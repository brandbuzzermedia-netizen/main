import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { companiesWith, nameMap } from "@/lib/group-data";
import { GroupHead } from "@/lib/group-head";
import { formatDate } from "@/domain/dates";
import { ListView, NOTES } from "@/views/list";

export const metadata: Metadata = { title: "Vault" };

export default async function GroupVault() {
  const g = await getGroupContext();
  const cs = companiesWith(g, "documents.read");
  const names = nameMap(cs);
  const slug = new Map(cs.map((c) => [c.id, c.slug]));
  const { data } = cs.length ? await g.supabase.from("documents").select("id, organization_id, file_name, kind, created_at").in("organization_id", cs.map((c) => c.id)).order("created_at", { ascending: false }).limit(300) : { data: [] };
  const [title, lines] = NOTES.vault;
  return (
    <>
      <GroupHead title="Vault" />
      <ListView vm={{
        head: ["FILE", "TYPE", "BUSINESS", "UPDATED"],
        rows: ((data ?? []) as { id: string; organization_id: string; file_name: string; kind: string; created_at: string }[]).map((x) => ({ a: x.file_name, b: x.kind, c: names.get(x.organization_id), d: formatDate(x.created_at.slice(0, 10)), href: `/c/${slug.get(x.organization_id)}/documents/${x.id}` })),
        empty: "No documents in the businesses whose vault you can open. Company vaults stay separate by default.", noteTitle: title, noteLines: lines,
      }} />
    </>
  );
}
