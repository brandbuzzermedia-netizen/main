import { C } from "@/components/dp/theme";
import { font } from "@/components/dp/ui";

export type SearchVM = { q: string; action: string; scope: string; hits: { kind: string; title: string; sub?: string; where?: string; href: string }[] };

/** Search results, in the design's card and row style. Results are scoped to one workspace. */
export function SearchView({ vm }: { vm: SearchVM }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px", maxWidth: 820 }}>
      <form action={vm.action} style={{ display: "flex", gap: 10 }}>
        <input name="q" defaultValue={vm.q} aria-label="Search" placeholder={`Search in ${vm.scope} only…`} style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 14px", fontSize: 14, background: C.bg }} />
        <button style={{ background: "var(--co-side)", color: "#fff", border: 0, borderRadius: 9, padding: "0 18px", fontWeight: 600, cursor: "pointer" }}>Search</button>
      </form>
      <div style={{ fontFamily: font, fontSize: 22, margin: "20px 0 6px" }}>{vm.q.trim().length < 2 ? "Type at least two letters" : `${vm.hits.length} result${vm.hits.length === 1 ? "" : "s"}`}</div>
      {vm.q.trim().length >= 2 && vm.hits.length === 0 && <div style={{ fontSize: 14, color: C.muted, padding: "8px 0" }}>Nothing found in records you can see.</div>}
      {vm.hits.map((h, i) => (
        <a key={i} href={h.href} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: `1px solid ${C.line2}`, color: C.ink, textDecoration: "none" }}>
          <span><span style={{ fontWeight: 600, fontSize: 14.5 }}>{h.title}</span>{h.sub && <span style={{ fontSize: 12.5, color: C.muted }}> · {h.sub}</span>}</span>
          <span style={{ fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>{h.kind}{h.where ? ` · ${h.where}` : ""}</span>
        </a>
      ))}
      <div style={{ fontSize: 12, color: C.muted, marginTop: 12 }}>Search covers deals, leads, customers, tasks and documents your role can read.</div>
    </div>
  );
}
