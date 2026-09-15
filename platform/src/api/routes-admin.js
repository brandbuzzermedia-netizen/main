import { Router } from '../core/http.js';
import { validate } from '../core/validate.js';
import { find, findBy, insert, list, update, count } from '../db/repo.js';
import { resolveClient, requirePermission } from './context.js';
import { performanceSummary } from '../engines/analytics.js';
import { agents, AGENT_CATALOGUE } from '../ai/agents/index.js';
import { publishPromptVersion, promptHistory, DEFAULT_PROMPTS } from '../ai/prompts.js';
import { forUser } from '../services/notifications.js';
import { queueStats } from '../jobs/queue.js';
import { capabilityMatrix } from '../platforms/registry.js';
import { audit } from '../core/audit.js';
import { badRequest, notFound } from '../core/errors.js';
import { all } from '../db/index.js';
import { now } from '../core/ids.js';
import { config } from '../config.js';
import { providerName } from '../ai/provider.js';

/** Dashboards, analytics, automation controls, assistant, search, audit, prompts. */
export const adminRouter = new Router();

// --- dashboards --------------------------------------------------------------
adminRouter.get('/api/dashboard', async ({ principal }) => {
  requirePermission(principal, 'client:read');
  const agencyId = principal.agencyId;
  const scope = principal.clientScope.length ? { id: principal.clientScope } : {};
  const clients = list('clients', agencyId, { ...scope, status: 'active' }, { limit: 100 });
  const agency = find('agencies', agencyId, agencyId);

  return {
    agency: {
      name: agency.name,
      automation_paused: Boolean(agency.automation_paused),
      paused_reason: agency.paused_reason,
    },
    totals: {
      clients: clients.length,
      pending_approvals: count('approval_items', agencyId, { status: 'pending' }),
      opportunities: count('engagement_opportunities', agencyId, { status: 'new' }),
      trends: count('trending_topics', agencyId, { status: 'active' }),
      scheduled: count('scheduled_content', agencyId, { status: ['APPROVED', 'SCHEDULED'] }),
      failures: count('publishing_jobs', agencyId, { status: ['failed', 'dead_letter'] }),
      manual_action_required: count('scheduled_content', agencyId, { status: 'MANUAL_ACTION_REQUIRED' }),
    },
    clients: clients.map((c) => ({
      id: c.id, name: c.name, industry: c.industry,
      automation_paused: Boolean(c.automation_paused),
      onboarding_complete: Boolean(c.onboarding_complete),
      trends: count('trending_topics', agencyId, { client_id: c.id, status: 'active' }),
      opportunities: count('engagement_opportunities', agencyId, { client_id: c.id, status: 'new' }),
      pending_approvals: count('approval_items', agencyId, { client_id: c.id, status: 'pending' }),
      accounts: count('social_accounts', agencyId, { client_id: c.id, status: 'active' }),
    })),
  };
});

/** The client command centre (§46). */
adminRouter.get('/api/clients/:id/dashboard', async ({ principal, params }) => {
  requirePermission(principal, 'client:read');
  const client = resolveClient(principal, params.id);
  const agencyId = principal.agencyId;
  const { serializeAccount } = await import('../services/credentials.js');

  const autopilot = findBy('automation_rules', agencyId, { client_id: client.id, kind: 'autopilot', status: 'active' });
  const brief = list('ai_recommendations', agencyId, { client_id: client.id, kind: 'daily_brief' },
    { orderBy: 'created_at DESC', limit: 1 })[0] ?? null;

  return {
    client: { ...client, automation_paused: Boolean(client.automation_paused) },
    brand_profile: findBy('brand_profiles', agencyId, { client_id: client.id }) ?? null,
    accounts: list('social_accounts', agencyId, { client_id: client.id, status: 'active' }, { limit: 20 }).map(serializeAccount),
    trends: list('trending_topics', agencyId, { client_id: client.id, status: 'active' },
      { orderBy: 'trend_score DESC', limit: 5 }),
    inspiration: list('inspiration_items', agencyId, { client_id: client.id, status: 'active' },
      { orderBy: 'viral_score DESC', limit: 5 }),
    opportunities: list('engagement_opportunities', agencyId, { client_id: client.id, status: 'new' },
      { orderBy: 'relevance_score DESC', limit: 5 }),
    ideas: list('content_ideas', agencyId, { client_id: client.id, status: ['idea', 'approved'] },
      { orderBy: 'priority DESC', limit: 5 }),
    upcoming: list('scheduled_content', agencyId,
      { client_id: client.id, status: ['APPROVED', 'SCHEDULED', 'IN_REVIEW'] },
      { orderBy: 'scheduled_for ASC', limit: 8 }),
    competitors: list('competitors', agencyId, { client_id: client.id, status: 'active' }, { limit: 10 }),
    performance: performanceSummary({ agencyId, clientId: client.id, days: 30 }),
    recommendations: list('ai_recommendations', agencyId, { client_id: client.id },
      { orderBy: 'created_at DESC', limit: 5 }),
    daily_brief: brief,
    autopilot: {
      // "On" means the client has authorised publishing without a person in the
      // loop. Approval-required is the default and is NOT autopilot.
      enabled: Boolean(autopilot && autopilot.mode === 'controlled_auto' && !autopilot.paused),
      mode: autopilot?.mode ?? 'approval_required',
      config: autopilot?.config ?? {},
    },
    pending_approvals: count('approval_items', agencyId, { client_id: client.id, status: 'pending' }),
  };
});

