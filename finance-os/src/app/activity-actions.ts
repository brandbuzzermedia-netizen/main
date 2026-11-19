"use server";

import { createClient } from "@/lib/supabase/server";

/** Marks notifications as read for the signed-in person (only their own row). */
export async function markActivitySeenAction() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  await db.from("activity_seen").upsert({ user_id: user.id, seen_at: new Date().toISOString() });
}

/** Latest activity for the live tiles. Row security still decides what this person may see. */
export async function fetchActivityAction(orgs: { id: string; name: string }[]) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];
  const safe = orgs.filter((o) => /^[0-9a-f-]{36}$/.test(o.id)).slice(0, 30).map((o) => ({ id: o.id, name: String(o.name).slice(0, 120) }));
  const { loadActivity } = await import("@/lib/activity");
  return loadActivity(db, safe, 20);
}
