#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, readJson, sendJson, sendError, parseCookies } from './core/http.js';
import { authenticate, requirePermission } from './api/context.js';
import { coreRouter } from './api/routes-core.js';
import { intelRouter } from './api/routes-intel.js';
import { contentRouter } from './api/routes-content.js';
import { adminRouter } from './api/routes-admin.js';
import { migrate } from './db/index.js';
import { seedDefaultPrompts } from './ai/prompts.js';
import { assertProductionConfig, config } from './config.js';
import { AppError, notFound, tooMany } from './core/errors.js';
import { log } from './core/logger.js';
import { newId } from './core/ids.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(HERE, '..', 'web');

/** Every router, in match order. */
const routers = [coreRouter, intelRouter, contentRouter, adminRouter];

/** Routes that do not require a session. */
const PUBLIC = new Set(['POST /api/auth/login', 'GET /api/oauth/:platform/callback', 'GET /api/health']);

// --- coarse per-IP rate limiting --------------------------------------------
/** @type {Map<string, {count:number, resetAt:number}>} */
const buckets = new Map();
function rateLimit(ip) {
  const nowMs = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || nowMs > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: nowMs + 60_000 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > config.limits.apiRequestsPerMinute) {
    throw tooMany('Too many requests. Slow down.', { retry_after_seconds: Math.ceil((bucket.resetAt - nowMs) / 1000) });
  }
}

const server = createServer(async (req, res) => {
  const requestId = newId('req');
  const started = Date.now();
  res.setHeader('x-request-id', requestId);

  try {
    const url = new URL(req.url ?? '/', config.baseUrl);
    const pathname = url.pathname;

    if (pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, service: 'social-os', version: '0.1.0' });
    }

    if (!pathname.startsWith('/api/')) {
      return serveStatic(pathname, res);
    }

    rateLimit(req.socket?.remoteAddress ?? 'unknown');

    for (const router of routers) {
      const match = router.match(req.method ?? 'GET', pathname);
      if (!match) continue;

      const key = `${req.method} /${match.route.segments.join('/')}`;
      const cookies = parseCookies(req);
      const principal = PUBLIC.has(key) || match.route.opts.auth === false
        ? null
        : authenticate(req, cookies);

      if (principal && match.route.opts.permission) {
        requirePermission(principal, match.route.opts.permission);
      }

      const body = ['POST', 'PATCH', 'PUT'].includes(req.method ?? '') ? await readJson(req) : {};
      const result = await match.route.handler({
        req, res, principal, params: match.params, query: url.searchParams, body, requestId,
      });

      log.info('request', {
        requestId, method: req.method, path: pathname,
        user: principal?.userId, ms: Date.now() - started,
      });

      if (res.writableEnded) return undefined;       // handler wrote its own response
      return sendJson(res, result === undefined ? 204 : 200, result ?? null);
    }

    throw notFound(`No route for ${req.method} ${pathname}`);
  } catch (err) {
    if (res.writableEnded) return undefined;
    return sendError(res, err, requestId);
  }
});

/** Static file serving for the SPA, with traversal protection. */
async function serveStatic(pathname, res) {
  const relative = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(WEB_ROOT, relative);
  if (!filePath.startsWith(WEB_ROOT)) {
    return sendError(res, new AppError(403, 'forbidden', 'Forbidden'), null);
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': extname(filePath) === '.html' ? 'no-store' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    });
    return res.end(body);
  } catch {
    // Unknown paths fall back to the SPA shell so client-side routes work.
    try {
      const shell = await readFile(join(WEB_ROOT, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(shell);
    } catch {
      return sendError(res, notFound('Not found'), null);
    }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function start() {
  assertProductionConfig();
  migrate();
  seedDefaultPrompts();
  server.listen(config.port, () => {
    log.info('server_started', {
      port: config.port, env: config.env,
      ai_provider: config.ai.provider, base_url: config.baseUrl,
    });
  });
  return server;
}

export { server };

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      log.info('server_stopping', { signal });
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    });
  }
}