/** Daily brief (§35). */
adminRouter.get('/api/clients/:id/brief', async ({ principal, params }) => {
  requirePermission(principal, 'client:read');
  const client = resolveClient(principal, params.id);
  const brief = list('ai_recommendations', principal.agencyId,
    { client_id: client.id, kind: 'daily_brief' }, { orderBy: 'created_at DESC', limit: 1 })[0];
  if (!brief) {
    return { brief: null, note: 'No brief generated yet. Briefs run daily; use "Generate now" to build one immediately.' };
  }
  return { brief };
});

adminRouter.post('/api/clients/:id/brief/generate', async ({ principal, params }) => {
  requirePermission(principal, 'client:read');
  const client = resolveClient(principal, params.id);
  const { enqueue } = await import('../jobs/queue.js');
  const job = enqueue({
    agencyId: principal.agencyId, clientId: client.id, kind: 'daily_brief', priority: 95,
    dedupeKey: `brief:manual:${client.id}:${Math.floor(Date.now() / 300_000)}`,
  });
  return { job_id: job.id, deduped: job.deduped, status: 'queued' };
});

// --- analytics ---------------------------------------------------------------
adminRouter.get('/api/clients/:id/analytics', async ({ principal, params, query }) => {
  requirePermission(principal, 'analytics:read');
  const client = resolveClient(principal, params.id);
  const days = Math.min(Number(query.get('days') ?? 30), 365);
  return {
    summary: performanceSummary({ agencyId: principal.agencyId, clientId: client.id, days }),
    learning: list('ai_recommendations', principal.agencyId,
      { client_id: client.id, kind: 'learning' }, { orderBy: 'created_at DESC', limit: 5 }),
  };
});

adminRouter.post('/api/clients/:id/analytics/learn', async ({ principal, params }) => {
  requirePermission(principal, 'analytics:read');
  const client = resolveClient(principal, params.id);
  const { enqueue } = await import('../jobs/queue.js');
  const job = enqueue({
    agencyId: principal.agencyId, clientId: client.id, kind: 'learning_loop', priority: 70,
    dedupeKey: `learn:manual:${client.id}:${Math.floor(Date.now() / 600_000)}`,
  });
  return { job_id: job.id, deduped: job.deduped };
});

// --- automation and the emergency stop (§25, §31) ----------------------------
adminRouter.post('/api/automation/pause-all', async ({ principal, body, req }) => {
  requirePermission(principal, 'automation:write');
  const input = validate(body ?? {}, { reason: { type: 'string', maxLength: 500 } });
  update('agencies', principal.agencyId, principal.agencyId, {
    automation_paused: 1, paused_reason: input.reason ?? 'Paused from the dashboard', paused_at: now(),
  });
  audit({
    agencyId: principal.agencyId, actorType: 'user', actorId: principal.userId,
    action: 'automation.paused_all', next: { reason: input.reason }, ip: req.socket?.remoteAddress,
  });
  return {
    paused: true,
    note: 'All scheduled publishing, automated engagement and AI publishing jobs are stopped. Nothing scheduled has been deleted.',
  };
});

