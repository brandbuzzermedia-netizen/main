import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { addNote, changeStatus, chooseResolution, createShareLink, removeShareLink, setShareLinkPassword } from "@/app/(app)/actions";
import { ReportReview } from "@/components/studio/report-review";
import { analyze } from "@/lib/analysis";
import { getReportDoc, getShare, shareUrlPath } from "@/lib/data/repo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const doc = await getReportDoc((await params).id);
  return { title: doc ? `${doc.client.name}, ${analyze(doc.data).month}` : "Report" };
}

export default async function ReportViewer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ duplicates?: string }> }) {
  const doc = await getReportDoc((await params).id);
  if (!doc) notFound();
  const duplicates = Number((await searchParams).duplicates) || 0;
  const [share, path, h] = await Promise.all([getShare(doc.id), shareUrlPath(doc.id), headers()]);
  // Links use PUBLIC_URL when set (e.g. https://reports.getbeeseen.com), else the address in use.
  const origin = process.env.PUBLIC_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return (
    <ReportReview
      doc={doc}
      duplicates={duplicates}
      share={share && path ? { url: origin.replace(/\/$/, "") + path, hasPassword: !!share.passwordHash } : null}
      actions={{ addNote, changeStatus, chooseResolution, share: { create: createShareLink, remove: removeShareLink, setPassword: setShareLinkPassword } }}
    />
  );
}
