import { Router } from '../core/http.js';
import { validate } from '../core/validate.js';
import { find, findBy, insert, list, update, count } from '../db/repo.js';
import { resolveClient, requirePermission } from './context.js';
import { generateIdeas, draftFromIdea, buildContentPlan } from '../services/content.js';
import { enqueueApproval, decide } from '../services/approvals.js';
import { queuePublish } from '../services/publishing.js';
import { runSafetyGate } from '../engines/safety-gate.js';
import { bestTimeToPost, nextSlot } from '../engines/best-time.js';
import { repurposePlan, PLATFORM_STYLE } from '../engines/adaptation.js';
import { engagementOf } from '../engines/analytics.js';
import { getAdapter } from '../platforms/registry.js';
import { badRequest, notFound } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { all } from '../db/index.js';

/** Content ideas, the calendar, publishing and the approval centre. */
export const contentRouter = new Router();

// --- ideas -------------------------------------------------------------------
contentRouter.get('/api/clients/:id/ideas', async ({ principal, params, query }) => {
  requirePermission(principal, 'idea:read');
  const client = resolveClient(principal, params.id);
  return {
    ideas: list('content_ideas', principal.agencyId,
      { client_id: client.id, status: query.get('status') ?? ['idea', 'in_review', 'approved'] },
      { orderBy: 'priority DESC', limit: Number(query.get('limit') ?? 50) }),
  };
});

contentRouter.post('/api/clients/:id/ideas/generate', async ({ principal, params, body }) => {
  requirePermission(principal, 'idea:write');
  const client = resolveClient(principal, params.id);
  const input = validate(body ?? {}, {
    count: { type: 'number', min: 1, max: 12, default: 5 },
    platforms: { type: 'array', default: [] },
  });
  return generateIdeas({
    agencyId: principal.agencyId, client, count: input.count, platforms: input.platforms,
    actor: { type: 'user', id: principal.userId, label: principal.user.name },
  });
});

/** The §16 flow: "create next week's Instagram content for <client>". */
contentRouter.post('/api/clients/:id/content-plan', async ({ principal, params, body }) => {
  requirePermission(principal, 'content:write');
  const client = resolveClient(principal, params.id);
  const input = validate(body ?? {}, {
    platforms: { type: 'array', required: true, max: 8, items: { type: 'string' } },
    count: { type: 'number', min: 1, max: 12, default: 5 },
  });
  for (const p of input.platforms) getAdapter(p); // fail fast on an unknown platform
  return buildContentPlan({
    agencyId: principal.agencyId, client,
    platforms: input.platforms, count: input.count,
    actor: { type: 'user', id: principal.userId, label: principal.user.name },
  });
});

contentRouter.post('/api/clients/:id/ideas/:ideaId/draft', async ({ principal, params, body }) => {
  requirePermission(principal, 'content:write');
  const client = resolveClient(principal, params.id);
  const input = validate(body ?? {}, {
    platforms: { type: 'array', required: true, max: 8, items: { type: 'string' } },
    media: { type: 'array', default: [] },
  });
  return draftFromIdea({
    agencyId: principal.agencyId, client, ideaId: params.ideaId,
    platforms: input.platforms, media: input.media,
    actor: { type: 'user', id: principal.userId, label: principal.user.name },
  });
});

// --- calendar ----------------------------------------------------------------
contentRouter.get('/api/clients/:id/calendar', async ({ principal, params, query }) => {
  requirePermission(principal, 'content:read');
  const client = resolveClient(principal, params.id);
  const from = query.get('from') ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
  const to = query.get('to') ?? new Date(Date.now() + 30 * 86_400_000).toISOString();

  const scheduled = all(
    `SELECT * FROM scheduled_content
      WHERE agency_id = ? AND client_id = ?
        AND (scheduled_for IS NULL OR (scheduled_for >= ? AND scheduled_for <= ?))
      ORDER BY scheduled_for ASC LIMIT 500`,
    [principal.agencyId, client.id, from, to],
  ).map((row) => ({
    ...row,
    hashtags: parse(row.hashtags), media: parse(row.media), safety_report: parse(row.safety_report),
  }));

  const published = list('published_content', principal.agencyId,
    { client_id: client.id, published_at: { op: 'gte', value: from } },
    { orderBy: 'published_at DESC', limit: 200 });

  return {
    scheduled,
    published,
    range: { from, to },
    statuses: ['DRAFT', 'AI_GENERATED', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'MANUAL_ACTION_REQUIRED'],
    counts: scheduled.reduce((acc, s) => { acc[s.status] = (acc[s.status] ?? 0) + 1; return acc; }, {}),
  };
});

