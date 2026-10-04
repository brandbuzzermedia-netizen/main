import { createHash } from "node:crypto";
import type { Db, DbRunner } from "@/lib/db";
import { audit } from "@/lib/audit";
import { enabledPlatforms } from "@/lib/env";
import { getAdapter } from "@/lib/platforms/registry";
import { PlatformApiError, type DiscoveredItem, type Platform } from "@/lib/platforms/types";
import { CredentialsUnavailableError, getCredentials } from "@/lib/services/tokens";
import { notifyClient } from "./notify";
import { scoreOpportunity, type ScoringContext, type ScoringPost } from "./scoring";

export interface CampaignScope {
  organization_id: string;
  client_id: string;
  client_name: string;
  id: string;
  name: string;
  status: string;
  platforms: Platform[];
  keywords: string[];
  hashtags: string[];
  locations: string[];
  daily_opportunity_limit: number;
  min_score: number;
}

/** Everything scoring needs, loaded for ONE client and ONE campaign. */
export async function loadScoringContext(db: Db, clientId: string, campaignId: string): Promise<{ campaign: CampaignScope; ctx: ScoringContext }> {
  const campaign = await db.one<CampaignScope>(
    `select ca.organization_id, ca.client_id, cl.name as client_name, ca.id, ca.name, ca.status, ca.platforms, ca.keywords, ca.hashtags,
            ca.locations, ca.daily_opportunity_limit, ca.min_score
     from campaigns ca join clients cl on cl.id = ca.client_id where ca.id = $1 and ca.client_id = $2`,
    [campaignId, clientId],
  );
  if (!campaign) throw new Error("Campaign not found for this client.");
  const brand = await db.one<{ products: string[]; services: string[]; keywords: string[]; topics_to_avoid: string[]; competitors: string[] }>(
    "select products, services, keywords, topics_to_avoid, competitors from brand_profiles where client_id = $1",
    [clientId],
  );
  const segments = await db.query<{
    id: string;
    name: string;
    industries: string[];
    job_titles: string[];
    locations: string[];
    keywords: string[];
    hashtags: string[];
    negatives: string[];
  }>(
    `select s.id, s.name, s.industries, s.job_titles, s.locations,
            coalesce(array_agg(k.keyword) filter (where k.kind = 'keyword'), '{}') as keywords,
            coalesce(array_agg(k.keyword) filter (where k.kind = 'hashtag'), '{}') as hashtags,
            coalesce(array_agg(k.keyword) filter (where k.kind = 'negative'), '{}') as negatives
     from campaign_segments cs join audience_segments s on s.id = cs.segment_id and s.client_id = cs.client_id
     left join audience_keywords k on k.segment_id = s.id and k.client_id = s.client_id
     where cs.campaign_id = $1 and cs.client_id = $2 group by s.id`,
    [campaignId, clientId],
  );
  const targets = await db.query<{ handle: string; platform: string }>(
    `select tp.handle, tp.platform from campaign_target_profiles ctp
     join target_profiles tp on tp.id = ctp.target_profile_id and tp.client_id = ctp.client_id
     where ctp.campaign_id = $1 and ctp.client_id = $2`,
    [campaignId, clientId],
  );
  return {
    campaign,
    ctx: {
      campaignKeywords: campaign.keywords,
      campaignHashtags: campaign.hashtags,
      campaignLocations: campaign.locations,
      brandTerms: [...(brand?.products ?? []), ...(brand?.services ?? []), ...(brand?.keywords ?? [])],
      excludedTopics: brand?.topics_to_avoid ?? [],
      competitors: brand?.competitors ?? [],
      targetHandles: targets.map((t) => t.handle),
      segments: segments.map((s) => ({
        id: s.id,
        name: s.name,
        industries: s.industries,
        jobTitles: s.job_titles,
        locations: s.locations,
        keywords: s.keywords,
        hashtags: s.hashtags,
        negativeKeywords: s.negatives,
      })),
    },
  };
}

async function todaysOpportunityCount(db: Db, clientId: string, campaignId: string, platform: string) {
  return db.one<{ campaign_count: number; platform_count: number; platform_limit: number | null }>(
    `select (select count(*)::int from engagement_opportunities where campaign_id = $2 and client_id = $1 and discovered_at >= date_trunc('day', now())) as campaign_count,
            (select count(*)::int from engagement_opportunities where client_id = $1 and platform = $3 and discovered_at >= date_trunc('day', now())) as platform_count,
            coalesce((select daily_opportunity_limit from usage_limits where client_id = $1 and platform = $3),
                     (select daily_opportunity_limit from usage_limits where client_id = $1 and platform = 'all')) as platform_limit`,
    [clientId, campaignId, platform],
  );
}

