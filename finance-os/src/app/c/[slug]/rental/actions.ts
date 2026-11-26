"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

const opt = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };
const intIn = (v: FormDataEntryValue | null, lo: number, hi: number) => { const s = opt(v); if (s === null) return null; const n = Number(s); return Number.isInteger(n) && n >= lo && n <= hi ? n : NaN; };
/** Indian 10-digit numbers become +91…; anything else must already be in +country form. */
function phone(v: FormDataEntryValue | null): string | null {
  const s = opt(v)?.replace(/[\s()-]/g, "") ?? null;
  if (!s) return null;
  const e = /^\d{10}$/.test(s) ? `+91${s}` : /^0\d{10}$/.test(s) ? `+91${s.slice(1)}` : s;
  if (!/^\+[1-9]\d{7,14}$/.test(e)) throw new Error("Phone must be a 10-digit Indian number or start with + and the country code.");
  return e;
}

/**
 * Saves one rental unit from a single form: the unit, its tenant and its active lease (rent, due day,
 * deposit, dates, escalation, notice and lock-in). Leaving the tenant empty keeps the unit vacant.
 * "End this lease" closes the current lease; past rent charges and receipts are never touched.
 */
export async function saveUnitAction(slug: string, unitId: string, fd: FormData) {
  const ctx = await writer(slug);
  const org = ctx.company.id;
  const back = (msg: string, id = unitId) => redirect(`/c/${slug}/rental/${id}?note=${encodeURIComponent(msg)}`);
  let saved = unitId;
  try {
    const label = z.string().trim().min(1, "Give the unit a name, e.g. Salon").max(80).parse(fd.get("label"));
    const unit = {
      label, legal_entity_id: z.uuid("Choose the legal owner").parse(fd.get("legal_entity_id")),
      use_type: z.enum(["residential", "commercial", "retail", "office", "industrial", "land", "other"]).nullable().parse(opt(fd.get("use_type"))),
      address: opt(fd.get("address"))?.slice(0, 500) ?? null, co_owners: opt(fd.get("co_owners"))?.slice(0, 300) ?? null, notes: opt(fd.get("notes"))?.slice(0, 2000) ?? null,
    };
    if (unitId === "new") {
      const { data, error } = await ctx.supabase.from("rental_units").insert({ organization_id: org, ...unit }).select("id").single();
      if (error) throw new Error(error.code === "23505" ? `A unit called "${label}" already exists.` : error.message);
      saved = data.id;
    } else {
      const { error } = await ctx.supabase.from("rental_units").update(unit).eq("id", unitId).eq("organization_id", org);
      if (error) throw new Error(error.code === "23505" ? `A unit called "${label}" already exists.` : error.message);
    }

    const { data: lease } = await ctx.supabase.from("leases").select("id, tenant_id").eq("unit_id", saved).eq("organization_id", org).eq("status", "active").maybeSingle();
    if (lease && fd.get("end_lease") === "on") {
      const { error } = await ctx.supabase.from("leases").update({ status: "ended", end_date: opt(fd.get("end_date")) ?? todayInBusinessTz() }).eq("id", lease.id);
      if (error) throw new Error(error.message);
      revalidatePath(`/c/${slug}`, "layout");
      return back("Lease ended. The unit is now vacant; its past rent and receipts are kept.", saved);
    }
    const tenantName = opt(fd.get("tenant_name"));
    if (tenantName) {
      const tenant = { name: tenantName.slice(0, 200), contact_name: opt(fd.get("tenant_contact"))?.slice(0, 200) ?? null, phone_e164: phone(fd.get("tenant_phone")),
        email: z.email("Tenant email looks wrong").nullable().parse(opt(fd.get("tenant_email"))) };
      const rentRaw = opt(fd.get("rent"));
      const start = opt(fd.get("start_date"));
      if (!rentRaw || !start) throw new Error("With a tenant, enter the rent amount and the lease start date.");
      const esc = opt(fd.get("escalation_pct")), every = intIn(fd.get("escalation_every_months"), 1, 120);
      if ((esc === null) !== (every === null)) throw new Error("Escalation needs both the percentage and how often (months).");
      const terms = {
        rent_minor: parseMoneyToMinor(rentRaw), start_date: date.parse(start), end_date: opt(fd.get("end_date")) ? date.parse(fd.get("end_date")) : null,
        frequency: z.enum(["monthly", "quarterly", "yearly"]).parse(fd.get("frequency") ?? "monthly"), due_day: intIn(fd.get("due_day"), 1, 28) ?? 5,
        deposit_minor: opt(fd.get("deposit")) ? parseMoneyToMinor(String(fd.get("deposit"))) : 0, deposit_terms: opt(fd.get("deposit_terms"))?.slice(0, 1000) ?? null,
        escalation_pct: esc === null ? null : z.coerce.number().min(0).max(100).parse(esc), escalation_every_months: every,
        lock_in_months: intIn(fd.get("lock_in_months"), 0, 240), notice_days: intIn(fd.get("notice_days"), 0, 365),
      };
      if ([terms.due_day, terms.lock_in_months, terms.notice_days, terms.escalation_every_months].some((x) => Number.isNaN(x))) throw new Error("Check the due day (1 to 28), lock-in, notice and escalation months.");
      if (terms.rent_minor <= 0) throw new Error("Rent must be more than zero.");
      if (lease) {
        const [{ error: e1 }, { error: e2 }] = await Promise.all([
          ctx.supabase.from("tenants").update(tenant).eq("id", lease.tenant_id).eq("organization_id", org),
          ctx.supabase.from("leases").update(terms).eq("id", lease.id),
        ]);
        if (e1 || e2) throw new Error((e1 ?? e2)!.message);
      } else {
        const { data: t, error: e1 } = await ctx.supabase.from("tenants").insert({ organization_id: org, ...tenant }).select("id").single();
        if (e1) throw new Error(e1.message);
        const { error: e2 } = await ctx.supabase.from("leases").insert({ organization_id: org, unit_id: saved, tenant_id: t.id, status: "active", ...terms });
        if (e2) throw new Error(e2.message);
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    const msg = e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the fields." : e instanceof Error ? e.message : "Could not save.";
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    revalidatePath(`/c/${slug}`, "layout");
    return back(`Not saved: ${msg}`, saved);
  }
  revalidatePath(`/c/${slug}`, "layout");
  revalidatePath("/group", "layout");
  back("Saved.", saved);
}
