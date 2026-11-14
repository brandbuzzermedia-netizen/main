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
    <label style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 24, padding: "5px 6px 5px 14px" }}>
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

export function Bell({ href, count, hi }: { href: string; count: number; hi: string }) {
  return (
    <Link href={href} title={count ? `${count} waiting for you` : "Nothing waiting for you"} aria-label={count ? `${count} items waiting for you` : "Notifications"}
      style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.line}`, background: "#fff", display: "grid", placeItems: "center", position: "relative", color: C.ink, textDecoration: "none", flex: "none" }}>
      ◔{count > 0 && <span style={{ position: "absolute", top: 8, right: 9, width: 8, height: 8, borderRadius: "50%", background: hi }} />}
    </Link>
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
