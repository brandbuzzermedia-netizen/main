"use server";

import { createClient } from "@/lib/supabase/server";

/** Marks notifications as read for the signed-in person (only their own row). */
export async function markActivitySeenAction() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  await db.from("activity_seen").upsert({ user_id: user.id, seen_at: new Date().toISOString() });
}
