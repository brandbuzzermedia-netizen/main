import type { CompanyContext } from "@/lib/workspace";
import { addDays, formatDate, todayInBusinessTz } from "@/domain/dates";
import { formatShort } from "@/domain/money";
import { C } from "@/components/dp/theme";
import { CHANNEL_RULES, ChannelView, OUTREACH_CHANNELS, type ChannelKey } from "@/views/outreach";
import { logOutcomeAction } from "./actions";

const sel = { border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "9px 10px", fontSize: 14, background: "#fff" } as const;
const OUTCOMES: Record<string, string[]> = {
  email: ["sent", "positive", "objection", "not_now", "referral", "wrong_contact", "out_of_office"],
  whatsapp: ["sent", "positive", "objection", "not_now", "referral", "wrong_contact"],
  linkedin: ["sent", "positive", "objection", "not_now", "referral"],
  call: ["connected", "no_answer", "voicemail", "positive", "objection", "not_now", "referral", "wrong_contact"],
  facebook: ["sent", "positive", "objection", "not_now", "referral"],
  instagram: ["sent", "positive", "objection", "not_now", "referral"],
};
const RESPONDED = ["connected", "positive", "objection", "not_now", "referral"];
const NOT_REACHED = ["no_answer", "voicemail", "wrong_contact", "failed"];
const label = (o: string | null) => (o ? o.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase()) : "Logged");
const colour = (o: string | null) => (o === "positive" ? "#2F5D4C" : o && NOT_REACHED.includes(o) ? C.red : C.muted);

