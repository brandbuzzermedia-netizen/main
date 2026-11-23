import "server-only";
import type { CompanyContext } from "@/lib/workspace";
import type { FieldLead } from "@/components/field/field-client";

export const LEAD_COLUMNS = "id, company_name, full_name, phone_e164, whatsapp_e164, area, address, field_status, field_segment, lat, lng, place_id, next_follow_up_on, owner_back_at, needs_confirm";

/** Field leads the viewer can see (the existing lead permissions apply: reps see their own). */
export async function loadFieldLeads(ctx: CompanyContext, opts: { includeLost?: boolean } = {}): Promise<FieldLead[]> {
  await ctx.supabase.rpc("expire_google_coords", { p_org: ctx.company.id }); // Google pins are kept at most 30 days
  let q = ctx.supabase.from("contacts").select(LEAD_COLUMNS).eq("organization_id", ctx.company.id).not("field_status", "is", null);
  if (!opts.includeLost) q = q.neq("field_status", "lost");
  const { data } = await q.order("next_follow_up_on", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(3000);
  return ((data ?? []) as FieldLead[]).map((l) => ({ ...l, lat: l.lat === null ? null : Number(l.lat), lng: l.lng === null ? null : Number(l.lng) }));
}

/** Monday of this week (India), as YYYY-MM-DD. */
export function weekStart(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
