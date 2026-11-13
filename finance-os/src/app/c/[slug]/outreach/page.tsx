import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { designFor } from "@/domain/design";
import { aiConfig } from "@/integrations/ai/claude";
import { Cta, PageHead } from "@/components/dp/shell";
import { Card, Grid } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";
import { Assistant } from "../assistant/forms";
import { handoverAction, logOutcomeAction } from "./actions";

export const metadata: Metadata = { title: "Outreach" };
const sel = { border: `1px solid ${C.btnLine}`, borderRadius: 7, padding: "5px 8px", fontSize: 12.5, background: "#fff" } as const;
const TRIAGE: [string, (e: { kind: string; outcome: string | null }) => boolean][] = [
  ["Positive", (e) => e.outcome === "positive"], ["Objection", (e) => e.outcome === "objection"], ["Not now", (e) => e.outcome === "not_now"],
  ["Referral", (e) => e.outcome === "referral"], ["Unsubscribe", (e) => e.kind === "unsubscribe"], ["Wrong contact", (e) => e.outcome === "wrong_contact"],
  ["Out of office", (e) => e.outcome === "out_of_office"], ["Human review", (e) => e.kind === "reply" && (!e.outcome || e.outcome === "other")],
];
const CH: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", linkedin_task: "LinkedIn task", call_task: "call task" };

