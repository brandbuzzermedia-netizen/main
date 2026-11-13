"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { C, type Theme } from "./theme";

export type DpNavItem = { key: string; label: string; icon: string; href: string; badge?: string };
export type StopControl = { slug: string; on: boolean; can: boolean; action: (fd: FormData) => Promise<void> } | null;

const KEY = "dp_side_open";

export function Sidebar({ theme, nav, homeHref, stop, note }: { theme: Theme; nav: DpNavItem[]; homeHref: string; stop: StopControl; note: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
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
  const tile: CSSProperties = theme.logo
    ? { height: open ? (g ? 92 : 84) : 48, backgroundColor: theme.logo.bg, backgroundImage: `url(${theme.logo.src})`, backgroundRepeat: "no-repeat",
        backgroundSize: g ? (open ? "auto 135%" : "auto 330%") : open ? theme.logo.size : "auto 170%", backgroundPosition: g && !open ? "50% 15%" : g ? "center 45%" : "center" }
    : { height: open ? 84 : 48, backgroundColor: "rgba(255,255,255,.12)" };
  return (
    <aside className={`dp-aside${mobile ? " dp-aside-open" : ""}`} style={{ width: open ? 252 : 72, flex: "none", background: theme.side, color: C.sideInk, display: "flex", flexDirection: "column", overflow: "hidden", transition: "width .2s" }}>
      <div style={{ padding: "14px 12px 10px" }}>
        <button type="button" onClick={toggle} title="Toggle sidebar" aria-label={`${theme.name}: toggle sidebar`} style={{ ...tile, width: "100%", border: 0, borderRadius: 12, cursor: "pointer", overflow: "hidden", padding: 0, display: "block", color: "inherit", textAlign: "left" }}>
          {!theme.logo && (
            <span style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 14px", fontFamily: theme.font, fontSize: 20, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden" }}>
              {open ? theme.name : theme.name.charAt(0)}
              {open && <span style={{ fontSize: 11.5, opacity: 0.75, fontFamily: "var(--font-figtree)", marginTop: 4 }}>{theme.own}</span>}
            </span>
          )}
        </button>
      </div>
      <nav aria-label="Main" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 10px" }}>
        {nav.map((n) => {
          const a = active(n.href);
          return (
            <Link key={n.key} href={n.href} title={n.label} aria-current={a ? "page" : undefined} onClick={() => setMobile(false)} className="dp-nav"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 11px", marginBottom: 2, borderRadius: 9, fontSize: 14.5, whiteSpace: "nowrap", textDecoration: "none",
                background: a ? "rgba(255,255,255,.16)" : "transparent", color: a ? "#fff" : C.navInk }}>
              <span style={{ width: 22, flex: "none", textAlign: "center", fontSize: 15, color: a ? theme.hi : "rgba(255,255,255,.65)" }} aria-hidden>{n.icon}</span>
              {open && <span style={{ flex: 1 }}>{n.label}</span>}
              {n.badge && <span style={{ background: theme.hi, color: theme.side, fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "1px 7px" }}>{n.badge}</span>}
            </Link>
          );
        })}
      </nav>
      <div style={{ padding: "14px 12px 16px", borderTop: "1px solid rgba(255,255,255,.15)" }}>
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
            <button type="button" onClick={() => setAsking(true)} title="Company emergency stop" style={{ width: "100%", cursor: "pointer", borderRadius: 9, padding: "9px 10px", fontSize: 13, fontWeight: 600, background: "transparent", color: C.sideInk, border: "1px solid rgba(255,255,255,.35)", whiteSpace: "nowrap", overflow: "hidden" }}>
              {open ? "Emergency stop" : "■"}
            </button>
          )
        )}
        {open && <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.65)", marginTop: 10, lineHeight: 1.4 }}>{note}</div>}
      </div>
    </aside>
  );
}
