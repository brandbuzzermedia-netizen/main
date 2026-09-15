import { Router } from '../core/http.js';
import { validate } from '../core/validate.js';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { find, findBy, insert, list, update, count } from '../db/repo.js';
import { login, logout, resolveClient, requirePermission, serializeUser, hashPassword } from './context.js';
import { capabilityMatrix, getAdapter, PLATFORMS, isOAuthConfigured, XAdapter } from '../platforms/registry.js';
import { serializeAccount, storeCredentials } from '../services/credentials.js';
import { audit } from '../core/audit.js';
import { notify } from '../services/notifications.js';
import { ROLES } from '../core/rbac.js';
import { newId, isoIn, now } from '../core/ids.js';
import { one } from '../db/index.js';
import { config } from '../config.js';

/** Authentication, agency, users, clients, onboarding and social accounts. */
export const coreRouter = new Router();

// --- auth --------------------------------------------------------------------
coreRouter.post('/api/auth/login', async ({ body, res, req }) => {
  const input = validate(body, {
    agency_slug: { type: 'string', required: true },
    email: { type: 'email', required: true },
    password: { type: 'string', required: true, minLength: 1 },
  });
  const agency = one('SELECT * FROM agencies WHERE slug = ?', [input.agency_slug]);
  if (!agency) throw notFound('Agency not found');
  return login(res, {
    agencyId: agency.id,
    email: input.email,
    password: input.password,
    ip: req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
  });
}, { auth: false });

coreRouter.post('/api/auth/logout', async ({ principal, res }) => logout(res, principal));

coreRouter.get('/api/auth/me', async ({ principal }) => {
  const agency = find('agencies', principal.agencyId, principal.agencyId);
  return {
    user: principal.user,
    agency: {
      id: agency.id, name: agency.name, slug: agency.slug, plan: agency.plan,
      automation_paused: Boolean(agency.automation_paused),
      paused_reason: agency.paused_reason,
    },
    ai_provider: config.ai.provider,
  };
});

// --- users -------------------------------------------------------------------
coreRouter.get('/api/users', async ({ principal }) => {
  requirePermission(principal, 'client:read');
  return { users: list('users', principal.agencyId, { status: 'active' }, { limit: 200 }).map(serializeUser) };
});

coreRouter.post('/api/users', async ({ principal, body }) => {
  requirePermission(principal, 'client:write');
  const input = validate(body, {
    email: { type: 'email', required: true },
    name: { type: 'string', required: true, maxLength: 120 },
    password: { type: 'string', required: true, minLength: 12, maxLength: 200 },
    role: { type: 'enum', enum: ROLES, required: true },
    client_scope: { type: 'array', default: [] },
  });
  if (findBy('users', principal.agencyId, { email: input.email })) {
    throw conflict('A user with that email already exists in this agency');
  }
  const user = insert('users', {
    agency_id: principal.agencyId,
    email: input.email, name: input.name, role: input.role,
    password_hash: hashPassword(input.password),
    client_scope: input.client_scope,
  });
  audit({
    agencyId: principal.agencyId, actorType: 'user', actorId: principal.userId,
    action: 'user.created', objectType: 'users', objectId: user.id,
    next: { email: user.email, role: user.role },
  });
  return { user: serializeUser(user) };
});

// --- clients -----------------------------------------------------------------
coreRouter.get('/api/clients', async ({ principal }) => {
  requirePermission(principal, 'client:read');
  const filters = principal.clientScope.length ? { id: principal.clientScope } : {};
  const clients = list('clients', principal.agencyId, { ...filters, status: 'active' },
    { orderBy: 'name ASC', limit: 200 });
  return {
    clients: clients.map((c) => ({
      ...c,
      automation_paused: Boolean(c.automation_paused),
      onboarding_complete: Boolean(c.onboarding_complete),
      counts: {
        accounts: count('social_accounts', principal.agencyId, { client_id: c.id, status: 'active' }),
        trends: count('trending_topics', principal.agencyId, { client_id: c.id, status: 'active' }),
        opportunities: count('engagement_opportunities', principal.agencyId, { client_id: c.id, status: 'new' }),
        pending_approvals: count('approval_items', principal.agencyId, { client_id: c.id, status: 'pending' }),
      },
    })),
  };
});

