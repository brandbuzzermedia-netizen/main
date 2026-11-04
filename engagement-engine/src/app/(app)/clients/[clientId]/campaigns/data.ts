import type { Db } from "@/lib/db";

export async function campaignFormData(db: Db, clientId: string) {
  const segments = await db.query<{ id: string; name: string }>("select id, name from audience_segments where client_id = $1 order by name", [clientId]);
  const targets = await db.query<{ id: string; handle: string; platform: string }>("select id, handle, platform from target_profiles where client_id = $1 order by handle", [clientId]);
  return { segments, targets };
}
