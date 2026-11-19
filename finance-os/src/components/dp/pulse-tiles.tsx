"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { ActivityItem, Badge, MonthAchievement } from "@/lib/activity";
import { fetchActivityAction } from "@/app/activity-actions";

const ICON: Record<string, string> = { deal_won: "🏆", deal_created: "＋", proposal_sent: "✉", proposal_accepted: "✓", meeting_booked: "◷", task_done: "☑", positive_reply: "★", payment_received: "₹", member_joined: "👋" };
const inr = (m: number) => { const r = m / 100; return r >= 1e7 ? `₹${(r / 1e7).toFixed(1)} Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(1)} L` : `₹${Math.round(r).toLocaleString("en-IN")}`; };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const todayIST = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const dayIST = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** Brand surfaces: the company's own sidebar colour, deepened, with a soft glow of its highlight colour. */
const brand: CSSProperties = {
  background: "radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--co-hi) 22%, transparent) 0%, transparent 55%), linear-gradient(135deg, var(--co-side) 0%, color-mix(in srgb, var(--co-side) 62%, #000) 100%)",
  border: "1px solid color-mix(in srgb, var(--co-hi) 30%, transparent)", color: "#fff",
};
const deep: CSSProperties = { background: "linear-gradient(160deg, color-mix(in srgb, var(--co-side) 38%, #16181b) 0%, #16181b 100%)", border: "1px solid rgba(255,255,255,.08)", color: "#fff" };
const iconDot = (bg: string, c: ReactNode, size = 46): ReactNode => <span aria-hidden style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "grid", placeItems: "center", flex: "none" }}>{c}</span>;
const person = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>;
const trophy = (s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6" /></svg>;
const Live = () => <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#fff", background: "rgba(76,175,80,.16)", borderRadius: 20, padding: "4px 10px" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4CAF50", boxShadow: "0 0 0 3px rgba(76,175,80,.25)" }} />Live</span>;

function Modal({ label, onClose, style, children }: { label: string; onClose: () => void; style: CSSProperties; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={label} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(10,12,14,.55)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "min(620px, 100%)", maxHeight: "86vh", overflowY: "auto", borderRadius: 26, padding: "24px 24px 26px", boxShadow: "0 30px 80px rgba(0,0,0,.4)", ...style }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 18, right: 18, width: 40, height: 40, borderRadius: "50%", border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.08)", color: "#fff", fontSize: 18, cursor: "pointer" }}>×</button>
        {children}
      </div>
    </div>
  );
}

