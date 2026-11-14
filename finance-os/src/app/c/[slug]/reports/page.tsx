import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { financialYear } from "@/domain/periods";
import { todayInBusinessTz } from "@/domain/dates";
import { PageHead } from "@/components/dp/shell";
import { ListView, NOTES } from "@/views/list";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ params }: PageProps<"/c/[slug]/reports">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("finance.read") && !ctx.can("crm.read_all")) notFound();
  const d = designFor(slug);
  const fy = financialYear(todayInBusinessTz(), ctx.company.fy_start_month);
  const fin = ctx.can("finance.read"), crm = ctx.can("crm.read_all");
  const rows = [
    fin && { a: "Monthly summary", b: "Month", c: "Ready", d: "Finance", href: `/c/${slug}/finance/ledger` },
    fin && { a: "FY performance", b: fy.label, c: "Ready", d: "Finance", href: `/c/${slug}/finance/ledger?period=fy` },
    fin && { a: "Receivables ageing", b: "Today", c: "Ready", d: "Finance", href: `/c/${slug}/receivables/invoices` },
    fin && { a: "Accountant pack (CSV)", b: fy.label, c: "Export (logged)", d: "Finance", href: `/c/${slug}/finance/tax/export?register=pack&fy=${fy.startYear}` },
    fin && { a: "GST summary (CSV)", b: fy.label, c: "Export (logged)", d: "Finance", href: `/c/${slug}/finance/tax/export?register=gst&fy=${fy.startYear}` },
    crm && { a: "Pipeline by stage", b: "Live", c: "Ready", d: "Sales", href: `/c/${slug}/pipeline` },
    crm && { a: "Leads export (CSV)", b: "All time", c: "Export (logged)", d: "Sales", href: `/c/${slug}/r/contacts/export` },
  ].filter(Boolean) as { a: string; b: string; c: string; d: string; href: string }[];
  const [title, lines] = NOTES.reports;
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title="Reports" />
      <ListView vm={{ chips: [{ l: "Export (logged)" }, { l: "CSV" }, { l: "PDF" }], head: ["REPORT", "PERIOD", "STATUS", "OWNER"], rows, empty: "No reports for your role.", noteTitle: title, noteLines: lines }} />
    </>
  );
}