coreRouter.post('/api/clients', async ({ principal, body }) => {
  requirePermission(principal, 'client:write');
  const input = validate(body, {
    name: { type: 'string', required: true, maxLength: 120 },
    company_name: { type: 'string', maxLength: 200 },
    website: { type: 'string', maxLength: 300 },
    industry: { type: 'string', maxLength: 120 },
    location: { type: 'string', maxLength: 200 },
    description: { type: 'string', maxLength: 4000 },
    products: { type: 'array', default: [] },
    target_audience: { type: 'string', maxLength: 2000 },
    target_geography: { type: 'array', default: [] },
  });
  if (findBy('clients', principal.agencyId, { name: input.name })) {
    throw conflict('A client with that name already exists');
  }
  const client = insert('clients', { agency_id: principal.agencyId, ...input, onboarding_step: 'brand' });
  insert('brand_profiles', { agency_id: principal.agencyId, client_id: client.id });
  audit({
    agencyId: principal.agencyId, clientId: client.id, actorType: 'user', actorId: principal.userId,
    action: 'client.created', objectType: 'clients', objectId: client.id, next: input,
  });
  return { client };
});

coreRouter.get('/api/clients/:id', async ({ principal, params }) => {
  requirePermission(principal, 'client:read');
  const client = resolveClient(principal, params.id);
  const agencyId = principal.agencyId;
  return {
    client: { ...client, automation_paused: Boolean(client.automation_paused), onboarding_complete: Boolean(client.onboarding_complete) },
    brand_profile: findBy('brand_profiles', agencyId, { client_id: client.id }) ?? null,
    content_pillars: list('content_pillars', agencyId, { client_id: client.id, status: 'active' }, { limit: 50 }),
    keywords: list('keywords', agencyId, { client_id: client.id, status: 'active' }, { limit: 300 }),
    competitors: list('competitors', agencyId, { client_id: client.id, status: 'active' }, { limit: 50 }),
    social_accounts: list('social_accounts', agencyId, { client_id: client.id, status: 'active' }, { limit: 50 }).map(serializeAccount),
    automation: list('automation_rules', agencyId, { client_id: client.id, status: 'active' }, { limit: 50 }),
  };
});

coreRouter.patch('/api/clients/:id', async ({ principal, params, body }) => {
  requirePermission(principal, 'client:write');
  const client = resolveClient(principal, params.id);
  const input = validate(body, {
    name: { type: 'string', maxLength: 120 },
    company_name: { type: 'string', maxLength: 200 },
    website: { type: 'string', maxLength: 300 },
    industry: { type: 'string', maxLength: 120 },
    location: { type: 'string', maxLength: 200 },
    description: { type: 'string', maxLength: 4000 },
    products: { type: 'array' },
    target_audience: { type: 'string', maxLength: 2000 },
    target_geography: { type: 'array' },
    onboarding_step: { type: 'string', maxLength: 40 },
    onboarding_complete: { type: 'boolean' },
  });
  const updated = update('clients', principal.agencyId, client.id, input);
  audit({
    agencyId: principal.agencyId, clientId: client.id, actorType: 'user', actorId: principal.userId,
    action: 'client.updated', objectType: 'clients', objectId: client.id,
    previous: client, next: input,
  });
  return { client: updated };
});

// --- onboarding: brand voice, pillars, keywords, competitors ------------------
coreRouter.put('/api/clients/:id/brand-profile', async ({ principal, params, body }) => {
  requirePermission(principal, 'client:write');
  const client = resolveClient(principal, params.id);
  const input = validate(body, {
    tone: { type: 'string', maxLength: 300 },
    personality: { type: 'string', maxLength: 300 },
    formality: { type: 'enum', enum: ['casual', 'balanced', 'formal'], default: 'balanced' },
    language: { type: 'string', maxLength: 20, default: 'en' },
    preferred_vocabulary: { type: 'array', default: [] },
    words_to_avoid: { type: 'array', default: [] },
    emoji_preference: { type: 'enum', enum: ['none', 'sparing', 'liberal'], default: 'sparing' },
    cta_style: { type: 'string', maxLength: 500 },
    comment_style: { type: 'string', maxLength: 1000 },
    compliance_notes: { type: 'string', maxLength: 4000 },
  });
  const existing = findBy('brand_profiles', principal.agencyId, { client_id: client.id });
  const profile = existing
    ? update('brand_profiles', principal.agencyId, existing.id, input)
    : insert('brand_profiles', { agency_id: principal.agencyId, client_id: client.id, ...input });
  audit({
    agencyId: principal.agencyId, clientId: client.id, actorType: 'user', actorId: principal.userId,
    action: 'brand_profile.updated', objectType: 'brand_profiles', objectId: profile.id,
    previous: existing, next: input,
  });
  return { brand_profile: profile };
});

