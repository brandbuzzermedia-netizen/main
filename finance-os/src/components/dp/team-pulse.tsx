import { badgesFor, loadActivity, loadLeaderboard, loadPersonStats } from "@/lib/activity";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AchievementsCard, ActivityFeedCard, LeaderboardCard } from "./activity";

/** Team activity, this month's leaderboard and the viewer's own achievements, side by side. */
export async function TeamPulse({ db, orgs, userId, fyStartMonth, showOrg }: { db: SupabaseClient; orgs: { id: string; name: string }[]; userId: string; fyStartMonth?: number; showOrg?: boolean }) {
  const ids = orgs.map((o) => o.id);
  const [items, board, stats] = await Promise.all([loadActivity(db, orgs, 12), loadLeaderboard(db, ids), loadPersonStats(db, ids, [userId], fyStartMonth)]);
  return (
    <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 20, marginTop: 20 }}>
      <ActivityFeedCard items={items} showOrg={showOrg} />
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <LeaderboardCard rows={board} meId={userId} />
        <AchievementsCard badges={badgesFor(stats.get(userId)!)} />
      </div>
    </div>
  );
}