contentRouter.post('/api/clients/:id/content', async ({ principal, params, body }) => {
  requirePermission(principal, 'content:write');
  const client = resolveClient(principal, params.id);
  const input = validate(body, {
    platform: { type: 'string', required: true },
    content_type: { type: 'string', required: true },
    caption: { type: 'string', maxLength: 8000 },
    hook: { type: 'string', maxLength: 400 },
    cta: { type: 'string', maxLength: 400 },
    hashtags: { type: 'array', default: [] },
    media: { type: 'array', default: [] },
    link_url: { type: 'string', maxLength: 500 },
    scheduled_for: { type: 'iso-date' },
    idea_id: { type: 'string' },
  });

  // Validate against the platform's real capabilities before it is ever queued.
  const adapter = getAdapter(input.platform);
  if (!adapter.supportsPublishing(input.content_type)) {
    return {
      status: 'MANUAL_ACTION_REQUIRED',
      platform: input.platform,
      content_type: input.content_type,
      reason: `${input.platform} offers no official API publishing for ${input.content_type}.`,
      how_to: adapter.capabilities.notes?.[input.content_type]
        ?? 'Publish this manually in the platform’s own app and record it here.',
      supported_types: adapter.capabilities.publish,
    };
  }

  const account = findBy('social_accounts', principal.agencyId,
    { client_id: client.id, platform: input.platform, connection_status: 'connected' });

  const item = insert('scheduled_content', {
    agency_id: principal.agencyId, client_id: client.id,
    social_account_id: account?.id ?? null, ...input,
    status: 'DRAFT', approval_status: 'pending',
  });

  audit({
    agencyId: principal.agencyId, clientId: client.id, actorType: 'user', actorId: principal.userId,
    action: 'content.created', objectType: 'scheduled_content', objectId: item.id, platform: input.platform,
  });
  return { content: item };
});

contentRouter.patch('/api/content/:contentId', async ({ principal, params, body }) => {
  requirePermission(principal, 'content:write');
  const item = find('scheduled_content', principal.agencyId, params.contentId);
  if (!item) throw notFound('Content not found');
  resolveClient(principal, item.client_id);
  if (['PUBLISHING', 'PUBLISHED'].includes(item.status)) {
    throw badRequest(`Content that is ${item.status} can no longer be edited`);
  }

  const input = validate(body, {
    caption: { type: 'string', maxLength: 8000 },
    hook: { type: 'string', maxLength: 400 },
    cta: { type: 'string', maxLength: 400 },
    hashtags: { type: 'array' },
    media: { type: 'array' },
    link_url: { type: 'string', maxLength: 500 },
    scheduled_for: { type: 'iso-date' },
    content_type: { type: 'string' },
  });

  const updated = update('scheduled_content', principal.agencyId, item.id, {
    ...input,
    // Any edit re-opens review: an approved item cannot be changed after the fact.
    status: item.approval_status === 'approved' ? 'IN_REVIEW' : item.status,
    approval_status: item.approval_status === 'approved' ? 'pending' : item.approval_status,
  });

  audit({
    agencyId: principal.agencyId, clientId: item.client_id, actorType: 'user', actorId: principal.userId,
    action: 'content.edited', objectType: 'scheduled_content', objectId: item.id,
    platform: item.platform, previous: { caption: item.caption, scheduled_for: item.scheduled_for }, next: input,
  });
  return { content: updated };
});

