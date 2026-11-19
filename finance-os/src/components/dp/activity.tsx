import { formatDateTime } from "@/domain/dates";
import { formatShort } from "@/domain/money";
import type { ActivityItem, Badge } from "@/lib/activity";
import { C } from "./theme";
import { label } from "./ui";

export const KIND_ICON: Record<string, string> = { deal_won: "🏆", deal_created: "＋", proposal_sent: "✉", proposal_accepted: "✓", meeting_booked: "◷", task_done: "☑", positive_reply: "★", payment_received: "₹", member_joined: "👋" };
const box = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: "20px 22px" } as const;
const head = (t: string, it: string) => (
  <div style={{ fontFamily: "var(--font-tight), sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", marginBottom: 6 }}>
    {t} <span style={{ fontFamily: "var(--font-newsreader), serif", fontStyle: "italic", fontWeight: 400 }}>{it}</span>
  </div>
);

export function ActivityLine({ a, showOrg }: { a: ActivityItem; showOrg?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 13.5, lineHeight: 1.4 }}>
      <span aria-hidden style={{ width: 26, height: 26, flex: "none", borderRadius: "50%", background: a.kind === "deal_won" ? "var(--co-btn)" : C.soft, color: a.kind === "deal_won" ? "#fff" : C.ink, display: "grid", placeItems: "center", fontSize: 12 }}>{KIND_ICON[a.kind] ?? "•"}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>{a.actor}</b> {a.title}{a.amountMinor ? <b> · {formatShort(a.amountMinor)}</b> : null}
        <span style={{ display: "block", fontSize: 11.5, color: C.faint, marginTop: 1 }}>{showOrg && a.orgName ? `${a.orgName} · ` : ""}{formatDateTime(a.at)}</span>
      </span>
    </div>
  );
}

/** Team activity box: wins, meetings, proposals, payments and follow-ups, as they happen. */
export function ActivityFeedCard({ items, showOrg, title = "Team activity" }: { items: ActivityItem[]; showOrg?: boolean; title?: string }) {
  return (
    <section id="activity" aria-label={title} style={{ ...box, scrollMarginTop: 96 }}>
      {head(`${title}.`, "As it happens.")}
      {items.length === 0 && <div style={{ fontSize: 13.5, color: C.muted, padding: "8px 0" }}>Nothing yet. Wins, meetings, proposals and completed follow-ups appear here.</div>}
      {items.map((a) => <ActivityLine key={a.id} a={a} showOrg={showOrg} />)}
    </section>
  );
}

/** Leaderboard: this month's wins by person. */
export function LeaderboardCard({ rows, meId }: { rows: { actorId: string; name: string; wonMinor: number; wins: number }[]; meId?: string }) {
  return (
    <section aria-label="Leaderboard" style={box}>
      {head("Leaderboard.", "This month.")}
      {rows.length === 0 && <div style={{ fontSize: 13.5, color: C.muted, padding: "8px 0" }}>No wins yet this month. The first one takes the top spot.</div>}
      {rows.slice(0, 8).map((r, i) => (
        <div key={r.actorId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14, fontWeight: r.actorId === meId ? 700 : 500 }}>
          <span style={{ width: 26, height: 26, borderRadius: 3, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, background: i === 0 ? "var(--co-btn)" : C.soft, color: i === 0 ? "#fff" : C.ink }}>{i + 1}</span>
          <span style={{ flex: 1 }}>{r.name}{r.actorId === meId ? " (you)" : ""}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.muted }}>{r.wins} win{r.wins === 1 ? "" : "s"}</span>
          <b>{formatShort(r.wonMinor)}</b>
        </div>
      ))}
    </section>
  );
}

/** Achievement badges for one person: earned ones in colour, the next goal with its progress. */
export function BadgeRow({ badges, compact }: { badges: Badge[]; compact?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {badges.filter((b) => !compact || b.earned).map((b) => (
        <div key={b.key} title={b.detail} style={{ border: `1px solid ${b.earned ? "transparent" : C.line}`, background: b.earned ? C.ink : "#fff", color: b.earned ? "#fff" : C.muted, borderRadius: 3, padding: compact ? "4px 8px" : "8px 10px", minWidth: compact ? 0 : 140 }}>
          <div style={{ fontSize: compact ? 11.5 : 13, fontWeight: 700 }}>{b.earned ? "★ " : ""}{b.label}</div>
          {!compact && (
            <>
              <div style={{ fontSize: 11.5, marginTop: 3, color: b.earned ? "rgba(255,255,255,.7)" : C.faint }}>{b.detail}</div>
              {!b.earned && <div style={{ height: 4, background: C.line2, borderRadius: 2, marginTop: 6, overflow: "hidden" }}><div style={{ width: `${Math.round(b.progress * 100)}%`, height: "100%", background: "var(--co-btn)" }} /></div>}
            </>
          )}
        </div>
      ))}
      {compact && badges.every((b) => !b.earned) && <span style={{ fontSize: 12, color: C.faint }}>No badges yet</span>}
    </div>
  );
}

export function AchievementsCard({ badges, title = "My achievements" }: { badges: Badge[]; title?: string }) {
  const n = badges.filter((b) => b.earned).length;
  return (
    <section aria-label={title} style={box}>
      {head(`${title}.`, n ? `${n} unlocked.` : "The first is close.")}
      <div style={{ ...label, margin: "6px 0 10px" }}>Earned and next goals</div>
      <BadgeRow badges={badges} />
    </section>
  );
}

/** Notification rows for the top-bar bell. */
export function toBellItems(items: ActivityItem[], showOrg = false) {
  return items.map((a) => ({ id: a.id, actor: a.actor, title: a.title, amount: a.amountMinor ? formatShort(a.amountMinor) : undefined, when: formatDateTime(a.at), org: showOrg ? a.orgName : undefined, icon: KIND_ICON[a.kind] ?? "•" }));
}