coreRouter.post('/api/clients/:id/pillars', async ({ principal, params, body }) => {
  requirePermission(principal, 'client:write');
  const client = resolveClient(principal, params.id);
  const input = validate(body, {
    name: { type: 'string', required: true, maxLength: 120 },
    kind: { type: 'enum', required: true, enum: [
      'educational', 'promotional', 'behind_the_scenes', 'customer_stories',
      'industry_news', 'trending', 'faq', 'thought_leadership'] },
    description: { type: 'string', maxLength: 1000 },
    target_share: { type: 'number', min: 0, max: 100, default: 0 },
  });
  const pillar = insert('content_pillars', { agency_id: principal.agencyId, client_id: client.id, ...input });
  return { pillar };
});

coreRouter.post('/api/clients/:id/keywords', async ({ principal, params, body }) => {
  requirePermission(principal, 'client:write');
  const client = resolveClient(principal, params.id);
  const input = validate(body, {
    keywords: {
      type: 'array', required: true, max: 200,
      items: {
        type: 'object',
        of: {
          term: { type: 'string', required: true, maxLength: 120 },
          kind: { type: 'enum', required: true, enum: ['primary', 'secondary', 'product', 'industry', 'location', 'competitor', 'hashtag'] },
          weight: { type: 'number', min: 0, max: 100, default: 50 },
        },
      },
    },
  });
  const created = [];
  for (const kw of input.keywords) {
    if (findBy('keywords', principal.agencyId, { client_id: client.id, term: kw.term, kind: kw.kind })) continue;
    created.push(insert('keywords', { agency_id: principal.agencyId, client_id: client.id, ...kw }));
  }
  audit({
    agencyId: principal.agencyId, clientId: client.id, actorType: 'user', actorId: principal.userId,
    action: 'keywords.added', objectType: 'clients', objectId: client.id, next: { count: created.length },
  });
  return { keywords: created, skipped: input.keywords.length - created.length };
});

coreRouter.delete('/api/clients/:id/keywords/:keywordId', async ({ principal, params }) => {
  requirePermission(principal, 'client:write');
  resolveClient(principal, params.id);
  update('keywords', principal.agencyId, params.keywordId, { status: 'archived' });
  return { ok: true };
});

coreRouter.post('/api/clients/:id/competitors', async ({ principal, params, body }) => {
  requirePermission(principal, 'competitor:write');
  const client = resolveClient(principal, params.id);
  const input = validate(body, {
    name: { type: 'string', required: true, maxLength: 160 },
    website: { type: 'string', maxLength: 300 },
    handles: { type: 'object', default: {} },
    notes: { type: 'string', maxLength: 2000 },
  });
  return { competitor: insert('competitors', { agency_id: principal.agencyId, client_id: client.id, ...input }) };
});

// --- platforms and social accounts -------------------------------------------
coreRouter.get('/api/platforms', async () => ({ platforms: capabilityMatrix() }));

coreRouter.get('/api/clients/:id/accounts', async ({ principal, params }) => {
  requirePermission(principal, 'account:read');
  const client = resolveClient(principal, params.id);
  return {
    accounts: list('social_accounts', principal.agencyId, { client_id: client.id, status: 'active' }, { limit: 50 })
      .map(serializeAccount),
    available: capabilityMatrix(),
  };
});

/** Begin OAuth. Returns the platform's own authorisation URL. */
coreRouter.post('/api/clients/:id/accounts/:platform/connect', async ({ principal, params }) => {
  requirePermission(principal, 'account:write');
  const client = resolveClient(principal, params.id);
  if (!PLATFORMS.includes(params.platform)) throw badRequest(`Unknown platform "${params.platform}"`);
  if (!isOAuthConfigured(params.platform)) {
    throw badRequest(
      `This deployment has no ${params.platform} app credentials configured.`,
      { hint: 'Set the platform’s client id and secret in the environment. See docs/ENVIRONMENT.md.' },
    );
  }

  const adapter = getAdapter(params.platform);
  const state = newId('oauth');
  const pkce = params.platform === 'x' ? XAdapter.pkce() : { verifier: '', challenge: '' };
  const redirectUri = `${config.baseUrl}/api/oauth/${params.platform}/callback`;

  insert('oauth_states', {
    id: state,
    agency_id: principal.agencyId,
    client_id: client.id,
    platform: params.platform,
    verifier: pkce.verifier,
    redirect_uri: redirectUri,
    expires_at: isoIn(15),
  });

  audit({
    agencyId: principal.agencyId, clientId: client.id, actorType: 'user', actorId: principal.userId,
    action: 'account.oauth_started', platform: params.platform,
  });

  return {
    authorize_url: adapter.authorizeUrl({ state, redirectUri, codeChallenge: pkce.challenge }),
    required_scopes: /** @type {any} */ (adapter.constructor).requiredScopes,
  };
});

