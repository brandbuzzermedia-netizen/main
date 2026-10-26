import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { loadLeadContext, memberName } from "@/lib/leads";
import { ROLES, roleLabel } from "@/domain/labels";
import { Card, Select, Table, Td } from "@/components/ui";
import { changeRoleAction, removeMemberAction } from "../actions";
import { InviteForm } from "../forms";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await getContext();
  const { members } = await loadLeadContext(ctx);
  return (
    <div className="flex flex-col gap-6">
      {ctx.can.manageTeam && (
        <Card title="Invite a colleague">
          <InviteForm />
          <p className="mt-3 text-xs text-muted">
            Agency admins manage everything. Campaign managers manage and assign all leads. Sales reps see only leads assigned to them.
            Read-only users can view but not change anything.
          </p>
        </Card>
      )}
      <Card title={`Members (${members.length})`}>
        <div className="-m-4">
          <Table head={["Name", "Email", "Role", ""]}>
            {members.map((m) => (
              <tr key={m.user_id}>
                <Td className="font-medium">{memberName(m)}{m.user_id === ctx.userId && <span className="text-muted"> (you)</span>}</Td>
                <Td>{m.user?.email}</Td>
                <Td>
                  {ctx.can.manageTeam ? (
                    <form action={changeRoleAction.bind(null, m.user_id)} className="flex gap-2">
                      <label htmlFor={`role-${m.user_id}`} className="sr-only">Role</label>
                      <Select id={`role-${m.user_id}`} name="role" defaultValue={m.role} className="w-auto">
                        {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                      </Select>
                      <button className="rounded-lg border border-line px-2 text-xs hover:bg-surface-2">Save</button>
                    </form>
                  ) : roleLabel[m.role]}
                </Td>
                <Td>
                  {ctx.can.manageTeam && m.user_id !== ctx.userId && (
                    <form action={removeMemberAction.bind(null, m.user_id)}>
                      <button className="text-xs text-muted hover:text-danger">Remove</button>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>
    </div>
  );
}
