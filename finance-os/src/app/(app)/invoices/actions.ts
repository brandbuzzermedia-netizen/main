"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext, requireWriter, type AppContext } from "@/lib/auth";
import { commitmentSchema, creditNoteSchema, extensionSchema, fieldErrors, manualInvoiceSchema, type FieldErrors } from "@/domain/schemas";
import { addDays } from "@/domain/dates";
import { MAX_IMPORT_BYTES, planCsvImport, type ImportPlan } from "@/integrations/swipe/csv-import";
import type { ImportRow, MatchableClient } from "@/integrations/swipe/match";

export type ImportResult = {
  run_id: string;
  inserted: number;
  updated: number;
  unchanged: number;
  errors: number;
  reconciliation_tasks: number;
  same_file_imported_before: boolean;
  results: { row: number; invoice_number: string; invoice_id?: string; action: string; message?: string; changed?: string[] }[];
};

async function loadMatchableClients(ctx: AppContext): Promise<MatchableClient[]> {
  const { data, error } = await ctx.supabase
    .from("clients")
    .select("id, client_code, legal_name, trading_name, gstin, source_aliases, payment_terms_days")
    .eq("organization_id", ctx.org.id);
  if (error) throw new Error(error.message);
  return data as MatchableClient[];
}

export type PreviewState = { error?: string; plan?: ImportPlan; fileName?: string; sha256?: string; result?: ImportResult };

async function readUpload(formData: FormData): Promise<{ text: string; fileName: string; sha256: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file exported from Swipe." };
  if (file.size > MAX_IMPORT_BYTES) return { error: "The file is larger than 1 MB. Export a shorter date range." };
  if (!/\.csv$/i.test(file.name)) return { error: "Upload a .csv file. In Excel, use File → Save As → CSV UTF-8." };
  const text = await file.text();
  return { text, fileName: file.name, sha256: createHash("sha256").update(text).digest("hex") };
}

