import Link from "next/link";
import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { dailySeries, defaultRange, totals } from "@/lib/services/analytics";
import { Card, CardBody, CardHeader, EmptyState, LinkButton, PageHeader, PlatformIcon, ScoreBadge, Stat, StatusBadge, fmt, pct, timeAgo } from "@/components/ui";
import { LineChart } from "@/components/client/charts";

export const metadata = { title: "Client dashboard" };

export default async function ClientDashboard({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { user, access } = await requireClientAccess(clientId);
  const range = defaultRange(14);
  const data = await withUser(user.id, async (db) => {
    const f = { clientId, ...range };
    const [t, series, today, queue, opps, campaigns, accounts, name] = await Promise.all([
      totals(db, { clientId, ...defaultRange(30) }),
      dailySeries(db, f),
      db.one<{ n: number }>(`select count(*)::int as n from engagement_opportunities where client_id = $1 and discovered_at >= date_trunc('day', now())`, [clientId]),
      db.one<{ queued: number; manual: number; failed: number }>(
        `select count(*) filter (where status = 'queued')::int as queued, count(*) filter (where status = 'manual_required')::int as manual,
                count(*) filter (where status = 'failed')::int as failed from publishing_jobs where client_id = $1`,
        [clientId],
      ),
      db.query<{ id: string; platform: string; score: number; score_label: string; status: string; author: string | null; content: string; discovered_at: Date }>(
        `select o.id, o.platform, o.score, o.score_label, o.status, coalesce(p.author_handle, p.author_name) as author, p.content, o.discovered_at
         from engagement_opportunities o join posts p on p.id = o.post_id and p.client_id = o.client_id
         where o.client_id = $1 and o.status in ('analyzed','comment_generated','pending_approval') order by o.score desc nulls last limit 5`,
        [clientId],
      ),
      db.query<{ id: string; name: string; status: string; platforms: string[] }>(`select id, name, status, platforms from campaigns where client_id = $1 and status <> 'archived' order by status, name`, [clientId]),
      db.query<{ platform: string; handle: string | null; display_name: string | null; status: string }>(
        `select platform, handle, display_name, status from social_accounts where client_id = $1 and status <> 'disconnected' order by platform`,
        [clientId],
      ),
      db.one<{ name: string }>("select name from clients where id = $1", [clientId]),
    ]);
    return { t, series, today: today!.n, queue: queue!, opps, campaigns, accounts, name: name!.name };
  });
  const base = `/clients/${clientId}`;

  return (
    <>
      <PageHeader
        title={`${data.name} dashboard`}
        description="Last 30 days unless noted."
        actions={
          <>
            <LinkButton href={`${base}/approvals`} variant="primary">
              Review approvals{data.t.pending ? ` (${data.t.pending})` : ""}
            </LinkButton>
            {access.canManage && <LinkButton href={`${base}/opportunities`}>Opportunities</LinkButton>}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Today's opportunities" value={fmt(data.today)} href={`${base}/opportunities`} />
        <Stat label="Pending approval" value={fmt(data.t.pending)} href={`${base}/approvals`} />
        <Stat label="Comments generated" value={fmt(data.t.generated)} />
        <Stat label="Approved" value={fmt(data.t.approved)} hint={`Approval rate ${pct(data.t.approved, data.t.approved + data.t.rejected)}`} />
        <Stat label="Published" value={fmt(data.t.published)} href={`${base}/comments?status=published`} />
        <Stat label="Replies received" value={fmt(data.t.replies)} hint={`${fmt(data.t.likes)} likes`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Engagement trend" description="Last 14 days" />
          <CardBody>
            <LineChart
              title="Opportunities, approvals and published comments per day"
              data={data.series as unknown as Record<string, number | string>[]}
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
          <CardHeader title="Publishing" actions={<Link href={`${base}/publishing`} className="text-xs text-brand hover:underline">Open queue</Link>} />
          <CardBody className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="tabular text-xl font-semibold">{data.queue.queued}</div>
              <div className="text-xs text-ink-3">Queued</div>
            </div>
            <div>
              <div className="tabular text-xl font-semibold text-[#7a4b00]">{data.queue.manual}</div>
              <div className="text-xs text-ink-3">Manual action</div>
            </div>
            <div>
              <div className="tabular text-xl font-semibold text-bad">{data.queue.failed}</div>
              <div className="text-xs text-ink-3">Failed</div>
            </div>
          </CardBody>
          <CardHeader title="Social accounts" actions={<Link href={`${base}/accounts`} className="text-xs text-brand hover:underline">Manage</Link>} />
          <CardBody>
            {data.accounts.length === 0 ? (
              <p className="text-sm text-ink-3">No accounts connected.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.accounts.map((a) => (
                  <li key={a.platform + a.handle} className="flex items-center gap-2 text-sm">
                    <PlatformIcon platform={a.platform} />
                    <span className="flex-1 truncate">{a.display_name ?? a.handle}</span>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Top open opportunities" actions={<Link href={`${base}/opportunities`} className="text-xs text-brand hover:underline">View all</Link>} />
          {data.opps.length === 0 ? (
            <EmptyState title="No open opportunities" description="Run discovery on an active campaign, or add a post manually." />
          ) : (
            <ul className="divide-y divide-line">
              {data.opps.map((o) => (
                <li key={o.id}>
                  <Link href={`${base}/opportunities/${o.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2">
                    <PlatformIcon platform={o.platform} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-ink">{o.author ? `@${o.author}` : "Unknown author"}</span>
                        <span className="text-xs text-ink-3">{timeAgo(o.discovered_at)}</span>
                      </div>
                      <p className="line-clamp-2 text-sm text-ink-2">{o.content}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <ScoreBadge score={o.score} />
                      <StatusBadge status={o.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Campaigns" actions={<Link href={`${base}/campaigns`} className="text-xs text-brand hover:underline">All campaigns</Link>} />
          {data.campaigns.length === 0 ? (
            <EmptyState title="No campaigns yet" />
          ) : (
            <ul className="divide-y divide-line">
              {data.campaigns.map((c) => (
                <li key={c.id}>
                  <Link href={`${base}/campaigns/${c.id}`} className="flex items-center gap-2 px-5 py-3 text-sm hover:bg-surface-2">
                    <span className="flex-1 truncate font-medium text-ink">{c.name}</span>
                    {c.platforms.map((p) => (
                      <PlatformIcon key={p} platform={p} size={16} />
                    ))}
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