/** One outreach channel for one company: numbers from logged activity only, never estimates. */
export async function ChannelSection({ ctx, ch }: { ctx: CompanyContext; ch: ChannelKey }) {
  const slug = ctx.company.slug;
  const org = ctx.company.id;
  const meta = OUTREACH_CHANNELS.find((c) => c.key === ch)!;
  const info = CHANNEL_RULES[ch];
  const since = `${addDays(todayInBusinessTz(), -30)}T00:00:00+05:30`;

  if (ch === "meta-ads") {
    const month = todayInBusinessTz().slice(0, 7) + "-01";
    const [ads, leads, spend] = await Promise.all([
      ctx.supabase.from("ad_approvals").select("headline, channel, status, created_at").eq("organization_id", org).in("channel", ["meta", "instagram"]).order("created_at", { ascending: false }).limit(50),
      ctx.supabase.from("contacts").select("full_name, source, created_at").eq("organization_id", org).or("source.ilike.%meta%,source.ilike.%facebook%,source.ilike.%instagram%").gte("created_at", since).order("created_at", { ascending: false }).limit(50),
      ctx.supabase.from("advertising_budgets").select("platform_spend_minor").eq("organization_id", org).eq("platform", "meta").gte("period_start", month),
    ]);
    const a = (ads.data ?? []) as { headline: string; channel: string; status: string; created_at: string }[];
    const l = (leads.data ?? []) as { full_name: string; source: string | null; created_at: string }[];
    const spent = spend.error ? null : ((spend.data ?? []) as { platform_spend_minor: number }[]).reduce((t, x) => t + Number(x.platform_spend_minor), 0);
    return (
      <ChannelView vm={{
        label: meta.label, status: info.status, how: info.how, rules: info.rules,
        tiles: [
          { l: "Ads waiting for approval", v: a.filter((x) => x.status === "submitted").length, s: "Nothing spends before approval" },
          { l: "Approved or live", v: a.filter((x) => x.status === "approved" || x.status === "published").length },
          { l: "Leads from Meta", v: l.length, s: "Last 30 days" },
          { l: "Ad spend this month", v: spent === null ? "—" : formatShort(spent), s: spent === null ? "Needs finance access" : "Recorded spend, Meta" },
        ],
        log: (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <div style={{ fontFamily: "var(--co-font)", fontSize: 22, fontWeight: 500 }}>Ads for approval</div>
              <a href={`/c/${slug}/marketing`} style={{ fontSize: 13.5, fontWeight: 600, color: "var(--co-side)" }}>Open {ctx.company.name} marketing →</a>
            </div>
            {a.length === 0 && <div style={{ fontSize: 14, color: C.muted, padding: "10px 0", borderTop: `1px solid ${C.line2}` }}>No Meta or Instagram ads yet. Add one in Marketing; it waits for approval before any spend.</div>}
            {a.slice(0, 12).map((x, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}>
                <span>{x.headline} <span style={{ color: C.muted }}>· {x.channel === "instagram" ? "Instagram" : "Facebook / Meta"}</span></span>
                <span style={{ fontWeight: 600, color: x.status === "rejected" ? C.red : x.status === "approved" || x.status === "published" ? "#2F5D4C" : C.warnFg2 }}>{label(x.status)}</span>
              </div>
            ))}
          </>
        ),
        recent: l.slice(0, 15).map((x) => ({ who: x.full_name, what: x.source ?? "Meta", when: formatDate(x.created_at.slice(0, 10)) })),
      }} />
    );
  }

  const kind = meta.kind!;
  const [events, contacts] = await Promise.all([
    ctx.supabase.from("outreach_events").select("outcome, occurred_at, contact:contacts(full_name)").eq("organization_id", org).eq("kind", kind).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(500),
    ctx.supabase.from("contacts").select("id, full_name, company_name, email, phone_e164, consent_basis").eq("organization_id", org).eq("do_not_contact", false).order("created_at", { ascending: false }).limit(200),
  ]);
  const ev = (events.data ?? []) as unknown as { outcome: string | null; occurred_at: string; contact: { full_name: string } | null }[];
  const cs = (contacts.data ?? []) as { id: string; full_name: string; company_name: string | null; email: string | null; phone_e164: string | null; consent_basis: string }[];
  const queue = ch === "calls" ? cs.filter((c) => c.phone_e164).slice(0, 15) : [];
  return (
    <ChannelView vm={{
      label: meta.label, status: info.status, how: info.how, rules: info.rules,
      tiles: [
        { l: ch === "calls" ? "Calls logged" : "Messages logged", v: ev.length, s: "Last 30 days" },
        { l: ch === "calls" ? "Connected or replied" : "Replies", v: ev.filter((e) => e.outcome && RESPONDED.includes(e.outcome)).length },
        { l: "Positive", v: ev.filter((e) => e.outcome === "positive").length, s: "Become qualified leads" },
        { l: "Not reached", v: ev.filter((e) => e.outcome && NOT_REACHED.includes(e.outcome)).length },
      ],
      log: (
        <>
          <div style={{ fontFamily: "var(--co-font)", fontSize: 22, fontWeight: 500, marginBottom: 12 }}>Log {ch === "calls" ? "a call" : `a ${meta.label} message`}</div>
          {cs.length === 0 ? <div style={{ fontSize: 14, color: C.muted }}>No leads you can contact yet. Add leads first; do-not-contact leads never appear here.</div> : (
            <form action={logOutcomeAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="back" value={`/c/${slug}/outreach?ch=${ch}`} />
              <select name="contact_id" aria-label="Lead" style={sel}>
                {cs.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.company_name ? ` · ${c.company_name}` : ""}{c.consent_basis === "none" ? " · no lawful basis" : ""}</option>)}
              </select>
              <select name="outcome" aria-label="Outcome" style={sel}>{OUTCOMES[kind].map((o) => <option key={o} value={o}>{label(o)}</option>)}</select>
              <input name="notes" placeholder="Notes" aria-label="Notes" style={sel} />
              <div><button style={{ background: "var(--co-side)", color: "#fff", border: 0, borderRadius: 9, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Log {ch === "calls" ? "call" : "message"}</button></div>
            </form>
          )}
        </>
      ),
      extra: ch === "calls" ? (
        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px" }}>
          <div style={{ fontFamily: "var(--co-font)", fontSize: 22, fontWeight: 500, marginBottom: 6 }}>Call queue</div>
          {queue.length === 0 && <div style={{ fontSize: 14, color: C.muted, padding: "10px 0", borderTop: `1px solid ${C.line2}` }}>No leads with a phone number yet.</div>}
          {queue.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}>
              <span><b style={{ fontWeight: 600 }}>{c.full_name}</b>{c.company_name ? <span style={{ color: C.muted }}> · {c.company_name}</span> : null}</span>
              <span style={{ color: c.consent_basis === "none" ? C.red : C.muted, whiteSpace: "nowrap" }}>{c.phone_e164}{c.consent_basis === "none" ? " · no lawful basis" : ""}</span>
            </div>
          ))}
        </div>
      ) : undefined,
      recent: ev.slice(0, 15).map((e) => ({ who: e.contact?.full_name ?? "Lead", what: label(e.outcome), when: formatDate(e.occurred_at.slice(0, 10)), c: colour(e.outcome) })),
    }} />
  );
}
