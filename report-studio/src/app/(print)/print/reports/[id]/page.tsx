import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReportPages, reportTitle } from "@/components/report/pages";
import { getReportDoc, getSession } from "@/lib/data/repo";

// The page Playwright prints. Same components as the studio preview, unscaled.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const doc = await getReportDoc((await params).id);
  return { title: { absolute: doc ? reportTitle(doc) : "Report" }, robots: { index: false } };
}

export default async function PrintReport({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) redirect("/login");
  const doc = await getReportDoc((await params).id);
  if (!doc) notFound();
  return <ReportPages doc={doc} mode="print" scale={1} />;
}
