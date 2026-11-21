import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { formatDate, todayInBusinessTz } from "@/domain/dates";
import { formatMoney, formatShort } from "@/domain/money";
import { Cta, PageHead } from "@/components/dp/shell";
import { Modal } from "@/components/dp/modal";
import { Btn, Card, Field, Pill, inputStyle, label } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";
import { addProposalAction, createBrandedProposalAction, proposalStatusAction } from "./actions";
import { hasBrandedProposals, SERVICE_KEYS, SERVICES } from "@/lib/gbs-proposal";
import { SubmitButton } from "./submit-button";

export const metadata: Metadata = { title: "Proposals" };
type P = { id: string; has_doc: string | null; number: string; title: string; client_name: string; amount_minor: number; gst_bp: number; status: string; sent_on: string | null; follow_up_on: string | null; decided_on: string | null };
const total = (p: P) => Math.round(p.amount_minor * (1 + p.gst_bp / 10000));

/** Proposals that close (More of Us OS): sending one moves its deal to Proposal; accepting marks it Won. */
export default async function ProposalsPage({ params, searchParams }: PageProps<"/c/[slug]/proposals">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write") && !ctx.can("crm.read_all")) notFound();
  const d = designFor(slug);
  const base = `/c/${slug}/proposals`;
  const today = todayInBusinessTz();
  const month = today.slice(0, 7);
  const [{ data }, { data: deals }, { data: clients }, { data: tgt }] = await Promise.all([
    ctx.supabase.from("proposals").select("id, number, title, client_name, amount_minor, gst_bp, status, sent_on, follow_up_on, decided_on, has_doc:doc->>tags").eq("organization_id", ctx.company.id).order("created_at", { ascending: false }).limit(200),
    ctx.supabase.from("deals").select("id, title, account_name").eq("organization_id", ctx.company.id).is("closed_at", null).order("created_at", { ascending: false }).limit(200),
    ctx.supabase.from("clients").select("legal_name").eq("organization_id", ctx.company.id).order("legal_name").limit(300),
    ctx.supabase.from("company_targets").select("default_gst_bp, services").eq("organization_id", ctx.company.id).maybeSingle(),
  ]);
  const ps = (data ?? []) as P[];
  const out = ps.filter((p) => p.status === "sent");
  const accepted = ps.filter((p) => p.status === "accepted" && (p.decided_on ?? "").startsWith(month));
  const decided = ps.filter((p) => p.status === "accepted" || p.status === "rejected");
  const rate = decided.length ? `${Math.round((ps.filter((p) => p.status === "accepted").length / decided.length) * 100)}%` : "—";
  const due = out.filter((p) => p.follow_up_on && p.follow_up_on <= today);
  const kpi = (l: string, v: string, s: string, dark = false) => (
    <div style={{ position: "relative", borderRadius: 6, padding: "18px 20px", minHeight: 120, background: dark ? "#141414" : C.card, color: dark ? "#fff" : C.ink, border: dark ? 0 : `1px solid ${C.line}`,
      ...(dark ? { backgroundImage: "linear-gradient(90deg, #141414 40%, rgba(20,20,20,0) 80%), radial-gradient(rgba(255,255,255,.24) 1px, transparent 1.3px)", backgroundSize: "100% 100%, 9px 9px" } : {}) }}>
      <div style={{ ...label, color: dark ? "rgba(255,255,255,.6)" : C.muted }}>{l}</div>
      <div style={{ fontFamily: "var(--font-tight)", fontWeight: 800, fontSize: 38, letterSpacing: "-.04em", margin: "14px 0 4px" }}>{v}</div>
      <div style={{ fontSize: 12.5, color: dark ? "rgba(255,255,255,.65)" : C.faint }}>{s}</div>
    </div>
  );
  const gst = (tgt?.default_gst_bp ?? 1800) / 100;
  const branded = hasBrandedProposals(slug);
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title="Proposals" right={<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{branded && <Cta href={`${base}?brand=1`}>+ GBS proposal</Cta>}<Btn href={`${base}?add=1`}>+ Simple proposal</Btn></div>}
        intro={<>Accepting a proposal linked to a deal marks that deal <b>Won</b>. Sending one moves early deals to <b>Proposal</b>.</>} />
      {typeof sp.note === "string" && <div role="status" style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: "3px solid var(--co-btn)", borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>{sp.note}</div>}
      <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14, marginBottom: 20 }}>
        {kpi("Proposals out", formatShort(out.reduce((s, p) => s + total(p), 0)), `${out.length} awaiting a decision`, true)}
        {kpi("Accepted this month", formatShort(accepted.reduce((s, p) => s + total(p), 0)), `${accepted.length} proposals`)}
        {kpi("Acceptance rate", rate, `${decided.length} decided`)}
        {kpi("Follow-up due", String(due.length), due.length ? "Chase them today" : "All followed up")}
      </div>
      <Card title="All proposals">
        {ps.length === 0 && <div style={{ fontSize: 14, color: C.muted, paddingTop: 8 }}>No proposals yet. Create one for any client or open deal.</div>}
        {ps.map((p) => (
          <div key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "12px 0", borderTop: `1px solid ${C.line2}` }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: C.muted, width: 92 }}>{p.number}</span>
            <div style={{ flex: 1, minWidth: 200 }}>{p.has_doc ? <a href={`${base}/${p.id}`} style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{p.title}</a> : <b style={{ fontSize: 14.5 }}>{p.title}</b>}<div style={{ fontSize: 12.5, color: C.muted }}>{p.client_name}{p.sent_on ? ` · sent ${formatDate(p.sent_on)}` : ""}{p.status === "sent" && p.follow_up_on ? ` · follow up ${formatDate(p.follow_up_on)}` : ""}</div></div>
            <b style={{ fontSize: 14.5, whiteSpace: "nowrap" }}>{formatMoney(total(p))}</b>
            <Pill tone={p.status === "accepted" ? "soft" : p.status === "rejected" ? "red" : p.status === "sent" ? "warn" : "plain"}>{p.status === "rejected" ? "Not accepted" : p.status}</Pill>
            {p.status !== "accepted" && p.status !== "rejected" && (
              <form action={proposalStatusAction.bind(null, slug)} style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="id" value={p.id} />
                {p.status === "draft" && <Btn small name="status" value="sent">Mark sent</Btn>}
                <Btn small primary name="status" value="accepted">Accepted</Btn>
                <Btn small name="status" value="rejected">Not accepted</Btn>
              </form>
            )}
          </div>
        ))}
      </Card>
      {branded && sp.brand && (
        <Modal title="New GBS proposal" closeHref={base}>
          <form action={createBrandedProposalAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>Enter the company and what you are pitching. The OS reads their website and your CRM records{" "}
              (and researches them on the web when AI is on), then drafts the proposal in the Get Bee Seen format for you to check and edit. Nothing is sent.</div>
            <Field label="Company name *"><input name="company" required minLength={2} maxLength={200} list="dp-clients" placeholder="e.g. Shobha Decor & Furniture" style={inputStyle} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Website"><input name="website" maxLength={300} placeholder="acme.in" style={inputStyle} /></Field>
              <Field label="Contact person"><input name="contact" maxLength={120} style={inputStyle} /></Field>
              <Field label="Industry"><input name="industry" maxLength={120} placeholder="e.g. Furniture showroom" style={inputStyle} /></Field>
              <Field label="City"><input name="city" maxLength={120} placeholder="e.g. Bengaluru" style={inputStyle} /></Field>
            </div>
            <fieldset style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 14px", margin: 0 }}>
              <legend style={{ ...label, padding: "0 6px" }}>Services and price (₹, before GST)</legend>
              {SERVICE_KEYS.map((k) => (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10, alignItems: "center", padding: "5px 0" }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}><input type="checkbox" name={`svc_${k}`} />{SERVICES[k].label}</label>
                  <input name={`price_${k}`} type="number" min={0} step="1" placeholder={SERVICES[k].billing === "Monthly" ? "per month" : "one-time"} aria-label={`${SERVICES[k].short} price`} style={inputStyle} />
                </div>
              ))}
            </fieldset>
            <Field label="Related deal"><select name="deal_id" defaultValue="" style={inputStyle}><option value="">— None —</option>{(deals ?? []).map((x) => <option key={x.id} value={x.id}>{x.title}{x.account_name ? ` · ${x.account_name}` : ""}</option>)}</select></Field>
            <Field label="Notes for the draft"><textarea name="notes" rows={3} maxLength={1500} placeholder="What they told you, their goals, budget for ads, anything to mention" style={inputStyle} /></Field>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><Btn href={base}>Cancel</Btn><SubmitButton>Research and draft</SubmitButton></div>
          </form>
        </Modal>
      )}
      {sp.add && (
        <Modal title="New proposal" closeHref={base}>
          <form action={addProposalAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Title *"><input name="title" required minLength={2} maxLength={200} placeholder="e.g. Website + brand identity" list="dp-services" style={inputStyle} /></Field>
            <datalist id="dp-services">{((tgt?.services ?? []) as string[]).map((s) => <option key={s} value={s} />)}</datalist>
            <Field label="Client *"><input name="client_name" required maxLength={200} list="dp-clients" placeholder="Client or company name" style={inputStyle} /></Field>
            <datalist id="dp-clients">{[...new Set([...(clients ?? []).map((c) => c.legal_name as string), ...(deals ?? []).map((x) => x.account_name as string).filter(Boolean)])].map((n) => <option key={n} value={n} />)}</datalist>
            <Field label="Related deal"><select name="deal_id" defaultValue="" style={inputStyle}><option value="">— None —</option>{(deals ?? []).map((x) => <option key={x.id} value={x.id}>{x.title}{x.account_name ? ` · ${x.account_name}` : ""}</option>)}</select></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Amount before GST (₹) *"><input name="amount" type="number" required min={0} step="0.01" style={inputStyle} /></Field>
              <Field label="GST %"><input name="gst" type="number" min={0} max={28} step="0.01" defaultValue={gst} style={inputStyle} /></Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Status"><select name="status" style={inputStyle}><option value="draft">Draft</option><option value="sent">Sent</option></select></Field>
              <Field label="Sent on"><input name="sent_on" type="date" defaultValue={today} style={inputStyle} /></Field>
              <Field label="Follow up on"><input name="follow_up_on" type="date" style={inputStyle} /></Field>
            </div>
            <Field label="Notes"><textarea name="notes" rows={3} maxLength={4000} style={inputStyle} /></Field>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><Btn href={base}>Cancel</Btn><Btn primary>Save</Btn></div>
          </form>
        </Modal>
      )}
    </>
  );
}
