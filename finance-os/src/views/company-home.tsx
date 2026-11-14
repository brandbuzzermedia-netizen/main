import type { ReactNode } from "react";
import { C } from "@/components/dp/theme";
import { Cta, PageHead, Periods } from "@/components/dp/shell";
import { font, side, hi } from "@/components/dp/ui";

export type DeskRow = { key: string; t: string; s: string; a: string; href: string };
export type StageBar = { n: string; cnt: number };
export type HomeVM = {
  own: string; treat: string; title: string; period: string; base: string; cta: { label: string; href: string };
  empty?: { title: string; msg: string; setup: string[] };
  desk: DeskRow[]; bars: StageBar[]; kpis: { l: string; s: string; v: ReactNode; href?: string }[];
  auto: { live: number; pending: number; failed: number; href: string | null };
  today: { time: string; title: string }[];
  footnote?: string;
};

const DESK_TONE = [[side, "#fff"], [hi, side], [C.soft, side], [C.soft, side], [C.red, "#fff"]];
const SHADES = [side, "#2F5D4C", "#829487", hi, "#D8C490", "#B9B4A3", "#DAD5C3", "#8C2F39"];

/** Company home, exactly as the Company OS design. */
export function CompanyHome({ vm }: { vm: HomeVM }) {
  return (
    <>
      <PageHead own={vm.own} treat={vm.treat} title={vm.title} right={<><Periods current={vm.period} base={vm.base} /><Cta href={vm.cta.href}>{vm.cta.label}</Cta></>} />
      {vm.empty ? (
        <div style={{ background: "#fff", border: `1px dashed ${C.dashed}`, borderRadius: 16, padding: 36, maxWidth: 720 }}>
          <div style={{ fontFamily: font, fontSize: 28 }}>{vm.empty.title}</div>
          <div style={{ color: C.body, margin: "8px 0 20px", lineHeight: 1.5 }}>{vm.empty.msg}</div>
          {vm.empty.setup.map((t) => (
            <div key={t} style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 0", borderTop: "1px solid #ece6d6" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", border: "1.5px solid #829487", flex: "none" }} /><span style={{ fontSize: 14.5 }}>{t}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "6px 26px 10px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "20px 0 8px" }}>
                <div style={{ fontFamily: font, fontSize: 24, fontWeight: 500 }}>Closer Desk</div><div style={{ fontSize: 13, color: C.muted }}>Ranked by money at stake</div>
              </div>
              {vm.desk.map((d, i) => (
                <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderTop: `1px solid ${C.line2}` }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: DESK_TONE[i][0], color: DESK_TONE[i][1], display: "grid", placeItems: "center", fontWeight: 700, fontSize: 15, flex: "none" }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 15 }}>{d.t}</div><div style={{ fontSize: 13, color: C.muted, marginTop: 1 }}>{d.s}</div></div>
                  <a href={d.href} style={{ fontSize: 13, fontWeight: 600, color: side, border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "6px 12px", whiteSpace: "nowrap", textDecoration: "none" }}>{d.a}</a>
                </div>
              ))}
            </div>
            <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px" }}>
              <div style={{ fontFamily: font, fontSize: 22, fontWeight: 500, marginBottom: 14 }}>Pipeline by stage</div>
              <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", gap: 2 }} role="img" aria-label={vm.bars.map((b) => `${b.n}: ${b.cnt}`).join(", ")}>
                {vm.bars.map((b, i) => <div key={b.n} style={{ flex: Math.max(b.cnt, 0.3), background: SHADES[i % SHADES.length] }} />)}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 22px", marginTop: 14 }}>
                {vm.bars.map((b, i) => <div key={b.n} style={{ fontSize: 13, display: "flex", gap: 7, alignItems: "center" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: SHADES[i % SHADES.length] }} />{b.n} <b>{b.cnt}</b></div>)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "8px 24px" }}>
              {vm.kpis.map((k, i) => {
                const body = (
                  <>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: C.muted }}>{k.l}</div><div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{k.s}</div></div>
                    <div style={{ fontFamily: font, fontSize: 30, fontWeight: 500, letterSpacing: "-.01em" }}>{k.v}</div>
                  </>
                );
                const st = { display: "flex", alignItems: "center", gap: 12, padding: "15px 0", borderTop: `1px solid ${i ? C.line2 : "transparent"}`, color: "inherit", textDecoration: "none" } as const;
                return k.href ? <a key={k.l} href={k.href} style={st}>{body}</a> : <div key={k.l} style={st}>{body}</div>;
              })}
            </div>
            <div style={{ background: side, color: "#F5F1E8", borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.65)" }}>Automation (n8n)</div>
              <div style={{ fontFamily: font, fontSize: 36, margin: "6px 0" }}>{vm.auto.live} live</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,.8)" }}>{vm.auto.pending} waiting for approval · {vm.auto.failed} failed runs</div>
              {vm.auto.href && <a href={vm.auto.href} style={{ marginTop: 16, display: "inline-block", background: hi, color: side, borderRadius: 9, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, textDecoration: "none" }}>Review approvals</a>}
            </div>
            <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "20px 24px" }}>
              <div style={{ fontFamily: font, fontSize: 20, marginBottom: 8 }}>Today</div>
              {vm.today.length === 0 ? (
                <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>No meetings synced yet. Connect a calendar in Settings, or <a href={`${vm.base}/meetings?add=1`} style={{ color: side }}>add a meeting manually</a>.</div>
              ) : vm.today.map((m) => (
                <div key={m.time + m.title} style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}><b style={{ width: 70, flex: "none" }}>{m.time}</b>{m.title}</div>
              ))}
            </div>
          </div>
        </div>
      )}
      {vm.footnote && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 18 }}>{vm.footnote}</div>}
    </>
  );
}
