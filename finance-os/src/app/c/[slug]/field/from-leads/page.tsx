import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { bigPrimary } from "@/components/field/field-client";
import { SEGMENT_LABEL, SEGMENTS } from "@/lib/field-sales";
import { addExistingToFieldAction } from "../actions";
import { Box, FieldTabs } from "../tabs";

export const metadata: Metadata = { title: "From your leads" };
const inp = { width: "100%", minHeight: 46, border: "1px solid #E4E0D6", borderRadius: 10, padding: "8px 12px", fontSize: 16, background: "#fff", boxSizing: "border-box" } as const;

/** Leads already in the OS that are not on the field list yet. */
export default async function FromLeads({ params, searchParams }: PageProps<"/c/[slug]/field/from-leads">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  let query = ctx.supabase.from("contacts").select("id, full_name, company_name, phone_e164, source, lead_status").eq("organization_id", ctx.company.id)
    .is("field_status", null).eq("do_not_contact", false).in("lead_status", ["new", "contacted", "qualified"]);
  if (q) query = query.or(`company_name.ilike.%${q.replace(/[%_,()]/g, " ")}%,full_name.ilike.%${q.replace(/[%_,()]/g, " ")}%`);
  const { data } = await query.order("created_at", { ascending: false }).limit(150);
  const rows = data ?? [];
  return (
    <>
      <PageHead own={designFor(slug).own} treat="Field sales" title="From your leads" tag="Visit them." />
      <FieldTabs slug={slug} current="/add" note={sp.note} />
      <form method="get" style={{ marginBottom: 12 }}><input name="q" defaultValue={q} placeholder="Search leads by name" aria-label="Search leads" style={inp} /></form>
      <Box title={`${rows.length} not on the field list`}>
        <form action={addExistingToFieldAction.bind(null, slug)} style={{ display: "grid", gap: 8 }}>
          {rows.length === 0 && <div style={{ fontSize: 14, color: "#6B6B6B" }}>Every open lead is already on the field list.</div>}
          {rows.map((r) => (
            <label key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid #EFEBE1", minHeight: 44 }}>
              <input type="checkbox" name="id" value={r.id} style={{ width: 24, height: 24 }} />
              <span><b>{r.company_name || r.full_name}</b><br /><span style={{ fontSize: 13, color: "#6B6B6B" }}>{[r.company_name ? r.full_name : null, r.phone_e164, r.source].filter(Boolean).join(" · ")}</span></span>
            </label>
          ))}
          {rows.length > 0 && <>
            <label style={{ fontSize: 13, color: "#6B6B6B", display: "grid", gap: 4 }}>Segment for the ticked leads
              <select name="segment" defaultValue="car_detailing" style={inp}>{SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}</select>
            </label>
            <button style={{ ...bigPrimary, width: "100%" }}>Add ticked leads to field list</button>
          </>}
        </form>
      </Box>
    </>
  );
}
