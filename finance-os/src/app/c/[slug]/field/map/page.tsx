import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { todayInBusinessTz } from "@/domain/dates";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { FieldMap } from "@/components/field/field-client";
import { loadFieldLeads } from "@/lib/field-data";
import { FieldTabs } from "../tabs";

export const metadata: Metadata = { title: "Field map" };

/** Map of all field leads, pins coloured by status. Without a Maps key it shows the list with Google Maps links. */
export default async function FieldMapPage({ params, searchParams }: PageProps<"/c/[slug]/field/map">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const leads = await loadFieldLeads(ctx, { includeLost: true });
  const areas = [...new Set(leads.map((l) => l.area).filter(Boolean) as string[])].sort();
  return (
    <>
      <PageHead own={designFor(slug).own} treat="Field sales" title="Map" tag="Bengaluru." />
      <FieldTabs slug={slug} current="/map" note={sp.note} />
      <FieldMap slug={slug} leads={leads} today={todayInBusinessTz()} areas={areas} />
    </>
  );
}
