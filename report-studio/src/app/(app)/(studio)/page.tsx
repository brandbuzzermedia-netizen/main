import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ClientsTable, ReportsTable, Stats } from "@/components/studio/views";
import { listClients, listReports } from "@/lib/data/repo";

export default async function Dashboard() {
  const [clients, reports] = await Promise.all([listClients(), listReports()]);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const recent = reports.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8);
  return (
    <>
      <section className="bg-hex mb-[22px] flex flex-wrap items-center justify-between gap-5 rounded-[26px] px-8 py-[26px] text-gbs-cream">
        <div>
          <span className="mb-2.5 inline-block rounded-full bg-gbs-gold px-3.5 py-1 text-xs font-bold text-gbs-ink">Client Report Studio</span>
          <h1 className="m-0 font-heading text-[40px] leading-[1.05] font-extrabold">Monthly reports</h1>
          <p className="mt-1.5 opacity-90">Choose a client, upload the month&apos;s screenshots, review, and send.</p>
        </div>
        <div className="flex items-center gap-[18px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bee.png" alt="" className="h-[92px] w-auto max-[640px]:hidden" />
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href="/clients/new">+ Add client</Link></Button>
            <Button asChild variant="primary"><Link href="/create">+ Create report</Link></Button>
          </div>
        </div>
      </section>
      <Stats
        items={[
          [clients.length, "Total clients"],
          [reports.filter((r) => r.createdAt.startsWith(thisMonth)).length, "Reports created this month"],
          [reports.filter((r) => r.status !== "Delivered").length, "Pending reports"],
          [reports.filter((r) => r.status === "Delivered").length, "Delivered reports"],
        ]}
      />
      <Card className="mb-5">
        <CardTitle>Clients</CardTitle>
        <CardDescription>Each client&apos;s latest report. Start next month&apos;s report from here.</CardDescription>
        <ClientsTable clients={clients} reports={reports} />
      </Card>
      <Card>
        <CardTitle>Recent reports</CardTitle>
        <CardDescription>Open a report to review it or download the PDF.</CardDescription>
        <ReportsTable reports={recent} />
      </Card>
    </>
  );
}
