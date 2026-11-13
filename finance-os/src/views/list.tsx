import type { ReactNode } from "react";
import { C } from "@/components/dp/theme";
import { font } from "@/components/dp/ui";

export type ListVM = {
  head: [string, string, string, string];
  rows: { a: ReactNode; b: ReactNode; c: ReactNode; d: ReactNode; href?: string }[];
  empty: string; noteTitle: string; noteLines: string[];
  chips?: { l: string; href?: string; on?: boolean }[]; more?: ReactNode;
};
const grid = { display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr", gap: 8 } as const;

/** Table and rules card, as the design's list screens (Leads, Meetings, Customers, Team, Reports, Vault). */
export function ListView({ vm }: { vm: ListVM }) {
  return (
    <>
      {vm.chips && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {vm.chips.map((c) => {
            const st = { fontSize: 13, background: c.on ? "var(--co-side)" : "#fff", color: c.on ? "#fff" : C.ink, border: `1px solid ${C.line}`, borderRadius: 20, padding: "6px 14px", textDecoration: "none" } as const;
            return c.href ? <a key={c.l} href={c.href} style={st}>{c.l}</a> : <span key={c.l} style={st}>{c.l}</span>;
          })}
        </div>
      )}
      <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 20 }}>
        <div style={{ alignSelf: "start", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ ...grid, padding: "13px 24px", fontSize: 12.5, fontWeight: 600, color: C.muted, background: C.headBg }}>{vm.head.map((h) => <span key={h}>{h}</span>)}</div>
            {vm.rows.length === 0 && <div style={{ padding: "36px 24px", color: C.body }}>{vm.empty}</div>}
            {vm.rows.map((r, i) => {
              const body = <><span style={{ fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{r.a}</span><span style={{ minWidth: 0 }}>{r.b}</span><span>{r.c}</span><span style={{ color: C.muted }}>{r.d}</span></>;
              const st = { ...grid, padding: "15px 24px", borderTop: `1px solid ${C.line2}`, fontSize: 14, color: "inherit", textDecoration: "none" } as const;
              return r.href ? <a key={i} href={r.href} style={st}>{body}</a> : <div key={i} style={st}>{body}</div>;
            })}
          </div>
          {vm.more}
        </div>
        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 24px", alignSelf: "start" }}>
          <div style={{ fontFamily: font, fontSize: 22, fontWeight: 500, marginBottom: 6 }}>{vm.noteTitle}</div>
          {vm.noteLines.map((n) => <div key={n} style={{ padding: "9px 0", borderTop: `1px solid ${C.line2}`, fontSize: 13.5, lineHeight: 1.45, color: "#3b443f" }}>{n}</div>)}
        </div>
      </div>
    </>
  );
}

export const NOTES: Record<string, [string, string[]]> = {
  leads: ["Intake rules", ["Deduplicate by email, phone and domain", "Enrich only through approved, legal providers", "Score, classify, assign to owner", "Missing consent: create a human task"]],
  meetings: ["Meeting prep", ["Agenda and account brief auto-drafted", "Notes, outcome, next step, owner, due date", "Positive reply creates a booking task", "Outcome creates proposal task"]],
  customers: ["Account view", ["Contacts, companies, history in one place", "Country and time zone aware", "Opt-out and suppression visible"]],
  marketing: ["Ad rules", ["External campaign activation needs approval", "Regulated claims need approval", "Ad spend tracked separately from revenue"]],
  team: ["Roles & scope", ["Roles set per module, action and record scope", "Invite staff and assign scoped roles", "Employees see only this company", "Partner users see only shared records"]],
  reports: ["Report rules", ["Every export is logged", "Exports respect module permissions", "Finance and payroll need separate access"]],
  vault: ["Vault rules", ["Private storage, short-lived signed links", "Per-company access", "No passwords, OTPs or card data stored"]],
};
