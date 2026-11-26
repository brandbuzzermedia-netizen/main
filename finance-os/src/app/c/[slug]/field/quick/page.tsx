import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { QuickAdd } from "@/components/field/field-client";
import { saveLeadAction } from "../actions";
import { Box, FieldTabs } from "../tabs";

export const metadata: Metadata = { title: "Quick add" };

export default async function QuickAddPage({ params, searchParams }: PageProps<"/c/[slug]/field/quick">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  return (
    <>
      <PageHead own={designFor(slug).own} treat="Field sales" title="Quick add" tag="Ten seconds." />
      <FieldTabs slug={slug} current="/add" note={sp.note} />
      <Box title="At the shop"><QuickAdd action={saveLeadAction.bind(null, slug, "new")} /></Box>
    </>
  );
}
