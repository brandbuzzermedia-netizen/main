import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, ReportsTable } from "@/components/studio/views";
import { listReports } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const reports = (await listReports()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return (
    <>
      <PageHeader title="Reports" sub="All reports, newest first.">
        <Button asChild variant="primary"><Link href="/create">+ Create new report</Link></Button>
      </PageHeader>
      <Card><ReportsTable reports={reports} /></Card>
    </>
  );
}