/** Team activity (live) and Achievements as two brand-coloured tiles; each opens its own pop-up. */
export function PulseTiles({ orgs, initial, showOrg, month, badges, board, meId }: {
  orgs: { id: string; name: string }[]; initial: ActivityItem[]; showOrg?: boolean; month: MonthAchievement[]; badges: Badge[];
  board: { actorId: string; name: string; wonMinor: number; wins: number }[]; meId: string;
}) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<"activity" | "achievements" | null>(null);
  useEffect(() => {
    const t = window.setInterval(async () => { try { setItems(await fetchActivityAction(orgs)); } catch { /* offline: keep the last list */ } }, 30_000);
    const h = () => { if (location.hash === "#activity") setOpen("activity"); };
    h(); window.addEventListener("hashchange", h);
    return () => { window.clearInterval(t); window.removeEventListener("hashchange", h); };
  }, [orgs]);
  const today = items.filter((a) => dayIST(a.at) === todayIST());
  const earned = month.filter((m) => m.earned);
  const latest = today[0];
  const tile = (key: "activity" | "achievements", icon: ReactNode, title: ReactNode, sub: string) => (
    <button type="button" onClick={() => setOpen(key)} aria-haspopup="dialog"
      style={{ ...brand, flex: "1 1 280px", display: "flex", alignItems: "center", gap: 14, borderRadius: 20, padding: "14px 18px", cursor: "pointer", textAlign: "left", font: "inherit", boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
      {iconDot("rgba(255,255,255,.14)", icon)}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 16.5 }}>{title}</span>
        <span style={{ display: "block", fontSize: 13.5, color: "rgba(255,255,255,.72)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
      </span>
      <span aria-hidden style={{ fontSize: 18, opacity: 0.85 }}>↗</span>
    </button>
  );
  return (
    <>
      <div id="activity" style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20, scrollMarginTop: 96 }}>
        {tile("activity", person, <>Team activity <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#9BE3A0" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4CAF50" }} />Live</span></>,
          today.length ? `${today.length} update${today.length === 1 ? "" : "s"} today · ${latest.actor} ${latest.title}` : "Quiet so far today")}
        {tile("achievements", trophy(), "Achievements", `${earned.length} this month · tap to view`)}
      </div>

      {open === "activity" && (
        <Modal label="Team activity" onClose={() => setOpen(null)} style={deep}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, paddingRight: 56 }}>
            {iconDot("var(--co-btn)", person, 48)}
            <div style={{ flex: 1 }}><div style={{ fontSize: 22, fontWeight: 700 }}>Team activity</div><div style={{ fontSize: 14, color: "rgba(255,255,255,.6)" }}>What everyone is doing right now</div></div>
            <Live />
          </div>
          <div style={{ marginTop: 18 }}>
            {items.length === 0 && <div style={{ textAlign: "center", color: "rgba(255,255,255,.6)", padding: "26px 0 10px" }}>No activity yet.</div>}
            {items.map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: "1px solid rgba(255,255,255,.08)", fontSize: 14, lineHeight: 1.45 }}>
                {iconDot(a.kind === "deal_won" ? "var(--co-btn)" : "rgba(255,255,255,.08)", <span style={{ fontSize: 14 }}>{ICON[a.kind] ?? "•"}</span>, 32)}
                <span style={{ flex: 1 }}>
                  <b>{a.actor}</b> <span style={{ color: "rgba(255,255,255,.85)" }}>{a.title}</span>{a.amountMinor ? <b> · {inr(a.amountMinor)}</b> : null}
                  <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,.5)" }}>{showOrg && a.orgName ? `${a.orgName} · ` : ""}{when(a.at)}</span>
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {open === "achievements" && (
        <Modal label="Achievements" onClose={() => setOpen(null)} style={{ ...brand, borderRadius: 26 }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: 26, background: "linear-gradient(115deg, transparent 55%, rgba(255,255,255,.08) 62%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ textAlign: "center", position: "relative" }}>
            <div style={{ display: "inline-grid", marginTop: 4 }}>{iconDot("rgba(255,255,255,.14)", trophy(30), 84)}</div>
            <div style={{ fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.75)", marginTop: 16 }}>{earned.length ? "Congratulations" : "This month"}</div>
            <div style={{ fontSize: 30, fontWeight: 600, marginTop: 6, lineHeight: 1.15 }}>{earned.length} achievement{earned.length === 1 ? "" : "s"} this month</div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,.75)", marginTop: 6 }}>{earned.length ? "Keep the momentum going" : "Your first one is close"}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 10, marginTop: 20, position: "relative" }}>
            {month.map((m) => (
              <div key={m.key} style={{ borderRadius: 14, padding: "10px 12px", background: m.earned ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.18)", border: `1px solid rgba(255,255,255,${m.earned ? ".3" : ".08"})`, opacity: m.earned ? 1 : 0.75 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.icon} {m.label}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", marginTop: 2 }}>{m.earned ? "Unlocked · " : ""}{m.detail}</div>
              </div>
            ))}
          </div>
          {board.length > 0 && (
            <div style={{ marginTop: 18, position: "relative" }}>
              <div style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.7)", marginBottom: 6 }}>Leaderboard · this month</div>
              {board.slice(0, 5).map((r, i) => (
                <div key={r.actorId} style={{ display: "flex", gap: 10, padding: "7px 0", borderTop: "1px solid rgba(255,255,255,.1)", fontSize: 14, fontWeight: r.actorId === meId ? 700 : 500 }}>
                  <span style={{ width: 20 }}>{i + 1}</span><span style={{ flex: 1 }}>{r.name}{r.actorId === meId ? " (you)" : ""}</span><span>{r.wins} win{r.wins === 1 ? "" : "s"} · {inr(r.wonMinor)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: 12.5, color: "rgba(255,255,255,.7)", position: "relative" }}>All-time badges: {badges.filter((b) => b.earned).map((b) => b.label).join(" · ") || "none yet"}</div>
          <button type="button" onClick={() => setOpen(null)} style={{ position: "relative", width: "100%", marginTop: 20, background: "#fff", color: "#111", border: 0, borderRadius: 999, padding: "15px", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>Keep going</button>
        </Modal>
      )}
    </>
  );
}
