import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { formatMoney } from "@/domain/money";
import { Badge, ButtonLink, EmptyState, PageHeader, Table, Td } from "@/components/ui";

export const metadata: Metadata = { title: "Properties" };

export default async function PropertiesPage() {
  const ctx = await getContext();
  const [{ data, error }, { data: interests }] = await Promise.all([
    ctx.supabase.from("properties").select("id, title, reference, city, listing_type, price_minor, currency, bedrooms, status, video_url").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(500),
    ctx.supabase.from("lead_property_interests").select("property_id, status, view_count").eq("organization_id", ctx.org.id),
  ]);
  if (error) throw new Error(error.message);
  const stats = new Map<string, { shared: number; viewed: number; interested: number }>();
  for (const i of interests ?? []) {
    const s = stats.get(i.property_id) ?? { shared: 0, viewed: 0, interested: 0 };
    s.shared++;
    if (i.view_count > 0) s.viewed++;
    if (i.status === "interested") s.interested++;
    stats.set(i.property_id, s);
  }
  return (
    <>
      <PageHeader title="Properties" description="Listings you can share with leads. Every share carries a personal video-tour link, and you see who opened it."
        actions={ctx.can.assignLeads ? <ButtonLink href="/properties/new">Add property</ButtonLink> : undefined} />
      {!data?.length ? (
        <EmptyState title="No properties yet" action={ctx.can.assignLeads ? <ButtonLink href="/properties/new">Add your first listing</ButtonLink> : undefined}>
          Add listings with a video tour link, then share them from a lead&apos;s page.
        </EmptyState>
      ) : (
        <Table head={["Property", "Status", "Price", "Beds", "Video", "Shared", "Opened", "Interested"]}>
          {data.map((p) => {
            const s = stats.get(p.id);
            return (
              <tr key={p.id}>
                <Td><Link className="font-medium hover:text-brand" href={`/properties/${p.id}`}>{p.title}</Link><div className="text-xs text-muted">{[p.reference, p.city].filter(Boolean).join(" · ")}</div></Td>
                <Td><Badge tone={p.status === "available" ? "ok" : p.status === "under_offer" ? "warn" : "neutral"}>{p.status.replace("_", " ")}</Badge></Td>
                <Td numeric>{formatMoney(p.price_minor, p.currency, { compact: true })}{p.listing_type === "rent" && <span className="text-xs text-muted">/yr</span>}</Td>
                <Td numeric>{p.bedrooms ?? "—"}</Td>
                <Td>{p.video_url ? "Yes" : <span className="text-muted">No</span>}</Td>
                <Td numeric>{s?.shared ?? 0}</Td>
                <Td numeric>{s?.viewed ?? 0}</Td>
                <Td numeric>{s?.interested ?? 0}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
