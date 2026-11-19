import { badgesFor, loadActivity, loadLeaderboard, loadPersonStats, monthAchievements } from "@/lib/activity";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PulseTiles } from "./pulse-tiles";

/** Team activity (live) and the viewer's achievements as two brand tiles with pop-ups. */
export async function TeamPulse({ db, orgs, userId, fyStartMonth, showOrg }: { db: SupabaseClient; orgs: { id: string; name: string }[]; userId: string; fyStartMonth?: number; showOrg?: boolean }) {
  const ids = orgs.map((o) => o.id);
  const [items, board, stats] = await Promise.all([loadActivity(db, orgs, 20), loadLeaderboard(db, ids), loadPersonStats(db, ids, [userId], fyStartMonth)]);
  const me = stats.get(userId)!;
  return <PulseTiles orgs={orgs} initial={items} showOrg={showOrg} month={monthAchievements(me)} badges={badgesFor(me)} board={board} meId={userId} />;
}
