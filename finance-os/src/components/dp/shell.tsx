import type { CSSProperties, ReactNode } from "react";
import { Sidebar, type DpNavItem, type StopControl } from "./sidebar";
import { Bell, Me, MenuButton, Search, Switcher, type BellItem, type WsOption } from "./topbar";
import { markActivitySeenAction } from "@/app/activity-actions";
import { WorkspaceLoader } from "./loader";
import { TabBar } from "./tabbar";
import { InstallButton } from "./app-install";
import { C, type Theme } from "./theme";

/** The Company OS frame: sidebar, sticky top bar and content column, themed per workspace. */
export function DpShell({ theme, wsId, nav, homeHref, stop, note, switcher, search, bell, user, banner, children, plusHref }: {
  theme: Theme; wsId: string; nav: DpNavItem[]; homeHref: string; stop: StopControl; note: string;
  switcher: { options: WsOption[]; current: string }; search: { placeholder: string; action: string };
  bell: { href: string; count: number; items?: BellItem[]; unread?: number; allHref?: string }; user: { initials: string; name: string; role: string };
  banner?: ReactNode; children: ReactNode; plusHref?: string;
}) {
  const vars = { "--co-side": theme.side, "--co-hi": theme.hi, "--co-acc": theme.acc, "--co-font": theme.font, "--co-btn": theme.btn } as CSSProperties;
  return (
    <div className="dp-root" style={{ ...vars, display: "flex", height: "100vh", fontFamily: "var(--font-figtree), sans-serif", color: C.ink, background: C.bg, overflow: "hidden" }}>
      <WorkspaceLoader id={wsId} theme={theme} />
      <Sidebar theme={theme} nav={nav} homeHref={homeHref} stop={stop} note={note} plusHref={plusHref} />
      <main style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
        <div className="dp-topbar" style={{ position: "sticky", top: 0, zIndex: 5, background: `${C.bg}f2`, backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10, padding: "12px 32px" }}>
          <MenuButton />
          <Search placeholder={search.placeholder} action={search.action} />
          <Switcher options={switcher.options} current={switcher.current} acc={theme.btn} />
          <div className="dp-spacer" style={{ flex: 1 }} />
          <InstallButton />
          <Bell href={bell.href} count={bell.count} hi={theme.btn} items={bell.items} unread={bell.unread} allHref={bell.allHref} markSeen={markActivitySeenAction} />
          <Me initials={user.initials} name={user.name} role={user.role} side={C.ink} />
          {plusHref && (
            <a href={plusHref} aria-label="New" title="New" style={{ width: 40, height: 40, borderRadius: "50%", background: theme.btn, color: "#fff", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 400, textDecoration: "none", flex: "none" }}>+</a>
          )}
        </div>
        <div className="dp-content" style={{ padding: "28px 32px 64px", maxWidth: 1440 }}>
          {banner}
          {children}
        </div>
      </main>
      <TabBar nav={nav} />
    </div>
  );
}

const mono = "var(--font-mono), ui-monospace, monospace";
/** More of Us OS headings: section and a two-part title (heavy statement, italic follow-through). */
const TAGS: [RegExp, string, string][] = [
  [/import/i, "Sales", "Lists in, in minutes."], [/follow/i, "Sales", "Every time."], [/research/i, "Sales", "Know them first."], [/proposal/i, "Finance", "That close."], [/lead/i, "Sales", "Every one counted."], [/outreach/i, "Sales", "Log everything."],
  [/pipeline|quotes|crm|order board/i, "Sales", "Every deal, one board."], [/meeting|calendar/i, "Sales", "On record."],
  [/customer|client|dealer|buyer/i, "Sales", "For the long run."], [/delivery|catalogue|fulfil|operation/i, "Operations", "On time, every time."],
  [/campaign|marketing/i, "Operations", "Seen everywhere."], [/automation/i, "Operations", "Hands off."], [/invoice|receivable/i, "Finance", "Paid on time."],
  [/tax/i, "Finance", "Filed right."], [/rental|rent/i, "Finance", "Collected on time."], [/expense|bill/i, "Finance", "Under control."],
  [/finance|ledger|money/i, "Finance", "Every rupee traced."], [/team|people/i, "People & insight", "One goal."], [/report/i, "People & insight", "What's working."],
  [/vault|document/i, "System", "Everything filed."], [/settings/i, "System", ""],
];

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: mono, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: C.muted, marginBottom: 10, flexWrap: "wrap" }}>
      <span aria-hidden style={{ width: 22, height: 2, background: "var(--co-btn)" }} />{children}
    </div>
  );
}

