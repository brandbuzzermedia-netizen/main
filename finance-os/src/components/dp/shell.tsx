import type { CSSProperties, ReactNode } from "react";
import { Sidebar, type DpNavItem, type StopControl } from "./sidebar";
import { Bell, Me, MenuButton, Search, Switcher, type WsOption } from "./topbar";
import { WorkspaceLoader } from "./loader";
import { C, type Theme } from "./theme";

/** The Company OS frame: sidebar, sticky top bar and content column, themed per workspace. */
export function DpShell({ theme, wsId, nav, homeHref, stop, note, switcher, search, bell, user, banner, children }: {
  theme: Theme; wsId: string; nav: DpNavItem[]; homeHref: string; stop: StopControl; note: string;
  switcher: { options: WsOption[]; current: string }; search: { placeholder: string; action: string };
  bell: { href: string; count: number }; user: { initials: string; name: string; role: string };
  banner?: ReactNode; children: ReactNode;
}) {
  const vars = { "--co-side": theme.side, "--co-hi": theme.hi, "--co-acc": theme.acc, "--co-font": theme.font } as CSSProperties;
  return (
    <div className="dp-root" style={{ ...vars, display: "flex", height: "100vh", fontFamily: "var(--font-figtree), sans-serif", color: C.ink, background: C.bg, overflow: "hidden" }}>
      <WorkspaceLoader id={wsId} theme={theme} />
      <Sidebar theme={theme} nav={nav} homeHref={homeHref} stop={stop} note={note} />
      <main style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
        <div className="dp-topbar" style={{ position: "sticky", top: 0, zIndex: 5, background: "#F5F1E8ee", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12, padding: "12px 32px" }}>
          <MenuButton />
          <Switcher options={switcher.options} current={switcher.current} acc={theme.acc} />
          <Search placeholder={search.placeholder} action={search.action} />
          <div style={{ flex: 1 }} />
          <Bell href={bell.href} count={bell.count} hi={theme.hi} />
          <Me initials={user.initials} name={user.name} role={user.role} side={theme.side} />
        </div>
        <div className="dp-content" style={{ padding: "28px 32px 64px", maxWidth: 1440 }}>
          {banner}
          {children}
        </div>
      </main>
    </div>
  );
}

/** Page heading: ownership pill and treatment, title in the workspace's display face, period control and main action. */
export function PageHead({ own, treat, title, right, intro }: { own: string; treat: string; title: string; right?: ReactNode; intro?: ReactNode }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: intro ? 16 : 24 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, background: C.soft, color: "var(--co-side)", borderRadius: 6, padding: "3px 9px" }}>{own}</span>
            <span style={{ fontSize: 12.5, color: C.muted }}>{treat}</span>
          </div>
          <h1 style={{ fontFamily: "var(--co-font)", fontWeight: 500, fontSize: 40, letterSpacing: "-.02em", margin: 0, lineHeight: 1.05 }}>{title}</h1>
        </div>
        {right}
      </div>
      {intro && <div style={{ color: C.body, margin: "0 0 20px", maxWidth: 720, lineHeight: 1.5 }}>{intro}</div>}
    </>
  );
}

export function Cta({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} style={{ background: "var(--co-side)", color: "#fff", borderRadius: 10, height: 40, padding: "0 18px", display: "flex", alignItems: "center", fontWeight: 600, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}>{children}</a>;
}

export function Periods({ current, base }: { current: string; base: string }) {
  const tabs: [string, string][] = [["month", "This month"], ["last_month", "Last month"], ["quarter", "Quarter"], ["fy", "FY"]];
  return (
    <nav aria-label="Period" style={{ display: "flex", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: 3, gap: 2 }}>
      {tabs.map(([k, l]) => (
        <a key={k} href={k === "month" ? base : `${base}?period=${k}`} aria-current={current === k ? "page" : undefined}
          style={{ whiteSpace: "nowrap", padding: "7px 13px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, textDecoration: "none", background: current === k ? "var(--co-side)" : "transparent", color: current === k ? "#fff" : C.ink }}>{l}</a>
      ))}
    </nav>
  );
}

export function StopBanner({ name }: { name: string }) {
  return <div role="alert" style={{ background: C.red, color: "#fff", borderRadius: 10, padding: "12px 16px", fontWeight: 600, fontSize: 14, marginBottom: 20 }}>Emergency stop is ON for {name}. Outbound messages and workflow runs are paused. Resume from the sidebar.</div>;
}

export function DemoBanner() {
  return <div style={{ background: C.warnBg, color: C.warnFg, borderRadius: 10, padding: "10px 16px", fontSize: 13.5, marginBottom: 20 }}>Demo workspace. Every name and figure here is made up for development and never mixed with production.</div>;
}
