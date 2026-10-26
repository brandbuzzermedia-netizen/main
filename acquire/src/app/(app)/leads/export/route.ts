import type { NextRequest } from "next/server";
import { getContext } from "@/lib/auth";
import { leadQuery, loadLeadContext, memberName, parseFilters } from "@/lib/leads";
import type { Lead } from "@/lib/db-types";
import { toCsv } from "@/domain/csv";
import { minorUnits } from "@/domain/money";

const MAX_EXPORT = 25_000;

/** CSV export of the current filters. RLS applies; only managers may export. */
export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx.can.exportLeads) return new Response("Your role cannot export leads.", { status: 403 });
  const f = parseFilters(Object.fromEntries(request.nextUrl.searchParams));
  const ref = await loadLeadContext(ctx);
  const stage = new Map(ref.stages.map((s) => [s.id, s.name]));
  const source = new Map(ref.sources.map((s) => [s.id, s.name]));
  const member = new Map(ref.members.map((m) => [m.user_id, memberName(m)]));

  const rows: Lead[] = [];
  for (let from = 0; from < MAX_EXPORT; from += 1000) {
    const { data, error } = await leadQuery(ctx, f).range(from, from + 999);
    if (error) return new Response(error.message, { status: 500 });
    rows.push(...((data ?? []) as unknown as Lead[]));
    if (!data || data.length < 1000) break;
  }
  const money = (v: number | null, c: string | null) => (v === null || !c ? "" : String(v / minorUnits(c)));
  const csv = toCsv([
    ["Full name", "Email", "Phone", "Country", "Time zone", "Segment", "Stage", "Source", "Owner", "Property interest", "Property type",
      "Preferred location", "Budget min", "Budget max", "Currency", "Timeline", "Tags", "Next follow-up", "Created at"],
    ...rows.map((l) => [
      l.full_name, l.email, l.phone_e164, l.country, l.timezone, l.segment, stage.get(l.stage_id), l.source_id ? source.get(l.source_id) : "",
      l.owner_id ? member.get(l.owner_id) : "", l.property_interest, l.property_type, l.preferred_location,
      money(l.budget_min_minor, l.currency), money(l.budget_max_minor, l.currency), l.currency, l.timeline, l.tags.join(", "),
      l.next_follow_up_at, l.created_at,
    ]),
  ].map((r) => r.map(neutralizeFormula)));
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Stops spreadsheet apps from executing imported text as formulas (CSV injection). */
function neutralizeFormula(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) && !/^\+\d+$/.test(s) ? `'${s}` : s;
}
