import { notFound } from "next/navigation";
import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, CardBody, CardHeader, LinkButton, PageHeader, Stat, StatusBadge, timeAgo } from "@/components/ui";
import { ActionButton } from "@/components/client/comment-tools";
import { runDiscoveryNow, setCampaignStatus } from "@/app/actions/campaigns";
import { CampaignForm, type CampaignValues } from "../campaign-form";
import { campaignFormData } from "../data";

export const metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: { params: Promise<{ clientId: string; campaignId: string }> }) {
  const { clientId, campaignId } = await params;
  const { user, access } = await requireClientAccess(clientId);
  const data = await withUser(user.id, async (db) => {
    const c = await db.one<CampaignValues & { status: string; last_discovery_at: Date | null }>(
      `select ca.*, coalesce((select array_agg(segment_id) from campaign_segments where campaign_id = ca.id), '{}') as segment_ids,
              coalesce((select array_agg(target_profile_id) from campaign_target_profiles where campaign_id = ca.id), '{}') as target_ids
       from campaigns ca where ca.id = $1 and ca.client_id = $2`,
      [campaignId, clientId],
    );
    if (!c) return null;
    const stats = await db.one<{ opportunities: number; today: number; generated: number; approved: number; published: number }>(
      `select (select count(*)::int from engagement_opportunities where campaign_id = $1) as opportunities,
              (select count(*)::int from engagement_opportunities where campaign_id = $1 and discovered_at >= date_trunc('day', now())) as today,
              (select count(*)::int from comments where campaign_id = $1 and status <> 'superseded') as generated,
              (select count(*)::int from comments where campaign_id = $1 and approved_at is not null) as approved,
              (select count(*)::int from comments where campaign_id = $1 and status = 'published') as published`,
      [campaignId],
    );
    return { c, stats: stats!, ...(await campaignFormData(db, clientId)) };
  });
  if (!data) notFound();
  const { c, stats } = data;
  return (
    <>
      <PageHeader
        eyebrow="Campaign"
        title={c.name}
        description={c.objective ?? undefined}
        actions={
          <>
            <StatusBadge status={c.status} />
            {access.canManage && c.status === "active" && (
              <>
                <ActionButton run={runDiscoveryNow.bind(null, clientId, campaignId)} variant="primary" size="md">
                  Run discovery now
                </ActionButton>
                <ActionButton run={setCampaignStatus.bind(null, clientId, campaignId, "paused")} size="md">
                  Pause
                </ActionButton>
              </>
            )}
            {access.canManage && c.status === "paused" && (
              <ActionButton run={setCampaignStatus.bind(null, clientId, campaignId, "active")} variant="primary" size="md">
                Activate
              </ActionButton>
            )}
            <LinkButton href={`/clients/${clientId}/opportunities?campaign=${campaignId}&status=all`}>Opportunities</LinkButton>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Opportunities today" value={`${stats.today} / ${c.daily_opportunity_limit}`} />
        <Stat label="All opportunities" value={stats.opportunities} />
        <Stat label="Comments generated" value={stats.generated} />
        <Stat label="Approved" value={stats.approved} />
        <Stat label="Published" value={stats.published} hint={`Limit ${c.daily_publish_limit}/day`} />
      </div>
      <Card>
        <CardHeader title="Settings" description={`Last discovery ${timeAgo(c.last_discovery_at)}. Discovery uses only this client's connected accounts.`} />
        <CardBody>
          {access.canManage ? (
            <CampaignForm clientId={clientId} campaign={c} segments={data.segments} targets={data.targets} isGbs={access.isGbsManager} />
          ) : (
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="text-ink-3">Keywords</dt>
                <dd>{c.keywords.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Hashtags</dt>
                <dd>{c.hashtags.map((h) => `#${h}`).join(", ") || "—"}</dd>
              </div>
            </dl>
          )}
        </CardBody>
      </Card>
    </>
  );
}
