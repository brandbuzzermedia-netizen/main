import { AppError } from './errors.js';
import { log } from './logger.js';

/** Minimal HTTP plumbing: JSON bodies, cookies, a path router, error mapping. */

const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** @param {import('node:http').IncomingMessage} req */
export async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new AppError(413, 'payload_too_large', 'Request body too large');
    chunks.push(chunk);
  }
  if (!size) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); }
  catch { throw new AppError(400, 'invalid_json', 'Request body is not valid JSON'); }
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload ?? null);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
  });
  res.end(body);
}

export function sendError(res, err, requestId) {
  const known = err instanceof AppError;
  const status = known ? err.status : 500;
  if (!known || status >= 500) {
    log.error('request_failed', { requestId, err: String(err?.stack ?? err) });
  }
  sendJson(res, status, {
    error: {
      code: known ? err.code : 'internal_error',
      message: known ? err.message : 'Internal error',
      ...(known && err.details ? { details: err.details } : {}),
      ...(err?.name === 'ManualActionRequired'
        ? { status: 'MANUAL_ACTION_REQUIRED', platform: err.platform, how_to: err.howTo }
        : {}),
      request_id: requestId,
    },
  });
}

/** @param {import('node:http').IncomingMessage} req */
export function parseCookies(req) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, { maxAge, secure = process.env.NODE_ENV === 'production' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  const existing = res.getHeader('set-cookie');
  const list = existing ? [].concat(existing) : [];
  list.push(parts.join('; '));
  res.setHeader('set-cookie', list);
}

/**
 * Path router with `:param` segments.
 * Routes are matched in registration order; the first match wins.
 */
export class Router {
  constructor() { /** @type {any[]} */ this.routes = []; }

  /** @param {string} method @param {string} pattern @param {Function} handler @param {{permission?:string, auth?:boolean}} [opts] */
  add(method, pattern, handler, opts = {}) {
    const segments = pattern.split('/').filter(Boolean);
    this.routes.push({ method, segments, handler, opts, pattern });
    return this;
  }

  get(p, h, o) { return this.add('GET', p, h, o); }
  post(p, h, o) { return this.add('POST', p, h, o); }
  patch(p, h, o) { return this.add('PATCH', p, h, o); }
  put(p, h, o) { return this.add('PUT', p, h, o); }
  delete(p, h, o) { return this.add('DELETE', p, h, o); }

  /** @param {string} method @param {string} pathname */
  match(method, pathname) {
    const parts = pathname.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method || route.segments.length !== parts.length) continue;
      /** @type {Record<string,string>} */
      const params = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) { ok = false; break; }
      }
      if (ok) return { route, params };
    }
    return null;
  }
}
