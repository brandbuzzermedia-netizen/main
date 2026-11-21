import "server-only";
import type { CompanyContext } from "@/lib/workspace";
import type { Resource } from "@/lib/resources";

export const PAGE_SIZE = 25;
const SAFE = /^[a-z_]+$/;

/** Loads one page of a resource with search, sorting and reference labels. RLS applies. */
export async function loadRecords(ctx: CompanyContext, r: Resource, opts: { q?: string; sort?: string; dir?: string; page?: number; all?: boolean }) {
  const sortable = new Set([...r.columns.map((c) => c.key), "created_at"]);
  const sort = opts.sort && sortable.has(opts.sort) && SAFE.test(opts.sort) ? opts.sort : r.order.column;
  const ascending = opts.dir ? opts.dir === "asc" : r.order.ascending;
  const page = Math.max(1, opts.page ?? 1);
  let q = ctx.supabase.from(r.table).select("*", { count: "exact" }).eq("organization_id", ctx.company.id).order(sort, { ascending });
  const term = (opts.q ?? "").trim().replace(/[%,()*\\]/g, "").slice(0, 80);
  if (term && r.search.length) q = q.or(r.search.map((c) => `${c}.ilike.%${term}%`).join(","));
  q = opts.all ? q.limit(10000) : q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data, count, error } = await q;
  if (error) throw new Error(`Could not load ${r.title.toLowerCase()}: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];

  // Labels for reference columns and form dropdowns.
  const refs = new Map<string, { table: string; label: string }>();
  for (const c of r.columns) if (c.ref) refs.set(c.ref.table, c.ref);
  for (const f of r.fields) if (f.ref) refs.set(f.ref.table, f.ref);
  const labels: Record<string, Map<string, string>> = {};
  await Promise.all([...refs.values()].map(async (ref) => {
    const res = await ctx.supabase.from(ref.table).select(`id, ${ref.label}`).eq("organization_id", ctx.company.id).order(ref.label).limit(1000);
    labels[ref.table] = new Map(((res.data ?? []) as unknown as Record<string, string>[]).map((x) => [x.id, x[ref.label]]));
  }));
  return { rows, total: count ?? rows.length, page, sort, ascending, labels, term };
}
