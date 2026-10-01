import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ReportPages, reportTitle } from "@/components/report/pages";
import { UnlockForm } from "@/components/share/unlock-form";
import { FitPages, PresentButton } from "@/components/studio/fit-pages";
import { analyze } from "@/lib/analysis";
import { isShareUnlocked, shareCookieName } from "@/lib/auth/session";
import { findSharedReport } from "@/lib/data/repo";
import "../../../share.css";

type Params = { client: string; month: string; token: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const found = await findSharedReport(p.client, p.month, p.token);
  return { title: { absolute: found ? reportTitle(found.doc) : "Report" }, robots: { index: false, follow: false } };
}

/** The client's view of a shared report: the report only, never staff notes or warnings. */
export default async function SharedReport({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ print?: string }> }) {
  const p = await params;
  const found = await findSharedReport(p.client, p.month, p.token);
  if (!found) {
    return (
      <main className="share-gone">
        <div><h1 style={{ fontWeight: 600 }}>This report link is not available</h1><p>It may have been replaced with a new link. Ask Get Bee Seen for the latest one.</p></div>
      </main>
    );
  }
  const { doc, share } = found;
  const unlocked = isShareUnlocked((await cookies()).get(shareCookieName(p.token))?.value, p.token, share.passwordHash);
  const title = `${doc.client.name}, ${analyze(doc.data).month}`;
  if (!unlocked) {
    return <main className="share-lock"><UnlockForm client={p.client} month={p.month} token={p.token} title={title} /></main>;
  }
  if ((await searchParams).print === "1") return <ReportPages doc={doc} mode="print" scale={1} />;
  const base = `/report/${p.client}/${p.month}/${p.token}`;
  return (
    <div className="share">
      <header className="share-bar">
        <div><h1>{title}</h1><small>Monthly performance report · Prepared by Get Bee Seen</small></div>
        <div className="share-actions">
          <PresentButton className="share-btn">Present</PresentButton>
          <a className="share-btn primary" href={`${base}/pdf`}>Download PDF</a>
        </div>
      </header>
      <main className="share-body">
        <FitPages><ReportPages doc={doc} mode="print" scale="var(--fit, 1)" /></FitPages>
      </main>
    </div>
  );
}
