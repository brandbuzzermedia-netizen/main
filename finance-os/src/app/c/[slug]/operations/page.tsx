import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { RESOURCES, operationsResources } from "@/lib/resources";
import { formatDate, todayInBusinessTz } from "@/domain/dates";
import { Badge, Card, PageHeader } from "@/components/ui";
import { decideAdAction, listProductAction, verifyBisAction, verifyReraAction } from "./actions";

export const metadata: Metadata = { title: "Operations" };
const inp = "rounded border border-line bg-surface px-1.5 py-1 text-xs";

export default async function OperationsPage({ params }: PageProps<"/c/[slug]/operations">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("operations.read")) notFound();
  const keys = operationsResources(ctx.company.business_model);
  const verify = ctx.can("compliance.verify");
  const today = todayInBusinessTz();
  const [products, properties, ads, docs] = await Promise.all([
    keys.includes("products") ? ctx.supabase.from("products").select("id, sku, name, requires_bis, bis_status, bis_valid_until, listed").eq("organization_id", ctx.company.id).eq("requires_bis", true).limit(200) : Promise.resolve({ data: [] }),
    keys.includes("properties") ? ctx.supabase.from("properties").select("id, title, rera_registration, rera_verified").eq("organization_id", ctx.company.id).limit(200) : Promise.resolve({ data: [] }),
    keys.includes("ads") ? ctx.supabase.from("ad_approvals").select("id, headline, channel, status").eq("organization_id", ctx.company.id).in("status", ["draft", "submitted"]).limit(100) : Promise.resolve({ data: [] }),
    verify ? ctx.supabase.from("documents").select("id, file_name").eq("organization_id", ctx.company.id).eq("kind", "certificate").limit(200) : Promise.resolve({ data: [] }),
  ]);
  const certs = (docs.data ?? []) as { id: string; file_name: string }[];
  return (
    <>
      <PageHeader title="Operations" description={`${ctx.company.name}: the records this business runs on, with their compliance gates.`} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {keys.filter((k) => RESOURCES[k]).map((k) => (
          <Link key={k} href={`/c/${slug}/r/${k}`} className="rounded-xl border border-line bg-surface p-4 hover:border-faint"><div className="font-display text-lg">{RESOURCES[k].title}</div><div className="mt-1 text-xs text-muted">{RESOURCES[k].description}</div></Link>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {(products.data ?? []).length > 0 && (
          <Card title="BIS compliance">
            <ul>{((products.data ?? []) as { id: string; sku: string; name: string; bis_status: string; bis_valid_until: string | null; listed: boolean }[]).map((p) => {
              const ok = p.bis_status === "verified" && (p.bis_valid_until ?? "") >= today;
              return (
                <li key={p.id} className="border-t border-line-2 py-2.5 text-sm">
                  <div className="flex justify-between gap-2"><span>{p.sku} · {p.name}</span><span>{ok ? <Badge tone="ok">Verified to {formatDate(p.bis_valid_until)}</Badge> : <Badge tone="danger">Listing blocked</Badge>} {p.listed && <Badge tone="brand">Listed</Badge>}</span></div>
                  {verify && !ok && (certs.length ? (
                    <form action={verifyBisAction.bind(null, slug)} className="mt-1.5 flex flex-wrap gap-1"><input type="hidden" name="id" value={p.id} />
                      <input name="certificate" required placeholder="Certificate / licence no." aria-label="Certificate" className={inp} />
                      <input type="date" name="valid_until" required aria-label="Valid until" className={inp} />
                      <select name="document_id" aria-label="Evidence" className={inp}>{certs.map((d) => <option key={d.id} value={d.id}>{d.file_name}</option>)}</select>
                      <button className="rounded border border-line px-2 text-xs">Verify</button></form>
                  ) : <p className="mt-1 text-xs text-muted">Upload the certificate to the <Link className="underline" href={`/c/${slug}/vault`}>vault</Link> (kind: certificate) to verify.</p>)}
                  {ok && ctx.can("operations.write") && (
                    <form action={listProductAction.bind(null, slug)} className="mt-1"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="listed" value={String(!p.listed)} /><button className="text-xs underline">{p.listed ? "Unlist" : "List for sale"}</button></form>
                  )}
                </li>
              );
            })}</ul>
          </Card>
        )}
        {(properties.data ?? []).length > 0 && (
          <Card title="K-RERA">
            <ul>{((properties.data ?? []) as { id: string; title: string; rera_registration: string | null; rera_verified: boolean }[]).map((p) => (
              <li key={p.id} className="border-t border-line-2 py-2.5 text-sm">
                <div className="flex justify-between gap-2"><span>{p.title}</span>{p.rera_verified ? <Badge tone="ok">{p.rera_registration}</Badge> : <Badge tone="danger">Ads blocked</Badge>}</div>
                {verify && !p.rera_verified && (
                  <form action={verifyReraAction.bind(null, slug)} className="mt-1.5 flex gap-1"><input type="hidden" name="id" value={p.id} />
                    <input name="registration" required defaultValue={p.rera_registration ?? ""} placeholder="Verified registration no." aria-label="Registration" className={`${inp} flex-1`} />
                    <button className="rounded border border-line px-2 text-xs">Verify (checked on the K-RERA portal)</button></form>
                )}
              </li>))}</ul>
          </Card>
        )}
        {(ads.data ?? []).length > 0 && (
          <Card title="Ads awaiting a decision">
            <ul>{((ads.data ?? []) as { id: string; headline: string; channel: string }[]).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-2 py-2.5 text-sm">
                <span>{a.headline} <span className="text-xs text-muted">· {a.channel}</span></span>
                {verify && <form action={decideAdAction.bind(null, slug)} className="flex gap-1"><input type="hidden" name="id" value={a.id} />
                  <button name="status" value="approved" className="rounded bg-co-side px-2 py-1 text-xs text-white">Approve</button>
                  <button name="status" value="rejected" className="rounded border border-line px-2 py-1 text-xs">Reject</button></form>}
              </li>))}</ul>
          </Card>
        )}
      </div>
      {ctx.company.business_model === "restaurant" && <p className="mt-6 text-sm text-muted">POS sync (Petpooja or another POS) and Zomato/Swiggy settlement import start only after outlet access and a supported API are confirmed. Until then, daily sales are entered by hand.</p>}
      {ctx.company.business_model === "ecommerce_services" && <p className="mt-6 text-sm text-muted">Shopify order sync needs the store&apos;s app credentials; until then orders are recorded here by hand.</p>}
    </>
  );
}
