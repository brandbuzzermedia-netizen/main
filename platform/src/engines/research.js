import { getAdapter, PLATFORMS } from '../platforms/registry.js';
import { list, insert, update, findBy } from '../db/repo.js';
import { openCredentials } from '../services/credentials.js';
import { classifySignal, countKeywordHits, isLocalSignal, scoreTrend } from './trend.js';
import { prescore, recommendAction } from './engagement.js';
import { agents } from '../ai/agents/index.js';
import { SocialResearcher } from '../ai/agents/index.js';
import { log } from '../core/logger.js';
import { clampScore } from '../core/validate.js';
import { now, isoIn } from '../core/ids.js';

/**
 * AI Social Intelligence Engine (§6).
 *
 * Runs asynchronously in the worker — never inside an HTTP request. Discovery
 * happens only through the platforms' own official search APIs, using the
 * client's connected credentials. A platform with no public-search API
 * contributes nothing, and the run reports that plainly instead of filling the
 * gap from somewhere else.
 */

const researcher = new SocialResearcher();

/**
 * Discover trends for one client.
 * @param {{agencyId:string, client:any}} ctx
 */
export async function discoverTrends({ agencyId, client }) {
  const keywords = list('keywords', agencyId, { client_id: client.id, status: 'active' }, { limit: 200 });
  if (!keywords.length) {
    return { discovered: 0, skipped: 'No keywords configured for this client', platforms: {} };
  }

  const accounts = list('social_accounts', agencyId, { client_id: client.id, connection_status: 'connected' }, { limit: 50 });
  /** @type {Record<string, any>} */
  const platformReport = {};
  /** @type {Map<string, any>} */
  const topics = new Map();

  for (const platform of PLATFORMS) {
    const adapter = getAdapter(platform);
    if (!adapter.capabilities.readPublicSearch) {
      platformReport[platform] = { status: 'unsupported', note: `${platform} offers no official public-search API` };
      continue;
    }
    const account = accounts.find((a) => a.platform === platform);
    const creds = account ? openCredentials(account) : null;
    if (!creds && platform !== 'youtube') {
      platformReport[platform] = { status: 'not_connected', note: 'Connect an account to search this platform' };
      continue;
    }

    const queries = researcher.buildQueries({ keywords, platform, industry: client.industry, location: client.location });
    let found = 0;
    for (const q of queries.slice(0, 6)) {
      try {
        const results = await adapter.searchPublic(creds, { query: q.query, limit: 25 });
        found += results.length;
        for (const raw of results) collectTopic(topics, raw, { platform, keywords, client });
      } catch (err) {
        log.warn('research_query_failed', { platform, query: q.query, err: String(err.message ?? err) });
        platformReport[platform] = { status: 'error', note: String(err.message ?? err) };
      }
    }
    platformReport[platform] ??= { status: 'ok', results: found, queries: queries.length };
  }

  // Score, explain and persist.
  let discovered = 0;
  for (const signal of topics.values()) {
    const scored = scoreTrend({
      firstSeenAt: signal.firstSeenAt,
      mentions: signal.mentions,
      previousMentions: previousMentionCount(agencyId, client.id, signal.topic),
      totalEngagement: signal.totalEngagement,
      sampleSize: signal.mentions,
      keywordHits: signal.keywordHits,
      keywordTotal: keywords.length,
      industryMatch: signal.industryMatch,
      geoMatch: signal.geoMatch,
      platforms: [...signal.platforms],
    });
    if (scored.score < 35) continue;

    let explanation = null;
    try {
      const run = await agents.trendScout.run(
        { agencyId, clientId: client.id },
        {
          client_name: client.name, industry: client.industry, location: client.location,
          description: client.description, topic: signal.topic,
          classification: signal.classification, trend_score: scored.score,
          platforms: [...signal.platforms], sources: signal.sources.slice(0, 5),
        },
      );
      explanation = run.output;
    } catch (err) {
      log.warn('trend_scout_failed', { topic: signal.topic, err: String(err.message ?? err) });
    }

    upsertTrend(agencyId, client.id, signal, scored, explanation);
    discovered++;
  }

  return { discovered, platforms: platformReport, topics_considered: topics.size };
}

