"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { C, type Theme } from "./theme";
import { Glyph, hasGlyph } from "./icons";

export type DpNavItem = { key: string; label: string; icon: string; href: string; badge?: string; section?: string };
export type StopControl = { slug: string; on: boolean; can: boolean; action: (fd: FormData) => Promise<void> } | null;

const KEY = "dp_side_open";

const mono = "var(--font-mono), ui-monospace, monospace";

export function Sidebar({ theme, nav, homeHref, stop, note, plusHref }: { theme: Theme; nav: DpNavItem[]; homeHref: string; stop: StopControl; note: string; plusHref?: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [shut, setShut] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore a per-viewer preference after hydration
      setOpen(localStorage.getItem(KEY) !== "0");
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    const t = () => setMobile((m) => !m);
    window.addEventListener("dp:toggle-nav", t);
    return () => window.removeEventListener("dp:toggle-nav", t);
  }, []);
  const toggle = () => setOpen((o) => { try { localStorage.setItem(KEY, o ? "0" : "1"); } catch { /* ignore */ } return !o; });
  const active = (href: string) => {
    const p = href.split("?")[0];
    return p === homeHref ? path === p : path === p || path.startsWith(`${p}/`);
  };
  const g = theme.isGroup;
  // Active marker: the brand's button colour when it stands out on the sidebar, else its highlight colour.
  const bar = theme.btn.toLowerCase() !== theme.side.toLowerCase() ? theme.btn : theme.hi;
  const barInk = /^#(?:f|e|d|c)/i.test(bar) ? "#141414" : "#fff";
  const sections: [string, { n: DpNavItem; i: number }[]][] = [];
  nav.forEach((n, idx) => {
    const sec = n.section ?? "";
    const last = sections[sections.length - 1];
    if (last && last[0] === sec) last[1].push({ n, i: idx + 1 }); else sections.push([sec, [{ n, i: idx + 1 }]]);
  });
  const tile: CSSProperties = theme.logo
    ? { height: open ? (g ? 92 : 84) : 48, backgroundColor: theme.logo.bg, backgroundImage: `url(${theme.logo.src})`, backgroundRepeat: "no-repeat",
        backgroundSize: g ? (open ? "auto 135%" : "auto 330%") : open ? theme.logo.size : "auto 170%", backgroundPosition: g && !open ? "50% 15%" : g ? "center 45%" : "center" }
    : { height: open ? 84 : 48, backgroundColor: "rgba(255,255,255,.12)" };
  return (
    <aside className={`dp-aside${mobile ? " dp-aside-open" : ""}`} style={{ width: open ? 252 : 72, flex: "none", background: theme.side, color: C.sideInk, display: "flex", flexDirection: "column", overflow: "hidden", transition: "width .2s" }}>
      <div style={{ padding: "14px 12px 10px" }}>
        <button type="button" onClick={toggle} title="Toggle sidebar" aria-label={`${theme.name}: toggle sidebar`} style={{ ...tile, width: "100%", border: 0, borderRadius: 4, cursor: "pointer", overflow: "hidden", padding: 0, display: "block", color: "inherit", textAlign: "left" }}>
          {!theme.logo && (
            <span style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 14px", fontFamily: theme.font, fontSize: 20, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden" }}>
              {open ? theme.name : theme.name.charAt(0)}
              {open && <span style={{ fontSize: 11.5, opacity: 0.75, fontFamily: "var(--font-figtree)", marginTop: 4 }}>{theme.own}</span>}
            </span>
          )}
        </button>
      </div>
      {open && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 16px 10px", fontFamily: mono, fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>
          <span><span aria-hidden style={{ display: "inline-block", width: 7, height: 7, background: bar, marginRight: 7 }} />{theme.short} OS</span>
          <span>{theme.isGroup ? "Group" : theme.own.length <= 12 ? theme.own : ""}</span>
        </div>
      )}
      <nav aria-label="Main" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 0 8px" }}>
        {sections.map(([sec, items]) => (
          <div key={sec}>
            {open && sec && (
              <button type="button" onClick={() => setShut((x) => ({ ...x, [sec]: !x[sec] }))} aria-expanded={!shut[sec]}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "transparent", border: 0, cursor: "pointer", padding: "14px 16px 6px",
                  fontFamily: mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.45)", borderTop: "1px solid rgba(255,255,255,.08)" }}>
                {sec}<span aria-hidden style={{ fontSize: 9 }}>{shut[sec] ? "▸" : "▾"}</span>
              </button>
            )}
            {!shut[sec] && items.map(({ n, i }) => {
              const a = active(n.href);
              return (
                <Link key={n.key} href={n.href} title={n.label} aria-current={a ? "page" : undefined} onClick={() => setMobile(false)} className="dp-nav"
                  style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 16px", fontSize: 14, whiteSpace: "nowrap", textDecoration: "none", position: "relative",
                    background: a ? "rgba(255,255,255,.08)" : "transparent", color: a ? "#fff" : C.navInk, borderLeft: `3px solid ${a ? bar : "transparent"}` }}>
                  {open && <span style={{ fontFamily: mono, fontSize: 10, color: a ? bar : "rgba(255,255,255,.4)", width: 16 }}>{String(i).padStart(2, "0")}</span>}
                  <span style={{ width: 18, flex: "none", textAlign: "center", fontSize: 14, color: a ? "#fff" : "rgba(255,255,255,.6)", display: "grid", placeItems: "center" }} aria-hidden>{hasGlyph(n.key) ? <Glyph name={n.key} size={17} /> : n.icon}</span>
                  {open && <span style={{ flex: 1, fontWeight: a ? 600 : 500 }}>{n.label}</span>}
                  {n.badge && <span style={{ fontFamily: mono, background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 10.5, borderRadius: 3, padding: "1px 6px" }}>{n.badge}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{ padding: "14px 12px 16px", borderTop: "1px solid rgba(255,255,255,.12)" }}>
        {plusHref && (
          <Link href={plusHref} onClick={() => setMobile(false)} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: open ? "flex-start" : "center", background: bar, color: barInk, borderRadius: 3, padding: "11px 14px", fontWeight: 700, fontSize: 13.5, textDecoration: "none", marginBottom: 12, whiteSpace: "nowrap" }}>
            + {open && (g ? "New lead" : "New deal")}
          </Link>
        )}
        {open && (
          <div style={{ fontFamily: "var(--font-tight)", fontWeight: 800, fontSize: 18, color: "#fff", letterSpacing: "-.02em", marginBottom: 10, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            All in. <span style={{ fontFamily: "var(--font-newsreader)", fontStyle: "italic", fontWeight: 400, color: bar }}>{theme.short}.</span>
          </div>
        )}
        {stop && stop.can && (
          asking ? (
            <form action={(fd) => start(async () => { await stop.action(fd); setAsking(false); })} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input type="hidden" name="on" value="true" />
              <input name="reason" required minLength={5} autoFocus placeholder="Why are you stopping?" aria-label="Reason for emergency stop"
                style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,.35)", background: "rgba(255,255,255,.1)", color: "#fff", padding: "8px 10px", font: "13px var(--font-figtree)" }} />
              <div style={{ display: "flex", gap: 6 }}>
                <button disabled={pending} style={{ flex: 1, borderRadius: 9, padding: "8px", fontSize: 13, fontWeight: 600, background: theme.hi, color: theme.side, border: 0, cursor: "pointer" }}>Stop now</button>
                <button type="button" onClick={() => setAsking(false)} style={{ borderRadius: 9, padding: "8px 10px", fontSize: 13, background: "transparent", color: C.sideInk, border: "1px solid rgba(255,255,255,.35)", cursor: "pointer" }}>Cancel</button>
              </div>
            </form>
          ) : stop.on ? (
            <form action={(fd) => start(() => stop.action(fd))}>
              <input type="hidden" name="on" value="false" />
              <button disabled={pending} title="Company emergency stop" style={{ width: "100%", cursor: "pointer", borderRadius: 9, padding: "9px 10px", fontSize: 13, fontWeight: 600, background: theme.hi, color: theme.side, border: `1px solid ${theme.hi}`, whiteSpace: "nowrap", overflow: "hidden" }}>
                {open ? "Resume company" : "■"}
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setAsking(true)} title="Company emergency stop" style={{ width: "100%", cursor: "pointer", borderRadius: 3, padding: "6px 10px", fontSize: 12, fontWeight: 600, background: "transparent", color: "rgba(255,255,255,.7)", border: "1px solid rgba(255,255,255,.22)", whiteSpace: "nowrap", overflow: "hidden" }}>
              {open ? "Emergency stop" : "■"}
            </button>
          )
        )}
        {open && <div title={note} style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.45)", marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{note}</div>}
      </div>
    </aside>
  );
}
