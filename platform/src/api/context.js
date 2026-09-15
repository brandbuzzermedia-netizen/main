import { one } from '../db/index.js';
import { decode, find, insert, update } from '../db/repo.js';
import { hashPassword, newSessionToken, sha256, verifyPassword } from '../core/crypto.js';
import { badRequest, forbidden, unauthorized } from '../core/errors.js';
import { assertClientAccess } from '../core/tenancy.js';
import { require_ } from '../core/rbac.js';
import { config } from '../config.js';
import { audit } from '../core/audit.js';
import { isoIn, now } from '../core/ids.js';
import { setCookie } from '../core/http.js';

/**
 * Request context: who is calling, for which agency, and which client they are
 * allowed to touch. Every authenticated route receives a Principal built here —
 * routes never read the session cookie themselves.
 */

/** @typedef {import('../core/tenancy.js').Principal & {user:any}} Principal */

const MAX_FAILED_WINDOW_MS = 15 * 60_000;
/** @type {Map<string, {count:number, first:number}>} */
const failedLogins = new Map();

/** @param {import('node:http').IncomingMessage} req */
export function authenticate(req, cookies) {
  const token = cookies[config.session.cookieName]
    ?? String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw unauthorized();

  const session = one(
    `SELECT * FROM sessions WHERE id = ? AND status = 'active' AND expires_at > ?`,
    [sha256(token), now()],
  );
  if (!session) throw unauthorized('Session expired or invalid');

  const user = find('users', session.agency_id, session.user_id);
  if (!user || user.status !== 'active') throw unauthorized('Account is not active');

  return {
    userId: user.id,
    agencyId: user.agency_id,
    role: user.role,
    clientScope: user.client_scope ?? [],
    user: serializeUser(user),
    sessionId: session.id,
  };
}

/** @param {{agencyId:string, email:string, password:string, ip?:string, userAgent?:string}} input */
export function login(res, input) {
  const key = `${input.agencyId}:${input.email}`;
  const record = failedLogins.get(key);
  if (record && Date.now() - record.first < MAX_FAILED_WINDOW_MS && record.count >= 8) {
    throw forbidden('Too many failed attempts. Try again in a few minutes.');
  }

  const row = one('SELECT * FROM users WHERE agency_id = ? AND email = ?', [input.agencyId, input.email]);
  const user = row ? decode(row) : null;

  // Always run a verification so a missing user and a wrong password take the
  // same time — no user enumeration through response timing.
  const ok = verifyPassword(input.password, user?.password_hash ?? PLACEHOLDER_HASH);

  if (!user || !ok || user.status !== 'active') {
    failedLogins.set(key, record && Date.now() - record.first < MAX_FAILED_WINDOW_MS
      ? { count: record.count + 1, first: record.first }
      : { count: 1, first: Date.now() });
    audit({
      agencyId: input.agencyId, actorType: 'user', actorLabel: input.email,
      action: 'auth.login_failed', result: 'failure', ip: input.ip,
    });
    throw unauthorized('Email or password is incorrect');
  }

  failedLogins.delete(key);
  const { token, digest } = newSessionToken();
  insert('sessions', {
    id: digest,
    agency_id: user.agency_id,
    user_id: user.id,
    expires_at: isoIn(config.session.ttlMinutes),
    ip: input.ip ?? null,
    user_agent: String(input.userAgent ?? '').slice(0, 300),
  });
  update('users', user.agency_id, user.id, { last_login_at: now() });

  setCookie(res, config.session.cookieName, token, { maxAge: config.session.ttlMinutes * 60 });
  audit({
    agencyId: user.agency_id, actorType: 'user', actorId: user.id,
    action: 'auth.login', ip: input.ip,
  });

  return { token, user: serializeUser(user) };
}

export function logout(res, principal) {
  update('sessions', principal.agencyId, principal.sessionId, { status: 'revoked' });
  setCookie(res, config.session.cookieName, '', { maxAge: 0 });
  audit({ agencyId: principal.agencyId, actorType: 'user', actorId: principal.userId, action: 'auth.logout' });
  return { ok: true };
}

/** A user row as it may appear in an API response. No password hash, ever. */
export function serializeUser(user) {
  return {
    id: user.id,
    agency_id: user.agency_id,
    email: user.email,
    name: user.name,
    role: user.role,
    client_scope: user.client_scope ?? [],
    notification_prefs: user.notification_prefs ?? {},
    last_login_at: user.last_login_at,
    status: user.status,
  };
}

/**
 * Resolve the client named by a request and check the caller may see it.
 * Every client-scoped route goes through this.
 */
export function resolveClient(principal, clientId) {
  if (!clientId) throw badRequest('A client id is required');
  const client = find('clients', principal.agencyId, clientId);
  return assertClientAccess(principal, client);
}

/** @param {Principal} principal @param {string} permission */
export function requirePermission(principal, permission) {
  require_({ role: principal.role }, permission);
}

export { hashPassword };

// A valid scrypt hash of a value nobody knows, used for constant-time misses.
const PLACEHOLDER_HASH = hashPassword('placeholder-for-constant-time-comparison');
