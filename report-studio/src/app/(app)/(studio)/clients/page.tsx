import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClientsTable, PageHeader } from "@/components/studio/views";
import { listClients, listReports } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const [clients, reports] = await Promise.all([listClients(), listReports()]);
  return (
    <>
      <PageHeader title="Clients" sub="Select a client to see their profile and report history.">
        <Button asChild variant="primary"><Link href="/clients/new">+ Add client</Link></Button>
      </PageHeader>
      <Card><ClientsTable clients={clients} reports={reports} /></Card>
    </>
  );
}
