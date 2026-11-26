import { C } from "@/components/dp/theme";
import { font } from "@/components/dp/ui";

export type KanbanCol = { name: string; deals: { id: string; t: string; v: string; hot: boolean; sub?: string; href?: string }[] };

/** Stage columns with deal cards, as the design's Pipeline screen. */
export function Kanban({ cols, empty }: { cols: KanbanCol[]; empty?: { msg: string } }) {
  return (
    <>
      {empty && (
        <div style={{ background: "#fff", border: `1px dashed ${C.dashed}`, borderRadius: 16, padding: 32, maxWidth: 680, marginBottom: 18 }}>
          <div style={{ fontFamily: font, fontSize: 24 }}>No pipeline yet</div><div style={{ color: C.body, marginTop: 8, lineHeight: 1.5 }}>{empty.msg}</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 14, overflow: "auto", paddingBottom: 10 }}>
        {cols.map((col) => (
          <div key={col.name} style={{ flex: "1 0 215px", background: C.colBg, borderRadius: 14, padding: 12, alignSelf: "flex-start" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "2px 4px 12px" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{col.name}</div>
              <div style={{ fontSize: 12, background: "#fff", borderRadius: 10, padding: "1px 8px" }}>{col.deals.length}</div>
            </div>
            {col.deals.map((d) => {
              const body = (
                <>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{d.t}</div>
                  {d.sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{d.sub}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13 }}><span style={{ fontWeight: 700 }}>{d.v}</span><span style={{ color: C.red }}>{d.hot ? "Hot" : ""}</span></div>
                </>
              );
              const st = { display: "block", background: "#fff", borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${C.line}`, borderLeft: "3px solid var(--co-acc)", color: "inherit", textDecoration: "none" } as const;
              return d.href ? <a key={d.id} href={d.href} style={st}>{body}</a> : <div key={d.id} style={st}>{body}</div>;
            })}
          </div>
        ))}
      </div>
    </>
  );
}
