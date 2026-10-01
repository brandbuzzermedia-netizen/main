"use client";
import { useEffect, useRef } from "react";

/** Scales report pages to the available width by setting `--fit` (read by `.pages` as `--s`). */
export function FitPages({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const fit = () => el.style.setProperty("--fit", Math.min(1, el.clientWidth / 1122).toFixed(4));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={host} className="min-w-0" style={{ ["--fit" as string]: 0.6 }}>
      {children}
    </div>
  );
}
