import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/studio/views";
import { listClients, listReports } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const [clients, reports] = await Promise.all([listClients(), listReports()]);
  return (
    <>
      <PageHeader title="Clients" sub="Select a client to see their report history.">
        <Button asChild variant="primary"><Link href="/clients/new">+ Add client</Link></Button>
      </PageHeader>
      <Card>
        {clients.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Industry</TableHead><TableHead>Reports</TableHead><TableHead>Latest</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {clients.map((c) => {
                const rs = reports.filter((r) => r.clientId === c.id).sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
                return (
                  <TableRow key={c.id}>
                    <TableCell><b>{c.name}</b></TableCell>
                    <TableCell>{c.industry ?? "—"}</TableCell>
                    <TableCell>{rs.length}</TableCell>
                    <TableCell>{rs[0]?.month ?? "—"}</TableCell>
                    <TableCell><Button asChild size="sm"><Link href={`/clients/${c.id}`}>View reports</Link></Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground">No clients yet. Add your first client to start a report.</p>
        )}
      </Card>
    </>
  );
}
