import type { ReactNode } from "react";
import { C } from "./theme";

/** Dialog opened by the design's "+ Add" buttons (a ?add= link), closed by a plain link back. */
export function Modal({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(23,24,23,.35)", display: "grid", placeItems: "start center", padding: "8vh 16px", overflow: "auto" }}>
      <a href={closeHref} aria-label="Close" style={{ position: "fixed", inset: 0 }} />
      <section style={{ position: "relative", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px", width: "min(640px, 100%)", boxShadow: "0 20px 60px rgba(0,0,0,.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontFamily: "var(--co-font)", fontSize: 22, fontWeight: 500, margin: 0 }}>{title}</h2>
          <a href={closeHref} aria-label="Close" style={{ fontSize: 20, color: C.muted, textDecoration: "none" }}>×</a>
        </div>
        {children}
      </section>
    </div>
  );
}
