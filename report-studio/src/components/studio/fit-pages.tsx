"use client";
// Scales report pages to the available width by setting `--fit` (read by
// `.pages` as `--s`), and runs present mode: one page at a time, full screen,
// arrows / space / Page Up / Page Down to move, Esc to leave.
import { useCallback, useEffect, useRef, useState } from "react";

export const PRESENT_EVENT = "gbs:present";

export function FitPages({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState<number | null>(null);
  const count = () => host.current?.querySelectorAll(".pbox").length ?? 0;

  const fit = useCallback(() => {
    const el = host.current;
    if (!el) return;
    const s = present == null ? Math.min(1, el.clientWidth / 1122) : Math.min(window.innerWidth / 1122, (window.innerHeight - 48) / 794);
    el.style.setProperty("--fit", s.toFixed(4));
  }, [present]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [fit]);

  useEffect(() => {
    const start = (e: Event) => setPresent(Number((e as CustomEvent).detail) || 0);
    window.addEventListener(PRESENT_EVENT, start);
    return () => window.removeEventListener(PRESENT_EVENT, start);
  }, []);

  useEffect(() => {
    if (present == null) return;
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", " ", "PageDown"].includes(e.key)) { e.preventDefault(); setPresent((p) => Math.min((p ?? 0) + 1, count() - 1)); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); setPresent((p) => Math.max((p ?? 0) - 1, 0)); }
      else if (e.key === "Escape") setPresent(null);
    };
    window.addEventListener("keydown", key);
    document.documentElement.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.documentElement.style.overflow = ""; };
  }, [present]);

  return (
    <div
      ref={host}
      className={present == null ? "min-w-0" : "presenting"}
      data-present={present ?? undefined}
      style={{ ["--fit" as string]: 0.6 }}
    >
      {present != null ? (
        <style>{`.presenting .pbox:not([data-i="${present}"]){display:none}`}</style>
      ) : null}
      {children}
      {present != null ? (
        <div className="present-hud" role="toolbar" aria-label="Presentation">
          <button type="button" onClick={() => setPresent(Math.max(present - 1, 0))} disabled={present === 0}>← Previous</button>
          <span>{present + 1} / {count()}</span>
          <button type="button" onClick={() => setPresent(Math.min(present + 1, count() - 1))} disabled={present >= count() - 1}>Next →</button>
          <button type="button" onClick={() => setPresent(null)}>Exit (Esc)</button>
        </div>
      ) : null}
    </div>
  );
}

/** Starts present mode on the FitPages on this page. */
export function PresentButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent(PRESENT_EVENT, { detail: 0 }))}>
      {children ?? "Present"}
    </button>
  );
}