/** Preview the safety gate without publishing (§26). */
contentRouter.post('/api/content/:contentId/safety-check', async ({ principal, params }) => {
  requirePermission(principal, 'content:read');
  const item = find('scheduled_content', principal.agencyId, params.contentId);
  if (!item) throw notFound('Content not found');
  resolveClient(principal, item.client_id);
  const brand = findBy('brand_profiles', principal.agencyId, { client_id: item.client_id });
  const recent = list('published_content', principal.agencyId, { client_id: item.client_id },
    { orderBy: 'published_at DESC', limit: 25 });
  const gate = runSafetyGate({ item, brand, recentCaptions: recent.map((r) => r.caption).filter(Boolean) });
  update('scheduled_content', principal.agencyId, item.id, { safety_report: gate });
  return gate;
});

/** Best time to post for this client and platform (§23). */
contentRouter.get('/api/clients/:id/best-time', async ({ principal, params, query }) => {
  requirePermission(principal, 'content:read');
  const client = resolveClient(principal, params.id);
  const platform = query.get('platform');
  if (!platform) throw badRequest('platform is required');
  const published = list('published_content', principal.agencyId, { client_id: client.id },
    { orderBy: 'published_at DESC', limit: 200 });
  const recommendation = bestTimeToPost({
    history: published.map((p) => ({
      published_at: p.published_at, platform: p.platform,
      content_type: p.content_type, engagement: engagementOf(p),
    })),
    platform,
    contentType: query.get('content_type') ?? undefined,
    timezoneOffsetMinutes: Number(query.get('tz_offset') ?? 0),
  });
  return { ...recommendation, next_slot: nextSlot(recommendation) };
});

/** Repurposing plan (§29). */
contentRouter.post('/api/content/:contentId/repurpose', async ({ principal, params, body }) => {
  requirePermission(principal, 'content:write');
  const item = find('scheduled_content', principal.agencyId, params.contentId);
  if (!item) throw notFound('Content not found');
  resolveClient(principal, item.client_id);
  const input = validate(body, { platforms: { type: 'array', required: true, max: 8, items: { type: 'string' } } });
  return {
    source: { platform: item.platform, content_type: item.content_type },
    plan: repurposePlan({ sourceContentType: item.content_type, targetPlatforms: input.platforms }),
    guidance: PLATFORM_STYLE,
  };
});

// --- approvals ---------------------------------------------------------------
contentRouter.get('/api/approvals', async ({ principal, query }) => {
  requirePermission(principal, 'approval:read');
  const filters = { status: query.get('status') ?? 'pending' };
  if (query.get('kind')) filters.kind = query.get('kind');
  if (query.get('client_id')) {
    resolveClient(principal, query.get('client_id'));
    filters.client_id = query.get('client_id');
  } else if (principal.clientScope.length) {
    filters.client_id = principal.clientScope;
  }

  const items = list('approval_items', principal.agencyId, filters,
    { orderBy: 'created_at DESC', limit: Number(query.get('limit') ?? 100) });

  return {
    items: items.map((item) => ({ ...item, subject: find(item.subject_type, principal.agencyId, item.subject_id) ?? null })),
    counts: {
      content: count('approval_items', principal.agencyId, { status: 'pending', kind: 'content' }),
      comment: count('approval_items', principal.agencyId, { status: 'pending', kind: 'comment' }),
      auto_post: count('approval_items', principal.agencyId, { status: 'pending', kind: 'auto_post' }),
      trending_post: count('approval_items', principal.agencyId, { status: 'pending', kind: 'trending_post' }),
      engagement: count('approval_items', principal.agencyId, { status: 'pending', kind: 'engagement' }),
    },
  };
});

