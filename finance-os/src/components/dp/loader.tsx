"use client";

import { useEffect, useState } from "react";
import type { Theme } from "./theme";

const KEY = "dp_loader_seen";

/**
 * Workspace entry animation from the design: the workspace logo (or name) on its own canvas, a
 * counter to 100% and a progress bar, then the panel slides away. Plays once per workspace per
 * browser session, and again when switching.
 */
export function WorkspaceLoader({ id, theme }: { id: string; theme: Theme }) {
  const [on, setOn] = useState(false);
  const [shown, setShown] = useState(false);
  const [out, setOut] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    let seen = "";
    try { seen = sessionStorage.getItem(KEY) ?? ""; } catch { /* ignore */ }
    if (seen === id || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Marked as seen only once the panel has had time to show, so a re-run effect (React dev
    // mode, fast refresh) cannot leave the overlay up without its timers.
    const mark = () => { try { sessionStorage.setItem(KEY, id); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the entry animation once per workspace
    setOn(true);
    const t0 = Date.now();
    const timers = [setTimeout(() => setShown(true), 120), setTimeout(() => { setOut(true); mark(); }, 2150), setTimeout(() => setOn(false), 2900)];
    const iv = setInterval(() => { const t = Math.min(1, (Date.now() - t0) / 1900); setN(Math.round(100 * (1 - Math.pow(1 - t, 2)))); if (t >= 1) clearInterval(iv); }, 45);
    return () => { timers.forEach(clearTimeout); clearInterval(iv); setOn(false); setShown(false); setOut(false); setN(0); };
  }, [id]);
  if (!on) return null;
  const g = theme.isGroup;
  const bg = theme.logo ? theme.logo.bg : theme.side;
  const fg = theme.logo ? (theme.logo.dark ? "#FFFFFF" : "#173F32") : "#FFFFFF";
  const bar = theme.logo ? (g ? "#C7A45A" : theme.logo.dark ? "#FFFFFF" : theme.acc) : theme.hi;
  const msgs = g ? ["Verifying access", "Loading portfolio", "Syncing automations", "Ready"] : ["Securing workspace", "Loading modules", "Syncing automations", "Ready"];
  const sizes: Record<string, string> = { "/logos/diwani.png": "auto 125%", "/logos/gbs.png": "auto 130%", "/logos/brightwire.png": "auto 84%", "/logos/moreofus.png": "auto 115%", "/logos/iyp.png": "auto 150%", "/logos/tanofun.png": "auto 140%" };
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 100, overflow: "hidden", background: bg, color: fg, transform: `translateY(${out ? "-101%" : "0"})`, pointerEvents: out ? "none" : "auto", transition: "transform .7s cubic-bezier(.76,0,.24,1)" }}>
      <div style={{ position: "absolute", top: 28, left: 36, fontSize: 12.5, letterSpacing: ".22em", textTransform: "uppercase", opacity: 0.7 }}>{g ? "Diwani Parivaar OS" : ""}</div>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div style={{ opacity: shown ? 1 : 0, transform: `translateY(${shown ? 0 : 18}px) scale(${shown ? 1 : 0.96})`, filter: `blur(${shown ? 0 : 10}px)`, transition: "all 1s cubic-bezier(.2,.7,.2,1)" }}>
          {theme.logo ? (
            <div style={{ width: "min(560px,86vw)", height: "min(340px,44vh)", backgroundImage: `url(${theme.logo.src})`, backgroundSize: sizes[theme.logo.src] ?? "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} />
          ) : (
            <div style={{ fontFamily: theme.font, fontSize: "clamp(40px,7vw,84px)", lineHeight: 1.05, textAlign: "center", padding: "0 24px", maxWidth: "90vw" }}>{theme.name}</div>
          )}
        </div>
      </div>
      <div style={{ position: "absolute", left: 36, right: 36, bottom: 34, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
        <div style={{ fontSize: 14, letterSpacing: ".06em", opacity: 0.85 }}>{msgs[n < 30 ? 0 : n < 60 ? 1 : n < 95 ? 2 : 3]}</div>
        <div style={{ fontSize: 44, fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{n}<span style={{ fontSize: 18, opacity: 0.6 }}>%</span></div>
      </div>
      <div style={{ position: "absolute", left: 0, bottom: 0, height: 5, width: `${n}%`, background: bar }} />
    </div>
  );
}
