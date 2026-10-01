import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { saveReport } from "@/app/(app)/actions";
import { ReportForm } from "@/components/studio/report-form";
import { PageHeader } from "@/components/studio/views";
import { analyze } from "@/lib/analysis";
import { getReportDoc, listClients } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Edit report data" };

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const doc = await getReportDoc((await params).id);
  if (!doc) notFound();
  const clients = await listClients();
  return (
    <>
      <PageHeader
        title={`Edit data: ${doc.client.name}, ${analyze(doc.data).month}`}
        sub="Saving rebuilds the report from these figures. Internal notes and your choice on data conflicts are kept."
      />
      <ReportForm
        action={saveReport}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        initial={{ id: doc.id, clientId: doc.client.id, template: doc.template, sections: doc.sections, data: doc.data, uploads: doc.uploads }}
      />
    </>
  );
}
