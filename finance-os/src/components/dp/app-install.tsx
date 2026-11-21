"use client";

import { useEffect, useState } from "react";
import { C } from "./theme";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/** Registers the service worker once (production only) so the installed app opens offline-safe. */
export function AppServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

/** "Install app" in the top bar: one click on Chrome/Edge (computer or Android); instructions on iPhone. Hidden once installed. */
export function InstallButton() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onInstalled = () => setEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const t = window.setTimeout(() => setIos(/iphone|ipad|ipod/i.test(navigator.userAgent)), 0);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); window.clearTimeout(t); };
  }, []);
  if (!evt && !ios) return null;
  const click = async () => {
    if (evt) { await evt.prompt(); await evt.userChoice; setEvt(null); } else setHelp((h) => !h);
  };
  return (
    <div style={{ position: "relative", flex: "none" }}>
      <button type="button" onClick={click} title="Install Diwani Parivaar OS as an app"
        style={{ height: 40, borderRadius: 10, border: `1px solid ${C.line}`, background: "#fff", padding: "0 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: C.ink, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
        <span className="dp-me-text">Install app</span>
      </button>
      {help && (
        <div role="dialog" aria-label="Install on iPhone" style={{ position: "absolute", right: 0, top: 46, width: 250, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, fontSize: 13.5, lineHeight: 1.5, boxShadow: "0 8px 24px rgba(0,0,0,.08)", zIndex: 30 }}>
          In Safari, tap the <b>Share</b> button, then <b>Add to Home Screen</b>. The OS then opens like an app.
        </div>
      )}
    </div>
  );
}
