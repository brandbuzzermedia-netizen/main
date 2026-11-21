import type { ReactNode } from "react";
import { C } from "@/components/dp/theme";
import { font } from "@/components/dp/ui";
import type { ExtItem } from "@/domain/design";

/** Company-specific operations screen: compliance gate and module cards, as the design. */
export function OperationsView({ gate, items, base, below }: { gate: [string, string, string]; items: ExtItem[]; base: string; below?: ReactNode }) {
  const red = /block|Needs|Not|Setup/i.test(gate[1]);
  return (
    <>
      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "20px 26px", marginBottom: 20, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: red ? C.red : C.faint }} />
        <div style={{ flex: 1, minWidth: 240 }}><div style={{ fontSize: 12.5, color: C.muted }}>Compliance gate</div><div style={{ fontFamily: font, fontSize: 21, marginTop: 2 }}>{gate[0]}</div><div style={{ fontSize: 13.5, color: C.body, marginTop: 2 }}>{gate[2]}</div></div>
        <div style={{ fontWeight: 700, fontSize: 13.5, background: C.bg, borderRadius: 8, padding: "7px 14px" }}>{gate[1]}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(290px,100%),1fr))", gap: 16 }}>
        {items.map((m) => {
          const body = (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ fontFamily: font, fontSize: 19, lineHeight: 1.2 }}>{m.t}</div>
                <span style={{ fontSize: 11.5, background: C.soft, color: "var(--co-side)", borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>{m.tag}</span>
              </div>
              <div style={{ fontSize: 13.5, color: C.body, marginTop: 10, lineHeight: 1.5 }}>{m.d}</div>
            </>
          );
          const st = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "20px 22px", color: "inherit", textDecoration: "none", display: "block" } as const;
          return m.to ? <a key={m.t} href={`${base}/${m.to}`} style={st}>{body}</a> : <div key={m.t} style={st}>{body}</div>;
        })}
      </div>
      {below}
    </>
  );
}
