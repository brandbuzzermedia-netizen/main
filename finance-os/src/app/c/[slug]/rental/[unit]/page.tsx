import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { Btn, Card, Field, inputStyle } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";
import { saveUnitAction } from "../actions";

export const metadata: Metadata = { title: "Rental unit" };

const rupees = (minor: number | null | undefined) => (minor == null ? "" : String(minor / 100));

/** One page to set up or edit a rental unit: the unit, its tenant and the rent terms of its active lease. */
export default async function RentalUnitPage({ params, searchParams }: PageProps<"/c/[slug]/rental/[unit]">) {
  const { slug, unit } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("rental.write")) notFound();
  const isNew = unit === "new";
  const [{ data: entities }, { data: u }, { data: lease }] = await Promise.all([
    ctx.supabase.from("legal_entities").select("id, name, is_default").eq("organization_id", ctx.company.id).order("name"),
    isNew ? Promise.resolve({ data: null }) : ctx.supabase.from("rental_units").select("id, label, legal_entity_id, use_type, address, co_owners, notes").eq("id", unit).eq("organization_id", ctx.company.id).maybeSingle(),
    isNew ? Promise.resolve({ data: null }) : ctx.supabase.from("leases").select("id, start_date, end_date, rent_minor, frequency, due_day, deposit_minor, deposit_terms, escalation_pct, escalation_every_months, lock_in_months, notice_days, tenant:tenants(name, contact_name, phone_e164, email)")
      .eq("unit_id", unit).eq("organization_id", ctx.company.id).eq("status", "active").maybeSingle(),
  ]);
  if (!isNew && !u) notFound();
  const t = (lease?.tenant ?? null) as unknown as { name: string; contact_name: string | null; phone_e164: string | null; email: string | null } | null;
  const d = designFor(slug);
  const back = `/c/${slug}/finance?tab=rental`;
  const defEntity = u?.legal_entity_id ?? entities?.find((e) => e.is_default)?.id ?? "";
  const section = (title: string, hint: string) => (
    <div style={{ marginTop: 6 }}><div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div><div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{hint}</div></div>
  );
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 } as const;
  return (
    <>
      <PageHead own={d.own} treat="Finance · Rental income" title={isNew ? "New rental unit" : u!.label} tag={isNew ? "Set it up." : "Edit the details."} right={<Btn href={back}>Back to rental income</Btn>} />
      {typeof sp.note === "string" && (
        <div role="status" style={{ background: sp.note.startsWith("Not saved") ? "#FBEAEA" : C.card, border: `1px solid ${C.line}`, borderLeft: `3px solid ${sp.note.startsWith("Not saved") ? C.red : "var(--co-btn)"}`, borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>{sp.note}</div>
      )}
      <Card title="Unit, tenant and rent">
        <form action={saveUnitAction.bind(null, slug, unit)} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 920 }}>
          {section("The unit", "Its name, legal owner and use. Nothing is assumed from the name.")}
          <div style={grid}>
            <Field label="Name *"><input name="label" required maxLength={80} defaultValue={u?.label ?? ""} placeholder="e.g. Salon" style={inputStyle} /></Field>
            <Field label="Legal owner / entity *">
              <select name="legal_entity_id" required defaultValue={defEntity} style={inputStyle}>{(entities ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            </Field>
            <Field label="Use">
              <select name="use_type" defaultValue={u?.use_type ?? ""} style={inputStyle}>
                <option value="">Not set</option>{["residential", "commercial", "retail", "office", "industrial", "land", "other"].map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
              </select>
            </Field>
            <Field label="Co-owners"><input name="co_owners" maxLength={300} defaultValue={u?.co_owners ?? ""} placeholder="Names and shares, if any" style={inputStyle} /></Field>
          </div>
          <Field label="Address"><textarea name="address" rows={2} maxLength={500} defaultValue={u?.address ?? ""} style={inputStyle} /></Field>

          {section("Tenant", lease ? "Current tenant on the active lease." : "Leave empty while the unit is vacant.")}
          <div style={grid}>
            <Field label="Tenant name"><input name="tenant_name" maxLength={200} defaultValue={t?.name ?? ""} style={inputStyle} /></Field>
            <Field label="Contact person"><input name="tenant_contact" maxLength={200} defaultValue={t?.contact_name ?? ""} style={inputStyle} /></Field>
            <Field label="Phone"><input name="tenant_phone" inputMode="tel" defaultValue={t?.phone_e164 ?? ""} placeholder="98xxxxxxxx" style={inputStyle} /></Field>
            <Field label="Email"><input name="tenant_email" type="email" defaultValue={t?.email ?? ""} style={inputStyle} /></Field>
          </div>

          {section("Rent and lease", "Needed when there is a tenant. Rent dues are generated from these terms.")}
          <div style={grid}>
            <Field label="Rent amount (₹)"><input name="rent" inputMode="decimal" defaultValue={rupees(lease?.rent_minor)} placeholder="e.g. 45000" style={inputStyle} /></Field>
            <Field label="Every">
              <select name="frequency" defaultValue={lease?.frequency ?? "monthly"} style={inputStyle}><option value="monthly">Month</option><option value="quarterly">Quarter</option><option value="yearly">Year</option></select>
            </Field>
            <Field label="Due day of month (1–28)"><input name="due_day" type="number" min={1} max={28} defaultValue={lease?.due_day ?? 5} style={inputStyle} /></Field>
            <Field label="Security deposit (₹)"><input name="deposit" inputMode="decimal" defaultValue={rupees(lease?.deposit_minor)} style={inputStyle} /></Field>
            <Field label="Lease start"><input name="start_date" type="date" defaultValue={lease?.start_date ?? ""} style={inputStyle} /></Field>
            <Field label="Lease end"><input name="end_date" type="date" defaultValue={lease?.end_date ?? ""} style={inputStyle} /></Field>
            <Field label="Escalation %"><input name="escalation_pct" inputMode="decimal" defaultValue={lease?.escalation_pct ?? ""} placeholder="e.g. 5" style={inputStyle} /></Field>
            <Field label="Escalate every (months)"><input name="escalation_every_months" type="number" min={1} max={120} defaultValue={lease?.escalation_every_months ?? ""} placeholder="e.g. 12" style={inputStyle} /></Field>
            <Field label="Notice period (days)"><input name="notice_days" type="number" min={0} max={365} defaultValue={lease?.notice_days ?? ""} style={inputStyle} /></Field>
            <Field label="Lock-in (months)"><input name="lock_in_months" type="number" min={0} max={240} defaultValue={lease?.lock_in_months ?? ""} style={inputStyle} /></Field>
          </div>
          <Field label="Deposit refund terms"><textarea name="deposit_terms" rows={2} maxLength={1000} defaultValue={lease?.deposit_terms ?? ""} style={inputStyle} /></Field>
          <Field label="Notes"><textarea name="notes" rows={2} maxLength={2000} defaultValue={u?.notes ?? ""} style={inputStyle} /></Field>
          {lease && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" name="end_lease" /> End this lease (tenant has moved out). Uses the lease end date above, or today.
            </label>
          )}
          <div style={{ fontSize: 13, color: C.muted }}>Lease agreements and other documents go in the Vault.</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><Btn href={back}>Cancel</Btn><Btn primary>Save</Btn></div>
        </form>
      </Card>
    </>
  );
}
