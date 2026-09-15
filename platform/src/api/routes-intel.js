import { Router } from '../core/http.js';
import { validate } from '../core/validate.js';
import { find, insert, list, update, count } from '../db/repo.js';
import { resolveClient, requirePermission } from './context.js';
import { enqueue } from '../jobs/queue.js';
import { generateComments, approveComment } from '../services/engagement.js';
import { agents } from '../ai/agents/index.js';
import { notFound, badRequest } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { CLASSIFICATIONS } from '../engines/trend.js';
import { all } from '../db/index.js';

/** Trends, inspiration, engagement opportunities and comments. */
export const intelRouter = new Router();

// --- trends ------------------------------------------------------------------
intelRouter.get('/api/clients/:id/trends', async ({ principal, params, query }) => {
  requirePermission(principal, 'trend:read');
  const client = resolveClient(principal, params.id);
  const filters = { client_id: client.id, status: 'active' };
  if (query.get('classification')) filters.classification = query.get('classification');
  if (query.get('min_score')) filters.trend_score = { op: 'gte', value: Number(query.get('min_score')) };

  const trends = list('trending_topics', principal.agencyId, filters,
    { orderBy: 'trend_score DESC', limit: Number(query.get('limit') ?? 50) });

  return {
    trends,
    classifications: CLASSIFICATIONS,
    summary: {
      total: trends.length,
      critical: trends.filter((t) => t.urgency === 'critical').length,
      high: trends.filter((t) => t.urgency === 'high').length,
    },
  };
});

/** Kick off discovery by hand. Runs in the worker, never in this request (§6). */
intelRouter.post('/api/clients/:id/trends/discover', async ({ principal, params }) => {
  requirePermission(principal, 'trend:read');
  const client = resolveClient(principal, params.id);
  const job = enqueue({
    agencyId: principal.agencyId, clientId: client.id,
    kind: 'discover_trends', priority: 90,
    dedupeKey: `trends:manual:${client.id}:${Math.floor(Date.now() / 300_000)}`,
  });
  audit({
    agencyId: principal.agencyId, clientId: client.id, actorType: 'user', actorId: principal.userId,
    action: 'research.trends_requested', objectType: 'job_queue', objectId: job.id,
  });
  return {
    job_id: job.id,
    deduped: job.deduped,
    status: 'queued',
    note: job.deduped
      ? 'A discovery run for this client is already in flight.'
      : 'Discovery is running in the background. Refresh in a minute.',
  };
});

intelRouter.get('/api/clients/:id/trends/:trendId', async ({ principal, params }) => {
  requirePermission(principal, 'trend:read');
  const client = resolveClient(principal, params.id);
  const trend = find('trending_topics', principal.agencyId, params.trendId);
  if (!trend || trend.client_id !== client.id) throw notFound('Trend not found');
  return { trend };
});

// --- inspiration -------------------------------------------------------------
intelRouter.get('/api/clients/:id/inspiration', async ({ principal, params, query }) => {
  requirePermission(principal, 'inspiration:read');
  const client = resolveClient(principal, params.id);

  const filters = { client_id: client.id, status: 'active' };
  for (const [param, column] of [['platform', 'platform'], ['format', 'content_format'],
    ['language', 'language'], ['geography', 'geography'], ['topic', 'topic']]) {
    if (query.get(param)) filters[column] = query.get(param);
  }
  if (query.get('min_engagement')) filters.engagement_rate = { op: 'gte', value: Number(query.get('min_engagement')) };
  if (query.get('min_views')) filters.views = { op: 'gte', value: Number(query.get('min_views')) };
  if (query.get('since')) filters.posted_at = { op: 'gte', value: query.get('since') };
  if (query.get('saved') === 'true') filters.saved = 1;

  const ORDER = {
    viral: 'viral_score DESC', relevant: 'relevance_score DESC',
    growing: 'engagement_rate DESC', recent: 'posted_at DESC', engagement: 'engagement_rate DESC',
  };
  const sort = ORDER[query.get('sort') ?? 'viral'] ?? ORDER.viral;

  return {
    items: list('inspiration_items', principal.agencyId, filters,
      { orderBy: sort, limit: Number(query.get('limit') ?? 50) }),
    filters: { platform: query.get('platform'), sort: query.get('sort') ?? 'viral' },
    note: 'Inspiration is a reference for structure only. Every adaptation must be original work for this client.',
  };
});

intelRouter.post('/api/clients/:id/inspiration/:itemId/save', async ({ principal, params, body }) => {
  requirePermission(principal, 'inspiration:write');
  const client = resolveClient(principal, params.id);
  const item = find('inspiration_items', principal.agencyId, params.itemId);
  if (!item || item.client_id !== client.id) throw notFound('Inspiration item not found');
  const input = validate(body ?? {}, { saved: { type: 'boolean', default: true } });
  return { item: update('inspiration_items', principal.agencyId, item.id, { saved: input.saved ? 1 : 0 }) };
});

