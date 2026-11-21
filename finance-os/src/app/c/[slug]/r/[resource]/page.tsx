import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { RESOURCES, canReadResource } from "@/lib/resources";
import { loadRecords, PAGE_SIZE } from "@/lib/records";
import { RecordsTable } from "@/components/records";
import { RecordForm } from "@/components/record-form";
import { ButtonLink, Card, Input, PageHeader } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/c/[slug]/r/[resource]">): Promise<Metadata> {
  return { title: RESOURCES[(await params).resource]?.title ?? "Records" };
}

export default async function ResourcePage({ params, searchParams }: PageProps<"/c/[slug]/r/[resource]">) {
  const { slug, resource } = await params;
  const sp = await searchParams;
  const r = RESOURCES[resource];
  if (!r) notFound();
  const ctx = await getCompanyContext(slug);
  if (!canReadResource(r, ctx.can)) notFound();
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const data = await loadRecords(ctx, r, { q: str(sp.q), sort: str(sp.sort), dir: str(sp.dir), page: Number(str(sp.page) ?? 1) });
  const base = `/c/${slug}/r/${resource}`;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const qs = (page: number) => `${base}?${new URLSearchParams({ ...(data.term ? { q: data.term } : {}), sort: data.sort, dir: data.ascending ? "asc" : "desc", page: String(page) })}`;
  const refOptions = Object.fromEntries(Object.entries(data.labels).map(([t, m]) => [t, [...m.entries()]]));
  return (
    <>
      <PageHeader title={r.title} description={r.description}
        actions={<ButtonLink variant="secondary" href={`${base}/export${data.term ? `?q=${encodeURIComponent(data.term)}` : ""}`} prefetch={false}>Export CSV</ButtonLink>} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          {r.search.length > 0 && (
            <form className="flex gap-2" role="search">
              <Input name="q" defaultValue={data.term} placeholder={`Search ${r.title.toLowerCase()}`} aria-label="Search" />
              <button className="rounded-lg border border-line px-3 text-sm hover:bg-surface-2">Search</button>
            </form>
          )}
          <RecordsTable r={r} rows={data.rows} labels={data.labels} base={base} sort={data.sort} ascending={data.ascending} q={data.term} />
          <nav aria-label="Pages" className="flex items-center justify-between text-sm text-muted">
            <span>{data.total} record{data.total === 1 ? "" : "s"} · page {data.page} of {pages}</span>
            <span className="flex gap-2">
              {data.page > 1 && <Link className="underline" href={qs(data.page - 1)}>Previous</Link>}
              {data.page < pages && <Link className="underline" href={qs(data.page + 1)}>Next</Link>}
            </span>
          </nav>
        </div>
        {ctx.can(r.write) ? (
          <Card title={`Add to ${r.title.toLowerCase()}`}><RecordForm slug={slug} resource={resource} fields={r.fields} refOptions={refOptions} /></Card>
        ) : (
          <p className="text-sm text-muted">Your role can view these records but not add them.</p>
        )}
      </div>
    </>
  );
}
