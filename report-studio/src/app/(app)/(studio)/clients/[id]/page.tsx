import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeClient, saveBrand } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ClientSwatch, PageHeader, ReportsTable } from "@/components/studio/views";
import { BrandForm } from "@/components/studio/brand-form";
import { DEFAULT_BRAND, getClient, getSettings, listReports } from "@/lib/data/repo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await getClient((await params).id);
  return { title: c?.name ?? "Client" };
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  const [reports, settings] = await Promise.all([listReports(id), getSettings()]);
  const history = reports.slice().sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
  const latest = history.find((r) => r.available);
  const years = [...new Set(history.map((r) => r.periodStart.slice(0, 4)))];
  const details = [client.industry, client.location].filter(Boolean).join(" · ");
  const profile: [string, React.ReactNode][] = [
    ["Company", client.company],
    ["Industry", client.industry],
    ["Contact", client.contact],
    ["Website", client.website ? <a className="underline" href={client.website} target="_blank" rel="noreferrer">{client.website}</a> : null],
    ["Instagram", client.instagram ? <a className="underline" href={`https://instagram.com/${client.instagram}`} target="_blank" rel="noreferrer">@{client.instagram}</a> : null],
    ["Facebook", client.facebook ? <a className="underline" href={client.facebook} target="_blank" rel="noreferrer">{client.facebook.replace(/^https?:\/\/(www\.)?/, "")}</a> : null],
    ["Report design", (client.template ?? settings.defaultTemplate).replace(/^./, (c) => c.toUpperCase()) + (client.template ? "" : " (studio default)")],
  ];
  return (
    <>
      <PageHeader title={client.name} sub={<span className="flex items-center gap-2"><ClientSwatch client={client} size={22} />{details || "No industry set"}</span>}>
        <Button asChild variant="ghost"><Link href="/clients">All clients</Link></Button>
        <Button asChild><Link href={`/clients/${id}/edit`}>Edit profile</Link></Button>
        {latest ? <Button asChild><Link href={`/create?from=${latest.id}`}>Start next month</Link></Button> : null}
        <Button asChild variant="primary"><Link href={`/create?client=${id}`}>+ Create monthly report</Link></Button>
      </PageHeader>
      <div className="mb-5 grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-5 max-[980px]:grid-cols-1">
        <Card>
          <CardTitle>Report history</CardTitle>
          <CardDescription>
            {latest ? <>Latest: {latest.month}. &quot;Start next month&quot; copies its branding, template, pages and action plan, and starts every figure empty.</> : "No reports yet. Create the first monthly report for this client."}
          </CardDescription>
          {years.length ? years.map((y) => (
            <div key={y} className="mt-3">
              <h3 className="mb-1 font-heading text-[15px] font-bold text-heading">{y}</h3>
              <ReportsTable reports={history.filter((r) => r.periodStart.startsWith(y))} showClient={false} />
            </div>
          )) : null}
        </Card>
        <Card>
          <CardTitle>Profile</CardTitle>
          <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
            {profile.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="m-0 break-words">{v || <span className="text-muted-foreground">—</span>}</dd>
              </div>
            ))}
          </dl>
          {client.notes ? <p className="mt-3 rounded-xl bg-muted p-2.5 text-[13px]"><b>Internal notes.</b> {client.notes}</p> : null}
        </Card>
      </div>
      <Card className="mb-5">
        <CardTitle>Report branding</CardTitle>
        <CardDescription>This client&apos;s logo and colours lead every one of their reports; Get Bee Seen co-brands each page.</CardDescription>
        <BrandForm action={saveBrand} clientId={client.id} industry={client.industry} brand={client.brand ?? DEFAULT_BRAND} />
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