/** Stores a post for this client (posts are never shared between clients) and creates a scored opportunity. */
export async function upsertOpportunity(
  db: Db,
  campaign: CampaignScope,
  ctx: ScoringContext,
  item: DiscoveredItem,
  platform: Platform,
  socialAccountId: string | null,
  source: "api" | "manual" | "seed",
  opts: { ignoreMinScore?: boolean } = {},
): Promise<{ created: boolean; score: number; opportunityId?: string; reason?: string }> {
  const scoringPost: ScoringPost = {
    content: item.content,
    authorHandle: item.authorHandle,
    authorName: item.authorName,
    authorBio: item.authorBio,
    authorFollowers: item.authorFollowers,
    authorIsBusiness: item.authorIsBusiness,
    postedAt: item.postedAt,
    metrics: item.metrics,
    replyToText: item.replyToText,
    opportunityType: item.opportunityType,
  };
  const s = scoreOpportunity(scoringPost, ctx);
  if (s.excludedReason) return { created: false, score: 0, reason: s.excludedReason };
  if (!opts.ignoreMinScore && s.score < campaign.min_score) return { created: false, score: s.score, reason: "Below minimum score" };

  const post = await db.one<{ id: string }>(
    `insert into posts (organization_id, client_id, platform, external_post_id, url, author_handle, author_name, author_external_id,
       author_bio, author_followers, author_is_business, content, media, metrics, posted_at, source)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     on conflict (client_id, platform, external_post_id) do update set
       metrics = excluded.metrics, fetched_at = now(),
       author_followers = coalesce(excluded.author_followers, posts.author_followers),
       author_bio = coalesce(excluded.author_bio, posts.author_bio)
     returning id`,
    [
      campaign.organization_id,
      campaign.client_id,
      platform,
      item.externalPostId,
      item.url,
      item.authorHandle,
      item.authorName,
      item.authorExternalId,
      item.authorBio,
      item.authorFollowers,
      item.authorIsBusiness,
      item.content,
      JSON.stringify(item.media),
      JSON.stringify(item.metrics),
      item.postedAt,
      source,
    ],
  );
  const opp = await db.one<{ id: string }>(
    `insert into engagement_opportunities (organization_id, client_id, campaign_id, post_id, segment_id, social_account_id, platform,
       opportunity_type, reply_to_external_id, reply_to_text, reply_to_author, publish_capability, status, score, score_label,
       score_breakdown, explanation, topic, audience_match, brand_relevance, analyzed_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'analyzed', $13, $14, $15, $16, $17, $18, $19, now())
     on conflict (campaign_id, post_id, coalesce(reply_to_external_id, '')) do nothing
     returning id`,
    [
      campaign.organization_id,
      campaign.client_id,
      campaign.id,
      post!.id,
      s.bestSegmentId,
      socialAccountId,
      platform,
      item.opportunityType,
      item.replyToExternalId ?? null,
      item.replyToText ?? null,
      item.replyToAuthor ?? null,
      item.publishCapability,
      s.score,
      s.label,
      JSON.stringify({ ...s.factors, discovered_via: item.discoveredVia }),
      s.explanation,
      s.topic,
      s.audienceMatch,
      s.brandRelevance,
    ],
  );
  return { created: Boolean(opp), score: s.score, opportunityId: opp?.id };
}

export interface DiscoveryReport {
  campaignId: string;
  created: number;
  examined: number;
  skipped: number;
  errors: string[];
}

/**
 * Runs discovery for one campaign of one client using only that client's connected accounts.
 * `run` is the caller's transaction runner (user-scoped from the UI, system from the worker);
 * `system` is used only to decrypt that client's tokens.
 */
