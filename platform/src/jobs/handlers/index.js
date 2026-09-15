import { find, list, insert, update, findBy, count } from '../../db/repo.js';
import { discoverTrends, discoverOpportunities } from '../../engines/research.js';
import { performanceSummary, runLearningLoop } from '../../engines/analytics.js';
import { agents } from '../../ai/agents/index.js';
import { getAdapter } from '../../platforms/registry.js';
import { usableCredentials } from '../../services/credentials.js';
import { notify } from '../../services/notifications.js';
import { audit } from '../../core/audit.js';
import { log } from '../../core/logger.js';
import { enqueue } from '../queue.js';
import { now, isoIn } from '../../core/ids.js';
import { generateIdeas } from '../../services/content.js';

/**
 * Job handlers. Each is `(job) => Promise<result>`; throwing triggers the
 * queue's retry/backoff/dead-letter handling. Handlers are idempotent where
 * they can be — the queue guarantees at-least-once, not exactly-once.
 */

/** @type {Record<string, (job:any)=>Promise<any>>} */
export const HANDLERS = {
  /** §48 — every 15-60 minutes. */
  async discover_trends(job) {
    const client = requireClient(job);
    const result = await discoverTrends({ agencyId: job.agency_id, client });
    audit({
      agencyId: job.agency_id, clientId: client.id, actorType: 'agent',
      actorLabel: 'trend_scout', action: 'research.trends_discovered',
      objectType: 'clients', objectId: client.id, next: result,
    });
    for (const trend of list('trending_topics', job.agency_id,
      { client_id: client.id, status: 'active', trend_score: { op: 'gte', value: 85 } },
      { orderBy: 'trend_score DESC', limit: 3 })) {
      notify({
        agencyId: job.agency_id, clientId: client.id, kind: 'major_trend', severity: 'warning',
        title: `${trend.topic} — ${trend.trend_score}/100`,
        body: trend.why_it_matters, link: `/trends?client=${client.id}`,
      });
    }
    return result;
  },

  /** §48 — every 1-3 hours. */
  async discover_engagement(job) {
    const client = requireClient(job);
    const result = await discoverOpportunities({
      agencyId: job.agency_id, client,
      seedTopics: job.payload?.seed_topics ?? [],
      sourcePublishedContentId: job.payload?.published_content_id ?? null,
    });
    for (const opp of list('engagement_opportunities', job.agency_id,
      { client_id: client.id, status: 'new', relevance_score: { op: 'gte', value: 90 } },
      { orderBy: 'relevance_score DESC', limit: 3 })) {
      notify({
        agencyId: job.agency_id, clientId: client.id, kind: 'high_relevance_opportunity',
        title: `${opp.relevance_score}/100 relevance on ${opp.platform}`,
        body: String(opp.excerpt).slice(0, 240), link: `/engagement?item=${opp.id}`,
      });
    }
    return result;
  },

  /** §35 — daily client briefing. */
  async daily_brief(job) {
    const client = requireClient(job);
    const agencyId = job.agency_id;
    const since = isoIn(-60 * 24);

    const trends = list('trending_topics', agencyId, { client_id: client.id, status: 'active' },
      { orderBy: 'trend_score DESC', limit: 5 });
    const inspirationCount = count('inspiration_items', agencyId,
      { client_id: client.id, created_at: { op: 'gte', value: since } });
    const opportunities = list('engagement_opportunities', agencyId,
      { client_id: client.id, status: 'new' }, { orderBy: 'relevance_score DESC', limit: 10 });
    const ideas = list('content_ideas', agencyId, { client_id: client.id, status: ['idea', 'approved'] }, { limit: 20 });
    const pending = count('approval_items', agencyId, { client_id: client.id, status: 'pending' });
    const competitors = list('competitors', agencyId, { client_id: client.id, status: 'active' }, { limit: 10 });

    const run = await agents.briefWriter.run({ agencyId, clientId: client.id }, {
      client_name: client.name,
      top_trends: trends.map((t) => ({
        topic: t.topic, score: t.trend_score, classification: t.classification,
        suggested_format: t.classification === 'NEWS' ? 'text' : 'reel',
      })),
      inspiration_count: inspirationCount,
      opportunity_count: opportunities.length,
      idea_count: ideas.length,
      pending_approvals: pending,
      competitor_updates: competitors.map((c) => ({ name: c.name, last_checked_at: c.last_checked_at })),
    });

    const brief = insert('ai_recommendations', {
      agency_id: agencyId, client_id: client.id, kind: 'daily_brief',
      title: run.output.headline ?? `Daily brief — ${client.name}`,
      body: run.output.recommended_action,
      payload: {
        ...run.output,
        trends: trends.map((t) => ({ id: t.id, topic: t.topic, score: t.trend_score })),
        opportunities: opportunities.slice(0, 5).map((o) => ({ id: o.id, platform: o.platform, relevance: o.relevance_score })),
        ideas: ideas.slice(0, 5).map((i) => ({ id: i.id, title: i.title })),
        counts: { inspiration: inspirationCount, opportunities: opportunities.length, ideas: ideas.length, pending_approvals: pending },
      },
      agent: 'content_strategist',
      prompt_version_id: run.promptVersionId,
    });

    notify({
      agencyId, clientId: client.id, kind: 'major_trend', severity: 'info',
      title: `Daily brief ready — ${client.name}`,
      body: run.output.recommended_action, link: `/dashboard?client=${client.id}`,
    });
    return { brief_id: brief.id };
  },

  /** §27/§28 — after a post goes live. */
  async post_publish_loop(job) {
    const agencyId = job.agency_id;
    const published = find('published_content', agencyId, job.payload.published_content_id);
    if (!published) return { skipped: 'Published content no longer exists' };
    const client = find('clients', agencyId, published.client_id);
    if (!client) return { skipped: 'Client no longer exists' };

    // Topics come from the post's own hashtags and caption keywords.
    const keywords = list('keywords', agencyId, { client_id: client.id, status: 'active' }, { limit: 50 });
    const caption = String(published.caption ?? '').toLowerCase();
    const seedTopics = [
      ...(published.hashtags ?? []).map((h) => String(typeof h === 'string' ? h : h.tag).replace(/^#/, '')),
      ...keywords.filter((k) => caption.includes(String(k.term).toLowerCase())).map((k) => k.term),
    ].filter(Boolean).slice(0, 5);

    if (!seedTopics.length) return { skipped: 'No topics could be extracted from the post' };

    const result = await discoverOpportunities({
      agencyId, client, seedTopics, sourcePublishedContentId: published.id,
    });
    audit({
      agencyId, clientId: client.id, actorType: 'agent', actorLabel: 'engagement_scout',
      action: 'engagement.post_publish_discovery', objectType: 'published_content',
      objectId: published.id, next: { topics: seedTopics, discovered: result.discovered },
    });
    return { ...result, seedTopics };
  },

  /** Pull fresh metrics for a published post from its own account. */
  async sync_metrics(job) {
    const agencyId = job.agency_id;
    const published = find('published_content', agencyId, job.payload.published_content_id);
    if (!published?.external_post_id) return { skipped: 'No platform post id' };

    const account = published.social_account_id
      ? find('social_accounts', agencyId, published.social_account_id) : null;
    if (!account) return { skipped: 'Account no longer connected' };

    const adapter = getAdapter(published.platform);
    if (!adapter.capabilities.readOwnInsights) return { skipped: `${published.platform} exposes no insights API` };

    const creds = await usableCredentials(agencyId, account);
    if (!creds) return { skipped: 'Account needs reconnecting' };

    const insights = await adapter.fetchInsights(creds, { externalIds: [published.external_post_id] });
    const metrics = insights[0]?.metrics ?? {};
    update('published_content', agencyId, published.id, { metrics, metrics_synced_at: now() });

    insert('analytics', {
      agency_id: agencyId, client_id: published.client_id, platform: published.platform,
      subject_type: 'published_content', subject_id: published.id,
      metric_date: now().slice(0, 10), metrics,
    });

    // Keep syncing on a decaying cadence for the first week.
    const ageHours = (Date.now() - new Date(published.published_at).getTime()) / 3_600_000;
    if (ageHours < 168) {
      enqueue({
        agencyId, clientId: published.client_id, kind: 'sync_metrics',
        payload: { published_content_id: published.id },
        runAfter: isoIn(ageHours < 24 ? 120 : 720),
        dedupeKey: `sync_metrics:${published.id}:${Math.floor(ageHours)}`,
      });
    }
    return { metrics };
  },

  /** §34 — weekly competitor sweep over publicly available, permitted data. */
  async competitor_analysis(job) {
    const agencyId = job.agency_id;
    const client = requireClient(job);
    const competitors = list('competitors', agencyId, { client_id: client.id, status: 'active' }, { limit: 25 });
    if (!competitors.length) return { skipped: 'No competitors configured' };

    const accounts = list('social_accounts', agencyId,
      { client_id: client.id, connection_status: 'connected' }, { limit: 20 });
    const findings = [];

    for (const competitor of competitors) {
      for (const [platform, handle] of Object.entries(competitor.handles ?? {})) {
        const adapter = getAdapter(platform);
        if (!adapter.capabilities.readPublicSearch) {
          findings.push({ competitor: competitor.name, platform, status: 'unsupported',
            note: `${platform} offers no official API for observing another account's public posts` });
          continue;
        }
        const account = accounts.find((a) => a.platform === platform);
        const creds = account ? await usableCredentials(agencyId, account) : null;
        if (!creds) { findings.push({ competitor: competitor.name, platform, status: 'not_connected' }); continue; }

        try {
          const posts = await adapter.searchPublic(creds, { query: String(handle), limit: 25 });
          for (const post of posts.slice(0, 25)) {
            const exists = findBy('social_posts', agencyId, { platform, external_id: post.externalId, client_id: client.id });
            if (exists) continue;
            insert('social_posts', {
              agency_id: agencyId, client_id: client.id, competitor_id: competitor.id,
              platform, external_id: post.externalId, url: post.url, author: post.author,
              caption: String(post.excerpt ?? '').slice(0, 4000),
              thumbnail_url: post.thumbnailUrl ?? null, posted_at: post.postedAt ?? null,
              metrics: post.metrics ?? {},
            });
          }
          findings.push({ competitor: competitor.name, platform, status: 'ok', observed: posts.length });
        } catch (err) {
          findings.push({ competitor: competitor.name, platform, status: 'error', note: String(err.message ?? err) });
        }
      }
      update('competitors', agencyId, competitor.id, { last_checked_at: now() });
    }

    insert('ai_recommendations', {
      agency_id: agencyId, client_id: client.id, kind: 'competitor',
      title: `Competitor sweep — ${new Date().toISOString().slice(0, 10)}`,
      body: summariseCompetitors(findings),
      payload: { findings }, agent: 'social_researcher',
    });
    return { findings };
  },

  /** §33 — the learning loop. */
  async learning_loop(job) {
    const client = requireClient(job);
    const result = await runLearningLoop({ agencyId: job.agency_id, client });
    if (result?.findings?.length) {
      insert('ai_recommendations', {
        agency_id: job.agency_id, client_id: client.id, kind: 'learning',
        title: result.findings[0],
        body: result.recommendation ?? '',
        payload: result, confidence: result.confidence ?? null, agent: 'performance_analyst',
      });
    }
    return result;
  },

  /** §16 — generate the next cycle's ideas. */
  async generate_content_ideas(job) {
    const client = requireClient(job);
    return generateIdeas({
      agencyId: job.agency_id, client,
      count: job.payload?.count ?? 5,
      platforms: job.payload?.platforms ?? [],
      actor: { type: 'system', label: 'scheduler' },
    });
  },

  /** §24 — materialise recurring publishing slots. */
  async materialise_recurring_slots(job) {
    const agencyId = job.agency_id;
    const client = requireClient(job);
    const rules = list('automation_rules', agencyId,
      { client_id: client.id, kind: 'recurring_slot', status: 'active', paused: 0 }, { limit: 50 });
    const created = [];

    for (const rule of rules) {
      for (const slot of rule.config?.slots ?? []) {
        const when = nextOccurrence(slot.day, slot.hour, slot.minute ?? 0);
        const already = findBy('scheduled_content', agencyId, {
          client_id: client.id, platform: rule.platform, scheduled_for: when,
        });
        if (already) continue;
        const item = insert('scheduled_content', {
          agency_id: agencyId, client_id: client.id, platform: rule.platform,
          content_type: slot.content_type ?? 'image',
          scheduled_for: when, time_source: 'recurring_rule',
          automation_rule_id: rule.id,
          caption: null, status: 'DRAFT', approval_status: 'pending',
        });
        created.push(item.id);
      }
    }
    return { created: created.length, slots: created };
  },

  /** §32 — monthly performance snapshot. */
  async performance_report(job) {
    const client = requireClient(job);
    const summary = performanceSummary({ agencyId: job.agency_id, clientId: client.id, days: 30 });
    const rec = insert('ai_recommendations', {
      agency_id: job.agency_id, client_id: client.id, kind: 'strategy',
      title: `Monthly performance — ${client.name}`,
      body: `${summary.publishing.published} posts published, ${(summary.engagement_rate * 100).toFixed(2)}% engagement rate.`,
      payload: summary, agent: 'performance_analyst',
    });
    return { recommendation_id: rec.id };
  },
};

function requireClient(job) {
  const client = find('clients', job.agency_id, job.client_id);
  if (!client) {
    const err = new Error(`Client ${job.client_id} not found for agency ${job.agency_id}`);
    /** @type {any} */ (err).permanent = true;
    throw err;
  }
  return client;
}

function summariseCompetitors(findings) {
  const ok = findings.filter((f) => f.status === 'ok');
  const blocked = findings.filter((f) => f.status !== 'ok');
  const lines = [];
  if (ok.length) lines.push(`Observed ${ok.reduce((n, f) => n + (f.observed ?? 0), 0)} public posts across ${ok.length} competitor accounts.`);
  for (const f of blocked) lines.push(`${f.competitor} on ${f.platform}: ${f.status}${f.note ? ` — ${f.note}` : ''}`);
  return lines.join('\n') || 'Nothing observable through official APIs this cycle.';
}

const DAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function nextOccurrence(day, hour, minute) {
  const target = typeof day === 'number' ? day : DAY_INDEX[String(day).toLowerCase()] ?? 1;
  const d = new Date();
  const delta = (target - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  d.setUTCHours(hour, minute, 0, 0);
  if (d <= new Date()) d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString();
}

export function handlerNames() { return Object.keys(HANDLERS); }
