import { requireStaff } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { breakdown, dailySeries, parseRange, totals } from "@/lib/services/analytics";
import { Card, CardBody, CardHeader, PageHeader, Stat, Table, Td, Th, fmt, pct } from "@/components/ui";
import { BarList, LineChart } from "@/components/client/charts";

export const metadata = { title: "GBS analytics" };

type SP = { days?: string; from?: string; to?: string; client?: string; platform?: string; campaign?: string; am?: string };

export default async function MasterAnalytics({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const range = parseRange(sp);
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const f = {
    from: range.from,
    to: range.to,
    clientId: uuid(sp.client),
    platform: ["instagram", "facebook", "linkedin", "youtube"].includes(sp.platform ?? "") ? sp.platform! : null,
    campaignId: uuid(sp.campaign),
    accountManagerId: uuid(sp.am),
  };
  const d = await withUser(user.id, async (db) => ({
    t: await totals(db, f),
    series: await dailySeries(db, f),
    byClient: await breakdown(db, f, "client"),
    byPlatform: await breakdown(db, f, "platform"),
    byCampaign: await breakdown(db, f, "campaign"),
    counts: (await db.one<{ clients: number; campaigns: number; accounts: number }>(
      `select (select count(*)::int from clients where status <> 'archived') as clients, (select count(*)::int from campaigns where status = 'active') as campaigns,
              (select count(*)::int from social_accounts where status = 'connected') as accounts`,
    ))!,
    clients: await db.query<{ id: string; name: string }>("select id, name from clients order by name"),
    campaigns: await db.query<{ id: string; name: string; client: string }>("select ca.id, ca.name, cl.name as client from campaigns ca join clients cl on cl.id = ca.client_id order by cl.name, ca.name"),
    managers: await db.query<{ id: string; full_name: string }>("select id, full_name from users where platform_role = 'account_manager' order by full_name"),
    errors: (await db.one<{ n: number }>("select count(*)::int as n from publishing_results where success = false and created_at >= $1::date and created_at < $2::date + 1", [range.from, range.to]))!.n,
  }));
  const sel = "h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm";

  return (
    <>
      <PageHeader title="GBS analytics" description="Operational performance across clients. Client data is compared here for GBS only — it is never mixed into any client's AI context." />
      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-2 px-4 py-3">
          <select name="days" defaultValue={String(range.days)} aria-label="Date range" className={sel}>
            {[7, 14, 30, 90].map((n) => <option key={n} value={n}>Last {n} days</option>)}
          </select>
          <select name="client" defaultValue={f.clientId ?? ""} aria-label="Client" className={sel}>
            <option value="">All clients</option>
            {d.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="platform" defaultValue={f.platform ?? ""} aria-label="Platform" className={sel}>
            <option value="">All platforms</option>
            {["instagram", "facebook", "linkedin", "youtube"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select name="campaign" defaultValue={f.campaignId ?? ""} aria-label="Campaign" className={sel}>
            <option value="">All campaigns</option>
            {d.campaigns.map((c) => <option key={c.id} value={c.id}>{c.client} · {c.name}</option>)}
          </select>
          <select name="am" defaultValue={f.accountManagerId ?? ""} aria-label="Account manager" className={sel}>
            <option value="">All account managers</option>
            {d.managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
          <button className="h-9 rounded-lg bg-brand px-3 text-sm font-medium text-brand-ink">Apply</button>
        </form>
      </Card>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Total clients" value={fmt(d.counts.clients)} />
        <Stat label="Active campaigns" value={fmt(d.counts.campaigns)} />
        <Stat label="Connected accounts" value={fmt(d.counts.accounts)} />
        <Stat label="Opportunities" value={fmt(d.t.opportunities)} />
        <Stat label="Comments generated" value={fmt(d.t.generated)} />
        <Stat label="Approved" value={fmt(d.t.approved)} hint={`Approval rate ${pct(d.t.approved, d.t.approved + d.t.rejected)}`} />
        <Stat label="Published" value={fmt(d.t.published)} />
        <Stat label="Replies" value={fmt(d.t.replies)} />
        <Stat label="AI usage" value={fmt(d.t.aiGenerations)} hint="Generation runs" />
        <Stat label="API usage" value={fmt(d.t.apiCalls)} hint="Publishing calls + hashtag queries" />
        <Stat label="Publishing errors" value={fmt(d.errors)} />
        <Stat label="Pending approvals" value={fmt(d.t.pending)} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Trend" />
          <CardBody>
            <LineChart
              title="Opportunities and published comments per day"
              data={d.series as unknown as Record<string, number | string>[]}
              xKey="day"
              series={[
                { key: "opportunities", label: "Opportunities", color: "--series-1" },
                { key: "published", label: "Published", color: "--series-2" },
                { key: "replies", label: "Replies", color: "--series-3" },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Platform performance" />
          <CardBody>
            <BarList
              title="By platform"
              rows={d.byPlatform.map((r) => ({ label: r.label, values: { approved: r.approved, published: r.published, replies: r.replies } }))}
              series={[
                { key: "approved", label: "Approved", color: "--series-1" },
                { key: "published", label: "Published", color: "--series-2" },
                { key: "replies", label: "Replies", color: "--series-3" },
              ]}
            />
          </CardBody>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Client comparison" description="Operational metrics only" />
        <Table>
          <thead><tr><Th>Client</Th><Th className="text-right">Opportunities</Th><Th className="text-right">Generated</Th><Th className="text-right">Approved</Th><Th className="text-right">Rejected</Th><Th className="text-right">Published</Th><Th className="text-right">Replies</Th><Th className="text-right">Approval rate</Th></tr></thead>
          <tbody>
            {d.byClient.map((r) => (
              <tr key={r.key}>
                <Td className="font-medium text-ink">{r.label}</Td>
                <Td className="tabular text-right">{r.opportunities}</Td>
                <Td className="tabular text-right">{r.generated}</Td>
                <Td className="tabular text-right">{r.approved}</Td>
                <Td className="tabular text-right">{r.rejected}</Td>
                <Td className="tabular text-right">{r.published}</Td>
                <Td className="tabular text-right">{r.replies}</Td>
                <Td className="tabular text-right">{pct(r.approved, r.approved + r.rejected)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Campaign performance" />
        <CardBody>
          <BarList
            title="By campaign"
            rows={d.byCampaign.slice(0, 12).map((r) => ({ label: r.label ?? "—", values: { opportunities: r.opportunities, published: r.published } }))}
            series={[
              { key: "opportunities", label: "Opportunities", color: "--series-1" },
              { key: "published", label: "Published", color: "--series-2" },
            ]}
          />
        </CardBody>
      </Card>
    </>
  );
}
