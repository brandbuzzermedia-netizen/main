import { getContext } from "@/lib/auth";
import { getCompanyContext } from "@/lib/workspace";
import { Dashed } from "@/components/dp/ui";
import { FinanceTabs } from "@/components/shell/finance-tabs";

/**
 * Receivables (invoices, payments, clients) for the company in the URL. The company frame comes
 * from /c/[slug]/layout; this adds the receivables tabs and the finance permission check.
 */
export default async function ReceivablesLayout({ children, params }: LayoutProps<"/c/[slug]/receivables">) {
  const { slug } = await params;
  const [ctx, fin] = await Promise.all([getCompanyContext(slug), getContext()]);
  if (!ctx.can("finance.read")) {
    return <Dashed title="No finance access" msg={`Your role in ${ctx.company.name} does not include finance. Ask the company owner if you need it.`} />;
  }
  return (
    <>
      <FinanceTabs companyName={ctx.company.name} base={fin.base} financeHref={`/c/${slug}/finance`} />
      {children}
    </>
  );
}
