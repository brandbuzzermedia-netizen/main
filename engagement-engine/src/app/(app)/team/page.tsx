import { requireStaff } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { accountManagerWorkload } from "@/lib/services/workload";
import { Badge, Card, CardBody, CardHeader, Field, PageHeader, StatusBadge, Table, Td, Th, formatDate, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ActionButton } from "@/components/client/comment-tools";
import { createStaffUser, setUserStatus } from "@/app/actions/admin";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const user = await requireStaff();
  const isAdmin = user.platformRole === "super_admin";
  const d = await withUser(user.id, async (db) => ({
    workload: await accountManagerWorkload(db),
    staff: await db.query<{ id: string; full_name: string; email: string; platform_role: string; status: string; last_login_at: Date | null; clients: string | null }>(
      `select u.id, u.full_name, u.email, u.platform_role, u.status, u.last_login_at,
              (select string_agg(c.name, ', ' order by c.name) from account_managers am join clients c on c.id = am.client_id where am.user_id = u.id) as clients
       from users u where u.platform_role in ('super_admin','account_manager') order by u.platform_role, u.full_name`,
    ),
  }));
  return (
    <>
      <PageHeader title="Team" description="GBS staff, their assigned clients and their queues." />
      <Card>
        <CardHeader title="Account manager workload" />
        <Table>
          <thead><tr><Th>Account manager</Th><Th className="text-right">Assigned clients</Th><Th className="text-right">Pending approvals</Th><Th className="text-right">Approved today</Th><Th className="text-right">Today&apos;s opportunities</Th><Th className="text-right">Publishing queue</Th><Th className="text-right">Failed jobs</Th></tr></thead>
          <tbody>
            {d.workload.map((w) => (
              <tr key={w.user_id}>
                <Td className="font-medium text-ink">{w.full_name}</Td>
                <Td className="tabular text-right">{w.clients}</Td>
                <Td className="tabular text-right">{w.pending}</Td>
                <Td className="tabular text-right">{w.approved_today}</Td>
                <Td className="tabular text-right">{w.opportunities_today}</Td>
                <Td className="tabular text-right">{w.publishing}</Td>
                <Td className={"tabular text-right" + (w.failed ? " font-medium text-bad" : "")}>{w.failed}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader title="GBS employees" />
        <Table>
          <thead><tr><Th>Name</Th><Th>Role</Th><Th>Clients</Th><Th>Last sign-in</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {d.staff.map((s) => (
              <tr key={s.id}>
                <Td><div className="font-medium text-ink">{s.full_name}</div><div className="text-xs text-ink-3">{s.email}</div></Td>
                <Td><Badge tone={s.platform_role === "super_admin" ? "brand" : "neutral"}>{s.platform_role === "super_admin" ? "Super admin" : "Account manager"}</Badge></Td>
                <Td className="max-w-[280px] text-xs">{s.platform_role === "super_admin" ? "All clients" : (s.clients ?? "—")}</Td>
                <Td className="text-xs">{formatDate(s.last_login_at, true)}</Td>
                <Td><StatusBadge status={s.status === "active" ? "active" : "archived"} /></Td>
                <Td>
                  {isAdmin && s.id !== user.id && (
                    <ActionButton run={setUserStatus.bind(null, s.id, s.status === "active" ? "disabled" : "active")} variant={s.status === "active" ? "danger" : "secondary"} confirm={s.status === "active" ? { title: `Disable ${s.full_name}?`, body: "They are signed out immediately and lose access to all clients.", label: "Disable" } : undefined}>
                      {s.status === "active" ? "Disable" : "Enable"}
                    </ActionButton>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {isAdmin && (
          <CardBody>
            <ActionForm action={createStaffUser} resetOnSuccess className="grid items-end gap-3 md:grid-cols-[1fr_1fr_180px_1fr_auto]">
              <Field label="Name"><input name="full_name" required className={inputClass} /></Field>
              <Field label="Email"><input name="email" type="email" required className={inputClass} /></Field>
              <Field label="Role"><select name="role" className={inputClass}><option value="account_manager">Account manager</option><option value="super_admin">Super admin</option></select></Field>
              <Field label="Initial password"><input name="password" type="password" minLength={10} required autoComplete="new-password" className={inputClass} /></Field>
              <SubmitButton>Add employee</SubmitButton>
            </ActionForm>
            <p className="mt-2 text-xs text-ink-3">Assign account managers to clients from each client&apos;s Settings.</p>
          </CardBody>
        )}
      </Card>
    </>
  );
}
