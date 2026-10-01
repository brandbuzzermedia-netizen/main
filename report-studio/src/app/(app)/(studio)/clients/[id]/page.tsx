import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeClient } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader, ReportsTable } from "@/components/studio/views";
import { getClient, listReports } from "@/lib/data/repo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await getClient((await params).id);
  return { title: c?.name ?? "Client" };
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  const reports = await listReports(id);
  const details = [client.industry, client.location].filter(Boolean).join(" · ");
  return (
    <>
      <PageHeader title={client.name} sub={details || undefined}>
        <Button asChild variant="ghost"><Link href="/clients">All clients</Link></Button>
        <Button asChild><Link href={`/clients/${id}/edit`}>Edit details</Link></Button>
      </PageHeader>
      <Card className="mb-5">
        <CardTitle>Report history</CardTitle>
        <CardDescription>Previous months stay available for comparison.</CardDescription>
        <ReportsTable reports={reports} showClient={false} />
      </Card>
      <Card>
        <CardTitle>Delete client</CardTitle>
        <CardDescription>
          Removes {client.name} and all {reports.length} of their report{reports.length === 1 ? "" : "s"}, uploads and notes. This cannot be undone.
        </CardDescription>
        <form action={removeClient}>
          <input type="hidden" name="id" value={client.id} />
          <Button type="submit" variant="destructive" size="sm">Delete {client.name}</Button>
        </form>
      </Card>
    </>
  );
}
