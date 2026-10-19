"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWriter, type AppContext } from "@/lib/auth";
import { fieldErrors, paymentSchema, type FieldErrors } from "@/domain/schemas";
import { suggestAllocations, type Allocation, type OpenInvoice } from "@/domain/allocation";
import { parseBankStatement } from "@/integrations/bank/statement";
import { matchBankCredits, type BankImportRow, type BankMatch } from "@/integrations/bank/match";
import type { MatchableClient } from "@/integrations/swipe/match";

export type PaymentFormState = { error?: string; fieldErrors?: FieldErrors };

function friendly(message: string): string {
  if (/already recorded/i.test(message)) return message;
  if (/payments_reference_unique/.test(message)) return "A payment with this reference is already recorded.";
  if (/check constraint|violates check/i.test(message)) return "That would allocate more than the payment amount or more than an invoice's outstanding balance.";
  return message;
}

export async function loadOpenInvoices(ctx: AppContext, clientIds?: string[]): Promise<(OpenInvoice & { client_id: string; invoice_date: string })[]> {
  let q = ctx.supabase
    .from("invoice_balances")
    .select("id, client_id, invoice_number, invoice_date, effective_due_date, outstanding_minor, status")
    .eq("organization_id", ctx.org.id)
    .neq("status", "cancelled")
    .gt("outstanding_minor", 0);
  if (clientIds) q = q.in("client_id", clientIds);
  const { data, error } = await q.order("effective_due_date");
  if (error) throw new Error(error.message);
  return (data ?? []) as (OpenInvoice & { client_id: string; invoice_date: string })[];
}

