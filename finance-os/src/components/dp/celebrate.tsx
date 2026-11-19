"use client";

import { useEffect, useRef, useState } from "react";
import type { Celebration } from "@/lib/activity";
import { markCelebratedAction } from "@/app/activity-actions";
import { Glyph } from "./icons";

/** Confetti in the company's own colours. Skipped when the viewer prefers reduced motion. */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const css = getComputedStyle(c);
    const colours = [css.getPropertyValue("--co-btn"), css.getPropertyValue("--co-hi"), css.getPropertyValue("--co-side"), "#FFD54F", "#FFFFFF"].map((x) => x.trim()).filter(Boolean);
    const w = (c.width = window.innerWidth), h = (c.height = window.innerHeight);
    const bits = Array.from({ length: 170 }, (_, i) => ({ x: w / 2 + (Math.random() - 0.5) * 120, y: h * 0.35, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 15 - 5,
      s: 5 + Math.random() * 7, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, col: colours[i % colours.length] }));
    let frame = 0, raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const b of bits) {
        b.vy += 0.38; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.globalAlpha = Math.max(0, 1 - frame / 190);
        ctx.fillStyle = b.col; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore();
      }
      if (++frame < 190) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 71 }} />;
}

/** "Congratulations, Asha!" — plays once for each new achievement or congratulation received. */
export function Celebrate({ items, firstName }: { items: Celebration[]; firstName: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // Automated screen tests that are not about celebrations switch them off.
    if (!items.length || (window as Window & { __dpNoCelebrate?: boolean }).__dpNoCelebrate) return;
    const t = window.setTimeout(() => setShow(true), 700);
    return () => window.clearTimeout(t);
  }, [items.length]);
  if (!show) return null;
  const close = () => { setShow(false); void markCelebratedAction(items.map((i) => i.key)); };
  const main = items[0];
  return (
    <>
      <Confetti />
      <style>{"@keyframes dp-pop{0%{transform:scale(.4) rotate(-12deg);opacity:0}60%{transform:scale(1.15) rotate(6deg);opacity:1}100%{transform:scale(1) rotate(0)}}@keyframes dp-rise{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}@media (prefers-reduced-motion: reduce){.dp-anim{animation:none!important}}"}</style>
      <div role="dialog" aria-modal="true" aria-label="Congratulations" onClick={close} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(10,12,14,.55)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 16 }}>
        <div className="dp-anim" onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "min(520px,100%)", borderRadius: 28, padding: "30px 26px 26px", color: "#fff", textAlign: "center", animation: "dp-rise .45s ease-out",
          background: "radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--co-hi) 28%, transparent) 0%, transparent 55%), linear-gradient(135deg, var(--co-side) 0%, color-mix(in srgb, var(--co-side) 55%, #000) 100%)",
          border: "1px solid color-mix(in srgb, var(--co-hi) 35%, transparent)", boxShadow: "0 30px 80px rgba(0,0,0,.45)" }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: 28, background: "linear-gradient(115deg, transparent 55%, rgba(255,255,255,.1) 62%, transparent 70%)", pointerEvents: "none" }} />
          <div className="dp-anim" aria-hidden style={{ width: 96, height: 96, margin: "0 auto", borderRadius: "50%", background: "rgba(255,255,255,.16)", display: "grid", placeItems: "center", animation: "dp-pop .7s cubic-bezier(.2,1.4,.4,1)" }}><Glyph name={main.kind === "kudos" ? "clap" : main.icon || "trophy"} size={46} stroke={1.6} /></div>
          <div style={{ fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.78)", marginTop: 18 }}>Congratulations, {firstName}!</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, lineHeight: 1.15 }}>{main.kind === "kudos" ? main.label : `You unlocked ${main.label}`}</div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,.8)", marginTop: 6 }}>{main.detail}</div>
          {items.length > 1 && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
              {items.slice(1, 6).map((c) => (
                <div key={c.key} style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 14, padding: "9px 12px", fontSize: 14 }}>
                  <b style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Glyph name={c.icon} size={15} />{c.label}</b><span style={{ display: "block", fontSize: 12.5, color: "rgba(255,255,255,.75)" }}>{c.detail}</span>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={close} autoFocus style={{ width: "100%", marginTop: 22, background: "#fff", color: "#111", border: 0, borderRadius: 999, padding: 15, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Thank you</button>
        </div>
      </div>
    </>
  );
}
