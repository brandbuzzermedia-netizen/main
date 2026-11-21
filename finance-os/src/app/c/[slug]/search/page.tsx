import type { Metadata } from "next";
import { getCompanyContext } from "@/lib/workspace";
import { searchRecords } from "@/lib/search";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { SearchView } from "@/views/search";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ params, searchParams }: PageProps<"/c/[slug]/search">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const q = String((await searchParams).q ?? "").slice(0, 100);
  const hits = await searchRecords(ctx.supabase, [{ id: ctx.company.id, slug }], q);
  const d = designFor(slug);
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title="Search" />
      <SearchView vm={{ q, action: `/c/${slug}/search`, scope: ctx.company.name, hits }} />
    </>
  );
}
