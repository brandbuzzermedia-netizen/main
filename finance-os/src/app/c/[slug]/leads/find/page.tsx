import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { Btn } from "@/components/dp/ui";
import { MapsFinder } from "@/components/field/maps-finder";
import { addFoundLeadsAction } from "../../field/actions";

export const metadata: Metadata = { title: "Find on Google Maps" };

/** Leads tab: find businesses on Google Maps (search, this area, near me) and add them as leads in one tap. */
export default async function FindOnMaps({ params }: PageProps<"/c/[slug]/leads/find">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const d = designFor(slug);
  const { data } = await ctx.supabase.from("contacts").select("place_id").eq("organization_id", ctx.company.id).not("place_id", "is", null).limit(10000);
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title="Find on Google Maps" tag="Then go." right={<Btn href={`/c/${slug}/leads`}>All leads</Btn>} />
      <MapsFinder known={(data ?? []).map((r) => r.place_id as string)} add={addFoundLeadsAction.bind(null, slug)} />
    </>
  );
}
