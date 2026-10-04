import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { breakdown, dailySeries, parseRange, totals } from "@/lib/services/analytics";
import { Card, CardBody, CardHeader, PageHeader, Stat, fmt, pct } from "@/components/ui";
import { BarList, LineChart } from "@/components/client/charts";
import { RangePicker } from "@/components/range-picker";

export const metadata = { title: "Client analytics" };

export default async function ClientAnalytics({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ days?: string }> }) {
  const { clientId } = await params;
  const range = parseRange(await searchParams);
  const { user } = await requireClientAccess(clientId);
  const f = { clientId, from: range.from, to: range.to };
  const d = await withUser(user.id, async (db) => {
    const t = await totals(db, f);
    const series = await dailySeries(db, f);
    const platforms = await breakdown(db, f, "platform");
    const campaigns = await breakdown(db, f, "campaign");
    const audience = await db.one<{ followers: number | null; visits: number | null; leads: number | null }>(
      `select (select sum(followers)::int from (select distinct on (social_account_id) followers from engagement_metrics
                where client_id = $1 and comment_id is null and followers is not null order by social_account_id, metric_date desc) x) as followers,
              (select sum(profile_visits)::int from engagement_metrics where client_id = $1 and comment_id is null and metric_date between $2::date and $3::date) as visits,
              (select sum(leads)::int from engagement_metrics where client_id = $1 and metric_date between $2::date and $3::date) as leads`,
      [clientId, range.from, range.to],
    );
    return { t, series, platforms, campaigns, audience: audience! };
  });
  const { t } = d;
  const rateSeries = d.series.map((p) => ({ ...p, approvalRate: p.generated ? Math.round((p.approved / p.generated) * 100) : 0 }));

  return (
    <>
      <PageHeader title="Analytics" description="This client's engagement only." actions={<RangePicker base={`/clients/${clientId}/analytics`} current={range.days} />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Stat label="Opportunities" value={fmt(t.opportunities)} />
        <Stat label="Comments generated" value={fmt(t.generated)} />
        <Stat label="Approved" value={fmt(t.approved)} hint={`Approval rate ${pct(t.approved, t.approved + t.rejected)}`} />
        <Stat label="Rejected" value={fmt(t.rejected)} />
        <Stat label="Published" value={fmt(t.published)} hint={`Publishing rate ${pct(t.published, t.approved)}`} />
        <Stat label="Replies" value={fmt(t.replies)} hint={`Reply rate ${pct(t.replies, t.published)}`} />
        <Stat label="Likes" value={fmt(t.likes)} />
        <Stat label="Profile visits" value={fmt(d.audience.visits)} hint="Where the platform reports it" />
        <Stat label="Followers" value={fmt(d.audience.followers)} hint="Latest, across connected accounts" />
        <Stat label="Leads" value={fmt(d.audience.leads)} hint="Where measurable" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Engagement trend" />
          <CardBody>
            <LineChart
              title="Published comments and replies per day"
              data={d.series as unknown as Record<string, number | string>[]}
              xKey="day"
              series={[
                { key: "published", label: "Published", color: "--series-1" },
                { key: "replies", label: "Replies", color: "--series-2" },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Approval rate" description="Approved as a share of comments generated that day" />
          <CardBody>
            <LineChart title="Approval rate per day (%)" data={rateSeries as unknown as Record<string, number | string>[]} xKey="day" series={[{ key: "approvalRate", label: "Approval rate %", color: "--series-1" }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Platform performance" />
          <CardBody>
            <BarList
              title="By platform"
              rows={d.platforms.map((r) => ({ label: r.label, values: { approved: r.approved, published: r.published, replies: r.replies } }))}
              series={[
                { key: "approved", label: "Approved", color: "--series-1" },
                { key: "published", label: "Published", color: "--series-2" },
                { key: "replies", label: "Replies", color: "--series-3" },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Campaign performance" />
          <CardBody>
            <BarList
              title="By campaign"
              rows={d.campaigns.map((r) => ({ label: r.label ?? "—", values: { opportunities: r.opportunities, published: r.published, replies: r.replies } }))}
              series={[
                { key: "opportunities", label: "Opportunities", color: "--series-1" },
                { key: "published", label: "Published", color: "--series-2" },
                { key: "replies", label: "Replies", color: "--series-3" },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
