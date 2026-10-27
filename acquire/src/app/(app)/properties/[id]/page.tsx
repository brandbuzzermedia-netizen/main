import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { formatDateTime } from "@/domain/dates";
import { Badge, Card, Dl, PageHeader, Table, Td } from "@/components/ui";
import { PropertyForm, type PropertyValues } from "@/components/properties";

export const metadata: Metadata = { title: "Property" };

export default async function PropertyPage({ params }: PageProps<"/properties/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("properties").select("*").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!data) notFound();
  const p = data as PropertyValues;
  const { data: interests } = await ctx.supabase.from("lead_property_interests").select("id, lead_id, status, shared_at, view_count, last_viewed_at").eq("property_id", id).order("shared_at", { ascending: false });
  const leadIds = (interests ?? []).map((i) => i.lead_id);
  const { data: leads } = leadIds.length ? await ctx.supabase.from("leads").select("id, full_name").in("id", leadIds) : { data: [] };
  const names = new Map((leads ?? []).map((l) => [l.id, l.full_name]));
  return (
    <>
      <div className="mb-2 text-sm"><Link href="/properties" className="text-muted hover:text-ink">← Properties</Link></div>
      <PageHeader title={p.title} description={[p.reference, p.city].filter(Boolean).join(" · ")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card title={ctx.can.assignLeads ? "Edit" : "Details"}>
          {ctx.can.assignLeads ? <PropertyForm property={p} defaultCurrency={ctx.org.default_currency} />
            : <Dl items={[["Status", p.status], ["Video", p.video_url], ["Listing", p.listing_url], ["Description", p.description]]} />}
        </Card>
        <Card title={`Shared with (${interests?.length ?? 0})`}>
          {!interests?.length ? <p className="text-sm text-muted">Not shared yet. Share it from a lead&apos;s page.</p> : (
            <div className="-m-4">
              <Table head={["Lead", "Status", "Opens"]}>
                {interests.map((i) => (
                  <tr key={i.id}>
                    <Td><Link className="hover:text-brand" href={`/leads/${i.lead_id}`}>{names.get(i.lead_id) ?? "Lead"}</Link><div className="text-xs text-muted">{i.shared_at && `Shared ${formatDateTime(i.shared_at, ctx.org.timezone)}`}</div></Td>
                    <Td><Badge tone={i.status === "interested" ? "ok" : i.status === "viewed" ? "info" : "neutral"}>{i.status.replace("_", " ")}</Badge></Td>
                    <Td numeric>{i.view_count}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
