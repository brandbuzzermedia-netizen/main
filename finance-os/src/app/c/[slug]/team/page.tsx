import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { Card, PageHeader, Table, Td } from "@/components/ui";
import { MemberForm } from "../forms";
import { changeRoleAction, removeMemberAction } from "../actions";

export const metadata: Metadata = { title: "Team" };

const ASSIGNABLE = ["company_admin", "finance", "viewer", "sales_manager", "sales_rep", "account_manager", "operations_manager",
  "marketing_manager", "staff", "accountant", "partner"];

export default async function TeamPage({ params }: PageProps<"/c/[slug]/team">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("members.manage") && !ctx.can("dashboard.owner")) notFound();
  const [members, perms] = await Promise.all([
    loadMembers(ctx.supabase, ctx.company.id),
    ctx.supabase.from("role_permissions").select("role, permission"),
  ]);
  const canManage = ctx.can("members.manage");
  const roles = ctx.can("members.grant_owner") ? ["owner", ...ASSIGNABLE] : ASSIGNABLE;
  const byRole = new Map<string, string[]>();
  for (const r of perms.data ?? []) byRole.set(r.role as string, [...(byRole.get(r.role as string) ?? []), r.permission as string]);
  return (
    <>
      <PageHeader title="Team" description={`People with access to ${ctx.company.name}. Membership here grants nothing in other companies or the group.`} />
      <div className="flex flex-col gap-5">
        <Table head={["Person", "Role", "Can", ""]}>
          {members.map((m) => {
            const editable = canManage && m.user_id !== ctx.userId && (m.role !== "owner" || ctx.can("members.grant_owner"));
            return (
              <tr key={m.id}>
                <Td><div className="font-medium">{m.name}</div><div className="text-xs text-muted">{m.email}</div></Td>
                <Td>
                  {editable ? (
                    <form action={changeRoleAction.bind(null, slug)} className="flex gap-1.5">
                      <input type="hidden" name="membership_id" value={m.id} />
                      <select name="role" defaultValue={m.role} aria-label={`Role for ${m.name}`} className="rounded-md border border-line bg-surface px-2 py-1 text-sm">
                        {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                      </select>
                      <button className="rounded-md border border-line px-2 text-xs hover:bg-surface-2">Save</button>
                    </form>
                  ) : ROLE_LABELS[m.role] ?? m.role}
                </Td>
                <Td className="max-w-md text-xs text-muted">{(byRole.get(m.role) ?? []).filter((p) => p !== "company.view").join(", ") || "View only"}</Td>
                <Td>
                  {editable && (
                    <form action={removeMemberAction.bind(null, slug)}>
                      <input type="hidden" name="membership_id" value={m.id} />
                      <button className="text-xs text-danger underline-offset-2 hover:underline">Remove</button>
                    </form>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
        {canManage && (
          <Card title="Add a member">
            <p className="mb-3 text-sm text-muted">The person signs in once with their email (sign-in links are limited to approved addresses), then you add them here with a scoped role. Every change is audited.</p>
            <MemberForm slug={slug} roles={roles.map((r) => ({ id: r, label: ROLE_LABELS[r] ?? r }))} />
          </Card>
        )}
      </div>
    </>
  );
}
