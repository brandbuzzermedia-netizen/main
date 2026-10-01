import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeClient, saveBrand } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader, ReportsTable } from "@/components/studio/views";
import { BrandForm } from "@/components/studio/brand-form";
import { DEFAULT_BRAND, getClient, listReports } from "@/lib/data/repo";

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
        <Button asChild variant="primary"><Link href={`/create?client=${id}`}>+ New report</Link></Button>
      </PageHeader>
      <Card className="mb-5">
        <CardTitle>Report history</CardTitle>
        <CardDescription>Previous months stay available for comparison.</CardDescription>
        <ReportsTable reports={reports} showClient={false} />
      </Card>
      <Card className="mb-5">
        <CardTitle>Report branding</CardTitle>
        <CardDescription>The client&apos;s logo and colours lead every report; Get Bee Seen co-brands each page.</CardDescription>
        <BrandForm action={saveBrand} clientId={client.id} brand={client.brand ?? DEFAULT_BRAND} />
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
