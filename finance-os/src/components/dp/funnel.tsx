import { C } from "@/components/dp/theme";
import { font } from "@/components/dp/ui";
import { formatMoney } from "@/domain/money";
import { pct, type Funnel } from "@/lib/funnel";

/** Lead → touch → reply → meeting → won → invoiced → collected, with the step-to-step rate. */
export function FunnelCard({ f, title, periods }: { f: Funnel; title: string; periods: { l: string; href: string; on: boolean }[] }) {
  const steps: { l: string; v: string; rate?: string }[] = [
    { l: "New leads", v: String(f.leads) },
    { l: "Touches sent", v: String(f.touches) },
    { l: "Replies", v: String(f.replies), rate: `${pct(f.replies, f.leads)} of leads` },
    { l: "Meetings", v: String(f.meetings), rate: `${pct(f.meetings, f.replies)} of replies` },
    { l: "Deals won", v: String(f.won), rate: `${pct(f.won, f.meetings)} of meetings · ${formatMoney(f.wonMinor, "INR", { compact: true })}` },
    ...(f.invoicedMinor === null ? [] : [{ l: "Invoiced", v: formatMoney(f.invoicedMinor, "INR", { compact: true }) },
      { l: "Collected", v: formatMoney(f.collectedMinor ?? 0, "INR", { compact: true }), rate: `${pct(f.collectedMinor ?? 0, f.invoicedMinor)} of invoiced` }]),
  ];
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontFamily: font, fontSize: 22, fontWeight: 500 }}>{title}</div>
        <nav aria-label="Period" style={{ display: "flex", gap: 6 }}>
          {periods.map((p) => <a key={p.l} href={p.href} aria-current={p.on ? "page" : undefined} style={{ fontSize: 13, fontWeight: 600, padding: "4px 10px", borderRadius: 7, textDecoration: "none", color: p.on ? "#fff" : "var(--co-side)", background: p.on ? "var(--co-side)" : "transparent", border: `1px solid ${p.on ? "var(--co-side)" : C.btnLine}` }}>{p.l}</a>)}
        </nav>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginTop: 14 }}>
        {steps.map((s, i) => (
          <div key={s.l} style={{ borderLeft: `3px solid ${i < 5 ? "var(--co-side)" : "var(--co-hi)"}`, padding: "4px 0 4px 12px" }}>
            <div style={{ fontSize: 12.5, color: C.muted }}>{s.l}</div>
            <div style={{ fontFamily: font, fontSize: 26, marginTop: 2 }}>{s.v}</div>
            {s.rate && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{s.rate}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Where the best deals come from (More of Us OS report): deals, open and won value by lead source. */
export function SourceTable({ rows }: { rows: { source: string; deals: number; openMinor: number; wonMinor: number }[] }) {
  const th = { textAlign: "right", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: C.muted, fontWeight: 500 } as const;
  const td = { textAlign: "right", padding: "10px", borderTop: `1px solid ${C.line2}`, fontSize: 14 } as const;
  return (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: "22px 26px", marginBottom: 20 }}>
      <div style={{ fontFamily: "var(--font-tight)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em" }}>By lead source</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Where your best deals come from</div>
      {rows.length === 0 ? <div style={{ fontSize: 14, color: C.muted }}>No deals yet.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th style={{ ...th, textAlign: "left" }}>Source</th><th style={th}>Deals</th><th style={th}>Open</th><th style={th}>Won</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.source}><td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{r.source}</td><td style={td}>{r.deals}</td><td style={td}>{formatMoney(r.openMinor, "INR", { compact: true })}</td><td style={td}>{formatMoney(r.wonMinor, "INR", { compact: true })}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
