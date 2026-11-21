import { badgesFor, loadActivity, loadCelebrations, loadLeaderboard, loadPersonStats, monthAchievements } from "@/lib/activity";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PulseTiles } from "./pulse-tiles";

/** Team activity (live) and the viewer's achievements as two brand tiles with pop-ups. */
export async function TeamPulse({ db, orgs, userId, fyStartMonth, showOrg, firstName = "", preview }: { db: SupabaseClient; orgs: { id: string; name: string }[]; userId: string; fyStartMonth?: number; showOrg?: boolean; firstName?: string; preview?: boolean }) {
  const ids = orgs.map((o) => o.id);
  const [items, board, stats] = await Promise.all([loadActivity(db, orgs, 20), loadLeaderboard(db, ids), loadPersonStats(db, ids, [userId], fyStartMonth)]);
  const me = stats.get(userId)!;
  const month = monthAchievements(me);
  // In an admin's "view as" preview nothing is celebrated on the employee's behalf.
  const celebrations = preview ? [] : await loadCelebrations(db, ids, userId, month);
  return <PulseTiles orgs={orgs} initial={items} showOrg={showOrg} month={month} badges={badgesFor(me)} board={board} meId={userId} celebrations={celebrations} firstName={firstName.split(/[\s@]/)[0] || "you"} />;
}
