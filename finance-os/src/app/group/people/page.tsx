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
  // As in the design: one role and one scope per person. The most senior company role is shown.
  const RANK = ["owner", "company_admin", "finance", "sales_manager", "operations_manager", "marketing_manager", "account_manager", "accountant", "viewer", "sales_rep", "staff", "partner"];
  const people = new Map<string, { name: string; email: string; group?: string; roles: string[]; companies: string[] }>();
  const nm = new Map(g.registry.map((c) => [c.id, c.short_name ?? c.name]));
  for (const x of (gm.data ?? []) as unknown as { user_id: string; role: string; user: U }[]) people.set(x.user_id, { name: x.user?.full_name || x.user?.email || "—", email: x.user?.email ?? "", group: ROLE_LABELS[x.role], roles: [], companies: [] });
  for (const x of (cm.data ?? []) as unknown as { user_id: string; role: string; organization_id: string; user: U }[]) {
    const p = people.get(x.user_id) ?? { name: x.user?.full_name || x.user?.email || "—", email: x.user?.email ?? "", roles: [], companies: [] };
    p.roles.push(x.role); p.companies.push(nm.get(x.organization_id) ?? "");
    people.set(x.user_id, p);
  }
  const top = (roles: string[]) => [...roles].sort((a, b) => (RANK.indexOf(a) + 99) % 99 - (RANK.indexOf(b) + 99) % 99)[0];
  const scope = (p: { group?: string; companies: string[] }) =>
    p.group === ROLE_LABELS.group_owner ? "All businesses" : p.companies.length === 1 ? p.companies[0] : p.companies.length ? `${p.companies.length} businesses` : "Group view only";
  const [title, lines] = NOTES.team;
  const owner = g.group.role === "group_owner";
  return (
    <>
      <GroupHead title="People" right={owner ? <Cta href="/group/people?add=1">+ Add</Cta> : undefined} />
      <ListView vm={{
        head: ["PERSON", "ROLE", "SCOPE", "TARGET"],
        rows: [...people.values()].map((p) => ({ a: <span title={p.email}>{p.name}</span>, b: p.group ?? (p.roles.length ? ROLE_LABELS[top(p.roles)] ?? top(p.roles) : "—"), c: scope(p), d: "—" })),
        empty: "No people yet.", noteTitle: title, noteLines: [...lines, "Group roles show the registry; company figures need company membership"],
      }} />
      {sp.add && owner && <Modal title="Grant group access" closeHref="/group/people"><GroupMemberForm /></Modal>}
    </>
  );
}