/** Re-run the Content Analyst on one item. */
intelRouter.post('/api/clients/:id/inspiration/:itemId/analyze', async ({ principal, params }) => {
  requirePermission(principal, 'inspiration:write');
  const client = resolveClient(principal, params.id);
  const item = find('inspiration_items', principal.agencyId, params.itemId);
  if (!item || item.client_id !== client.id) throw notFound('Inspiration item not found');

  const run = await agents.contentAnalyst.run({ agencyId: principal.agencyId, clientId: client.id }, {
    client_name: client.name, industry: client.industry,
    platform: item.platform, content_format: item.content_format, creator: item.creator,
    topic: item.topic, excerpt: item.caption_structure ?? item.hook ?? item.topic ?? '',
    metrics: { views: item.views, likes: item.likes, comments: item.comments, shares: item.shares },
    engagement_rate: item.engagement_rate ?? 0,
  });

  const updated = update('inspiration_items', principal.agencyId, item.id, {
    hook: run.output.hook, caption_structure: run.output.caption_structure,
    cta: run.output.cta, why_it_worked: run.output.why_it_worked,
    suggested_adaptation: run.output.suggested_adaptation,
    relevance_score: run.output.relevance_score,
  });
  return { item: updated, analysis: run.output };
});

// --- engagement opportunities ------------------------------------------------
intelRouter.get('/api/clients/:id/opportunities', async ({ principal, params, query }) => {
  requirePermission(principal, 'opportunity:read');
  const client = resolveClient(principal, params.id);
  const filters = { client_id: client.id };
  filters.status = query.get('status') ?? ['new', 'queued'];
  if (query.get('platform')) filters.platform = query.get('platform');
  if (query.get('action')) filters.recommended_action = query.get('action');

  const items = list('engagement_opportunities', principal.agencyId, filters,
    { orderBy: 'relevance_score DESC', limit: Number(query.get('limit') ?? 50) });

  return {
    opportunities: items,
    summary: {
      engage: items.filter((o) => o.recommended_action === 'engage').length,
      review: items.filter((o) => o.recommended_action === 'review').length,
      ignore: items.filter((o) => o.recommended_action === 'ignore').length,
    },
    note: 'A recommendation of "engage" is advice to a person, not permission to post.',
  };
});

intelRouter.post('/api/clients/:id/opportunities/discover', async ({ principal, params }) => {
  requirePermission(principal, 'opportunity:read');
  const client = resolveClient(principal, params.id);
  const job = enqueue({
    agencyId: principal.agencyId, clientId: client.id,
    kind: 'discover_engagement', priority: 90,
    dedupeKey: `engagement:manual:${client.id}:${Math.floor(Date.now() / 300_000)}`,
  });
  return { job_id: job.id, deduped: job.deduped, status: 'queued' };
});

intelRouter.patch('/api/clients/:id/opportunities/:oppId', async ({ principal, params, body }) => {
  requirePermission(principal, 'opportunity:write');
  const client = resolveClient(principal, params.id);
  const opp = find('engagement_opportunities', principal.agencyId, params.oppId);
  if (!opp || opp.client_id !== client.id) throw notFound('Opportunity not found');
  const input = validate(body, {
    status: { type: 'enum', enum: ['new', 'queued', 'engaged', 'dismissed'], required: true },
    reason: { type: 'string', maxLength: 500 },
  });
  const updated = update('engagement_opportunities', principal.agencyId, opp.id, { status: input.status });
  audit({
    agencyId: principal.agencyId, clientId: client.id, actorType: 'user', actorId: principal.userId,
    action: `opportunity.${input.status}`, objectType: 'engagement_opportunities', objectId: opp.id,
    platform: opp.platform, previous: { status: opp.status }, next: { status: input.status, reason: input.reason },
  });
  return { opportunity: updated };
});

// --- comments ----------------------------------------------------------------
intelRouter.post('/api/clients/:id/opportunities/:oppId/comments', async ({ principal, params }) => {
  requirePermission(principal, 'comment:write');
  const client = resolveClient(principal, params.id);
  return generateComments({
    agencyId: principal.agencyId, clientId: client.id, opportunityId: params.oppId,
    actor: { type: 'user', id: principal.userId, label: principal.user.name },
  });
});

intelRouter.get('/api/clients/:id/opportunities/:oppId/comments', async ({ principal, params }) => {
  requirePermission(principal, 'comment:read');
  const client = resolveClient(principal, params.id);
  return {
    comments: list('generated_comments', principal.agencyId,
      { client_id: client.id, opportunity_id: params.oppId }, { orderBy: 'quality_score DESC', limit: 20 }),
  };
});

