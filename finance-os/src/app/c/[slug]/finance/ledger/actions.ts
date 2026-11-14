"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";
import { parseMoneyToMinor } from "@/domain/money";

export type LedgerState = { ok?: string; error?: string };
const TYPES = ["income", "commission_income", "other_income", "expense", "refund_out", "credit_note", "write_off", "loan_in", "loan_repayment",
  "capital_in", "owner_withdrawal", "deposit_received", "deposit_refunded", "pass_through_in", "pass_through_out", "tax_payment"] as const;

const entrySchema = z.object({
  entry_type: z.enum(TYPES), category: z.string().trim().min(1, "Category is required").max(60), description: z.string().trim().min(1, "Describe the entry").max(300),
  counterparty: z.string().trim().max(200).optional(), txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")), amount: z.string().min(1, "Enter the amount"),
  currency: z.string().regex(/^[A-Z]{3}$/).default("INR"), fx_rate: z.string().optional(), fx_rate_date: z.string().optional(),
  legal_entity_id: z.uuid(), rental_unit_id: z.uuid().optional().or(z.literal("")), submit: z.string().optional(),
});

export async function createEntryAction(slug: string, _p: LedgerState, fd: FormData): Promise<LedgerState> {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("finance.write")) return { error: "Your role cannot add ledger entries." };
  const p = entrySchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { error: p.error.issues[0].message };
  let amount: number;
  try { amount = parseMoneyToMinor(p.data.amount); } catch (e) { return { error: (e as Error).message }; }
  if (amount <= 0) return { error: "Amount must be more than zero." };
  let fx: { fx_rate: number; fx_rate_date: string; base_amount_minor: number } | Record<string, never> = {};
  if (p.data.currency !== "INR" && p.data.fx_rate) {
    const rate = Number(p.data.fx_rate);
    if (!(rate > 0) || !p.data.fx_rate_date) return { error: "Give the FX rate and the date of that rate." };
    fx = { fx_rate: rate, fx_rate_date: p.data.fx_rate_date, base_amount_minor: Math.round(amount * rate) };
  }
  const { error } = await ctx.supabase.from("ledger_entries").insert({
    organization_id: ctx.company.id, legal_entity_id: p.data.legal_entity_id, entry_type: p.data.entry_type, category: p.data.category,
    description: p.data.description, counterparty: p.data.counterparty || null, txn_date: p.data.txn_date, due_on: p.data.due_on || null,
    amount_minor: amount, currency: p.data.currency, ...fx, rental_unit_id: p.data.rental_unit_id || null,
    status: p.data.submit ? "pending_approval" : "draft", submitted_at: p.data.submit ? new Date().toISOString() : null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/c/${slug}/finance/ledger`);
  return { ok: p.data.submit ? "Submitted for approval. It counts in reports once approved." : "Saved as draft." };
}

async function rpc(slug: string, fn: string, args: Record<string, unknown>) {
  const ctx = await getCompanyContext(slug);
  const { error } = await ctx.supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/finance/ledger`);
}

export async function submitEntryAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  const id = z.uuid().parse(fd.get("id"));
  const { error } = await ctx.supabase.from("ledger_entries").update({ status: "pending_approval", submitted_at: new Date().toISOString() }).eq("id", id).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/finance/ledger`);
}
export async function decideEntryAction(slug: string, fd: FormData) {
  await rpc(slug, "approve_ledger_entry", { p_entry: z.uuid().parse(fd.get("id")), p_approve: fd.get("approve") === "true", p_note: null });
}
export async function settleEntryAction(slug: string, fd: FormData) {
  await rpc(slug, "settle_ledger_entry", {
    p_entry: z.uuid().parse(fd.get("id")), p_amount_minor: parseMoneyToMinor(String(fd.get("amount") ?? "")),
    p_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(fd.get("on")), p_method: z.string().max(20).parse(fd.get("method") ?? "neft"),
    p_reference: z.string().trim().min(1, "Reference required").max(80).parse(fd.get("reference")),
  });
}
export async function reverseEntryAction(slug: string, fd: FormData) {
  await rpc(slug, "reverse_ledger_entry", { p_entry: z.uuid().parse(fd.get("id")), p_reason: z.string().trim().min(5).max(300).parse(fd.get("reason")) });
}
export async function transferAction(slug: string, _p: LedgerState, fd: FormData): Promise<LedgerState> {
  const ctx = await getCompanyContext(slug);
  try {
    const to = z.uuid().parse(fd.get("to"));
    const { error } = await ctx.supabase.rpc("record_internal_transfer", {
      p_from_org: ctx.company.id, p_to_org: to, p_amount_minor: parseMoneyToMinor(String(fd.get("amount") ?? "")),
      p_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(fd.get("on")), p_reference: z.string().trim().min(1).parse(fd.get("reference")),
      p_description: z.string().trim().min(1).max(300).parse(fd.get("description")),
    });
    if (error) return { error: error.message };
  } catch (e) {
    return { error: e instanceof z.ZodError ? "Fill in every field." : (e as Error).message };
  }
  revalidatePath(`/c/${slug}/finance/ledger`);
  return { ok: "Both legs created, pending approval in each company. Transfers never count as income or expense." };
}