export async function recordPaymentAction(_prev: PaymentFormState, formData: FormData): Promise<PaymentFormState> {
  const ctx = await requireWriter();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  let allocations: Allocation[] = [];
  if (v.kind === "receipt" && v.client_id && v.auto_allocate) {
    allocations = suggestAllocations(v.amount_minor, await loadOpenInvoices(ctx, [v.client_id])).allocations;
  }
  const { data, error } = await ctx.supabase.rpc("record_payment", {
    p_org: ctx.org.id,
    p_payment: {
      client_id: v.client_id ?? null,
      source: "manual",
      transaction_reference: v.transaction_reference,
      payment_date: v.payment_date,
      amount_minor: v.amount_minor,
      method: v.method,
      kind: v.kind,
      payer_name: v.payer_name ?? null,
      reconciliation_notes: v.reconciliation_notes ?? null,
      verified: v.verified,
      verification_note: v.verification_note ?? null,
    },
    p_allocations: allocations,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/payments");
  revalidatePath("/");
  redirect(`/payments/${data as string}`);
}

const verifySchema = z.object({
  decision: z.enum(["verified", "rejected", "pending_verification"]),
  note: z.string().trim().max(500).optional(),
});

export async function setVerificationAction(paymentId: string, _prev: { error?: string }, formData: FormData) {
  const ctx = await requireWriter();
  const parsed = verifySchema.safeParse({ decision: formData.get("decision"), note: formData.get("note") || undefined });
  if (!parsed.success) return { error: "Invalid request" };
  const { decision, note } = parsed.data;
  if (decision !== "pending_verification" && (!note || note.length < 3)) {
    return { error: decision === "verified" ? "Say where you saw the money (bank statement, gateway settlement…)." : "Say why it is being rejected." };
  }
  const { error } = await ctx.supabase
    .from("payments")
    .update({
      verification_status: decision,
      verification_note: note ?? null,
      verified_by: decision === "verified" ? ctx.userId : null,
      verified_at: decision === "verified" ? new Date().toISOString() : null,
    })
    .eq("id", paymentId)
    .eq("organization_id", ctx.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/payments/${paymentId}`);
  revalidatePath("/payments");
  return {};
}

export async function assignClientAction(paymentId: string, _prev: { error?: string }, formData: FormData) {
  const ctx = await requireWriter();
  const clientId = z.uuid().safeParse(formData.get("client_id"));
  if (!clientId.success) return { error: "Choose a client" };
  const { error } = await ctx.supabase.from("payments").update({ client_id: clientId.data }).eq("id", paymentId).eq("organization_id", ctx.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/payments/${paymentId}`);
  return {};
}

const allocationsSchema = z.array(z.object({ invoice_id: z.uuid(), amount_minor: z.number().int().min(0) })).max(100);

export async function saveAllocationsAction(paymentId: string, allocations: Allocation[]): Promise<{ error?: string }> {
  const ctx = await requireWriter();
  const parsed = allocationsSchema.safeParse(allocations);
  if (!parsed.success) return { error: "Invalid allocation amounts" };
  const { error } = await ctx.supabase.rpc("set_payment_allocations", {
    p_payment_id: paymentId,
    p_allocations: parsed.data.filter((a) => a.amount_minor > 0),
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/payments/${paymentId}`);
  revalidatePath("/payments");
  revalidatePath("/invoices");
  return {};
}

// ---------------------------------------------------------------------------
// Bank statement import
// ---------------------------------------------------------------------------
export type BankPreviewState = {
  error?: string;
  fileName?: string;
  sha256?: string;
  rows?: BankMatch[];
  skippedDebits?: number;
  issues?: { rowNumber: number; message: string }[];
  result?: {
    inserted: number; verified_existing: number; duplicates: number; auto_allocated: number; unmatched: number; errors: number;
    same_file_imported_before: boolean;
    results: { row: number; action: string; message?: string; payment_id?: string }[];
  };
};

function toImportRow(m: BankMatch): BankImportRow {
  return {
    row_number: m.row_number, transaction_reference: m.transaction_reference, payment_date: m.payment_date,
    amount_minor: m.amount_minor, narration: m.narration, payer_name: m.payer_name, method: m.method,
    client_id: m.client_id, allocate_invoice_id: m.allocate_invoice_id,
  };
}

async function planBankImport(ctx: AppContext, text: string) {
  const parsed = parseBankStatement(text);
  if (!parsed.headerFound) throw new Error("Could not find the transaction table. Export the statement as CSV with Date, Narration and Deposit/Credit columns.");
  const { data: clients, error } = await ctx.supabase
    .from("clients")
    .select("id, client_code, legal_name, trading_name, gstin, source_aliases, payment_terms_days")
    .eq("organization_id", ctx.org.id);
  if (error) throw new Error(error.message);
  const open = await loadOpenInvoices(ctx);
  const byClient = new Map<string, OpenInvoice[]>();
  for (const i of open) byClient.set(i.client_id, [...(byClient.get(i.client_id) ?? []), i]);
  return { parsed, rows: matchBankCredits(parsed.credits, clients as MatchableClient[], byClient) };
}

async function readStatement(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV statement file." } as const;
  if (file.size > 2_000_000) return { error: "The file is larger than 2 MB. Export a shorter period." } as const;
  if (!/\.csv$/i.test(file.name)) return { error: "Upload a .csv file. Most banks offer CSV or Excel. Save Excel as CSV UTF-8." } as const;
  const text = await file.text();
  return { text, fileName: file.name, sha256: createHash("sha256").update(text).digest("hex") } as const;
}

export async function previewBankImportAction(_prev: BankPreviewState, formData: FormData): Promise<BankPreviewState> {
  const ctx = await requireWriter();
  const upload = await readStatement(formData);
  if ("error" in upload) return { error: upload.error };
  try {
    const { parsed, rows } = await planBankImport(ctx, upload.text);
    return { fileName: upload.fileName, sha256: upload.sha256, rows, skippedDebits: parsed.skippedDebits, issues: parsed.issues };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function commitBankImportAction(_prev: BankPreviewState, formData: FormData): Promise<BankPreviewState> {
  const ctx = await requireWriter();
  const upload = await readStatement(formData);
  if ("error" in upload) return { error: upload.error };
  if (formData.get("sha256") !== upload.sha256) return { error: "The file changed since the preview. Check it again." };
  try {
    const { parsed, rows } = await planBankImport(ctx, upload.text);
    if (rows.length === 0) return { error: "The statement has no credits to import." };
    const { data, error } = await ctx.supabase.rpc("import_bank_receipts", {
      p_org: ctx.org.id,
      p_rows: rows.map(toImportRow),
      p_file_name: upload.fileName,
      p_file_sha256: upload.sha256,
    });
    if (error) return { error: error.message };
    revalidatePath("/payments");
    revalidatePath("/invoices");
    revalidatePath("/");
    return { fileName: upload.fileName, sha256: upload.sha256, rows, skippedDebits: parsed.skippedDebits, issues: parsed.issues, result: data as BankPreviewState["result"] };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