adminRouter.post('/api/automation/resume-all', async ({ principal, req }) => {
  requirePermission(principal, 'automation:write');
  update('agencies', principal.agencyId, principal.agencyId, {
    automation_paused: 0, paused_reason: null, paused_at: null,
  });
  audit({
    agencyId: principal.agencyId, actorType: 'user', actorId: principal.userId,
    action: 'automation.resumed_all', ip: req.socket?.remoteAddress,
  });
  return { paused: false };
});

adminRouter.post('/api/clients/:id/automation/pause', async ({ principal, params, body }) => {
  requirePermission(principal, 'automation:write');
  const client = resolveClient(principal, params.id);
  const input = validate(body ?? {}, {
    paused: { type: 'boolean', default: true },
    platform: { type: 'string' },
  });

  if (input.platform) {
    const account = findBy('social_accounts', principal.agencyId, { client_id: client.id, platform: input.platform });
    if (!account) throw notFound(`No ${input.platform} account for this client`);
    update('social_accounts', principal.agencyId, account.id, { automation_paused: input.paused ? 1 : 0 });
  } else {
    update('clients', principal.agencyId, client.id, { automation_paused: input.paused ? 1 : 0 });
  }

  audit({
    agencyId: principal.agencyId, clientId: client.id, actorType: 'user', actorId: principal.userId,
    action: input.paused ? 'automation.paused' : 'automation.resumed',
    platform: input.platform, objectType: 'clients', objectId: client.id,
  });
  return { paused: input.paused, scope: input.platform ?? 'client' };
});

/** Autopilot configuration (§25). */
adminRouter.put('/api/clients/:id/automation', async ({ principal, params, body }) => {
  requirePermission(principal, 'automation:write');
  const client = resolveClient(principal, params.id);
  const input = validate(body, {
    kind: { type: 'enum', enum: ['autopilot', 'recurring_slot', 'engagement', 'thresholds'], required: true },
    platform: { type: 'string' },
    mode: { type: 'enum', enum: ['manual', 'approval_required', 'controlled_auto'], default: 'approval_required' },
    config: { type: 'object', default: {} },
    paused: { type: 'boolean', default: false },
  });

  // Sensitive topics stay off unless a person turns them on, per client.
  if (input.kind === 'autopilot') {
    input.config = {
      allowed_content_types: ['educational'],
      sensitive_topics: false,
      ...input.config,
      sensitive_topics: input.config.sensitive_topics === true,
    };
  }

  const existing = findBy('automation_rules', principal.agencyId, {
    client_id: client.id, kind: input.kind, platform: input.platform ?? null,
  });
  const rule = existing
    ? update('automation_rules', principal.agencyId, existing.id, input)
    : insert('automation_rules', { agency_id: principal.agencyId, client_id: client.id, ...input });

  audit({
    agencyId: principal.agencyId, clientId: client.id, actorType: 'user', actorId: principal.userId,
    action: 'automation.rule_updated', objectType: 'automation_rules', objectId: rule.id,
    platform: input.platform, previous: existing, next: input,
  });
  return { rule };
});

