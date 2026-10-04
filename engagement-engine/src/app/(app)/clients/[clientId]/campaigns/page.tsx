import Link from "next/link";
import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState, LinkButton, PageHeader, PlatformList, StatusBadge, Table, Td, Th, timeAgo } from "@/components/ui";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { user, access } = await requireClientAccess(clientId);
  const rows = await withUser(user.id, (db) =>
    db.query<{
      id: string;
      name: string;
      status: string;
      platforms: string[];
      segments: string | null;
      daily_opportunity_limit: number;
      daily_publish_limit: number;
      today: number;
      published_today: number;
      pending: number;
      last_discovery_at: Date | null;
    }>(
      `select ca.id, ca.name, ca.status, ca.platforms, ca.daily_opportunity_limit, ca.daily_publish_limit, ca.last_discovery_at,
              (select string_agg(s.name, ', ') from campaign_segments cs join audience_segments s on s.id = cs.segment_id where cs.campaign_id = ca.id) as segments,
              (select count(*)::int from engagement_opportunities o where o.campaign_id = ca.id and o.discovered_at >= date_trunc('day', now())) as today,
              (select count(*)::int from comments c where c.campaign_id = ca.id and c.published_at >= date_trunc('day', now())) as published_today,
              (select count(*)::int from comments c where c.campaign_id = ca.id and c.status = 'pending_approval') as pending
       from campaigns ca where ca.client_id = $1 and ca.status <> 'archived' order by ca.status, ca.name`,
      [clientId],
    ),
  );
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Each campaign belongs to this client only and runs on its audience segments, platforms and limits."
        actions={access.canManage && <LinkButton href={`/clients/${clientId}/campaigns/new`} variant="primary">+ New campaign</LinkButton>}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No campaigns yet" description="A campaign ties audience segments, platforms and keywords to daily limits." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Platforms</Th>
                <Th>Audience</Th>
                <Th className="text-right">Opportunities today</Th>
                <Th className="text-right">Published today</Th>
                <Th className="text-right">Pending</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/clients/${clientId}/campaigns/${c.id}`} className="font-medium text-ink hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-ink-3">Last discovery {timeAgo(c.last_discovery_at)}</div>
                  </Td>
                  <Td>
                    <PlatformList platforms={c.platforms} />
                  </Td>
                  <Td className="text-xs">{c.segments ?? "—"}</Td>
                  <Td className="tabular text-right">
                    {c.today} / {c.daily_opportunity_limit}
                  </Td>
                  <Td className="tabular text-right">
                    {c.published_today} / {c.daily_publish_limit}
                  </Td>
                  <Td className="tabular text-right">{c.pending}</Td>
                  <Td>
                    <StatusBadge status={c.status} />
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