contentRouter.post('/api/approvals/:itemId/decide', async ({ principal, params, body, req }) => {
  requirePermission(principal, 'approval:decide');
  const item = find('approval_items', principal.agencyId, params.itemId);
  if (!item) throw notFound('Approval item not found');
  resolveClient(principal, item.client_id);

  const input = validate(body, {
    decision: { type: 'enum', enum: ['approved', 'rejected', 'edited'], required: true },
    note: { type: 'string', maxLength: 1000 },
    publish_now: { type: 'boolean', default: false },
  });

  const decided = decide({
    agencyId: principal.agencyId, itemId: item.id, decision: input.decision,
    userId: principal.userId, note: input.note, ip: req.socket?.remoteAddress,
  });

  let queued = null;
  if (input.decision === 'approved' && item.subject_type === 'scheduled_content') {
    const content = find('scheduled_content', principal.agencyId, item.subject_id);
    if (input.publish_now) {
      queued = queuePublish({
        agencyId: principal.agencyId, clientId: item.client_id, scheduledContentId: content.id,
      });
    } else {
      update('scheduled_content', principal.agencyId, content.id, { status: 'SCHEDULED' });
    }
  }
  if (input.decision === 'approved' && item.subject_type === 'generated_comments') {
    const { approveComment } = await import('../services/engagement.js');
    queued = approveComment({
      agencyId: principal.agencyId, clientId: item.client_id,
      commentId: item.subject_id, userId: principal.userId,
    });
  }

  return { item: decided, queued };
});

/** Bulk decisions require explicit confirmation (§30). */
contentRouter.post('/api/approvals/bulk', async ({ principal, body, req }) => {
  requirePermission(principal, 'approval:decide');
  const input = validate(body, {
    item_ids: { type: 'array', required: true, max: 100, items: { type: 'string' } },
    decision: { type: 'enum', enum: ['approved', 'rejected'], required: true },
    confirm: { type: 'boolean', default: false },
    publish_now: { type: 'boolean', default: false },
    note: { type: 'string', maxLength: 500 },
  });

  if (!input.confirm) {
    const items = input.item_ids
      .map((id) => find('approval_items', principal.agencyId, id))
      .filter(Boolean);
    return {
      confirmation_required: true,
      summary: {
        count: items.length,
        by_kind: items.reduce((acc, i) => { acc[i.kind] = (acc[i.kind] ?? 0) + 1; return acc; }, {}),
        with_risk_flags: items.filter((i) => (i.risk_flags ?? []).length).length,
      },
      message: input.publish_now
        ? `This will approve and publish ${items.length} items. Re-send with confirm: true to proceed.`
        : `This will ${input.decision === 'approved' ? 'approve' : 'reject'} ${items.length} items. Re-send with confirm: true.`,
    };
  }

  const results = [];
  for (const id of input.item_ids) {
    const item = find('approval_items', principal.agencyId, id);
    if (!item) { results.push({ id, error: 'not found' }); continue; }
    try {
      resolveClient(principal, item.client_id);
      decide({
        agencyId: principal.agencyId, itemId: id, decision: input.decision,
        userId: principal.userId, note: input.note, ip: req.socket?.remoteAddress,
      });
      if (input.decision === 'approved' && item.subject_type === 'scheduled_content') {
        if (input.publish_now) {
          queuePublish({ agencyId: principal.agencyId, clientId: item.client_id, scheduledContentId: item.subject_id });
        } else {
          update('scheduled_content', principal.agencyId, item.subject_id, { status: 'SCHEDULED' });
        }
      }
      results.push({ id, status: input.decision });
    } catch (err) {
      results.push({ id, error: String(err.message ?? err) });
    }
  }

  audit({
    agencyId: principal.agencyId, actorType: 'user', actorId: principal.userId,
    action: 'approval.bulk_decision',
    next: { decision: input.decision, count: results.length, publish_now: input.publish_now },
  });
  return { results };
});

