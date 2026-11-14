import type { ReactNode } from "react";
import { C } from "./theme";
import { addSenderAccountAction, senderAccountStatusAction } from "@/app/c/[slug]/actions";

export type SenderAccount = { id: string; channel: string; kind: string; label: string; address: string; account_key: string; daily_limit: number; status: string; shared?: boolean; operator?: string | null; sentToday?: number };
const CH: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", linkedin: "LinkedIn", twitter: "X (Twitter)", instagram: "Instagram", facebook: "Facebook", reddit: "Reddit" };
const KIND: Record<string, string> = { mailbox: "Mailbox", business_number: "Business number", page: "Page", business_account: "Business account", personal_profile: "Personal profile (sent by its owner)" };
const MAX: Record<string, number> = { email: 200, whatsapp: 1000, linkedin: 25, twitter: 50, instagram: 50, facebook: 50, reddit: 10 };
const field = { border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, background: "#fff" } as const;
const btn = { ...field, cursor: "pointer", fontWeight: 600, padding: "6px 10px" } as const;

/** Sending accounts with their daily pace; bulk sends spread across them inside each platform's limits. */
export function AccountsCard({ slug, accounts, operators, canEdit, note, extra, title }: {
  slug: string | null; accounts: SenderAccount[]; operators: { id: string; name: string }[]; canEdit: boolean; note?: string; extra?: ReactNode; title: string;
}) {
  return (
    <section id="accounts" style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px", scrollMarginTop: 96 }}>
      <div style={{ fontFamily: "var(--co-font)", fontSize: 22, fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, margin: "4px 0 10px" }}>
        Bulk sends are spread across these accounts, each within its daily limit (new mailboxes warm up from 10 a day). Pages and business numbers send automatically;
        personal LinkedIn, Instagram, Facebook, X and Reddit profiles get drafted tasks that their owner sends. Passwords and tokens stay in n8n under each account&apos;s key.
      </div>
      {note && <div role="status" style={{ background: C.soft, color: "var(--co-side)", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>{note}</div>}
      {accounts.length === 0 && <div style={{ padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14, color: C.muted }}>No accounts yet.</div>}
      {accounts.map((a) => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            <b style={{ fontWeight: 600 }}>{CH[a.channel]} · {a.label}</b>{a.shared ? <span style={{ fontSize: 12, color: C.muted }}> · shared with all companies</span> : null}
            <div style={{ fontSize: 12.5, color: C.muted }}>{KIND[a.kind]} · {a.address}{a.operator ? ` · ${a.operator}` : ""} · key {a.account_key}</div>
          </span>
          <span style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap" }}>{a.sentToday ?? 0} / {a.daily_limit} today</span>
          <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 9px", background: a.status === "active" ? C.soft : "#F3E7C4", color: a.status === "active" ? "#2F5D4C" : "#7a5b00" }}>{a.status === "active" ? "Active" : "Paused"}</span>
          {canEdit && (!a.shared || slug === null) && (
            <form action={senderAccountStatusAction.bind(null, slug)} style={{ display: "flex", gap: 6 }}>
              <input type="hidden" name="account_id" value={a.id} />
              <button name="status" value={a.status === "active" ? "paused" : "active"} style={btn}>{a.status === "active" ? "Pause" : "Resume"}</button>
              <button name="remove" value="1" style={{ ...btn, color: C.red }}>Remove</button>
            </form>
          )}
        </div>
      ))}
      {canEdit && (
        <form action={addSenderAccountAction.bind(null, slug)} style={{ display: "flex", flexWrap: "wrap", gap: 8, borderTop: `1px solid ${C.line2}`, paddingTop: 12, marginTop: 4 }}>
          <select name="channel" aria-label="Channel" style={field}>{Object.entries(CH).map(([k, l]) => <option key={k} value={k}>{l} (max {MAX[k]}/day)</option>)}</select>
          <select name="kind" aria-label="Type" style={field}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input name="label" required placeholder="Name, e.g. Sales mailbox 2" aria-label="Name" style={{ ...field, flex: 1, minWidth: 160 }} />
          <input name="address" required placeholder="Email, number, Page or profile link" aria-label="Address or handle" style={{ ...field, flex: 1, minWidth: 200 }} />
          <input name="daily_limit" type="number" min={1} max={1000} defaultValue={30} aria-label="Daily limit" style={{ ...field, width: 90 }} />
          <select name="operator_id" aria-label="Operated by" style={field}><option value="">Operated by (for personal profiles)</option>{operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          <button style={{ ...btn, background: "var(--co-side)", color: "#fff", border: 0, padding: "8px 16px" }}>Add account</button>
        </form>
      )}
      {extra}
    </section>
  );
}
