import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { nameMap } from "@/lib/group-data";
import { searchRecords } from "@/lib/search";
import { GroupHead } from "@/lib/group-head";
import { SearchView } from "@/views/search";

export const metadata: Metadata = { title: "Search" };

/** Group search covers only companies the viewer is a member of; links pass through the workspace switch. */
export default async function GroupSearch({ searchParams }: PageProps<"/group/search">) {
  const g = await getGroupContext();
  const q = String((await searchParams).q ?? "").slice(0, 100);
  const mine = g.registry.filter((c) => g.access.has(c.id));
  const names = nameMap(mine);
  const hits = (await searchRecords(g.supabase, mine, q)).map((h) => {
    const slug = mine.find((c) => c.id === h.org)!.slug;
    return { ...h, where: names.get(h.org), href: `/switch?to=${slug}&next=${encodeURIComponent(h.href)}` };
  });
  return (
    <>
      <GroupHead title="Search" />
      <SearchView vm={{ q, action: "/group/search", scope: g.group.name, hits }} />
    </>
  );
}
