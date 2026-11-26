import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { todayInBusinessTz } from "@/domain/dates";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { NearMeList } from "@/components/field/field-client";
import { FIELD_STATUSES, SEGMENT_LABEL, SEGMENTS, STATUS_LABEL } from "@/lib/field-sales";
import { loadFieldLeads } from "@/lib/field-data";
import { FieldTabs } from "../tabs";

export const metadata: Metadata = { title: "Field leads" };

const sel = { minHeight: 44, border: "1px solid #E4E0D6", borderRadius: 10, padding: "8px 10px", fontSize: 15, background: "#fff", width: "100%" } as const;

/** All field leads with filters (segment, status, area, follow-ups due) and Near me. */
export default async function FieldLeads({ params, searchParams }: PageProps<"/c/[slug]/field/leads">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const f = { segment: one(sp.segment), status: one(sp.status), area: one(sp.area), due: one(sp.due) === "1", q: one(sp.q).trim().toLowerCase() };
  const today = todayInBusinessTz();
  const all = await loadFieldLeads(ctx, { includeLost: f.status === "lost" });
  const areas = [...new Set(all.map((l) => l.area).filter(Boolean) as string[])].sort();
  const leads = all.filter((l) => (!f.segment || l.field_segment === f.segment) && (!f.status || l.field_status === f.status) && (!f.area || l.area === f.area)
    && (!f.due || (l.next_follow_up_on !== null && l.next_follow_up_on <= today))
    && (!f.q || [l.company_name, l.full_name, l.phone_e164, l.area].some((x) => x?.toLowerCase().includes(f.q))));
  return (
    <>
      <PageHead own={designFor(slug).own} treat="Field sales" title="Leads" tag={`${leads.length} shown.`} />
      <FieldTabs slug={slug} current="/leads" note={sp.note} />
      <form method="get" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginBottom: 12 }}>
        <input name="q" defaultValue={f.q} placeholder="Search name, phone, area" aria-label="Search" style={{ ...sel, gridColumn: "1 / -1" }} />
        <select name="segment" defaultValue={f.segment} aria-label="Segment" style={sel}><option value="">All segments</option>{SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}</select>
        <select name="status" defaultValue={f.status} aria-label="Status" style={sel}><option value="">All open</option>{FIELD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        <select name="area" defaultValue={f.area} aria-label="Area" style={sel}><option value="">All areas</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <label style={{ ...sel, display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" name="due" value="1" defaultChecked={f.due} style={{ width: 20, height: 20 }} />Due today</label>
        <button style={{ ...sel, background: "#141414", color: "#fff", fontWeight: 700, border: 0 }}>Filter</button>
      </form>
      <NearMeList leads={leads} slug={slug} empty={<div style={{ padding: "16px 0", color: "#6B6B6B" }}>No leads here yet. Tap <a href={`/c/${slug}/field/leads/new`}>+ Add</a> or <a href={`/c/${slug}/field/import`}>Bulk add</a>.</div>} />
    </>
  );
}
