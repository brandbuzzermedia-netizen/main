import type { ReactNode } from "react";
import { C } from "@/components/dp/theme";
import { Toggle, font, hi, side } from "@/components/dp/ui";

export type AutomationVM = {
  wfs: { n: string; meta: string; on: boolean; toggle?: (fd: FormData) => Promise<void>; dry?: (fd: FormData) => Promise<void>; extra?: ReactNode }[];
  dry?: string;
  pending: { id: string; t: string; s: string }[]; decide?: (fd: FormData) => Promise<void>;
  runs: { n: string; s: string; c: string; retry?: ReactNode }[];
  conns: { n: string; s: string }[];
  libraryAside?: string;
};

const chip = { fontSize: 12.5, border: `1px solid ${C.btnLine}`, borderRadius: 7, padding: "5px 10px", cursor: "pointer", background: "transparent", color: C.ink } as const;

/** Automation screen, as the Company OS design. */
export function AutomationView({ vm }: { vm: AutomationVM }) {
  return (
    <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 20 }}>
      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px", alignSelf: "start" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><div style={{ fontFamily: font, fontSize: 22 }}>Workflow library</div><div style={{ fontSize: 12.5, color: C.muted }}>{vm.libraryAside ?? "Signed n8n webhooks"}</div></div>
        {vm.wfs.map((w) => (
          <div key={w.n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderTop: `1px solid ${C.line2}`, marginTop: 12 }}>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14.5 }}>{w.n}</div><div style={{ fontSize: 12.5, color: C.muted }}>{w.meta}</div></div>
            {w.extra}
            {w.dry && <form action={w.dry}><input type="hidden" name="name" value={w.n} /><button style={chip}>Dry run</button></form>}
            {w.toggle ? (
              <form action={w.toggle}><input type="hidden" name="name" value={w.n} /><input type="hidden" name="on" value={String(!w.on)} />
                <button aria-label={`${w.on ? "Turn off" : "Turn on"} ${w.n}`} aria-pressed={w.on} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", display: "flex" }}><Toggle on={w.on} /></button></form>
            ) : w.toggle === undefined && w.dry ? <Toggle on={w.on} /> : null}
          </div>
        ))}
        {vm.dry && <div role="status" style={{ marginTop: 14, background: C.bg, borderRadius: 8, padding: 12, fontSize: 13 }}>{vm.dry}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ background: side, color: "#fff", borderRadius: 16, padding: "22px 24px" }}>
          <div style={{ fontFamily: font, fontSize: 22, marginBottom: 4 }}>Approval inbox · {vm.pending.length}</div>
          {vm.pending.length === 0 && <div style={{ color: "rgba(255,255,255,.8)", fontSize: 14, padding: "8px 0" }}>Nothing waiting. High-impact actions land here first.</div>}
          {vm.pending.map((p) => (
            <div key={p.id} style={{ borderTop: "1px solid rgba(255,255,255,.18)", padding: "14px 0" }}>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.t}</div><div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", margin: "3px 0 10px" }}>{p.s}</div>
              {vm.decide ? (
                <form action={vm.decide} style={{ display: "flex", gap: 8 }}><input type="hidden" name="id" value={p.id} />
                  <button name="approve" value="true" style={{ background: hi, color: side, border: 0, borderRadius: 7, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Approve</button>
                  <button name="approve" value="false" style={{ border: "1px solid rgba(255,255,255,.4)", background: "transparent", color: "#fff", borderRadius: 7, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>Reject</button></form>
              ) : <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)" }}>Waiting for an owner</div>}
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 24px" }}>
          <div style={{ fontFamily: font, fontSize: 22, marginBottom: 6 }}>Run history</div>
          {vm.runs.length === 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderTop: `1px solid ${C.line2}`, fontSize: 13.5 }}><span>No runs yet. Dry-run a workflow.</span><span style={{ color: C.muted, fontWeight: 600 }}>—</span></div>}
          {vm.runs.map((r, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "9px 0", borderTop: `1px solid ${C.line2}`, fontSize: 13.5 }}><span>{r.n}</span><span style={{ display: "flex", gap: 8, alignItems: "center" }}>{r.retry}<span style={{ color: r.c, fontWeight: 600 }}>{r.s}</span></span></div>)}
          <div style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>Idempotency keys stop retries duplicating messages, invoices or orders.</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 24px" }}>
          <div style={{ fontFamily: font, fontSize: 22, marginBottom: 6 }}>Connections</div>
          {vm.conns.map((c) => <div key={c.n} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 14 }}><span>{c.n}</span><span style={{ color: C.muted }}>{c.s}</span></div>)}
        </div>
      </div>
    </div>
  );
}

export const RUN_COLOR: Record<string, string> = { succeeded: "#2F5D4C", failed: "#8C2F39", pending_approval: "#7a5b00", queued: "#6d7a70", running: "#6d7a70", cancelled: "#6d7a70", needs_attention: "#8C2F39" };
