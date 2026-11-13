import "server-only";
import type { CompanyContext } from "@/lib/workspace";
import { RESOURCES } from "@/lib/resources";

/** Dropdown options for a resource's reference fields, limited to this company (RLS applies too). */
export async function refOptionsFor(ctx: CompanyContext, key: string): Promise<Record<string, [string, string][]>> {
  const r = RESOURCES[key];
  const out: Record<string, [string, string][]> = {};
  await Promise.all(r.fields.filter((f) => f.ref).map(async (f) => {
    const { data } = await ctx.supabase.from(f.ref!.table).select(`id, ${f.ref!.label}`).eq("organization_id", ctx.company.id).order(f.ref!.label).limit(500);
    out[f.ref!.table] = ((data ?? []) as unknown as Record<string, string>[]).map((x) => [x.id, x[f.ref!.label]]);
  }));
  return out;
}
