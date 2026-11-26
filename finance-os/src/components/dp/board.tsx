"use client";

import { useOptimistic, useTransition, type ReactNode } from "react";
import { C } from "./theme";

export type BoardCard = { id: string; col: string; title: string; sub?: string; meta?: string; badge?: { text: string; tone?: "red" | "dark" }; href?: string; initials?: string };
export type BoardColumn = { key: string; label: string };

const mono = "var(--font-mono), ui-monospace, monospace";

/**
 * Kanban board in the More of Us OS style. Drag a card to another column (desktop), or use its
 * "Move to" menu (phone). Each move calls the page's server action with id and status.
 */
export function Board({ columns, cards, move, empty = "Drop here", footer }: {
  columns: BoardColumn[]; cards: BoardCard[]; move: (fd: FormData) => Promise<void>; empty?: string; footer?: (col: string) => ReactNode;
}) {
  const [, start] = useTransition();
  const [view, apply] = useOptimistic(cards, (cur, m: { id: string; col: string }) => cur.map((c) => (c.id === m.id ? { ...c, col: m.col } : c)));
  const go = (id: string, col: string) => start(async () => {
    apply({ id, col });
    const fd = new FormData(); fd.set("id", id); fd.set("status", col);
    await move(fd);
  });
  return (
    <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(250px, 1fr)", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
      {columns.map((col) => {
        const mine = view.filter((c) => c.col === col.key);
        return (
          <section key={col.key} aria-label={col.label} onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) go(id, col.key); }}
            style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: 12, minHeight: 200, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `2px solid ${C.ink}`, paddingBottom: 8 }}>
              <b style={{ fontSize: 13.5 }}>{col.label} <span style={{ fontFamily: mono, fontSize: 10.5, color: C.faint, fontWeight: 400 }}>{mine.length}</span></b>
            </div>
            {mine.length === 0 && <div style={{ border: `1px dashed ${C.dashed}`, borderRadius: 4, padding: "18px 8px", textAlign: "center", fontFamily: mono, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: C.faint }}>{empty}</div>}
            {mine.map((c) => (
              <article key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 4, padding: "11px 12px", cursor: "grab" }}>
                <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{c.href ? <a href={c.href} style={{ color: C.ink, textDecoration: "none" }}>{c.title}</a> : c.title}</div>
                {c.sub && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{c.sub}</div>}
                {c.badge && <div style={{ display: "inline-block", marginTop: 6, fontSize: 11.5, padding: "2px 7px", borderRadius: 2, background: c.badge.tone === "red" ? C.redBg : C.soft, color: c.badge.tone === "red" ? C.red : C.ink }}>{c.badge.text}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 6 }}>
                  <span style={{ fontFamily: mono, fontSize: 10.5, color: C.faint }}>{c.meta}</span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select aria-label={`Move ${c.title} to`} value={c.col} onChange={(e) => go(c.id, e.target.value)}
                      style={{ fontSize: 11.5, border: `1px solid ${C.line}`, borderRadius: 3, background: "#fff", padding: "2px 4px", maxWidth: 110 }}>
                      {columns.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                    {c.initials && <span title="Owner" style={{ width: 24, height: 24, borderRadius: "50%", background: C.ink, color: "#fff", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center" }}>{c.initials}</span>}
                  </span>
                </div>
              </article>
            ))}
            {footer?.(col.key)}
          </section>
        );
      })}
    </div>
  );
}
