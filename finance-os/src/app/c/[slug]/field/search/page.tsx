import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { AreaSearch } from "@/components/field/field-client";
import { addFoundLeadsAction } from "../actions";
import { Box, FieldTabs } from "../tabs";

export const metadata: Metadata = { title: "Search Google Maps" };

export default async function SearchPage({ params, searchParams }: PageProps<"/c/[slug]/field/search">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const { data } = await ctx.supabase.from("contacts").select("place_id").eq("organization_id", ctx.company.id).not("place_id", "is", null).limit(5000);
  return (
    <>
      <PageHead own={designFor(slug).own} treat="Field sales" title="Search Google Maps" tag="Pick and add." />
      <FieldTabs slug={slug} current="/add" note={sp.note} />
      <Box title="Find shops by area"><AreaSearch known={(data ?? []).map((r) => r.place_id as string)} add={addFoundLeadsAction.bind(null, slug)} /></Box>
    </>
  );
}