// --- assistant (§40) ---------------------------------------------------------
adminRouter.post('/api/clients/:id/assistant', async ({ principal, params, body }) => {
  requirePermission(principal, 'assistant:use');
  const client = resolveClient(principal, params.id);
  const input = validate(body, { question: { type: 'string', required: true, maxLength: 2000 } });
  const agencyId = principal.agencyId;

  // The assistant only ever sees the selected client's own stored data.
  const context = {
    trends: list('trending_topics', agencyId, { client_id: client.id, status: 'active' },
      { orderBy: 'trend_score DESC', limit: 10 })
      .map((t) => ({ topic: t.topic, trend_score: t.trend_score, classification: t.classification, why: t.why_it_matters })),
    opportunities: list('engagement_opportunities', agencyId, { client_id: client.id, status: 'new' },
      { orderBy: 'relevance_score DESC', limit: 10 })
      .map((o) => ({ platform: o.platform, excerpt: String(o.excerpt).slice(0, 200), relevance_score: o.relevance_score, url: o.url })),
    ideas: list('content_ideas', agencyId, { client_id: client.id }, { orderBy: 'priority DESC', limit: 10 })
      .map((i) => ({ title: i.title, format: i.format, angle: i.angle })),
    inspiration: list('inspiration_items', agencyId, { client_id: client.id, status: 'active' },
      { orderBy: 'viral_score DESC', limit: 8 })
      .map((i) => ({ platform: i.platform, topic: i.topic, why_it_worked: i.why_it_worked, url: i.url })),
    performance: performanceSummary({ agencyId, clientId: client.id, days: 30 }),
    upcoming: list('scheduled_content', agencyId, { client_id: client.id, status: ['APPROVED', 'SCHEDULED'] },
      { orderBy: 'scheduled_for ASC', limit: 10 })
      .map((s) => ({ platform: s.platform, type: s.content_type, when: s.scheduled_for, caption: String(s.caption ?? '').slice(0, 120) })),
  };

  const run = await agents.assistant.run({ agencyId, clientId: client.id }, {
    client_name: client.name, question: input.question, context,
  });

  audit({
    agencyId, clientId: client.id, actorType: 'user', actorId: principal.userId,
    action: 'assistant.asked', next: { question: input.question.slice(0, 200) },
  });

  return { answer: run.output.answer, used_context: run.output.used_context, model: run.model };
});

// --- global search (§36) -----------------------------------------------------
adminRouter.get('/api/search', async ({ principal, query }) => {
  requirePermission(principal, 'client:read');
  const q = String(query.get('q') ?? '').trim();
  if (q.length < 2) throw badRequest('Search needs at least two characters');
  const agencyId = principal.agencyId;
  const like = `%${q.toLowerCase()}%`;
  const clientFilter = principal.clientScope.length
    ? ` AND client_id IN (${principal.clientScope.map(() => '?').join(',')})`
    : '';
  const scopeParams = principal.clientScope;

  const search = (sql, params) => all(sql, params);

  const results = {
    trends: search(
      `SELECT id, client_id, topic AS title, classification, trend_score, why_it_matters AS detail
         FROM trending_topics WHERE agency_id = ? AND status = 'active'
          AND LOWER(topic) LIKE ?${clientFilter} ORDER BY trend_score DESC LIMIT 10`,
      [agencyId, like, ...scopeParams]),
    inspiration: search(
      `SELECT id, client_id, topic AS title, platform, url, viral_score, why_it_worked AS detail
         FROM inspiration_items WHERE agency_id = ? AND status = 'active'
          AND (LOWER(topic) LIKE ? OR LOWER(hook) LIKE ?)${clientFilter}
        ORDER BY viral_score DESC LIMIT 10`,
      [agencyId, like, like, ...scopeParams]),
    opportunities: search(
      `SELECT id, client_id, platform, url, relevance_score, excerpt AS detail
         FROM engagement_opportunities WHERE agency_id = ?
          AND LOWER(excerpt) LIKE ?${clientFilter}
        ORDER BY relevance_score DESC LIMIT 10`,
      [agencyId, like, ...scopeParams]),
    ideas: search(
      `SELECT id, client_id, title, format, angle AS detail
         FROM content_ideas WHERE agency_id = ?
          AND (LOWER(title) LIKE ? OR LOWER(angle) LIKE ?)${clientFilter}
        ORDER BY priority DESC LIMIT 10`,
      [agencyId, like, like, ...scopeParams]),
    published: search(
      `SELECT id, client_id, platform, url, caption AS detail, published_at
         FROM published_content WHERE agency_id = ?
          AND LOWER(caption) LIKE ?${clientFilter}
        ORDER BY published_at DESC LIMIT 10`,
      [agencyId, like, ...scopeParams]),
  };

  const total = Object.values(results).reduce((n, r) => n + r.length, 0);
  return {
    query: q,
    total,
    results,
    ranking: 'Relevance within each category, then trend velocity, engagement and recency.',
    note: total === 0
      ? 'Nothing stored matches that yet. Search covers research this system has already collected, not the live web.'
      : undefined,
  };
});

