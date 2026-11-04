import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/studio/views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEFAULT_BRAND, listClients } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Brand assets" };

export default async function BrandAssetsPage() {
  const clients = await listClients();
  return (
    <>
      <PageHeader title="Brand assets" sub="Each client's logo and report colours. Open a client to upload a logo or change colours." />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
        {clients.map((c) => {
          const b = c.brand ?? DEFAULT_BRAND;
          return (
            <section key={c.id} className="rounded-[20px] border border-border bg-card p-3.5">
              <div className="grid h-24 place-items-center overflow-hidden rounded-2xl p-3" style={{ background: b.primary }}>
                {b.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logo} alt={`${c.name} logo`} className="max-h-full max-w-full rounded bg-white p-2" />
                ) : <span className="font-heading text-sm font-bold" style={{ color: b.accent }}>{c.name}</span>}
              </div>
              <h2 className="mt-2.5 font-semibold">{c.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><i className="inline-block size-3 rounded-full" style={{ background: b.primary }} />{b.primary.toUpperCase()}</span>
                <span className="flex items-center gap-1"><i className="inline-block size-3 rounded-full" style={{ background: b.accent }} />{b.accent.toUpperCase()}</span>
                {!c.brand ? <Badge variant="warn">Placeholder colours</Badge> : null}
                {b.cover ? <Badge>Cover image</Badge> : null}
              </div>
              <Button asChild size="sm" className="mt-3"><Link href={`/clients/${c.id}`}>Edit branding</Link></Button>
            </section>
          );
        })}
      </div>
    </>
  );
}
