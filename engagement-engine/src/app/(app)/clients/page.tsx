import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { isStaff, isSuperAdmin } from "@/lib/auth/types";
import { withUser } from "@/lib/db";
import { Card, EmptyState, LinkButton, PageHeader, PlatformList, StatusBadge, Table, Td, Th, fmt } from "@/components/ui";
import { redirect } from "next/navigation";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireUser();
  if (!isStaff(user)) redirect("/");
  const { q = "", status = "" } = await searchParams;
  const rows = await withUser(user.id, (db) =>
    db.query<{
      id: string;
      name: string;
      industry: string | null;
      status: string;
      managers: string | null;
      platforms: string[];
      pending: number;
      published: number;
      replies: number;
      onboarding: number;
    }>(
      `select c.id, c.name, c.industry, c.status,
              (select string_agg(u.full_name, ', ' order by am.is_primary desc) from account_managers am join users u on u.id = am.user_id where am.client_id = c.id) as managers,
              coalesce((select array_agg(distinct sa.platform) from social_accounts sa where sa.client_id = c.id and sa.status = 'connected'), '{}') as platforms,
              (select count(*)::int from comments m where m.client_id = c.id and m.status = 'pending_approval') as pending,
              (select count(*)::int from comments m where m.client_id = c.id and m.status = 'published') as published,
              (select coalesce(sum(em.replies), 0)::int from engagement_metrics em where em.client_id = c.id and em.comment_id is not null) as replies,
              coalesce(array_length(c.onboarding_completed_steps, 1), 0) as onboarding
       from clients c
       where ($1 = '' or c.name ilike '%' || $1 || '%' or c.industry ilike '%' || $1 || '%')
         and (case when $2 = '' then c.status <> 'archived' else c.status = $2 end)
       order by c.name`,
      [q.slice(0, 100), ["active", "paused", "onboarding", "archived"].includes(status) ? status : ""],
    ),
  );

  return (
    <>
      <PageHeader
        title="Clients"
        description="Every client is isolated: its own accounts, brand voice, audiences, comments and analytics."
        actions={isSuperAdmin(user) && <LinkButton href="/clients/new" variant="primary">+ New client</LinkButton>}
      />
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b-2 border-line px-4 py-3" role="search">
          <input name="q" defaultValue={q} placeholder="Search by name or industry" aria-label="Search clients" className="h-9 min-w-[200px] flex-1 rounded-full border-2 border-brand/30 bg-surface-2 px-4 text-sm" />
          <select name="status" defaultValue={status} aria-label="Status" className="h-9 rounded-full border-2 border-brand/30 bg-surface-2 px-3 text-sm">
            <option value="">All except archived</option>
            <option value="active">Active</option>
            <option value="onboarding">Onboarding</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
          <button className="gbs-press h-9 rounded-full border-2 border-brand bg-surface px-4 text-sm font-semibold text-brand shadow-hard-sm">Filter</button>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="No clients match" description={isSuperAdmin(user) ? "Create a client to start onboarding." : "You haven't been assigned to any clients yet."} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Industry</Th>
                <Th>Account manager</Th>
                <Th>Connected platforms</Th>
                <Th className="text-right">Pending</Th>
                <Th className="text-right">Published</Th>
                <Th className="text-right">Replies</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/clients/${r.id}/dashboard`} className="font-medium text-ink hover:underline">
                      {r.name}
                    </Link>
                    {r.status === "onboarding" && <div className="text-xs text-ink-3">Setup {Math.round((r.onboarding / 12) * 100)}%</div>}
                  </Td>
                  <Td>{r.industry ?? "—"}</Td>
                  <Td>{r.managers ?? <span className="text-warn">Unassigned</span>}</Td>
                  <Td>
                    <PlatformList platforms={r.platforms} />
                  </Td>
                  <Td className="tabular text-right">
                    {r.pending ? (
                      <Link href={`/clients/${r.id}/approvals`} className="font-medium text-warn hover:underline">
                        {r.pending}
                      </Link>
                    ) : (
                      0
                    )}
                  </Td>
                  <Td className="tabular text-right">{fmt(r.published)}</Td>
                  <Td className="tabular text-right">{fmt(r.replies)}</Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
