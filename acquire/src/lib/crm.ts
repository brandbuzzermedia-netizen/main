import "server-only";
import type { AppContext } from "@/lib/auth";
import type { DealStage } from "@/lib/db-types";

export async function loadDealStages(ctx: AppContext): Promise<DealStage[]> {
  const { data, error } = await ctx.supabase.from("deal_stages").select("id, name, category, probability, position").eq("organization_id", ctx.org.id).order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as DealStage[];
}

export const DEAL_COLUMNS = "id, organization_id, lead_id, title, deal_type, value_minor, commission_minor, currency, stage_id, owner_id, expected_close_date, closed_at, lost_reason, property_ref, notes, created_at, updated_at";
