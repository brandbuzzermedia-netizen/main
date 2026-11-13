"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";
import { parseMoneyToMinor } from "@/domain/money";
import { addDays, todayInBusinessTz } from "@/domain/dates";

async function writer(slug: string) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("rental.write")) throw new Error("Your role cannot change rental records.");
  return ctx;
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Adds the two labels from the brief as units of the default legal entity. Owner, tenant and rent are configured after. */
export async function addSalonTowerAction(slug: string) {
  const ctx = await writer(slug);
  const { data: ent } = await ctx.supabase.from("legal_entities").select("id").eq("organization_id", ctx.company.id).eq("is_default", true).single();
  const { error } = await ctx.supabase.from("rental_units").upsert(
    ["Salon", "Tower"].map((label) => ({ organization_id: ctx.company.id, legal_entity_id: ent!.id, label })),
    { onConflict: "organization_id,label", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/finance`);
}

export async function generateChargesAction(slug: string) {
  const ctx = await writer(slug);
  const { error } = await ctx.supabase.rpc("generate_rent_charges", { p_org: ctx.company.id, p_through: addDays(todayInBusinessTz(), 31) });
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/finance`);
}

export async function receiptAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const { error } = await ctx.supabase.from("rent_receipts").insert({
    organization_id: ctx.company.id, charge_id: z.uuid().parse(fd.get("charge_id")), amount_minor: parseMoneyToMinor(String(fd.get("amount"))),
    received_on: date.parse(fd.get("on")), method: z.enum(["upi", "neft", "rtgs", "imps", "cheque", "cash", "other"]).parse(fd.get("method")),
    reference: z.string().trim().min(1).max(80).parse(fd.get("reference")),
  });
  if (error) throw new Error(error.code === "23505" ? "That reference is already recorded." : error.message);
  revalidatePath(`/c/${slug}/finance`);
}

export async function depositAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const { error } = await ctx.supabase.from("security_deposit_ledger").insert({
    organization_id: ctx.company.id, lease_id: z.uuid().parse(fd.get("lease_id")), kind: z.enum(["received", "refunded", "appropriated"]).parse(fd.get("kind")),
    amount_minor: parseMoneyToMinor(String(fd.get("amount"))), on_date: date.parse(fd.get("on")), reference: String(fd.get("reference") ?? "").slice(0, 80) || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/finance`);
}
