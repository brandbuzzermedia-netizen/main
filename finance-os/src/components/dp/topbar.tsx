"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { C } from "./theme";

export type WsOption = { value: string; label: string };

/** Workspace pill. Switching plays the workspace loader, then goes through /switch (membership re-checked on the server). */
export function Switcher({ options, current, acc }: { options: WsOption[]; current: string; acc: string }) {
  const router = useRouter();
  return (
    <label className="dp-switch" style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 24, padding: "5px 6px 5px 14px" }}>
      <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: acc, flex: "none" }} />
      <span className="sr-only">Workspace</span>
      <select value={current} onChange={(e) => router.push(`/switch?to=${encodeURIComponent(e.target.value)}`)}
        style={{ border: 0, background: "transparent", font: "600 14.5px var(--font-figtree)", color: C.ink, outline: 0, maxWidth: 210, cursor: "pointer" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Search scoped to the current workspace. Ctrl/Cmd+K focuses it. */
export function Search({ placeholder, action }: { placeholder: string; action: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <form action={action} role="search" className="dp-search" style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "0 14px", height: 40, maxWidth: 520 }}>
      <input ref={ref} name="q" placeholder={placeholder} aria-label={placeholder}
        style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 14, color: C.ink, fontFamily: "inherit" }} />
      <span style={{ whiteSpace: "nowrap", fontSize: 11, color: C.faint, border: `1px solid ${C.line}`, borderRadius: 5, padding: "1px 6px" }}>Ctrl K</span>
    </form>
  );
}

export type BellItem = { id: string; actor: string; title: string; amount?: string; when: string; org?: string; icon: string };

/** Notifications: what is waiting for you, and the team's latest activity. Opening marks it read. */
export function Bell({ href, count, hi, items = [], unread = 0, allHref, markSeen }: {
  href: string; count: number; hi: string; items?: BellItem[]; unread?: number; allHref?: string; markSeen?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState(unread + count);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const toggle = () => {
    setOpen((o) => !o);
    if (!open && unread && markSeen) { setBadge(count); void markSeen(); }
  };
  return (
    <div ref={ref} style={{ position: "relative", flex: "none" }}>
      <button type="button" onClick={toggle} aria-expanded={open} aria-label={badge ? `${badge} new notifications` : "Notifications"} title="Notifications"
        style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.line}`, background: "#fff", display: "grid", placeItems: "center", position: "relative", color: C.ink, cursor: "pointer" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {badge > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: hi, color: "#fff", fontSize: 10.5, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 4px" }}>{badge > 99 ? "99+" : badge}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" style={{ position: "absolute", right: 0, top: 48, width: "min(380px, calc(100vw - 32px))", maxHeight: 480, overflowY: "auto", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 6, boxShadow: "0 14px 40px rgba(0,0,0,.14)", zIndex: 40 }}>
          {count > 0 && (
            <Link href={href} onClick={() => setOpen(false)} style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", background: "#141414", color: "#fff", textDecoration: "none", fontSize: 13.5, fontWeight: 600 }}>
              <span>{count} waiting for your approval</span><span>Review →</span>
            </Link>
          )}
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: C.muted, padding: "12px 14px 4px" }}>Team activity</div>
          {items.length === 0 && <div style={{ padding: "10px 14px 16px", fontSize: 13.5, color: C.muted }}>Nothing new yet.</div>}
          {items.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 10, padding: "10px 14px", borderTop: `1px solid ${C.line2}`, fontSize: 13.5, lineHeight: 1.4 }}>
              <span aria-hidden style={{ width: 24, textAlign: "center" }}>{a.icon}</span>
              <span style={{ flex: 1 }}><b>{a.actor}</b> {a.title}{a.amount ? <b> · {a.amount}</b> : null}<span style={{ display: "block", fontSize: 11.5, color: C.faint }}>{a.org ? `${a.org} · ` : ""}{a.when}</span></span>
            </div>
          ))}
          {allHref && <Link href={allHref} onClick={() => setOpen(false)} style={{ display: "block", textAlign: "center", padding: "11px", borderTop: `1px solid ${C.line2}`, fontSize: 13, fontWeight: 600, color: C.ink, textDecoration: "none" }}>See all activity →</Link>}
        </div>
      )}
    </div>
  );
}

export function Me({ initials, name, role, side }: { initials: string; name: string; role: string; side: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ display: "flex", alignItems: "center", gap: 9, background: "transparent", border: 0, cursor: "pointer", padding: 0, textAlign: "left", color: C.ink }}>
        <span style={{ width: 38, height: 38, borderRadius: "50%", background: side, color: "#F5F1E8", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 700 }}>{initials}</span>
        <span className="dp-me-text" style={{ lineHeight: 1.2 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{name}</span><span style={{ display: "block", fontSize: 12, color: C.muted }}>{role}</span></span>
      </button>
      {open && (
        <form action="/auth/signout" method="post" style={{ position: "absolute", right: 0, top: 46, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,.08)", zIndex: 20 }}>
          <a href="/mfa" style={{ display: "block", padding: "8px 14px", fontSize: 13.5, color: C.ink, textDecoration: "none", whiteSpace: "nowrap" }}>Two-step sign-in</a>
          <button style={{ border: 0, background: "transparent", padding: "8px 14px", fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap", textAlign: "left", width: "100%" }}>Sign out</button>
        </form>
      )}
    </div>
  );
}

export function MenuButton() {
  return (
    <button type="button" className="dp-menu-btn" onClick={() => window.dispatchEvent(new Event("dp:toggle-nav"))} aria-label="Menu"
      style={{ display: "none", width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.line}`, background: "#fff", cursor: "pointer", flex: "none" }}>☰</button>
  );
}
