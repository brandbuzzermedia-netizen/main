import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribeSecret } from "@/lib/env";
import { readUnsubscribeToken } from "@/domain/outreach";

/** Suppresses the lead's email for marketing email. The signed token is the only credential. */
export async function unsubscribe(token: string): Promise<{ ok: boolean; orgName?: string }> {
  const secret = unsubscribeSecret();
  const parsed = secret ? readUnsubscribeToken(secret, token) : null;
  if (!parsed) return { ok: false };
  const db = createAdminClient();
  const [{ data: lead }, { data: org }] = await Promise.all([
    db.from("leads").select("id, email_normalized").eq("id", parsed.leadId).eq("organization_id", parsed.orgId).maybeSingle(),
    db.from("organizations").select("name").eq("id", parsed.orgId).maybeSingle(),
  ]);
  // An erased lead is already suppressed by erasure; report success either way.
  if (lead?.email_normalized) {
    await db.from("suppression_entries").upsert({
      organization_id: parsed.orgId, value_type: "email", value: lead.email_normalized, channel: "email",
      reason: "unsubscribe", source: "Unsubscribe link", lead_id: lead.id,
    }, { onConflict: "organization_id,value_type,value,channel", ignoreDuplicates: true });
  }
  return { ok: true, orgName: org?.name };
}

export async function unsubscribeTarget(token: string): Promise<{ valid: boolean; orgName?: string }> {
  const secret = unsubscribeSecret();
  const parsed = secret ? readUnsubscribeToken(secret, token) : null;
  if (!parsed) return { valid: false };
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", parsed.orgId).maybeSingle();
  return { valid: Boolean(org), orgName: org?.name };
}
