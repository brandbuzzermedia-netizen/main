import type { Metadata } from "next";
import Link from "next/link";
import { ReportForm } from "@/components/studio/report-form";
import { PageHeader } from "@/components/studio/views";
import { Button } from "@/components/ui/button";
import { allSections, listClients } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Create report" };

export default async function CreateReportPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
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
  // Google and LinkedIn Ads have no figures to enter yet, so they start off.
  const sections = { ...allSections(true), google: false, linkedin: false };
  return (
    <>
      <PageHeader title="Create report" sub="Enter the month's figures from the platform screenshots and attach the screenshots. The report is written from these figures only." />
      <ReportForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} initial={{ clientId: clients.some((c) => c.id === client) ? client : undefined, template: "premium", sections }} />
    </>
  );
}
