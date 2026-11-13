import type { Metadata } from "next";
import { getGroupContext, ROLE_LABELS } from "@/lib/workspace";
import { GroupHead } from "@/lib/group-head";
import { Cta } from "@/components/dp/shell";
import { Modal } from "@/components/dp/modal";
import { ListView, NOTES } from "@/views/list";
import { GroupMemberForm } from "../forms";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: PageProps<"/group/people">) {
  const sp = await searchParams;
  const g = await getGroupContext();
  const ids = g.registry.map((c) => c.id);
  const [gm, cm] = await Promise.all([
    g.supabase.from("group_memberships").select("user_id, role, user:users(full_name, email)").eq("family_group_id", g.group.id),
    ids.length ? g.supabase.from("memberships").select("user_id, role, organization_id, user:users(full_name, email)").in("organization_id", ids) : Promise.resolve({ data: [] }),
  ]);
  type U = { full_name: string | null; email: string | null } | null;
  const people = new Map<string, { name: string; email: string; group?: string; companies: string[] }>();
  const nm = new Map(g.registry.map((c) => [c.id, c.short_name ?? c.name]));
  for (const x of (gm.data ?? []) as unknown as { user_id: string; role: string; user: U }[]) people.set(x.user_id, { name: x.user?.full_name || x.user?.email || "—", email: x.user?.email ?? "", group: ROLE_LABELS[x.role], companies: [] });
  for (const x of (cm.data ?? []) as unknown as { user_id: string; role: string; organization_id: string; user: U }[]) {
    const p = people.get(x.user_id) ?? { name: x.user?.full_name || x.user?.email || "—", email: x.user?.email ?? "", companies: [] };
    p.companies.push(`${nm.get(x.organization_id)} (${ROLE_LABELS[x.role] ?? x.role})`);
    people.set(x.user_id, p);
  }
  const [title, lines] = NOTES.team;
  const owner = g.group.role === "group_owner";
  return (
    <>
      <GroupHead title="People" right={owner ? <Cta href="/group/people?add=1">+ Add</Cta> : undefined} />
      <ListView vm={{
        head: ["PERSON", "GROUP ROLE", "COMPANIES", "TARGET"],
        rows: [...people.values()].map((p) => ({ a: <>{p.name}<div style={{ fontWeight: 400, fontSize: 12.5, color: "#6d7a70" }}>{p.email}</div></>, b: p.group ?? "No group access", c: p.companies.join(", ") || "—", d: "—" })),
        empty: "No people yet.", noteTitle: title, noteLines: [...lines, "Group roles show the registry; company figures need company membership"],
      }} />
      {sp.add && owner && <Modal title="Grant group access" closeHref="/group/people"><GroupMemberForm /></Modal>}
    </>
  );
}