export function TwoPartTitle({ bold, italic, size = 46 }: { bold: string; italic?: string; size?: number }) {
  return (
    <h1 style={{ fontFamily: "var(--font-tight), sans-serif", fontWeight: 800, fontSize: size, letterSpacing: "-.035em", margin: 0, lineHeight: 1.02 }}>
      {bold}{italic && <> <span style={{ fontFamily: "var(--font-newsreader), serif", fontStyle: "italic", fontWeight: 400, letterSpacing: "-.02em" }}>{italic}</span></>}
    </h1>
  );
}

/** Page heading: ownership pill and treatment, title in the workspace's display face, period control and main action. */
export function PageHead({ own, treat, title, right, intro, tag }: { own: string; treat: string; title: string; right?: ReactNode; intro?: ReactNode; tag?: string }) {
  const t = TAGS.find(([re]) => re.test(title));
  const team = /^(team|people)$/i.test(title);
  const bold = team ? "One team." : /[.?!]$/.test(title) ? title : `${title}.`;
  const italic = tag ?? t?.[2];
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: intro ? 14 : 24 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <Eyebrow>{t ? `${t[1]} · ${title}` : title}<span style={{ color: C.faint }}>· {own} · {treat}</span></Eyebrow>
          <TwoPartTitle bold={bold} italic={italic || undefined} />
        </div>
        {right}
      </div>
      {intro && <div style={{ color: C.body, margin: "0 0 20px", maxWidth: 720, lineHeight: 1.5 }}>{intro}</div>}
    </>
  );
}

export function Cta({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} style={{ background: "var(--co-btn)", color: "#fff", borderRadius: 3, height: 42, padding: "0 18px", display: "flex", alignItems: "center", fontWeight: 700, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}>{children}</a>;
}

export function Periods({ current, base }: { current: string; base: string }) {
  const tabs: [string, string][] = [["month", "This month"], ["last_month", "Last month"], ["quarter", "Quarter"], ["fy", "FY"]];
  return (
    <nav aria-label="Period" style={{ display: "flex", background: C.card, border: `1px solid ${C.line}`, borderRadius: 3, padding: 0, gap: 0 }}>
      {tabs.map(([k, l]) => (
        <a key={k} href={k === "month" ? base : `${base}?period=${k}`} aria-current={current === k ? "page" : undefined}
          style={{ whiteSpace: "nowrap", padding: "10px 14px", fontSize: 13.5, fontWeight: 600, textDecoration: "none", borderLeft: `1px solid ${C.line}`, background: current === k ? C.ink : "transparent", color: current === k ? "#fff" : C.ink }}>{l}</a>
      ))}
    </nav>
  );
}

export function StopBanner({ name }: { name: string }) {
  return <div role="alert" style={{ background: C.red, color: "#fff", borderRadius: 10, padding: "12px 16px", fontWeight: 600, fontSize: 14, marginBottom: 20 }}>Emergency stop is ON for {name}. Outbound messages and workflow runs are paused. Resume from the sidebar.</div>;
}


/** Shown to the whole team while any client is on a payment hold. */
export function HoldBanner({ slug, clients }: { slug: string; clients: string[] }) {
  return (
    <div role="alert" style={{ background: "#F5DADA", color: C.red, border: `1px solid ${C.red}33`, borderRadius: 10, padding: "12px 16px", fontSize: 14, marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <b>Work on hold, payment overdue:</b> <span style={{ flex: 1 }}>{clients.join(", ")}. Do not start or deliver new work for {clients.length === 1 ? "this client" : "these clients"}.</span>
      <a href={`/c/${slug}/finance`} style={{ color: C.red, fontWeight: 700 }}>See holds →</a>
    </div>
  );
}