intelRouter.patch('/api/comments/:commentId', async ({ principal, params, body }) => {
  requirePermission(principal, 'comment:write');
  const comment = find('generated_comments', principal.agencyId, params.commentId);
  if (!comment) throw notFound('Comment not found');
  resolveClient(principal, comment.client_id);

  const input = validate(body, { body: { type: 'string', required: true, minLength: 10, maxLength: 4000 } });

  // An edited comment is re-checked, not trusted because a person touched it.
  const { checkComment } = await import('../engines/comment-quality.js');
  const opportunity = find('engagement_opportunities', principal.agencyId, comment.opportunity_id);
  const brand = list('brand_profiles', principal.agencyId, { client_id: comment.client_id }, { limit: 1 })[0];
  const recent = list('published_comments', principal.agencyId, { client_id: comment.client_id },
    { orderBy: 'published_at DESC', limit: 30 }).map((c) => c.body);
  const quality = checkComment({
    body: input.body, platform: opportunity?.platform ?? 'x',
    opportunityExcerpt: opportunity?.excerpt, brand, recentComments: recent,
  });

  const updated = update('generated_comments', principal.agencyId, comment.id, {
    body: input.body, quality_score: quality.score, quality_report: quality,
    blocked: quality.blocked ? 1 : 0, edited_by: principal.userId, status: 'in_review',
  });
  audit({
    agencyId: principal.agencyId, clientId: comment.client_id, actorType: 'user', actorId: principal.userId,
    action: 'comment.edited', objectType: 'generated_comments', objectId: comment.id,
    previous: { body: comment.body }, next: { body: input.body, quality_score: quality.score },
  });
  return { comment: updated, quality };
});

intelRouter.post('/api/comments/:commentId/approve', async ({ principal, params }) => {
  requirePermission(principal, 'approval:decide');
  const comment = find('generated_comments', principal.agencyId, params.commentId);
  if (!comment) throw notFound('Comment not found');
  resolveClient(principal, comment.client_id);
  return approveComment({
    agencyId: principal.agencyId, clientId: comment.client_id,
    commentId: comment.id, userId: principal.userId,
  });
});

/** Explicitly send an approved comment now. Still passes every publish gate. */
intelRouter.post('/api/comments/:commentId/send', async ({ principal, params }) => {
  requirePermission(principal, 'publish:execute');
  const comment = find('generated_comments', principal.agencyId, params.commentId);
  if (!comment) throw notFound('Comment not found');
  if (comment.status !== 'approved') throw badRequest('Only an approved comment can be sent');
  resolveClient(principal, comment.client_id);
  const opportunity = find('engagement_opportunities', principal.agencyId, comment.opportunity_id);

  const { queueComment } = await import('../services/publishing.js');
  const job = queueComment({
    agencyId: principal.agencyId, clientId: comment.client_id,
    commentId: comment.id, platform: opportunity.platform,
  });
  audit({
    agencyId: principal.agencyId, clientId: comment.client_id, actorType: 'user', actorId: principal.userId,
    action: 'comment.send_requested', objectType: 'publishing_jobs', objectId: job.id, platform: opportunity.platform,
  });
  return { job_id: job.id, status: 'queued' };
});

// --- competitors -------------------------------------------------------------
intelRouter.get('/api/clients/:id/competitors', async ({ principal, params }) => {
  requirePermission(principal, 'competitor:read');
  const client = resolveClient(principal, params.id);
  const competitors = list('competitors', principal.agencyId, { client_id: client.id, status: 'active' }, { limit: 50 });
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  return {
    competitors: competitors.map((c) => {
      const posts = all(
        `SELECT * FROM social_posts WHERE agency_id = ? AND competitor_id = ? AND posted_at > ?
          ORDER BY posted_at DESC LIMIT 100`,
        [principal.agencyId, c.id, weekAgo],
      );
      const engagement = posts.map((p) => {
        const m = typeof p.metrics === 'string' ? JSON.parse(p.metrics || '{}') : (p.metrics ?? {});
        return Number(m.likes ?? 0) + Number(m.comments ?? 0) + Number(m.score ?? 0);
      });
      const top = posts[engagement.indexOf(Math.max(...engagement, 0))];
      return {
        ...c,
        posts_this_week: posts.length,
        total_engagement: engagement.reduce((a, b) => a + b, 0),
        top_post: top ? { url: top.url, caption: String(top.caption ?? '').slice(0, 160), posted_at: top.posted_at } : null,
      };
    }),
    note: 'Competitor data comes only from publicly available information the platforms’ own APIs return.',
  };
});

intelRouter.post('/api/clients/:id/competitors/analyze', async ({ principal, params }) => {
  requirePermission(principal, 'competitor:read');
  const client = resolveClient(principal, params.id);
  const job = enqueue({
    agencyId: principal.agencyId, clientId: client.id, kind: 'competitor_analysis', priority: 70,
    dedupeKey: `competitors:manual:${client.id}:${Math.floor(Date.now() / 600_000)}`,
  });
  return { job_id: job.id, deduped: job.deduped, status: 'queued' };
});