/** Step 1: parse and validate on the server; nothing is written. */
export async function previewImportAction(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const ctx = await requireWriter();
  const upload = await readUpload(formData);
  if ("error" in upload) return { error: upload.error };
  try {
    const plan = planCsvImport(upload.text, await loadMatchableClients(ctx));
    return { plan, fileName: upload.fileName, sha256: upload.sha256 };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Step 2: re-parse the same file server-side (never trust rows sent from the browser) and import. */
export async function commitImportAction(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const ctx = await requireWriter();
  const upload = await readUpload(formData);
  if ("error" in upload) return { error: upload.error };
  const { text, fileName, sha256 } = upload;
  if (formData.get("sha256") !== sha256) return { error: "The file changed since the preview. Preview it again." };

  let plan: ImportPlan;
  try {
    plan = planCsvImport(text, await loadMatchableClients(ctx));
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (plan.rows.length === 0) return { error: "No valid rows to import.", plan, fileName: fileName, sha256 };
  const { data, error } = await ctx.supabase.rpc("import_invoices", {
    p_org: ctx.org.id,
    p_channel: "csv",
    p_rows: plan.rows,
    p_file_name: fileName,
    p_file_sha256: sha256,
  });
  if (error) return { error: `Import failed: ${error.message}`, plan, fileName: fileName, sha256 };
  revalidatePath("/invoices");
  revalidatePath("/");
  return { plan, fileName: fileName, sha256, result: data as ImportResult };
}

export type ManualState = { error?: string; fieldErrors?: FieldErrors; existingId?: string };

export async function createManualInvoiceAction(_prev: ManualState, formData: FormData): Promise<ManualState> {
  const ctx = await requireWriter();
  const parsed = manualInvoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const { data: existing } = await ctx.supabase
    .from("invoices")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("source_system", "swipe")
    .eq("invoice_number", v.invoice_number)
    .maybeSingle();
  if (existing) return { error: `Invoice ${v.invoice_number} is already recorded.`, existingId: existing.id };

  const { data: client } = await ctx.supabase.from("clients").select("payment_terms_days").eq("id", v.client_id).maybeSingle();
  if (!client) return { fieldErrors: { client_id: ["Choose a client"] } };

  const row: ImportRow = {
    row_number: 1,
    invoice_number: v.invoice_number,
    external_id: v.external_id ?? null,
    client_id: v.client_id,
    invoice_date: v.invoice_date,
    due_date: v.due_date ?? addDays(v.invoice_date, client.payment_terms_days),
    due_date_derived: v.due_date === null,
    billing_period_start: v.billing_period_start,
    billing_period_end: v.billing_period_end,
    currency: "INR",
    subtotal_minor: v.subtotal_minor,
    tax_minor: v.tax_minor ?? 0,
    total_minor: v.total_minor,
    pdf_url: v.pdf_url ?? null,
    source_status: "issued",
    source_reported_status: null,
    source_reported_paid_minor: null,
  };
  const { data, error } = await ctx.supabase.rpc("import_invoices", { p_org: ctx.org.id, p_channel: "manual", p_rows: [row] });
  if (error) return { error: error.message };
  const result = data as ImportResult;
  const first = result.results[0];
  if (first?.action === "error") return { error: first.message ?? "Could not save the invoice." };
  revalidatePath("/invoices");
  redirect(`/invoices/${first.invoice_id}`);
}

const disputeSchema = z.object({ reason: z.string().trim().min(3, "Give a short reason").max(1000) });

export async function setDisputeAction(invoiceId: string, disputed: boolean, _prev: { error?: string }, formData: FormData) {
  const ctx = await requireWriter();
  let reason: string | null = null;
  if (disputed) {
    const parsed = disputeSchema.safeParse({ reason: formData.get("dispute_reason") });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    reason = parsed.data.reason;
  }
  const { error } = await ctx.supabase
    .from("invoices")
    .update({ status: disputed ? "disputed" : "issued", status_reason: reason })
    .eq("id", invoiceId)
    .neq("status", "cancelled");
  if (error) return { error: error.message };
  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}

// ---------------------------------------------------------------------------
// Collections: commitments, extensions, credit notes
// ---------------------------------------------------------------------------

export type SimpleState = { error?: string; fieldErrors?: FieldErrors; ok?: boolean };

/** Log a payment promise. Account managers may do this for their own clients (RLS enforces it). */
export async function logCommitmentAction(clientId: string, invoiceId: string | null, _prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const ctx = await getContext();
  if (ctx.role === "viewer") return { error: "Your role cannot log commitments." };
  const parsed = commitmentSchema.safeParse({ ...Object.fromEntries(formData), invoice_id: invoiceId ?? formData.get("invoice_id") ?? "" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const { error } = await ctx.supabase.from("payment_commitments").insert({
    organization_id: ctx.org.id,
    client_id: clientId,
    invoice_id: v.invoice_id ?? null,
    promised_amount_minor: v.promised_amount_minor,
    commitment_date: v.commitment_date,
    promised_by: v.promised_by,
    notes: v.notes ?? null,
    recorded_by: ctx.userId,
  });
  if (error) return { error: error.message };
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

export async function cancelCommitmentAction(commitmentId: string, path: string) {
  const ctx = await requireWriter();
  const { error } = await ctx.supabase
    .from("payment_commitments")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", commitmentId)
    .eq("status", "open");
  if (error) throw new Error(error.message);
  revalidatePath(path);
}

export async function approveExtensionAction(invoiceId: string, _prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const ctx = await requireWriter();
  const parsed = extensionSchema.safeParse({ new_due_date: formData.get("new_due_date"), reason: formData.get("extension_reason") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await ctx.supabase.rpc("approve_extension", {
    p_invoice_id: invoiceId,
    p_new_due_date: parsed.data.new_due_date,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message };
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

export async function revokeExtensionAction(invoiceId: string, extensionId: string) {
  const ctx = await requireWriter();
  const { error } = await ctx.supabase.from("payment_extensions").update({ status: "revoked" }).eq("id", extensionId).eq("invoice_id", invoiceId);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function addCreditNoteAction(invoiceId: string, _prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const ctx = await requireWriter();
  const parsed = creditNoteSchema.safeParse({ ...Object.fromEntries(formData), reason: formData.get("credit_reason") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const { error } = await ctx.supabase.from("credit_notes").insert({
    organization_id: ctx.org.id,
    invoice_id: invoiceId,
    credit_note_number: v.credit_note_number,
    issued_on: v.issued_on,
    amount_minor: v.amount_minor,
    reason: v.reason ?? null,
    created_by: ctx.userId,
  });
  if (error) {
    if (/check constraint|violates check/i.test(error.message)) return { error: "The credit note is larger than the invoice's open balance." };
    if (/duplicate key/.test(error.message)) return { error: "That credit note number is already recorded." };
    return { error: error.message };
  }
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}