export async function runDiscovery(
  run: DbRunner,
  system: DbRunner,
  p: { clientId: string; campaignId: string; actor: { id: string | null; name: string } },
): Promise<DiscoveryReport> {
  const report: DiscoveryReport = { campaignId: p.campaignId, created: 0, examined: 0, skipped: 0, errors: [] };
  const { campaign, ctx } = await run((db) => loadScoringContext(db, p.clientId, p.campaignId));
  if (campaign.status !== "active") throw new Error("Campaign is paused. Activate it to run discovery.");

  const accounts = await run((db) =>
    db.query<{ id: string; platform: Platform; demo: boolean }>(
      `select id, platform, coalesce((metadata->>'demo')::boolean, false) as demo
       from social_accounts where client_id = $1 and status = 'connected' and platform = any($2)`,
      [p.clientId, campaign.platforms],
    ),
  );
  const enabled = new Set(enabledPlatforms());
  const since = new Date(Date.now() - 3 * 86_400_000);

  for (const account of accounts) {
    if (!enabled.has(account.platform)) continue;
    if (account.demo) {
      report.errors.push(`${account.platform}: demo account — connect the real account to discover content`);
      continue;
    }
    const counts = await run((db) => todaysOpportunityCount(db, p.clientId, p.campaignId, account.platform));
    const remaining = Math.min(
      campaign.daily_opportunity_limit - (counts?.campaign_count ?? 0),
      (counts?.platform_limit ?? Number.MAX_SAFE_INTEGER) - (counts?.platform_count ?? 0),
    );
    if (remaining <= 0) {
      report.errors.push(`${account.platform}: daily opportunity limit reached`);
      continue;
    }

    try {
      const creds = await system((db) => getCredentials(db, { clientId: p.clientId, socialAccountId: account.id }));
      const adapter = getAdapter(account.platform);
      let hashtags = campaign.hashtags;
      if (account.platform === "instagram") hashtags = await instagramHashtagBudget(run, p.clientId, account.id, hashtags);
      const items = await adapter.discoverContent(creds, {
        keywords: campaign.keywords,
        hashtags,
        targetHandles: ctx.targetHandles,
        locations: campaign.locations,
        since,
        limit: remaining,
      });
      report.examined += items.length;

      let created = 0;
      await run(async (db) => {
        for (const item of items) {
          if (created >= remaining) break;
          const r = await upsertOpportunity(db, campaign, ctx, item, account.platform, account.id, "api");
          if (r.created) created++;
          else report.skipped++;
        }
        if (account.platform === "instagram") {
          for (const tag of hashtags) {
            await db.query(
              `insert into usage_events (organization_id, client_id, kind, platform, metadata) values ($1, $2, 'hashtag_query', 'instagram', $3)`,
              [campaign.organization_id, p.clientId, JSON.stringify({ hashtag: tag.toLowerCase().replace(/^#/, ""), account: account.id })],
            );
          }
        }
        await db.query(
          `insert into usage_events (organization_id, client_id, kind, platform, quantity) values ($1, $2, 'opportunity_analyzed', $3, $4)`,
          [campaign.organization_id, p.clientId, account.platform, items.length],
        );
        await db.query(`update social_accounts set last_synced_at = now() where id = $1 and client_id = $2`, [account.id, p.clientId]);
      });
      report.created += created;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(`${account.platform}: ${msg}`);
      if ((err instanceof PlatformApiError && err.authExpired) || err instanceof CredentialsUnavailableError) {
        await system(async (db) => {
          await db.query(`update social_accounts set status = 'expired' where id = $1 and client_id = $2 and status = 'connected'`, [
            account.id,
            p.clientId,
          ]);
          await notifyClient(db, {
            organizationId: campaign.organization_id,
            clientId: p.clientId,
            kind: "oauth_expired",
            title: `${campaign.client_name}: ${account.platform} connection needs to be renewed`,
            link: `/clients/${p.clientId}/accounts`,
            audience: ["managers", "client_owners"],
          });
        });
      }
    }
  }

  await run(async (db) => {
    await db.query(`update campaigns set last_discovery_at = now() where id = $1 and client_id = $2`, [p.campaignId, p.clientId]);
    if (p.actor.id) {
      await audit(db, {
        organizationId: campaign.organization_id,
        clientId: p.clientId,
        campaignId: p.campaignId,
        actorId: p.actor.id,
        actorName: p.actor.name,
        action: "discovery.run",
        entityType: "campaign",
        entityId: p.campaignId,
        details: { created: report.created, examined: report.examined },
      });
    }
  });

  if (report.created > 0) {
    await system((db) =>
      notifyClient(db, {
        organizationId: campaign.organization_id,
        clientId: p.clientId,
        kind: "opportunities_found",
        title: `${campaign.client_name}: ${report.created} new opportunit${report.created === 1 ? "y" : "ies"}`,
        body: `Campaign: ${campaign.name}`,
        link: `/clients/${p.clientId}/opportunities`,
        audience: ["managers"],
        excludeUserId: p.actor.id,
      }),
    );
  }
  return report;
}

/**
 * Instagram allows 30 unique hashtags per account per rolling 7 days. Re-querying a hashtag
 * already used in the window is free; new ones are only added while budget remains.
 */
async function instagramHashtagBudget(run: DbRunner, clientId: string, accountId: string, wanted: string[]): Promise<string[]> {
  const used = await run((db) =>
    db.query<{ tag: string }>(
      `select distinct metadata->>'hashtag' as tag from usage_events
       where client_id = $1 and kind = 'hashtag_query' and metadata->>'account' = $2 and created_at > now() - interval '7 days'`,
      [clientId, accountId],
    ),
  );
  const usedSet = new Set(used.map((u) => u.tag));
  let budget = 30 - usedSet.size;
  const out: string[] = [];
  for (const raw of wanted) {
    const t = raw.toLowerCase().replace(/^#/, "");
    if (!t) continue;
    if (usedSet.has(t)) out.push(t);
    else if (budget > 0) {
      out.push(t);
      budget--;
    }
  }
  return out;
}

// ───────────────────────────── Manual intake ─────────────────────────────

export interface ManualPostInput {
  platform: Platform;
  url: string;
  content: string;
  authorHandle?: string | null;
  authorName?: string | null;
  authorBio?: string | null;
  authorFollowers?: number | null;
  postedAt?: Date | null;
}

/** Derive the API identifier from a post URL where the platform exposes one in the URL. */
export function parsePostUrl(platform: Platform, url: string): { externalPostId: string; apiPublishable: boolean } {
  const fallback = { externalPostId: `url:${createHash("sha256").update(url.trim()).digest("hex").slice(0, 24)}`, apiPublishable: false };
  try {
    const u = new URL(url);
    if (platform === "youtube") {
      const id = u.searchParams.get("v") ?? (u.hostname === "youtu.be" ? u.pathname.slice(1) : null);
      return id ? { externalPostId: id, apiPublishable: true } : fallback;
    }
    if (platform === "linkedin") {
      const m = decodeURIComponent(url).match(/urn:li:(activity|share|ugcPost):\d+/);
      return m ? { externalPostId: m[0], apiPublishable: true } : fallback;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export async function addManualOpportunity(db: Db, clientId: string, campaignId: string, input: ManualPostInput, actor: { id: string; name: string }) {
  const { campaign, ctx } = await loadScoringContext(db, clientId, campaignId);
  if (!campaign.platforms.includes(input.platform)) throw new Error("This campaign doesn't include that platform.");
  const parsed = parsePostUrl(input.platform, input.url);
  const adapter = getAdapter(input.platform);
  const capability = parsed.apiPublishable ? adapter.publishCapabilityFor("third_party_post") : "manual";
  const account = await db.one<{ id: string }>(
    `select id from social_accounts where client_id = $1 and platform = $2 and status = 'connected' order by connected_at limit 1`,
    [clientId, input.platform],
  );
  const r = await upsertOpportunity(
    db,
    campaign,
    ctx,
    {
      externalPostId: parsed.externalPostId,
      url: input.url,
      authorHandle: input.authorHandle ?? null,
      authorName: input.authorName ?? null,
      authorExternalId: null,
      authorBio: input.authorBio ?? null,
      authorFollowers: input.authorFollowers ?? null,
      authorIsBusiness: null,
      content: input.content,
      media: [],
      metrics: {},
      postedAt: input.postedAt ?? new Date(),
      opportunityType: "manual",
      publishCapability: capability,
      discoveredVia: "manual",
    },
    input.platform,
    account?.id ?? null,
    "manual",
    { ignoreMinScore: true },
  );
  if (r.opportunityId) {
    await audit(db, {
      organizationId: campaign.organization_id,
      clientId,
      campaignId,
      actorId: actor.id,
      actorName: actor.name,
      action: "opportunity.added",
      entityType: "opportunity",
      entityId: r.opportunityId,
      details: { url: input.url },
    });
  }
  return r;
}
