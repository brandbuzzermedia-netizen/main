import type { ReactNode } from "react";

const TABS = [["", "Today"], ["/leads", "Leads"], ["/map", "Map"], ["/leads/new", "+ Add"], ["/import", "Bulk add"], ["/handoffs", "Handoffs"]] as const;

/** Field Sales sub-menu: big, scrollable chips that work one-handed. */
export function FieldTabs({ slug, current, note }: { slug: string; current: string; note?: string | string[] }) {
  return (
    <>
      <nav aria-label="Field sales" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 14, WebkitOverflowScrolling: "touch" }}>
        {TABS.map(([p, l]) => (
          <a key={p} href={`/c/${slug}/field${p}`} aria-current={current === p ? "page" : undefined}
            style={{ flex: "none", minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 16px", borderRadius: 999, fontWeight: 700, fontSize: 14.5, textDecoration: "none",
              background: current === p ? "var(--co-btn)" : "#fff", color: current === p ? "#fff" : "#141414", border: current === p ? 0 : "1px solid #E4E0D6" }}>{l}</a>
        ))}
      </nav>
      {typeof note === "string" && <Banner bad={note.startsWith("Not saved") || note.startsWith("Stopped")}>{note}</Banner>}
    </>
  );
}
export function Banner({ children, bad }: { children: ReactNode; bad?: boolean }) {
  return <div role="status" style={{ background: bad ? "#FDECEC" : "#fff", border: "1px solid #E4E0D6", borderLeft: `4px solid ${bad ? "#B42318" : "var(--co-btn)"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 14.5, lineHeight: 1.45 }}>{children}</div>;
}
export function Box({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ background: "#fff", border: "1px solid #E4E0D6", borderRadius: 14, padding: "16px 16px 14px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8 }}><h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-.01em" }}>{title}</h2>{aside}</div>
      {children}
    </section>
  );
}
