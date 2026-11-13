import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { loadOverview } from "@/lib/finance-data";
import { designFor } from "@/domain/design";
import { todayInBusinessTz } from "@/domain/dates";
import { Cta, PageHead } from "@/components/dp/shell";
import { FinanceOverview, FinanceTabs } from "@/views/finance";
import { ExpensesSection, RentalSection, TaxSection } from "./sections";

export const metadata: Metadata = { title: "Finance" };

export default async function FinancePage({ params, searchParams }: PageProps<"/c/[slug]/finance">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  const canFin = ctx.can("finance.read");
  if (!canFin && !ctx.can("documents.write") && !ctx.can("rental.read") && ctx.role !== "accountant") notFound();
  const tabs = ["overview", "expenses", "rental", "tax"] as const;
  const tab = (tabs as readonly string[]).includes(sp.tab as string) ? (sp.tab as (typeof tabs)[number]) : canFin ? "overview" : "expenses";
  const d = designFor(slug);
  const base = `/c/${slug}/finance`;
  const link = (href: string, l: string) => <a key={l} href={href} style={{ color: "var(--co-side)", fontWeight: 600 }}>{l} →</a>;
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title="Finance" right={ctx.can("documents.write") ? <Cta href={`${base}?tab=expenses`}>Upload bill / receipt</Cta> : undefined} />
      <FinanceTabs current={tab} base={base} hide={(["rental", "expenses", "tax"] as const).filter((k) => !ctx.company.enabled_modules.includes(k))} />
      {tab === "overview" && (canFin ? <FinanceOverview vm={await loadOverview(ctx.supabase, [ctx.company.id], todayInBusinessTz(), ctx.company.fy_start_month, d.kpis,
        [link(`${base}/ledger`, "Open ledger & approvals"), link(`/switch?to=${slug}&next=/invoices`, "Invoices & receivables"), link(`/switch?to=${slug}&next=/payments`, "Payments & bank import")], true)} />
        : <div style={{ color: "#55605a" }}>Your role does not include the finance ledger.</div>)}
      {tab === "expenses" && <ExpensesSection ctx={ctx} bill={typeof sp.bill === "string" ? sp.bill : undefined} edit={sp.edit === "1"} />}
      {tab === "rental" && (ctx.can("rental.read") ? <RentalSection ctx={ctx} /> : <div style={{ color: "#55605a" }}>Your role does not include rental records.</div>)}
      {tab === "tax" && <TaxSection ctx={ctx} />}
    </>
  );
}
