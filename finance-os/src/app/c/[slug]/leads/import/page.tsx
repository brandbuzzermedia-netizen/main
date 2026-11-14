import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { C } from "@/components/dp/theme";
import { Btn, Card, Pill } from "@/components/dp/ui";
import { addSearchAction, importLeadsAction, searchStatusAction } from "./actions";

export const metadata: Metadata = { title: "Import leads" };
const field = { border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "9px 10px", fontSize: 14, background: "#fff", color: C.ink, fontFamily: "inherit" } as const;
const lbl = { display: "flex", flexDirection: "column", gap: 5, fontSize: 13, color: C.muted } as const;
const SIZES: [string, string][] = [["1,10", "1–10"], ["11,50", "11–50"], ["51,200", "51–200"], ["201,500", "201–500"], ["501,1000", "501–1,000"], ["1001,10000", "1,001+"]];

type Search = { id: string; name: string; titles: string[]; locations: string[]; keywords: string | null; per_run: number; active: boolean; enroll_sequence_id: string | null };

export default async function ImportLeadsPage({ params, searchParams }: PageProps<"/c/[slug]/leads/import">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const d = designFor(slug);
  const [{ data: seqs }, { data: searches }] = await Promise.all([
    ctx.supabase.from("outreach_sequences").select("id, name").eq("organization_id", ctx.company.id).eq("status", "active").order("created_at"),
    ctx.supabase.from("lead_searches").select("id, name, titles, locations, keywords, per_run, active, enroll_sequence_id").eq("organization_id", ctx.company.id).order("created_at"),
  ]);
  const seqName = new Map((seqs ?? []).map((s) => [s.id as string, s.name as string]));
  const campaignSelect = (
    <label style={lbl}>Add new leads to a campaign (optional)
      <select name="sequence_id" defaultValue="" style={field}>
        <option value="">Don&apos;t enrol</option>
        {(seqs ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
  const manage = ctx.can("crm.manage");
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title="Import leads" intro={<>Bring in lists from D7, Apollo or any spreadsheet. <a href={`/c/${slug}/leads`} style={{ color: "var(--co-side)", fontWeight: 600 }}>← Back to leads</a></>} />
      {typeof sp.note === "string" && <div role="status" style={{ background: "#fff", border: `1px solid ${C.line}`, borderLeft: "4px solid var(--co-side)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 14, lineHeight: 1.5 }}>{sp.note}</div>}
      <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card title="Upload a CSV">
            <form action={importLeadsAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 10 }}>
              <label style={lbl}>File (CSV, up to 5 MB / 10,000 rows)<input type="file" name="file" accept=".csv,text/csv" required style={field} /></label>
              <label style={lbl}>Source tag<input name="source" required defaultValue="D7" maxLength={80} style={field} placeholder="e.g. D7 clinics Bengaluru" /></label>
              <label style={lbl}>Lawful basis for outreach
                <select name="basis" defaultValue="legitimate_interest" style={field}>
                  <option value="legitimate_interest">Legitimate interest: bought B2B list (email, LinkedIn, calls; never WhatsApp)</option>
                  <option value="consent">Consent: these people agreed to hear from us</option>
                  <option value="none">None yet: keep as leads only, no outreach</option>
                </select>
              </label>
              {campaignSelect}
              <div><Btn primary>Import leads</Btn></div>
            </form>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 14, lineHeight: 1.55 }}>
              Columns are recognised automatically: Name (or First/Last name, or Business name), Email, Phone, Company, LinkedIn. Indian numbers without +91 are fixed.
              Rows without a name and a valid email or phone are skipped, and anyone already in this company (same email or phone) is not added twice.
              Excel files: File → Save As → CSV UTF-8.
            </div>
          </Card>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card title="Apollo searches">
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, margin: "6px 0 12px" }}>
              Runs daily through n8n once <b>Apollo searches → new leads</b> is switched on in Automation. Only Apollo-verified emails are added, tagged &ldquo;Apollo: search name&rdquo;.
            </div>
            {(searches as Search[] | null ?? []).map((s) => (
              <div key={s.id} style={{ borderTop: `1px solid ${C.line2}`, padding: "10px 0", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 14 }}>
                  <b style={{ fontWeight: 600 }}>{s.name}</b> {!s.active && <Pill tone="warn">Paused</Pill>}
                  <div style={{ fontSize: 12.5, color: C.muted }}>{[s.titles.join(", "), s.locations.join(", "), s.keywords].filter(Boolean).join(" · ")} · {s.per_run}/day{s.enroll_sequence_id ? ` · → ${seqName.get(s.enroll_sequence_id) ?? "campaign"}` : ""}</div>
                </div>
                {manage && (
                  <form action={searchStatusAction.bind(null, slug)} style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="id" value={s.id} />
                    <Btn small name="op" value={s.active ? "pause" : "resume"}>{s.active ? "Pause" : "Resume"}</Btn>
                    <Btn small name="op" value="delete">Remove</Btn>
                  </form>
                )}
              </div>
            ))}
            {!searches?.length && <div style={{ fontSize: 14, color: C.muted, borderTop: `1px solid ${C.line2}`, padding: "10px 0" }}>No searches yet.</div>}
            {manage ? (
              <form action={addSearchAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid ${C.line2}`, paddingTop: 14 }}>
                <label style={lbl}>Search name<input name="name" required maxLength={80} placeholder="Clinic owners, Bengaluru" style={field} /></label>
                <label style={lbl}>Job titles (comma separated)<input name="titles" placeholder="Owner, Founder, Director" style={field} /></label>
                <label style={lbl}>Locations<input name="locations" placeholder="Bengaluru, India" style={field} /></label>
                <label style={lbl}>Keywords<input name="keywords" maxLength={200} placeholder="dental clinic" style={field} /></label>
                <fieldset style={{ border: 0, padding: 0, margin: 0, fontSize: 13, color: C.muted }}><legend style={{ marginBottom: 6 }}>Company size (employees)</legend>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{SIZES.map(([v, l]) => <label key={v} style={{ display: "flex", gap: 5, alignItems: "center", color: C.ink }}><input type="checkbox" name="employees" value={v} />{l}</label>)}</div>
                </fieldset>
                <label style={lbl}>New leads per day (uses Apollo credits)<input type="number" name="per_run" min={1} max={100} defaultValue={25} style={field} /></label>
                {campaignSelect}
                <div><Btn primary>Save search</Btn></div>
              </form>
            ) : <div style={{ fontSize: 13, color: C.muted }}>A sales manager or owner can add searches.</div>}
          </Card>
          <Card title="Rules for bought data">
            {["Bought lists have no WhatsApp opt-in: WhatsApp steps are skipped for them automatically", "Every cold email carries an unsubscribe link; opt-outs are never contacted again", "Check numbers against DND / NCPR before calling", "The weekly contact cap and each account's daily limit apply", "Keep the source of every list (DPDP Act 2023)"].map((r) => (
              <div key={r} style={{ padding: "9px 0", borderTop: `1px solid ${C.line2}`, fontSize: 13.5, lineHeight: 1.45, color: "#3b443f" }}>{r}</div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