export default async function OutreachPage({ params }: PageProps<"/c/[slug]/outreach">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const d = designFor(slug);
  const org = ctx.company.id;
  const [seqs, events, queue, deals, members, settings] = await Promise.all([
    ctx.supabase.from("outreach_sequences").select("id, name, steps, requires_approval, status").eq("organization_id", org).neq("status", "archived").order("created_at"),
    ctx.supabase.from("outreach_events").select("kind, outcome").eq("organization_id", org).limit(5000),
    ctx.supabase.from("contacts").select("id, full_name, company_name, phone_e164, email, consent_basis").eq("organization_id", org).eq("do_not_contact", false).in("lead_status", ["new", "contacted"]).order("created_at").limit(30),
    ctx.supabase.from("deals").select("id, title, account_name, handed_over_at").eq("organization_id", org).is("closed_at", null).order("last_activity_at", { ascending: false }).limit(200),
    loadMembers(ctx.supabase, org),
    ctx.supabase.from("app_settings").select("ai_enabled").eq("organization_id", org).maybeSingle(),
  ]);
  const ev = (events.data ?? []) as { kind: string; outcome: string | null }[];
  const closers = members.filter((m) => ["owner", "sales_manager", "sales_rep", "company_admin"].includes(m.role) && m.user_id !== ctx.userId);
  const aiOn = Boolean(settings.data?.ai_enabled) && !aiConfig().mock;
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title={d.ren.outreach ?? "Outreach"} right={ctx.can("crm.manage") ? <Cta href={`/c/${slug}/r/sequences`}>+ Add</Cta> : undefined}
        intro="Sequences run in n8n. If a channel is unsupported or consent is missing, the step becomes a human task for you." />
      <Grid cols="minmax(0,1.4fr) minmax(0,1fr)">
        <Card title="Sequences">
          {(seqs.data ?? []).length === 0 && <div style={{ padding: "14px 0", borderTop: `1px solid ${C.line2}`, marginTop: 12, fontSize: 14, color: C.muted }}>No sequences yet. Add one with + Add; every bulk send waits for approval.</div>}
          {((seqs.data ?? []) as { id: string; name: string; steps: { channel: string; delay_days?: number }[]; requires_approval: boolean; status: string }[]).map((q) => (
            <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderTop: `1px solid ${C.line2}`, marginTop: 12 }}>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{q.name}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{q.steps.length ? `${q.steps.map((s) => CH[s.channel] ?? s.channel).join(" → ")} · ${q.steps.reduce((t, s) => t + (s.delay_days ?? 0), 0)} days` : "No steps yet"} · {q.status}</div></div>
              <span style={{ fontSize: 12, background: C.soft, color: "var(--co-side)", borderRadius: 6, padding: "3px 9px" }}>{q.requires_approval ? "Approval for bulk" : "Auto"}</span>
            </div>
          ))}
          <div style={{ marginTop: 14, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>Before every send: opt-out and suppression check, daily channel limits, country rules. Bulk sends need approval.</div>
        </Card>
        <Card title="Reply triage">
          {TRIAGE.map(([n, f]) => <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}><span>{n}</span><span style={{ color: C.muted }}>{ev.filter(f).length}</span></div>)}
          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: "var(--co-side)" }}>Positive reply creates a meeting task and booking link.</div>
        </Card>
      </Grid>
      <Grid cols="minmax(0,1.4fr) minmax(0,1fr)" style={{ marginTop: 20 }}>
        <Card title="Call queue" aside={`${(queue.data ?? []).length} to contact`}>
          {(queue.data ?? []).length === 0 && <div style={{ fontSize: 14, color: C.muted, padding: "10px 0" }}>Nobody waiting. New and contacted leads you can see appear here; do-not-contact never does.</div>}
          {((queue.data ?? []) as { id: string; full_name: string; company_name: string | null; phone_e164: string | null; email: string | null; consent_basis: string }[]).map((c) => (
            <div key={c.id} style={{ padding: "12px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><b>{c.full_name}{c.company_name ? ` · ${c.company_name}` : ""}</b>
                <span style={{ color: c.consent_basis === "none" ? C.red : C.muted, fontSize: 12.5 }}>{c.phone_e164 ?? c.email ?? "No contact detail"}{c.consent_basis === "none" ? " · no lawful basis" : ""}</span></div>
              <form action={logOutcomeAction.bind(null, slug)} style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <input type="hidden" name="contact_id" value={c.id} />
                <select name="kind" aria-label="Activity" style={sel}><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="reply">Reply received</option><option value="unsubscribe">Asked not to be contacted</option></select>
                <select name="outcome" aria-label="Outcome" style={sel}>{["connected", "no_answer", "voicemail", "positive", "objection", "not_now", "referral", "wrong_contact", "out_of_office"].map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}</select>
                <input name="notes" placeholder="Notes" aria-label="Notes" style={{ ...sel, flex: 1, minWidth: 120 }} />
                <button style={{ ...sel, cursor: "pointer", fontWeight: 600 }}>Log</button>
              </form>
            </div>
          ))}
        </Card>
        <Card title="Hand over to a closer">
          {(deals.data ?? []).filter((x) => !x.handed_over_at).length && closers.length ? (
            <form action={handoverAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <select name="deal_id" aria-label="Deal" style={{ ...sel, fontSize: 14, padding: "9px 10px" }}>{(deals.data ?? []).filter((x) => !x.handed_over_at).map((x) => <option key={x.id as string} value={x.id as string}>{x.title as string}</option>)}</select>
              <select name="closer_id" aria-label="Closer" style={{ ...sel, fontSize: 14, padding: "9px 10px" }}>{closers.map((m) => <option key={m.user_id} value={m.user_id}>{m.name} · {ROLE_LABELS[m.role]}</option>)}</select>
              <input name="note" placeholder="Context for the closer" aria-label="Note" style={{ ...sel, fontSize: 14, padding: "9px 10px" }} />
              <div><button style={{ background: "var(--co-side)", color: "#fff", border: 0, borderRadius: 9, padding: "9px 16px", fontWeight: 600, cursor: "pointer" }}>Hand over</button></div>
            </form>
          ) : <div style={{ fontSize: 14, color: C.muted, paddingTop: 8 }}>No open deals to hand over, or no closers in the team.</div>}
        </Card>
      </Grid>
      <section id="draft" style={{ marginTop: 20 }}>
        <Card title="Draft a follow-up with Claude" aside={aiOn ? "Drafts never send themselves" : aiConfig().mock ? "No API key on the server" : "Switched off in Settings"}>
          <div style={{ marginTop: 10 }}>
            <Assistant slug={slug} enabled={aiOn} deals={(deals.data ?? []).map((x) => ({ id: x.id as string, label: `${x.title}${x.account_name ? ` · ${x.account_name}` : ""}` }))} />
          </div>
        </Card>
      </section>
    </>
  );
}
