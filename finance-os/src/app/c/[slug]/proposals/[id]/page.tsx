import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { formatMoney } from "@/domain/money";
import { PageHead } from "@/components/dp/shell";
import { Btn, Card, Field, Pill, inputStyle } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";
import { priceLines, rupee, totals, type ProposalDoc, type Research } from "@/lib/gbs-proposal";
import type { OsFacts } from "@/lib/company-research";
import { proposalStatusAction, saveBrandedProposalAction } from "../actions";

export const metadata: Metadata = { title: "Proposal" };
type Saved = { mode: "ai" | "template"; note: string; confidence: string | null; found: Research | null; site: { url: string; title: string; emails: string[]; phones: string[]; social: string[] } | null; os: OsFacts; at: string };

/** One branded proposal: what research found, the edit form, and the link to the print-ready document. */
export default async function ProposalDetail({ params, searchParams }: PageProps<"/c/[slug]/proposals/[id]">) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write") && !ctx.can("crm.read_all")) notFound();
  const { data: p } = await ctx.supabase.from("proposals").select("id, number, title, client_name, status, amount_minor, gst_bp, doc, research, website").eq("id", id).eq("organization_id", ctx.company.id).maybeSingle();
  if (!p?.doc) notFound();
  const doc = p.doc as ProposalDoc;
  const r = (p.research ?? {}) as Partial<Saved>;
  const t = totals(doc.pricing.rows);
  const d = designFor(slug);
  const base = `/c/${slug}/proposals`;
  const can = ctx.can("crm.write");
  const area = (name: string, value: string, rows = 3) => (
    <Field label={name}><textarea name={nameOf(name)} defaultValue={value} rows={rows} disabled={!can} style={inputStyle} /></Field>
  );
  return (
    <>
      <PageHead own={d.own} treat={`${p.number} · ${p.title}`} title={p.client_name} tag="The proposal."
        right={<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Btn href={base}>All proposals</Btn><a href={`/proposal-doc/${slug}/${id}`} target="_blank" rel="noopener" style={{ background: "var(--co-btn)", color: "#fff", borderRadius: 3, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, textDecoration: "none" }}>Open proposal (PDF)</a></div>} />
      {typeof sp.note === "string" && <div role="status" style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: "3px solid var(--co-btn)", borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>{sp.note}</div>}
      {r.note && <div role="note" style={{ background: "#FFF6E0", border: "1px solid #F1D48A", borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>{r.note}</div>}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 18, fontSize: 14 }}>
        <Pill tone={p.status === "accepted" ? "soft" : p.status === "rejected" ? "red" : p.status === "sent" ? "warn" : "plain"}>{p.status}</Pill>
        <span>One-time {rupee(t.once)} · Monthly {rupee(t.monthly)} · First month <b>{formatMoney(p.amount_minor)}</b> + GST</span>
        {can && p.status === "draft" && (
          <form action={proposalStatusAction.bind(null, slug)}><input type="hidden" name="id" value={p.id} /><Btn small name="status" value="sent">Mark sent</Btn></form>
        )}
      </div>
      <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)", gap: 18, alignItems: "start" }}>
        <Card title={r.mode === "ai" ? "What research found (AI web research)" : "What research found"}>
          <div style={{ fontSize: 14, lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 10 }}>
            {r.found?.about ? <p style={{ margin: 0 }}>{r.found.about}</p> : <p style={{ margin: 0, color: C.muted }}>No description found. Add a website, or switch AI on to research by name.</p>}
            {(r.found?.industry || r.found?.city) && <div><b>Industry and city:</b> {[r.found?.industry, r.found?.city].filter(Boolean).join(" · ")}</div>}
            {r.found?.audience && <div><b>Customers:</b> {r.found.audience}</div>}
            {p.website && <div><b>Website:</b> <a href={p.website} target="_blank" rel="noopener noreferrer">{p.website}</a></div>}
            {!!r.found?.observations?.length && <div><b>Observations to check</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{r.found.observations.map((o) => <li key={o}>{o}</li>)}</ul></div>}
            {r.site && (r.site.emails.length + r.site.phones.length + r.site.social.length > 0) && (
              <div><b>From their website</b><div style={{ color: C.muted }}>{[...r.site.emails, ...r.site.phones].join(" · ")}</div>{r.site.social.map((s) => <div key={s}><a href={s} target="_blank" rel="noopener noreferrer">{s}</a></div>)}</div>
            )}
            {r.os && (r.os.contacts.length + r.os.deals.length > 0 || r.os.client) && (
              <div><b>Already in the OS</b>
                {r.os.client && <div>Client: {r.os.client}</div>}
                {r.os.contacts.map((c) => <div key={c.name + c.company}>{c.name}{c.email ? ` · ${c.email}` : ""}{c.phone ? ` · ${c.phone}` : ""}</div>)}
                {r.os.deals.map((x) => <div key={x.title}>Deal: {x.title}{x.next ? ` · next: ${x.next}` : ""}</div>)}
              </div>
            )}
            {!!r.found?.sources?.length && <div style={{ fontSize: 12.5, color: C.muted }}><b>Sources</b>{r.found.sources.map((s) => <div key={s} style={{ overflowWrap: "anywhere" }}>{s}</div>)}</div>}
            <div style={{ fontSize: 12.5, color: C.muted }}>Research is a starting point. Check every fact before the proposal goes out.</div>
          </div>
        </Card>
        <Card title="Edit the proposal">
          <form action={saveBrandedProposalAction.bind(null, slug, id)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {area("Cover tags (one per line)", doc.tags.join("\n"), 3)}
              {area("Cover lines under the name (one per line)", doc.prepared_for.join("\n"), 3)}
            </div>
            <Field label="Header line on inner pages"><input name="subtitle" defaultValue={doc.subtitle} maxLength={80} disabled={!can} style={inputStyle} /></Field>
            <Field label="01 · Growth opportunity headline"><input name="opp_headline" defaultValue={doc.opportunity.headline} maxLength={90} disabled={!can} style={inputStyle} /></Field>
            {area("Growth opportunity intro", doc.opportunity.intro, 4)}
            {area("Highlighted callout", doc.opportunity.callout, 2)}
            {doc.phases.map((ph, i) => (
              <fieldset key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 14px", margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                <legend style={{ fontSize: 12, fontWeight: 700, padding: "0 6px" }}>{String(i + 2).padStart(2, "0")} · Phase</legend>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Title"><input name={`ph${i}_title`} defaultValue={ph.title} maxLength={70} disabled={!can} style={inputStyle} /></Field>
                  <Field label="Headline"><input name={`ph${i}_headline`} defaultValue={ph.headline} maxLength={90} disabled={!can} style={inputStyle} /></Field>
                </div>
                <Field label="Body"><textarea name={`ph${i}_body`} defaultValue={ph.body} rows={3} maxLength={600} disabled={!can} style={inputStyle} /></Field>
                <Field label="Outcome"><textarea name={`ph${i}_outcome`} defaultValue={ph.outcome} rows={2} maxLength={300} disabled={!can} style={inputStyle} /></Field>
              </fieldset>
            ))}
            {area("Scope of work (one item per line)", doc.scope.items.join("\n"), 5)}
            {area("Investment intro", doc.pricing.intro, 2)}
            {area("Prices: Service | Scope | Amount | Monthly or One-Time (one per line)", priceLines(doc.pricing.rows), 5)}
            {area("Commercial terms (one per line)", doc.terms.join("\n"), 5)}
            {area("Our commitment", doc.commitment, 3)}
            <Field label="Closing headline"><input name="closing_headline" defaultValue={doc.closing.headline} maxLength={80} disabled={!can} style={inputStyle} /></Field>
            {area("Closing note", doc.closing.body, 3)}
            {area("Closing checklist (one per line)", doc.closing.checklist.join("\n"), 4)}
            {can && <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><Btn primary>Save changes</Btn></div>}
          </form>
        </Card>
      </div>
    </>
  );
}

/** Form field names for the labelled text areas above. */
function nameOf(label: string): string {
  const map: Record<string, string> = {
    "Cover tags (one per line)": "tags", "Cover lines under the name (one per line)": "prepared_for", "Growth opportunity intro": "opp_intro", "Highlighted callout": "opp_callout",
    "Scope of work (one item per line)": "scope_items", "Investment intro": "pricing_intro", "Prices: Service | Scope | Amount | Monthly or One-Time (one per line)": "pricing_rows",
    "Commercial terms (one per line)": "terms", "Our commitment": "commitment", "Closing note": "closing_body", "Closing checklist (one per line)": "checklist",
  };
  return map[label] ?? label;
}
