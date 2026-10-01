import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addNote, changeStatus, chooseResolution } from "@/app/(app)/actions";
import { ReportReview } from "@/components/studio/report-review";
import { analyze } from "@/lib/analysis";
import { getReportDoc } from "@/lib/data/repo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const doc = await getReportDoc((await params).id);
  return { title: doc ? `${doc.client.name}, ${analyze(doc.data).month}` : "Report" };
}

export default async function ReportViewer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ duplicates?: string }> }) {
  const doc = await getReportDoc((await params).id);
  if (!doc) notFound();
  const duplicates = Number((await searchParams).duplicates) || 0;
  return <ReportReview doc={doc} duplicates={duplicates} actions={{ addNote, changeStatus, chooseResolution }} />;
}