// --- publishing --------------------------------------------------------------
contentRouter.post('/api/content/:contentId/publish', async ({ principal, params }) => {
  requirePermission(principal, 'publish:execute');
  const item = find('scheduled_content', principal.agencyId, params.contentId);
  if (!item) throw notFound('Content not found');
  resolveClient(principal, item.client_id);
  if (!['approved', 'auto_approved'].includes(item.approval_status)) {
    throw badRequest('This item has not been approved yet');
  }
  const job = queuePublish({
    agencyId: principal.agencyId, clientId: item.client_id, scheduledContentId: item.id,
  });
  audit({
    agencyId: principal.agencyId, clientId: item.client_id, actorType: 'user', actorId: principal.userId,
    action: 'publish.requested', objectType: 'publishing_jobs', objectId: job.id, platform: item.platform,
  });
  return { job_id: job.id, status: 'queued' };
});

/** Retry a failed publishing job (§51). */
contentRouter.post('/api/publishing-jobs/:jobId/retry', async ({ principal, params }) => {
  requirePermission(principal, 'publish:execute');
  const job = find('publishing_jobs', principal.agencyId, params.jobId);
  if (!job) throw notFound('Job not found');
  resolveClient(principal, job.client_id);
  if (job.error_class === 'permanent') {
    throw badRequest('This failure is permanent — fix the content or the connection first, then publish again.');
  }
  const updated = update('publishing_jobs', principal.agencyId, job.id, {
    status: 'queued', run_after: new Date().toISOString(), attempt: 0, last_error: null,
  });
  return { job: updated };
});

/** Record a post that a person published by hand (§18 MANUAL_ACTION_REQUIRED). */
contentRouter.post('/api/content/:contentId/mark-published', async ({ principal, params, body }) => {
  requirePermission(principal, 'publish:execute');
  const item = find('scheduled_content', principal.agencyId, params.contentId);
  if (!item) throw notFound('Content not found');
  resolveClient(principal, item.client_id);
  const input = validate(body, {
    url: { type: 'string', maxLength: 500 },
    external_post_id: { type: 'string', maxLength: 200 },
    published_at: { type: 'iso-date' },
  });

  const published = insert('published_content', {
    agency_id: principal.agencyId, client_id: item.client_id,
    scheduled_content_id: item.id, social_account_id: item.social_account_id,
    platform: item.platform, content_type: item.content_type,
    caption: item.caption, hashtags: item.hashtags ?? [],
    external_post_id: input.external_post_id ?? null, url: input.url ?? null,
    scheduled_for: item.scheduled_for,
    published_at: input.published_at ?? new Date().toISOString(),
    publish_method: 'manual',
  });
  update('scheduled_content', principal.agencyId, item.id, { status: 'PUBLISHED' });

  audit({
    agencyId: principal.agencyId, clientId: item.client_id, actorType: 'user', actorId: principal.userId,
    action: 'content.marked_published_manually', objectType: 'published_content', objectId: published.id,
    platform: item.platform, next: { url: input.url, method: 'manual' },
  });
  return { published };
});

/** Publishing log (§52). */
contentRouter.get('/api/clients/:id/publishing-log', async ({ principal, params, query }) => {
  requirePermission(principal, 'content:read');
  const client = resolveClient(principal, params.id);
  const jobs = list('publishing_jobs', principal.agencyId, { client_id: client.id },
    { orderBy: 'created_at DESC', limit: Number(query.get('limit') ?? 100) });

  return {
    entries: jobs.map((job) => {
      const content = job.scheduled_content_id ? find('scheduled_content', principal.agencyId, job.scheduled_content_id) : null;
      const published = content
        ? findBy('published_content', principal.agencyId, { scheduled_content_id: content.id })
        : null;
      return {
        job_id: job.id,
        client: client.name,
        platform: job.platform,
        kind: job.kind,
        content: content ? String(content.caption ?? content.hook ?? '').slice(0, 120) : null,
        scheduled_for: content?.scheduled_for ?? null,
        published_at: published?.published_at ?? null,
        status: job.status,
        external_post_id: published?.external_post_id ?? null,
        url: published?.url ?? null,
        publish_method: published?.publish_method ?? null,
        error: job.last_error,
        error_class: job.error_class,
        attempts: job.attempt,
        retry_history: job.retry_history ?? [],
      };
    }),
  };
});

function parse(value, fallback = []) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