function collectTopic(topics, raw, { platform, keywords, client }) {
  const text = `${raw.title ?? ''} ${raw.excerpt ?? ''}`.trim();
  if (!text) return;
  const { hits, matched } = countKeywordHits(text, keywords);
  if (!hits) return;

  const topic = matched[0] ?? String(raw.title ?? '').slice(0, 60);
  const key = topic.toLowerCase();
  const entry = topics.get(key) ?? {
    topic,
    classification: classifySignal({ ...raw, platform }),
    mentions: 0,
    totalEngagement: 0,
    keywordHits: 0,
    platforms: new Set(),
    sources: [],
    firstSeenAt: raw.postedAt ?? now(),
    industryMatch: Boolean(client.industry && text.toLowerCase().includes(String(client.industry).toLowerCase())),
    geoMatch: isLocalSignal(text, [client.location, ...(client.target_geography ?? [])]),
  };

  entry.mentions += 1;
  entry.keywordHits = Math.max(entry.keywordHits, hits);
  entry.platforms.add(platform);
  entry.totalEngagement += sumEngagement(raw.metrics);
  if (raw.postedAt && raw.postedAt < entry.firstSeenAt) entry.firstSeenAt = raw.postedAt;
  if (entry.sources.length < 10 && raw.url) {
    entry.sources.push({ title: (raw.title ?? raw.excerpt ?? '').slice(0, 140), url: raw.url, platform, published_at: raw.postedAt });
  }
  topics.set(key, entry);
}

function sumEngagement(metrics = {}) {
  return ['likes', 'like_count', 'comments', 'reply_count', 'shares', 'retweet_count', 'score', 'views']
    .reduce((n, key) => n + Number(metrics[key] ?? 0), 0);
}

function previousMentionCount(agencyId, clientId, topic) {
  const existing = findBy('trending_topics', agencyId, { client_id: clientId, topic, status: 'active' });
  return existing ? Number(existing.score_breakdown?.mentions ?? 0) : 0;
}

function upsertTrend(agencyId, clientId, signal, scored, explanation) {
  const existing = findBy('trending_topics', agencyId, { client_id: clientId, topic: signal.topic });
  const values = {
    agency_id: agencyId,
    client_id: clientId,
    topic: signal.topic,
    classification: signal.classification,
    trend_score: scored.score,
    score_breakdown: { ...scored.breakdown, mentions: signal.mentions },
    velocity_pct: scored.velocityPct,
    urgency: explanation?.urgency ?? scored.urgency,
    why_it_matters: explanation?.why_it_matters ?? null,
    platforms: [...signal.platforms],
    sources: signal.sources,
    detected_at: now(),
    expires_at: isoIn(60 * 24 * 7),
    status: 'active',
  };
  return existing
    ? update('trending_topics', agencyId, existing.id, values)
    : insert('trending_topics', values);
}

/**
 * Discover engagement opportunities (§11) for a client, optionally seeded by
 * the topics of a post that just went live (§27/§28).
 * @param {{agencyId:string, client:any, seedTopics?:string[], sourcePublishedContentId?:string}} ctx
 */