/** OAuth callback. Exchanges the code and seals the tokens. */
coreRouter.get('/api/oauth/:platform/callback', async ({ query, res }) => {
  const state = query.get('state');
  const code = query.get('code');
  if (!state || !code) throw badRequest('Missing state or code');

  const pending = one(`SELECT * FROM oauth_states WHERE id = ? AND status = 'pending' AND expires_at > ?`, [state, now()]);
  if (!pending) throw badRequest('This authorisation link has expired. Start the connection again.');

  const adapter = getAdapter(pending.platform);
  const creds = await adapter.exchangeCode({
    code, redirectUri: pending.redirect_uri, codeVerifier: pending.verifier,
  });

  let handle = creds.handle;
  let externalId = creds.externalId;
  try {
    const verified = await adapter.verify(creds);
    handle ??= verified.handle;
    externalId ??= verified.detail;
  } catch { /* verification is best-effort at connect time */ }

  const existing = findBy('social_accounts', pending.agency_id, {
    client_id: pending.client_id, platform: pending.platform,
  });
  const account = existing
    ? update('social_accounts', pending.agency_id, existing.id, { handle, external_id: externalId })
    : insert('social_accounts', {
        agency_id: pending.agency_id,
        client_id: pending.client_id,
        platform: pending.platform,
        handle: handle ?? null,
        external_id: externalId ?? null,
      });

  storeCredentials(pending.agency_id, account.id, { ...creds, handle, externalId });
  update('oauth_states', pending.agency_id, pending.id, { status: 'used' });

  audit({
    agencyId: pending.agency_id, clientId: pending.client_id, actorType: 'user',
    action: 'account.connected', objectType: 'social_accounts', objectId: account.id,
    platform: pending.platform, next: { handle },
  });

  res.writeHead(302, { location: `/#/accounts?connected=${pending.platform}` });
  res.end();
  return undefined;
}, { auth: false });

/** Re-check a connection against the platform. */
coreRouter.post('/api/accounts/:accountId/verify', async ({ principal, params }) => {
  requirePermission(principal, 'account:read');
  const account = find('social_accounts', principal.agencyId, params.accountId);
  if (!account) throw notFound('Account not found');
  resolveClient(principal, account.client_id);

  const { usableCredentials } = await import('../services/credentials.js');
  const creds = await usableCredentials(principal.agencyId, account);
  if (!creds) return { ok: false, detail: 'No usable credentials — reconnect the account.' };

  try {
    const result = await getAdapter(account.platform).verify(creds);
    update('social_accounts', principal.agencyId, account.id, {
      connection_status: result.ok ? 'connected' : 'error',
      api_status: result.ok ? 'ok' : 'error',
      last_sync_at: now(),
      last_error: result.ok ? null : (result.detail ?? 'Verification failed'),
    });
    return result;
  } catch (err) {
    update('social_accounts', principal.agencyId, account.id, {
      api_status: 'error', last_error: String(err.message ?? err),
    });
    notify({
      agencyId: principal.agencyId, clientId: account.client_id,
      kind: 'account_needs_reconnect', severity: 'warning',
      title: `${account.platform} verification failed`, body: String(err.message ?? err), link: '/accounts',
    });
    return { ok: false, detail: String(err.message ?? err) };
  }
});

coreRouter.delete('/api/accounts/:accountId', async ({ principal, params }) => {
  requirePermission(principal, 'account:write');
  const account = find('social_accounts', principal.agencyId, params.accountId);
  if (!account) throw notFound('Account not found');
  resolveClient(principal, account.client_id);
  update('social_accounts', principal.agencyId, account.id, {
    status: 'archived', connection_status: 'disconnected',
    access_token_enc: null, refresh_token_enc: null,
  });
  audit({
    agencyId: principal.agencyId, clientId: account.client_id, actorType: 'user', actorId: principal.userId,
    action: 'account.disconnected', objectType: 'social_accounts', objectId: account.id, platform: account.platform,
  });
  return { ok: true };
});
