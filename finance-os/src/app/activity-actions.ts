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

/** Congratulate a teammate (kudos). They see a celebration next time they open the OS. */
export async function giveKudosAction(orgId: string, toId: string, message?: string) {
  const db = await createClient();
  const { error } = await db.rpc("give_kudos", { p_org: orgId, p_to: toId, p_message: message ?? null });
  return error ? { error: error.message } : { ok: true };
}

/** Remembers which celebrations this person has seen, so each plays once. */
export async function markCelebratedAction(keys: string[]) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user || !keys.length) return;
  const { data } = await db.from("activity_seen").select("celebrated, seen_at").eq("user_id", user.id).maybeSingle();
  const all = [...new Set([...((data?.celebrated as string[] | undefined) ?? []), ...keys.map((k) => String(k).slice(0, 80))])].slice(-300);
  await db.from("activity_seen").upsert({ user_id: user.id, celebrated: all, seen_at: data?.seen_at ?? new Date(0).toISOString() });
}