export async function discoverOpportunities({ agencyId, client, seedTopics = [], sourcePublishedContentId = null }) {
  const keywords = list('keywords', agencyId, { client_id: client.id, status: 'active' }, { limit: 200 });
  const brand = findBy('brand_profiles', agencyId, { client_id: client.id });
  const accounts = list('social_accounts', agencyId, { client_id: client.id, connection_status: 'connected' }, { limit: 50 });

  const searchTerms = [
    ...seedTopics,
    ...keywords.filter((k) => ['primary', 'product'].includes(k.kind)).slice(0, 6).map((k) => k.term),
  ].filter(Boolean);

  if (!searchTerms.length) {
    return { discovered: 0, skipped: 'No keywords or seed topics to search with', platforms: {} };
  }

  /** @type {Record<string, any>} */
  const platformReport = {};
  let discovered = 0;

  for (const account of accounts) {
    const adapter = getAdapter(account.platform);
    if (!adapter.capabilities.readPublicSearch) {
      platformReport[account.platform] = { status: 'unsupported', note: 'No official public-search API' };
      continue;
    }
    const creds = openCredentials(account);
    if (!creds) { platformReport[account.platform] = { status: 'not_connected' }; continue; }

    for (const term of searchTerms.slice(0, 5)) {
      let results = [];
      try {
        results = await adapter.searchPublic(creds, { query: term, limit: 25 });
      } catch (err) {
        platformReport[account.platform] = { status: 'error', note: String(err.message ?? err) };
        continue;
      }

      for (const raw of results) {
        if (!raw.externalId || !raw.excerpt) continue;
        const existing = findBy('engagement_opportunities', agencyId, {
          client_id: client.id, platform: account.platform, external_id: raw.externalId,
        });
        if (existing) continue;

        const { hits } = countKeywordHits(raw.excerpt, keywords);
        if (!hits) continue;

        const industryMatch = Boolean(client.industry &&
          String(raw.excerpt).toLowerCase().includes(String(client.industry).toLowerCase()));
        const pre = prescore({ excerpt: raw.excerpt, keywordHits: hits, keywordTotal: keywords.length, industryMatch });
        if (pre.relevance < 30) continue; // don't spend a model call on noise

        let assessment = {
          relevance_score: pre.relevance,
          brand_fit_score: clampScore(pre.relevance - 5),
          conversation_quality_score: pre.conversationQuality,
          promotional_risk_score: 30,
          spam_risk_score: pre.spamRisk,
          reasoning: 'Heuristic pre-score only — the assessment agent did not run.',
        };
        try {
          const run = await agents.engagementScout.run(
            { agencyId, clientId: client.id, platform: account.platform },
            {
              client_name: client.name, industry: client.industry,
              expertise: (client.products ?? []).slice(0, 6),
              platform: account.platform, context: raw.context ?? '',
              excerpt: String(raw.excerpt).slice(0, 3900),
              keyword_hits: hits, industry_match: industryMatch,
            },
          );
          assessment = run.output;
        } catch (err) {
          log.warn('engagement_scout_failed', { err: String(err.message ?? err) });
        }

        const decision = recommendAction({
          relevance: assessment.relevance_score,
          brandFit: assessment.brand_fit_score,
          conversationQuality: assessment.conversation_quality_score,
          promotionalRisk: assessment.promotional_risk_score,
          spamRisk: assessment.spam_risk_score,
        }, { platform: account.platform, thresholds: brand?.thresholds });

        insert('engagement_opportunities', {
          agency_id: agencyId,
          client_id: client.id,
          platform: account.platform,
          external_id: raw.externalId,
          url: raw.url ?? null,
          author: raw.author ?? null,
          excerpt: String(raw.excerpt).slice(0, 4000),
          context: raw.context ?? null,
          posted_at: raw.postedAt ?? null,
          relevance_score: assessment.relevance_score,
          brand_fit_score: assessment.brand_fit_score,
          conversation_quality_score: assessment.conversation_quality_score,
          promotional_risk_score: assessment.promotional_risk_score,
          spam_risk_score: assessment.spam_risk_score,
          recommended_action: decision.action,
          reasoning: [assessment.reasoning, ...decision.reasons].filter(Boolean).join(' — '),
          source_published_content_id: sourcePublishedContentId,
          status: 'new',
        });
        discovered++;
      }
      platformReport[account.platform] ??= { status: 'ok' };
    }
  }

  return { discovered, platforms: platformReport, terms: searchTerms };
}
