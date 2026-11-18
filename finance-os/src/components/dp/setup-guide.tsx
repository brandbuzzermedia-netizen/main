import { C } from "@/components/dp/theme";
import { font, side, hi } from "@/components/dp/ui";
import type { SetupGuide, SetupStep } from "@/lib/setup-guide";

function Step({ s, n }: { s: SetupStep; n: number | null }) {
  return (
    <a href={s.href} style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 0", borderTop: `1px solid ${C.line2}`, textDecoration: "none", color: C.ink }}>
      <span aria-hidden style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14,
        background: s.done ? side : n === null ? C.line2 : hi, color: s.done ? "#fff" : side }}>{s.done ? "✓" : n ?? "•"}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 14.5, textDecoration: s.done ? "line-through" : undefined, color: s.done ? C.muted : C.ink }}>{s.title}</span>
        {s.detail && <span style={{ fontSize: 12.5, color: C.muted }}> · {s.detail}</span>}
        <span style={{ display: "block", fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{s.why}</span>
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: s.done ? C.muted : side, whiteSpace: "nowrap" }}>{s.done ? "Done" : n === null ? "Set up →" : "Do this →"}</span>
    </a>
  );
}

/** "Get started" on a company's home page until its first steps are done. Steps tick themselves off from real records. */
export function SetupGuideCard({ g }: { g: SetupGuide }) {
  if (g.done === g.total) return null;
  const pct = Math.round((g.done / g.total) * 100);
  let n = 0;
  return (
    <section aria-label="Get started" style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: font, fontSize: 24 }}>Get started</div>
          <div style={{ fontSize: 13.5, color: C.body, marginTop: 4 }}>Do these in order. Each one ticks itself off as soon as it is done.</div>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: side }}>{g.done} of {g.total} done</div>
      </div>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress" style={{ height: 8, borderRadius: 4, background: C.line2, margin: "14px 0 6px", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: side }} />
      </div>
      <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 28 }}>
        <div>{g.steps.map((s) => <Step key={s.key} s={s} n={s.done ? 0 : ++n} />)}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.muted, margin: "10px 0 2px" }}>Connections (when the accounts are ready)</div>
          {g.connections.map((s) => <Step key={s.key} s={s} n={null} />)}
        </div>
      </div>
    </section>
  );
}

/** Group home: how far each company's setup has got. */
export function SetupProgressCard({ rows }: { rows: { name: string; slug: string; done: number; total: number; next: string | null }[] }) {
  const open = rows.filter((r) => r.done < r.total);
  if (open.length === 0) return null;
  return (
    <section aria-label="Setup progress" style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px", marginBottom: 20 }}>
      <div style={{ fontFamily: font, fontSize: 24 }}>Setup progress</div>
      <div style={{ fontSize: 13.5, color: C.body, margin: "4px 0 10px" }}>Start with your strongest companies. Each company&apos;s home page shows its next steps.</div>
      {rows.map((r) => (
        <a key={r.slug} href={`/c/${r.slug}`} style={{ display: "flex", gap: 14, alignItems: "center", padding: "10px 0", borderTop: `1px solid ${C.line2}`, textDecoration: "none", color: C.ink, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, width: 200 }}>{r.name}</span>
          <span style={{ flex: 1, minWidth: 120, height: 8, borderRadius: 4, background: C.line2, overflow: "hidden" }}><span style={{ display: "block", width: `${Math.round((r.done / r.total) * 100)}%`, height: "100%", background: C.ink }} /></span>
          <span style={{ fontSize: 13, color: C.muted, width: 70, textAlign: "right" }}>{r.done}/{r.total}</span>
          <span style={{ fontSize: 13, color: r.next ? C.ink : C.muted, width: 260 }}>{r.next ? `Next: ${r.next}` : "Ready"}</span>
        </a>
      ))}
    </section>
  );
}
