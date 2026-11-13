import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { getCompanyContext } from "@/lib/workspace";
import { RESOURCES, canReadResource } from "@/lib/resources";
import { loadRecords } from "@/lib/records";
import { plainCell } from "@/components/records";
import { toCsv } from "@/lib/csv";

/** CSV export of what the viewer can see (RLS applies). Every export is written to the audit log. */
export async function GET(request: NextRequest, { params }: RouteContext<"/c/[slug]/r/[resource]/export">) {
  const { slug, resource } = await params;
  const r = RESOURCES[resource];
  if (!r) notFound();
  const ctx = await getCompanyContext(slug);
  if (!canReadResource(r, ctx.can)) notFound();
  const data = await loadRecords(ctx, r, { q: request.nextUrl.searchParams.get("q") ?? undefined, all: true });
  const csv = toCsv([r.columns.map((c) => c.label), ...data.rows.map((row) => r.columns.map((c) => plainCell(r, c.key, row, data.labels)))]);
  await ctx.supabase.rpc("log_export", { p_org: ctx.company.id, p_what: r.table, p_rows: data.rows.length });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${ctx.company.slug}-${resource}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
