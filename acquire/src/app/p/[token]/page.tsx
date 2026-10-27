import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribeSecret } from "@/lib/env";
import { readPropertyLinkToken } from "@/domain/forms";
import { formatMoney } from "@/domain/money";

export const metadata: Metadata = { title: "Property", robots: { index: false } };

/** Property page behind a signed, per-lead link. Opening it records a view for the agent. */
export default async function SharedPropertyPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const secret = unsubscribeSecret();
  const t = secret ? readPropertyLinkToken(secret, token) : null;
  if (!t) notFound();
  const db = createAdminClient();
  const [{ data: p }, { data: org }] = await Promise.all([
    db.from("properties").select("title, address, city, listing_type, price_minor, currency, bedrooms, bathrooms, area_sqm, description, listing_url, video_url, image_url, status")
      .eq("id", t.propertyId).eq("organization_id", t.orgId).maybeSingle(),
    db.from("organizations").select("name").eq("id", t.orgId).maybeSingle(),
  ]);
  if (!p || !org || p.status === "draft" || p.status === "withdrawn") notFound();
  await db.rpc("record_property_view", { p_org: t.orgId, p_lead: t.leadId, p_property: t.propertyId });
  const facts = [p.bedrooms !== null && `${p.bedrooms} bed`, p.bathrooms !== null && `${p.bathrooms} bath`, p.area_sqm && `${p.area_sqm} m²`].filter(Boolean).join(" · ");
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{org.name}</p>
      <h1 className="mt-1 text-2xl font-semibold">{p.title}</h1>
      <p className="mt-1 text-sm text-muted">{[p.address, p.city].filter(Boolean).join(", ")}</p>
      {p.image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- external listing image, dimensions unknown
        <img src={p.image_url} alt={p.title} className="mt-6 w-full rounded-xl border border-line object-cover" />
      )}
      <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {p.price_minor !== null && <span className="tabular text-xl font-semibold">{formatMoney(p.price_minor, p.currency)}{p.listing_type === "rent" && " / year"}</span>}
        {facts && <span className="text-sm text-muted">{facts}</span>}
        {p.status !== "available" && <span className="text-sm font-medium text-warn">{p.status.replace("_", " ")}</span>}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        {p.video_url && <a href={p.video_url} rel="noopener noreferrer" target="_blank" className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink">Watch the video tour</a>}
        {p.listing_url && <a href={p.listing_url} rel="noopener noreferrer" target="_blank" className="rounded-lg border border-line px-4 py-2.5 text-sm">Full listing</a>}
      </div>
      {p.description && <p className="mt-6 text-sm whitespace-pre-wrap">{p.description}</p>}
      <p className="mt-10 text-xs text-muted">Shared with you by {org.name}. Reply to their message to arrange a viewing.</p>
    </main>
  );
}
