import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicForm = {
  id: string; organization_id: string; name: string; headline: string; intro: string | null; segment: string; ask_budget: boolean; ask_location: boolean;
  consent_email: string | null; consent_sms: string | null; consent_call: string | null; privacy_url: string | null; thank_you: string;
  org: { name: string; primary_market: string; default_currency: string; status: string };
};

/** Loads an active form for public display or submission. Only display fields, never tenant data. */
export async function loadPublicForm(key: string): Promise<PublicForm | null> {
  if (!/^[0-9a-f]{32}$/.test(key)) return null;
  const { data } = await createAdminClient().from("lead_forms")
    .select("id, organization_id, name, headline, intro, segment, ask_budget, ask_location, consent_email, consent_sms, consent_call, privacy_url, thank_you, org:organizations(name, primary_market, default_currency, status)")
    .eq("public_key", key).eq("is_active", true).maybeSingle();
  const form = data as unknown as PublicForm | null;
  return form && form.org.status === "active" ? form : null;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
