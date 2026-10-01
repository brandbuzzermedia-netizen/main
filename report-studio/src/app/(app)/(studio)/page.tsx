import Link from "next/link";
import { ReportCover } from "@/components/report/pages";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ReportsTable, Stats } from "@/components/studio/views";
import { getReportDoc, listClients, listReports } from "@/lib/data/repo";

export default async function Dashboard() {
  const [clients, reports] = await Promise.all([listClients(), listReports()]);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const ready = reports.find((r) => r.status === "Ready for review" && r.available);
  const readyDoc = ready ? await getReportDoc(ready.id) : null;
  return (
    <>
      <section className="bg-hex mb-[22px] flex flex-wrap items-center justify-between gap-5 rounded-[26px] px-8 py-[26px] text-gbs-cream">
        <div>
          <span className="mb-2.5 inline-block rounded-full bg-gbs-gold px-3.5 py-1 text-xs font-bold text-gbs-ink">Client Report Studio</span>
          <h1 className="m-0 font-heading text-[40px] leading-[1.05] font-extrabold">Monthly reports</h1>
          <p className="mt-1.5 opacity-90">Making brands impossible to ignore.</p>
        </div>
        <div className="flex items-center gap-[18px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bee.png" alt="" className="h-[92px] w-auto max-[640px]:hidden" />
          <Button asChild variant="primary"><Link href="/create">+ Create new report</Link></Button>
        </div>
      </section>
      <Stats
        items={[
          [clients.length, "Total clients"],
          [reports.filter((r) => r.createdAt.startsWith(thisMonth)).length, "Reports this month"],
          [reports.filter((r) => r.status === "Ready for review" || r.status === "Delivered").length, "Reports generated"],
          [reports.filter((r) => r.status === "Pending" || r.status === "Draft").length, "Pending reports"],
        ]}
      />
      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start gap-5 max-[980px]:grid-cols-1">
        <Card>
          <CardTitle>Recent reports</CardTitle>
          <CardDescription>Open a report to review it or download the PDF.</CardDescription>
          <ReportsTable reports={reports} />
        </Card>
        {ready && readyDoc ? (
          <Card>
            <CardTitle>Ready for review</CardTitle>
            <CardDescription>{ready.clientName}, {ready.month}</CardDescription>
            <Link href={`/reports/${ready.id}`} className="block overflow-hidden" aria-label={`Open ${ready.clientName}, ${ready.month}`}>
              <ReportCover doc={readyDoc} scale={0.3} />
            </Link>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="primary"><Link href={`/reports/${ready.id}`}>Open report</Link></Button>
              <Button asChild><a href={`/api/reports/${ready.id}/pdf`}>Download PDF</a></Button>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
