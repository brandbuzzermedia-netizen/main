import type { Metadata } from "next";
import Link from "next/link";
import { saveReport } from "@/app/(app)/actions";
import { ReportForm, type ReportFormInitial } from "@/components/studio/report-form";
import { aiConfigured } from "@/lib/ai/client";
import { PageHeader } from "@/components/studio/views";
import { Button } from "@/components/ui/button";
import { analyze } from "@/lib/analysis";
import { allSections, getReportDoc, getSettings, listClients, listReports, reportId } from "@/lib/data/repo";
import { duplicateData, followingMonth, nextMonthData } from "@/lib/report/next-month";

export const metadata: Metadata = { title: "Create report" };

export default async function CreateReportPage({ searchParams }: { searchParams: Promise<{ client?: string; from?: string; duplicate?: string }> }) {
  const { client, from, duplicate } = await searchParams;
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
  const sourceId = from || duplicate;
  const source = sourceId ? await getReportDoc(sourceId) : null;
  const chosen = clients.find((c) => c.id === (source?.client.id ?? client));
  // Google and LinkedIn Ads have no figures to enter yet, so they start off.
  const sections = source?.sections ?? { ...allSections(true), google: false, linkedin: false };
  const template = source?.template ?? chosen?.template ?? settings.defaultTemplate;

  let initial: ReportFormInitial;
  let title = "Create monthly report";
  if (source && duplicate) {
    // The first month after the source that this client has no report for yet.
    const taken = new Set((await listReports(source.client.id)).map((r) => r.id));
    let period = followingMonth(source.data.period.start);
    while (taken.has(reportId(source.client.id, period.start))) period = followingMonth(period.start);
    title = "Duplicate report";
    initial = {
      clientId: source.client.id, template, sections, data: duplicateData(source, period),
      copyFrom: { id: source.id, kind: "duplicate" },
      note: `Copied from ${source.client.name}, ${analyze(source.data).month}. Every figure and post below is that month's: replace them with this month's figures, and attach this month's screenshots, before sending. Choose the month with the first and last day.`,
    };
  } else if (source) {
    title = "Start next month";
    initial = {
      clientId: source.client.id, template, sections, data: nextMonthData(source),
      copyFrom: { id: source.id, kind: "next-month" },
      note: `Started from ${source.client.name}, ${analyze(source.data).month}. Its figures are filled in as the previous month, and its branding, template, pages and action plan carry over. Check them, then enter this month's figures and screenshots.`,
    };
  } else {
    initial = { clientId: chosen?.id, template, sections };
  }
  return (
    <>
      <PageHeader title={title} sub={chosen ? `${chosen.name}. Enter the month's figures from the platform screenshots and attach the screenshots. The report is written from these figures only.` : "Choose the client, then enter the month's figures from the platform screenshots. The report is written from these figures only."} />
      <ReportForm action={saveReport} extractEnabled={aiConfigured()} clients={clients.map((c) => ({ id: c.id, name: c.name, instagram: c.instagram }))} initial={initial} />
    </>
  );
}
