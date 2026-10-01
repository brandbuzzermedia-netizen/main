import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editBlock, resetAllText, restoreTextVersion, saveTextVersion } from "@/app/(app)/actions";
import { TextEditor } from "@/components/studio/text-editor";
import { getReportDoc, listVersions } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Report text" };

export default async function ReportTextPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { id } = await params;
  const doc = await getReportDoc(id);
  if (!doc) notFound();
  const versions = await listVersions(id);
  return (
    <TextEditor
      doc={doc}
      versions={versions}
      notice={(await searchParams).notice}
      actions={{ editBlock, saveVersion: saveTextVersion, restoreVersion: restoreTextVersion, resetAll: resetAllText }}
    />
  );
}
