import type { SupabaseClient } from "@supabase/supabase-js";
import { financialYear } from "@/domain/periods";
import { todayInBusinessTz } from "@/domain/dates";

export type ActivityItem = { id: string; org: string; orgName: string; actor: string; actorId: string | null; kind: string; title: string; amountMinor: number | null; at: string };

const nameOf = (u: { full_name: string | null; email: string | null } | null) => u?.full_name || u?.email?.split("@")[0] || "Someone";

/** Latest team activity the viewer may see (row security decides), across one or more companies. */
export async function loadActivity(db: SupabaseClient, orgs: { id: string; name: string }[], limit = 15): Promise<ActivityItem[]> {
  if (!orgs.length) return [];
  const names = new Map(orgs.map((o) => [o.id, o.name]));
  const { data } = await db.from("activity_feed").select("id, organization_id, actor_id, kind, title, amount_minor, created_at, actor:users(full_name, email)")
    .in("organization_id", orgs.map((o) => o.id)).order("created_at", { ascending: false }).limit(limit);
  return ((data ?? []) as unknown as { id: string; organization_id: string; actor_id: string | null; kind: string; title: string; amount_minor: number | null; created_at: string; actor: { full_name: string | null; email: string | null } | null }[])
    .map((r) => ({ id: r.id, org: r.organization_id, orgName: names.get(r.organization_id) ?? "", actor: nameOf(r.actor), actorId: r.actor_id, kind: r.kind, title: r.title, amountMinor: r.amount_minor === null ? null : Number(r.amount_minor), at: r.created_at }));
}

/** New activity by other people since the viewer last opened notifications. */
export async function unreadActivity(db: SupabaseClient, orgIds: string[], userId: string): Promise<number> {
  if (!orgIds.length) return 0;
  const { data: seen } = await db.from("activity_seen").select("seen_at").eq("user_id", userId).maybeSingle();
  let q = db.from("activity_feed").select("id", { count: "exact", head: true }).in("organization_id", orgIds).or(`actor_id.is.null,actor_id.neq.${userId}`);
  q = q.gt("created_at", seen?.seen_at ?? new Date(Date.now() - 7 * 86_400_000).toISOString());
  return (await q).count ?? 0;
}

/** This month's wins per person, from team-visible "won a deal" activity (so everyone can see the board). */
export async function loadLeaderboard(db: SupabaseClient, orgIds: string[]): Promise<{ actorId: string; name: string; wonMinor: number; wins: number }[]> {
  if (!orgIds.length) return [];
  const month = `${todayInBusinessTz().slice(0, 7)}-01T00:00:00+05:30`;
  const { data } = await db.from("activity_feed").select("actor_id, amount_minor, actor:users(full_name, email)").in("organization_id", orgIds).eq("kind", "deal_won").gte("created_at", month).limit(5000);
  const by = new Map<string, { actorId: string; name: string; wonMinor: number; wins: number }>();
  for (const r of (data ?? []) as unknown as { actor_id: string | null; amount_minor: number | null; actor: { full_name: string | null; email: string | null } | null }[]) {
    if (!r.actor_id) continue;
    const x = by.get(r.actor_id) ?? { actorId: r.actor_id, name: nameOf(r.actor), wonMinor: 0, wins: 0 };
    x.wonMinor += Number(r.amount_minor ?? 0); x.wins++;
    by.set(r.actor_id, x);
  }
  return [...by.values()].sort((a, b) => b.wonMinor - a.wonMinor || b.wins - a.wins);
}

export type Badge = { key: string; label: string; detail: string; earned: boolean; progress: number };
export type PersonStats = { wins: number; wonFyMinor: number; wonMonthMinor: number; targetMinor: number; touches: number; meetings: number; proposalsAccepted: number; overdue: number; done: number };

