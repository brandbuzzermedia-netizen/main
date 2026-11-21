"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";
import { financialYear } from "@/domain/periods";
import { todayInBusinessTz } from "@/domain/dates";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pad = (n: number) => String(n).padStart(2, "0");

/** Adds the 12 monthly GSTR-3B periods for the current FY with the default 20th-of-next-month due date (confirm with your accountant). */
export async function addGstPeriodsAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("finance.write")) throw new Error("Not allowed");
  const entity = z.uuid().parse(fd.get("legal_entity_id"));
  const fy = financialYear(todayInBusinessTz(), ctx.company.fy_start_month);
  const rows = Array.from({ length: 12 }, (_, i) => {
    const m0 = (ctx.company.fy_start_month - 1 + i) % 12, y = fy.startYear + Math.floor((ctx.company.fy_start_month - 1 + i) / 12);
    const start = `${y}-${pad(m0 + 1)}-01`;
    const end = new Date(Date.UTC(y, m0 + 1, 0)).toISOString().slice(0, 10);
    const due = new Date(Date.UTC(y, m0 + 1, 20)).toISOString().slice(0, 10);
    const label = `GSTR-3B ${new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${start}T00:00:00Z`))}`;
    return { organization_id: ctx.company.id, legal_entity_id: entity, kind: "gst_monthly", label, period_start: start, period_end: end, due_on: due };
  });
  const { error } = await ctx.supabase.from("tax_periods").upsert(rows, { onConflict: "organization_id,legal_entity_id,kind,period_start", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/finance`, "layout");
}

export async function addPeriodAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("finance.write")) throw new Error("Not allowed");
  const { error } = await ctx.supabase.from("tax_periods").insert({
    organization_id: ctx.company.id, legal_entity_id: z.uuid().parse(fd.get("legal_entity_id")),
    kind: z.enum(["gst_monthly", "gst_quarterly", "gst_annual", "itr", "tds_quarterly", "advance_tax", "other"]).parse(fd.get("kind")),
    label: z.string().trim().min(1).max(80).parse(fd.get("label")), period_start: date.parse(fd.get("period_start")), period_end: date.parse(fd.get("period_end")),
    due_on: fd.get("due_on") ? date.parse(fd.get("due_on")) : null, accountant_id: fd.get("accountant_id") ? z.uuid().parse(fd.get("accountant_id")) : null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/finance`, "layout");
}

export async function setStatusAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  const { error } = await ctx.supabase.from("tax_periods").update({ status: z.enum(["not_started", "preparing", "in_review", "ready_to_file"]).parse(fd.get("status")) })
    .eq("id", z.uuid().parse(fd.get("id"))).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/finance`, "layout");
}

export async function recordFilingAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  const { error } = await ctx.supabase.rpc("record_filing", { p_period: z.uuid().parse(fd.get("id")), p_ack: z.string().trim().min(5).max(80).parse(fd.get("ack")), p_filed_on: date.parse(fd.get("filed_on")) });
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/finance`, "layout");
}

export async function grantAccountantAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("finance.approve")) throw new Error("Not allowed");
  const { error } = await ctx.supabase.from("accountant_grants").insert({
    organization_id: ctx.company.id, legal_entity_id: z.uuid().parse(fd.get("legal_entity_id")), user_id: z.uuid().parse(fd.get("user_id")),
    period_start: date.parse(fd.get("period_start")), period_end: date.parse(fd.get("period_end")),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/finance`, "layout");
}
