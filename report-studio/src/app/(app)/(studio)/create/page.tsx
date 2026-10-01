import type { Metadata } from "next";
import Link from "next/link";
import { saveReport } from "@/app/(app)/actions";
import { ReportForm } from "@/components/studio/report-form";
import { PageHeader } from "@/components/studio/views";
import { Button } from "@/components/ui/button";
import { analyze } from "@/lib/analysis";
import { allSections, getReportDoc, getSettings, listClients } from "@/lib/data/repo";
import { nextMonthData } from "@/lib/report/next-month";

export const metadata: Metadata = { title: "Create report" };

export default async function CreateReportPage({ searchParams }: { searchParams: Promise<{ client?: string; from?: string }> }) {
  const { client, from } = await searchParams;
  const clients = await listClients();
  if (!clients.length) {
    return (
      <>
        <PageHeader title="Create report" />
        <p className="mb-3 text-muted-foreground">Add a client first, then create their monthly report.</p>
        <Button asChild variant="primary"><Link href="/clients/new">+ Add client</Link></Button>
      </>
    );
  }
  const settings = await getSettings();
  const source = from ? await getReportDoc(from) : null;
  // Google and LinkedIn Ads have no figures to enter yet, so they start off.
  const sections = source?.sections ?? { ...allSections(true), google: false, linkedin: false };
  return (
    <>
      <PageHeader title="Create report" sub="Enter the month's figures from the platform screenshots and attach the screenshots. The report is written from these figures only." />
      <ReportForm action={saveReport} clients={clients.map((c) => ({ id: c.id, name: c.name }))} initial={source ? {
        clientId: source.client.id, template: source.template, sections, data: nextMonthData(source),
        note: `Started from ${source.client.name}, ${analyze(source.data).month}. Its figures are filled in as the previous month; check them, then enter this month's figures.`,
      } : { clientId: clients.some((c) => c.id === client) ? client : undefined, template: settings.defaultTemplate, sections }} />
    </>
  );
}
