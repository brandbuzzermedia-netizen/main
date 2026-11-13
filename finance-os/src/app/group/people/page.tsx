import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGroupContext, ROLE_LABELS } from "@/lib/workspace";
import { Card, PageHeader, Table, Td } from "@/components/ui";
import { GroupMemberForm } from "../forms";

export const metadata: Metadata = { title: "People & access" };

export default async function PeoplePage() {
  const g = await getGroupContext();
  if (g.group.role !== "group_owner") notFound();
  const { data, error } = await g.supabase.from("group_memberships")
    .select("id, role, created_at, user:users(full_name, email)").eq("family_group_id", g.group.id).order("created_at");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { id: string; role: string; user: { full_name: string | null; email: string | null } | null }[];
  return (
    <>
      <PageHeader title="People & access" description="Group roles. A group role shows the registry and Command Centre; company figures and records need membership of that company (granted from its Team page)." />
      <div className="flex flex-col gap-5">
        <Table head={["Person", "Group role"]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td><div className="font-medium">{r.user?.full_name || r.user?.email}</div><div className="text-xs text-muted">{r.user?.email}</div></Td>
              <Td>{ROLE_LABELS[r.role] ?? r.role}</Td>
            </tr>
          ))}
        </Table>
        <Card title="Grant group access">
          <p className="mb-3 text-sm text-muted">Only group owners can do this; company admins cannot. The person must have signed in once.</p>
          <GroupMemberForm />
        </Card>
      </div>
    </>
  );
}
