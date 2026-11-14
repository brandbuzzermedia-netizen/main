import type { ReactNode } from "react";
import { C } from "@/components/dp/theme";
import { font, side } from "@/components/dp/ui";

/** The outreach channels every company has, in the order the owner asked for. */
export const OUTREACH_CHANNELS = [
  { key: "email", label: "Email", kind: "email" },
  { key: "whatsapp", label: "WhatsApp", kind: "whatsapp" },
  { key: "linkedin", label: "LinkedIn", kind: "linkedin" },
  { key: "calls", label: "Cold calls", kind: "call" },
  { key: "facebook", label: "Facebook", kind: "facebook" },
  { key: "instagram", label: "Instagram", kind: "instagram" },
  { key: "meta-ads", label: "Meta ads", kind: null },
] as const;
export type ChannelKey = (typeof OUTREACH_CHANNELS)[number]["key"];

export const CHANNEL_RULES: Record<ChannelKey, { status: string; how: string; rules: string[] }> = {
  email: { status: "Needs connection", how: "Sends through your email provider via n8n once connected. Until then, send from your mailbox and log it here.",
    rules: ["Every email carries an unsubscribe link and your business address", "Opted-out and bounced addresses never get another email", "Bulk sends wait for approval", "Daily send limit per mailbox"] },
  whatsapp: { status: "Needs confirmation", how: "WhatsApp Business API via n8n once your number and templates are approved. Until then, message from the business phone and log it here.",
    rules: ["Only people who opted in to WhatsApp", "The first message uses an approved template", "Free-form replies only within 24 hours of their last message", "A STOP reply blocks the number for this company"] },
  linkedin: { status: "Manual by design", how: "LinkedIn does not allow automated messaging. The OS creates the task; you send from your own profile and log it here.",
    rules: ["Personal connection notes, no copy-paste blasts", "Respect LinkedIn's weekly invitation limits", "Move the conversation to email or a call once they reply", "Log every touch so the setter and closer see the history"] },
  calls: { status: "Manual", how: "Call from your phone. Leads you can work appear in the queue; log the outcome after each call.",
    rules: ["Call between 9 am and 9 pm", "Check numbers against DND / NCPR before calling", "Do-not-contact leads never appear in the queue", "Positive calls become a qualified lead and a meeting task"] },
  facebook: { status: "Needs connection", how: "Page messages arrive through Meta once your Facebook Page is connected via n8n. Until then, reply from Meta Business Suite and log it here.",
    rules: ["Reply to people who messaged your Page; no cold DMs", "Standard replies only within 24 hours of their last message", "Comments that ask for a price go to a private reply", "Log each conversation against the lead"] },
  instagram: { status: "Needs connection", how: "Instagram business DMs arrive through Meta once the account is connected via n8n. Until then, reply in the Instagram app and log it here.",
    rules: ["Reply to DMs, story replies and comments; no cold DMs", "Standard replies only within 24 hours of their last message", "Move buying conversations to WhatsApp or a call", "Log each conversation against the lead"] },
  "meta-ads": { status: "Needs connection", how: "Ad approvals work now. Spend and lead forms sync once your Meta ad account is connected via n8n.",
    rules: ["Every ad is approved before any spend", "Property ads need the RERA number; loan ads fall under Meta's special ad category", "Lead-form leads arrive in Leads with source Meta", "Client ad funds are pass-through, never agency revenue"] },
};

/** Channel tabs under Outreach, styled like the design's Finance tabs. */
export function OutreachTabs({ base, current }: { base: string; current: string }) {
  const tabs: [string, string][] = [["overview", "Overview"], ...OUTREACH_CHANNELS.map((c) => [c.key, c.label] as [string, string])];
  return (
    <nav aria-label="Outreach channels" style={{ display: "flex", gap: 6, borderBottom: `1px solid ${C.line}`, marginBottom: 22, overflowX: "auto" }}>
      {tabs.map(([k, l]) => (
        <a key={k} href={k === "overview" ? base : `${base}?ch=${k}`} aria-current={current === k ? "page" : undefined}
          style={{ padding: "10px 16px", fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", textDecoration: "none", borderBottom: `3px solid ${current === k ? side : "transparent"}`, color: current === k ? side : "#6d7a70" }}>{l}</a>
      ))}
    </nav>
  );
}

export type ChannelVM = {
  label: string; tiles: { l: string; v: ReactNode; s?: string }[];
  recent: { who: string; what: string; when: string; c?: string }[];
  log: ReactNode; extra?: ReactNode; status: string; how: string; rules: string[];
};

const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px" } as const;
const h = (t: string, aside?: ReactNode) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}><div style={{ fontFamily: font, fontSize: 22, fontWeight: 500 }}>{t}</div>{aside}</div>;

/** One channel: last 30 days, log a touch, recent activity, connection and rules. */
export function ChannelView({ vm }: { vm: ChannelVM }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 20 }}>
        {vm.tiles.map((t) => (
          <div key={t.l} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontSize: 13, color: C.muted }}>{t.l}</div>
            <div style={{ fontFamily: font, fontSize: 28, marginTop: 6 }}>{t.v}</div>
            {t.s && <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{t.s}</div>}
          </div>
        ))}
      </div>
      <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={card}>{vm.log}</div>
          {vm.extra}
          <div style={card}>
            {h(`Recent ${vm.label} activity`)}
            {vm.recent.length === 0 && <div style={{ fontSize: 14, color: C.muted, padding: "10px 0", borderTop: `1px solid ${C.line2}` }}>Nothing logged yet.</div>}
            {vm.recent.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}>
                <span><b style={{ fontWeight: 600 }}>{r.who}</b> <span style={{ color: C.muted }}>· {r.when}</span></span>
                <span style={{ color: r.c ?? C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>{r.what}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: side, color: "#fff", borderRadius: 16, padding: "22px 24px" }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)" }}>Connection</div>
            <div style={{ fontFamily: font, fontSize: 26, margin: "6px 0 8px" }}>{vm.status}</div>
            <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.85)", lineHeight: 1.5 }}>{vm.how}</div>
          </div>
          <div style={card}>
            {h(`${vm.label} rules`)}
            {vm.rules.map((r) => <div key={r} style={{ padding: "9px 0", borderTop: `1px solid ${C.line2}`, fontSize: 13.5, lineHeight: 1.45, color: "#3b443f" }}>{r}</div>)}
          </div>
        </div>
      </div>
    </>
  );
}
