import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { financialYear } from "@/domain/periods";
import { todayInBusinessTz } from "@/domain/dates";
import { PageHead } from "@/components/dp/shell";
import { ListView, NOTES } from "@/views/list";
import { FunnelCard, SourceTable } from "@/components/dp/funnel";
import { loadFunnel } from "@/lib/funnel";
import { addDays } from "@/domain/dates";
import { receivablesOn } from "@/lib/phases";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ params, searchParams }: PageProps<"/c/[slug]/reports">) {
  const { slug } = await params;
  const days = (await searchParams).days === "90" ? 90 : (await searchParams).days === "7" ? 7 : 30;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("finance.read") && !ctx.can("crm.read_all")) notFound();
  const d = designFor(slug);
  const fy = financialYear(todayInBusinessTz(), ctx.company.fy_start_month);
  const fin = ctx.can("finance.read"), crm = ctx.can("crm.read_all");
  const rows = [
    fin && { a: "Monthly summary", b: "Month", c: "Ready", d: "Finance", href: `/c/${slug}/finance/ledger` },
    fin && { a: "FY performance", b: fy.label, c: "Ready", d: "Finance", href: `/c/${slug}/finance/ledger?period=fy` },
    fin && receivablesOn() && { a: "Receivables ageing", b: "Today", c: "Ready", d: "Finance", href: `/c/${slug}/receivables/invoices` },
    fin && { a: "Accountant pack (CSV)", b: fy.label, c: "Export (logged)", d: "Finance", href: `/c/${slug}/finance/tax/export?register=pack&fy=${fy.startYear}` },
    fin && { a: "GST summary (CSV)", b: fy.label, c: "Export (logged)", d: "Finance", href: `/c/${slug}/finance/tax/export?register=gst&fy=${fy.startYear}` },
    crm && { a: "Pipeline by stage", b: "Live", c: "Ready", d: "Sales", href: `/c/${slug}/pipeline` },
    crm && { a: "Leads export (CSV)", b: "All time", c: "Export (logged)", d: "Sales", href: `/c/${slug}/r/contacts/export` },
  ].filter(Boolean) as { a: string; b: string; c: string; d: string; href: string }[];
  const [title, lines] = NOTES.reports;
  const funnel = crm ? await loadFunnel(ctx.supabase, ctx.company.id, addDays(todayInBusinessTz(), -days), fin) : null;
  const { data: srcDeals } = crm ? await ctx.supabase.from("deals").select("source, value_minor, closed_at, stage:pipeline_stages(kind)").eq("organization_id", ctx.company.id).limit(10000) : { data: [] };
  const bySource = new Map<string, { source: string; deals: number; openMinor: number; wonMinor: number }>();
  for (const x of (srcDeals ?? []) as unknown as { source: string | null; value_minor: number; closed_at: string | null; stage: { kind: string } | null }[]) {
    const k = x.source?.trim() || "Not recorded";
    const r = bySource.get(k) ?? { source: k, deals: 0, openMinor: 0, wonMinor: 0 };
    r.deals++;
    if (x.stage?.kind === "won") r.wonMinor += Number(x.value_minor); else if (!x.closed_at && x.stage?.kind !== "lost") r.openMinor += Number(x.value_minor);
    bySource.set(k, r);
  }
  const sources = [...bySource.values()].sort((a, b) => b.wonMinor - a.wonMinor || b.deals - a.deals);
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title="Reports" />
      {crm && <SourceTable rows={sources} />}
      {funnel && <FunnelCard f={funnel} title={`Lead to cash · last ${days} days`} periods={[7, 30, 90].map((n) => ({ l: `${n} days`, href: `/c/${slug}/reports?days=${n}`, on: n === days }))} />}
      <ListView vm={{ chips: [{ l: "Export (logged)" }, { l: "CSV" }, { l: "PDF" }], head: ["REPORT", "PERIOD", "STATUS", "OWNER"], rows, empty: "No reports for your role.", noteTitle: title, noteLines: lines }} />
    </>
  );
}