// --- notifications -----------------------------------------------------------
adminRouter.get('/api/notifications', async ({ principal }) => {
  requirePermission(principal, 'notification:read');
  const user = find('users', principal.agencyId, principal.userId);
  const items = forUser(principal.agencyId, user, { limit: 50 });
  return { notifications: items, unread: items.filter((n) => n.status === 'unread').length };
});

adminRouter.post('/api/notifications/:notificationId/read', async ({ principal, params }) => {
  requirePermission(principal, 'notification:read');
  const item = find('notifications', principal.agencyId, params.notificationId);
  if (!item) throw notFound('Notification not found');
  return { notification: update('notifications', principal.agencyId, item.id, { status: 'read', read_at: now() }) };
});

// --- audit log (§42) ---------------------------------------------------------
adminRouter.get('/api/audit', async ({ principal, query }) => {
  requirePermission(principal, 'audit:read');
  const filters = {};
  if (query.get('client_id')) {
    resolveClient(principal, query.get('client_id'));
    filters.client_id = query.get('client_id');
  } else if (principal.clientScope.length) {
    filters.client_id = principal.clientScope;
  }
  if (query.get('object_type')) filters.object_type = query.get('object_type');
  if (query.get('object_id')) filters.object_id = query.get('object_id');
  if (query.get('actor_type')) filters.actor_type = query.get('actor_type');

  return {
    entries: list('audit_logs', principal.agencyId, filters,
      { orderBy: 'occurred_at DESC', limit: Number(query.get('limit') ?? 100) }),
  };
});

// --- prompt management (§49) -------------------------------------------------
adminRouter.get('/api/prompts', async ({ principal }) => {
  requirePermission(principal, 'automation:write');
  const keys = [...new Set(DEFAULT_PROMPTS.map((p) => p.key))];
  return {
    prompts: keys.map((key) => {
      const history = promptHistory(principal.agencyId, key);
      const active = history.find((h) => h.is_active && h.agency_id === principal.agencyId)
        ?? history.find((h) => h.is_active);
      return {
        key,
        agent: active?.agent,
        task: active?.task,
        active_version: active?.version,
        is_override: Boolean(active?.agency_id),
        template: active?.template,
        versions: history.map((h) => ({
          id: h.id, version: h.version, is_active: Boolean(h.is_active),
          scope: h.client_id ? 'client' : h.agency_id ? 'agency' : 'system',
          notes: h.notes, created_at: h.created_at,
        })),
      };
    }),
    agents: AGENT_CATALOGUE,
  };
});

adminRouter.post('/api/prompts/:key', async ({ principal, params, body }) => {
  requirePermission(principal, 'automation:write');
  const input = validate(body, {
    template: { type: 'string', required: true, minLength: 20, maxLength: 20_000 },
    notes: { type: 'string', maxLength: 500 },
    client_id: { type: 'string' },
    platform: { type: 'string' },
  });
  if (input.client_id) resolveClient(principal, input.client_id);

  const base = DEFAULT_PROMPTS.find((p) => p.key === params.key);
  if (!base) throw notFound(`Unknown prompt key "${params.key}"`);

  const version = publishPromptVersion({
    agencyId: principal.agencyId,
    clientId: input.client_id ?? null,
    key: params.key,
    platform: input.platform ?? null,
    agent: base.agent, task: base.task,
    template: input.template, notes: input.notes, userId: principal.userId,
  });

  audit({
    agencyId: principal.agencyId, clientId: input.client_id ?? null,
    actorType: 'user', actorId: principal.userId,
    action: 'prompt.version_published', objectType: 'prompt_versions', objectId: version.id,
    next: { key: params.key, version: version.version },
  });
  return { prompt: version };
});

// --- ops ---------------------------------------------------------------------
adminRouter.get('/api/system/status', async ({ principal }) => {
  requirePermission(principal, 'automation:read');
  const agency = find('agencies', principal.agencyId, principal.agencyId);
  return {
    ai_provider: providerName(),
    ai_model: config.ai.model,
    research_enabled: config.research.enabled,
    automation_paused: Boolean(agency.automation_paused),
    thresholds: config.thresholds,
    limits: config.limits,
    platforms: capabilityMatrix(),
    queue: queueStats(),
    agents: AGENT_CATALOGUE,
  };
});