/** Achievements from a person's real work. Each tier shows progress toward the next. */
export function badgesFor(s: PersonStats): Badge[] {
  const tier = (key: string, label: string, value: number, goal: number, unit: string): Badge =>
    ({ key, label, detail: value >= goal ? `${label} unlocked` : `${Math.min(value, goal).toLocaleString("en-IN")} / ${goal.toLocaleString("en-IN")} ${unit}`, earned: value >= goal, progress: Math.min(1, goal ? value / goal : 0) });
  const ladder = (key: string, steps: [number, string][], value: number, unit: string) => {
    const earned = steps.filter(([g]) => value >= g);
    const next = steps.find(([g]) => value < g);
    return [...earned.map(([g, l]) => tier(`${key}_${g}`, l, value, g, unit)), ...(next ? [tier(`${key}_${next[0]}`, next[1], value, next[0], unit)] : [])];
  };
  return [
    ...ladder("wins", [[1, "First win"], [5, "Five wins"], [25, "Closer: 25 wins"], [100, "Century closer"]], s.wins, "deals won"),
    ...ladder("fy", [[100000, "₹1 L club"], [500000, "₹5 L club"], [2500000, "₹25 L club"], [10000000, "₹1 Cr club"]], Math.round(s.wonFyMinor / 100), "₹ won this FY"),
    ...(s.targetMinor > 0 ? [tier("target", "Target hit", s.wonMonthMinor, s.targetMinor, "paise this month")].map((b) => ({ ...b, detail: `${Math.round((s.wonMonthMinor / s.targetMinor) * 100)}% of this month's target` })) : []),
    ...ladder("touches", [[100, "100 touches"], [500, "500 touches"], [2000, "Outreach machine"]], s.touches, "calls & messages"),
    ...ladder("meetings", [[10, "10 meetings"], [50, "50 meetings"]], s.meetings, "meetings"),
    ...ladder("proposals", [[1, "First proposal won"], [5, "Proposal closer"]], s.proposalsAccepted, "accepted"),
    { key: "clean", label: "Clean slate", detail: s.overdue ? `${s.overdue} follow-up(s) overdue` : s.done ? "No overdue follow-ups" : "Complete a follow-up to start", earned: s.overdue === 0 && s.done > 0, progress: s.overdue === 0 && s.done > 0 ? 1 : 0 },
  ];
}

/** Stats for the given people across the given companies (rows the viewer cannot read are not counted). */
export async function loadPersonStats(db: SupabaseClient, orgIds: string[], userIds: string[], fyStartMonth = 4): Promise<Map<string, PersonStats>> {
  const out = new Map<string, PersonStats>(userIds.map((u) => [u, { wins: 0, wonFyMinor: 0, wonMonthMinor: 0, targetMinor: 0, touches: 0, meetings: 0, proposalsAccepted: 0, overdue: 0, done: 0 }]));
  if (!orgIds.length || !userIds.length) return out;
  const today = todayInBusinessTz();
  const fy = `${financialYear(today, fyStartMonth).start}T00:00:00+05:30`;
  const month = `${today.slice(0, 7)}-01T00:00:00+05:30`;
  const [deals, events, meets, props, tasks, targets] = await Promise.all([
    db.from("deals").select("owner_id, value_minor, closed_at, stage:pipeline_stages(kind)").in("organization_id", orgIds).in("owner_id", userIds).not("closed_at", "is", null).limit(20000),
    db.from("outreach_events").select("created_by").in("organization_id", orgIds).in("created_by", userIds).in("kind", ["call", "email", "whatsapp", "linkedin", "facebook", "instagram", "twitter"]).limit(50000),
    db.from("meetings").select("owner_id").in("organization_id", orgIds).in("owner_id", userIds).lt("starts_at", new Date().toISOString()).neq("status", "cancelled").limit(20000),
    db.from("proposals").select("owner_id").in("organization_id", orgIds).in("owner_id", userIds).eq("status", "accepted").limit(10000),
    db.from("tasks").select("assignee_id, status, due_on").in("organization_id", orgIds).in("assignee_id", userIds).in("status", ["open", "in_progress", "done"]).limit(50000),
    db.from("member_targets").select("user_id, monthly_target_minor").in("organization_id", orgIds).in("user_id", userIds),
  ]);
  for (const d of (deals.data ?? []) as unknown as { owner_id: string; value_minor: number; closed_at: string; stage: { kind: string } | null }[]) {
    const s = out.get(d.owner_id); if (!s || d.stage?.kind !== "won") continue;
    s.wins++; if (d.closed_at >= fy) s.wonFyMinor += Number(d.value_minor); if (d.closed_at >= month) s.wonMonthMinor += Number(d.value_minor);
  }
  for (const e of (events.data ?? []) as { created_by: string }[]) { const s = out.get(e.created_by); if (s) s.touches++; }
  for (const m of (meets.data ?? []) as { owner_id: string }[]) { const s = out.get(m.owner_id); if (s) s.meetings++; }
  for (const p of (props.data ?? []) as { owner_id: string }[]) { const s = out.get(p.owner_id); if (s) s.proposalsAccepted++; }
  for (const t of (tasks.data ?? []) as { assignee_id: string; status: string; due_on: string | null }[]) {
    const s = out.get(t.assignee_id); if (!s) continue;
    if (t.status === "done") s.done++; else if (t.due_on && t.due_on < today) s.overdue++;
  }
  for (const t of (targets.data ?? []) as { user_id: string; monthly_target_minor: number }[]) { const s = out.get(t.user_id); if (s) s.targetMinor += Number(t.monthly_target_minor); }
  return out;
}
