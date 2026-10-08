import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { dailySeries, defaultRange, totals } from "@/lib/services/analytics";
import { accountManagerWorkload } from "@/lib/services/workload";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, Table, Td, Th, fmt } from "@/components/ui";
import { LineChart } from "@/components/client/charts";

export const metadata = { title: "Dashboard" };

export default async function GbsDashboard() {
  const user = await requireStaff();
  const d = await withUser(user.id, async (db) => {
    const t = await totals(db, defaultRange(30));
    const series = await dailySeries(db, defaultRange(14));
    const counts = (await db.one<{ clients: number; campaigns: number; accounts: number; today: number; expired: number }>(
      `select (select count(*)::int from clients where status in ('active','onboarding')) as clients,
              (select count(*)::int from campaigns where status = 'active') as campaigns,
              (select count(*)::int from social_accounts where status = 'connected') as accounts,
              (select count(*)::int from engagement_opportunities where discovered_at >= date_trunc('day', now())) as today,
              (select count(*)::int from social_accounts where status = 'expired') as expired`,
    ))!;
    const needs = await db.query<{ id: string; name: string; pending: number; manual: number; failed: number; expired: number }>(
      `select c.id, c.name,
              (select count(*)::int from comments m where m.client_id = c.id and m.status = 'pending_approval') as pending,
              (select count(*)::int from publishing_jobs j where j.client_id = c.id and j.status = 'manual_required') as manual,
              (select count(*)::int from publishing_jobs j where j.client_id = c.id and j.status = 'failed') as failed,
              (select count(*)::int from social_accounts s where s.client_id = c.id and s.status = 'expired') as expired
       from clients c where c.status <> 'archived'
       order by 4 desc, 5 desc, 3 desc, c.name limit 12`,
    );
    const workload = user.platformRole === "super_admin" ? await accountManagerWorkload(db) : [];
    return { t, series, counts, needs: needs.filter((n) => n.pending || n.manual || n.failed || n.expired), workload };
  });

  return (
    <>
      <PageHeader title={`Good to see you, ${user.fullName.split(" ")[0]}`} description={user.platformRole === "super_admin" ? "Everything across GBS clients." : "Your assigned clients."} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Clients" value={fmt(d.counts.clients)} href="/clients" />
        <Stat label="Active campaigns" value={fmt(d.counts.campaigns)} />
        <Stat label="Connected accounts" value={fmt(d.counts.accounts)} hint={d.counts.expired ? `${d.counts.expired} need reconnecting` : undefined} />
        <Stat label="Today's opportunities" value={fmt(d.counts.today)} />
        <Stat label="Pending approvals" value={fmt(d.t.pending)} />
        <Stat label="Published (30d)" value={fmt(d.t.published)} hint={`${fmt(d.t.replies)} replies`} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Activity across clients" description="Last 14 days" />
          <CardBody>
            <LineChart
              title="Opportunities, approvals and publications across clients"
              data={d.series as unknown as Record<string, number | string>[]}
              xKey="day"
              series={[
                { key: "opportunities", label: "Opportunities", color: "--series-1" },
                { key: "approved", label: "Approved", color: "--series-2" },
                { key: "published", label: "Published", color: "--series-3" },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Needs attention" />
          {d.needs.length === 0 ? (
            <EmptyState title="All clear" description="No pending approvals, failed jobs or expired connections." />
          ) : (
            <ul className="divide-y divide-line">
              {d.needs.map((n) => (
                <li key={n.id}>
                  <Link href={`/clients/${n.id}/${n.failed || n.manual ? "publishing" : n.expired ? "accounts" : "approvals"}`} className="block px-5 py-3 hover:bg-surface-2">
                    <div className="text-sm font-medium text-ink">{n.name}</div>
                    <div className="text-xs text-ink-3">
                      {[n.pending && `${n.pending} pending`, n.manual && `${n.manual} to post manually`, n.failed && `${n.failed} failed`, n.expired && `${n.expired} expired connection`].filter(Boolean).join(" · ")}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {d.workload.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Account manager workload" actions={<Link href="/team" className="text-xs text-brand hover:underline">Team</Link>} />
          <Table>
            <thead><tr><Th>Account manager</Th><Th className="text-right">Clients</Th><Th className="text-right">Pending</Th><Th className="text-right">Approved today</Th><Th className="text-right">Today&apos;s opportunities</Th><Th className="text-right">Publishing</Th><Th className="text-right">Failed</Th></tr></thead>
            <tbody>
              {d.workload.map((w) => (
                <tr key={w.user_id}>
                  <Td className="font-medium text-ink">{w.full_name}</Td>
                  <Td className="tabular text-right">{w.clients}</Td>
                  <Td className="tabular text-right">{w.pending}</Td>
                  <Td className="tabular text-right">{w.approved_today}</Td>
                  <Td className="tabular text-right">{w.opportunities_today}</Td>
                  <Td className="tabular text-right">{w.publishing}</Td>
                  <Td className={"tabular text-right" + (w.failed ? " text-bad" : "")}>{w.failed}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
