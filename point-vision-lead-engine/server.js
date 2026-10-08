#!/usr/bin/env node
/* Optional shared workspace for Point Vision Lead Engine. No dependencies.

   Serves the app and stores leads + settings in one JSON file so the intern
   and the founder work on the same data. Without this server the app still
   works on its own, saving to each browser's localStorage.

     node server.js                      http://127.0.0.1:8090 (this machine only)
     HOST=0.0.0.0 PV_PASSWORD=secret node server.js   share on your network
     node server.js --empty              start without sample leads

   Env: PORT (8090), HOST (127.0.0.1), PV_PASSWORD (enables HTTP basic auth,
   any username), DATA_FILE (./data/pv-lead-engine.json). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8090;
const HOST = process.env.HOST || '127.0.0.1';
const PASSWORD = process.env.PV_PASSWORD || '';
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'pv-lead-engine.json');
const MAX_BODY = 8 * 1024 * 1024;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const PUBLIC = /^\/(index\.html|css\/[\w.-]+\.css|js\/[\w.-]+\.js|js\/views\/[\w.-]+\.js|assets\/[\w.-]+\.(png|svg))$/;

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { return null; }
}
function save(db) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}

let db = load();
if (!db) {
  const E = require('./js/engine.js');
  const settings = JSON.parse(JSON.stringify(E.DEFAULT_SETTINGS));
  const leads = process.argv.includes('--empty') ? [] : require('./js/seed.js').build(E, settings, new Date());
  db = { settings, settingsUpdatedAt: new Date(0).toISOString(), leads, deleted: [] };
  save(db);
  console.log(`Created ${path.relative(process.cwd(), DATA_FILE)} with ${leads.length} sample leads`);
}

function merge(body) {
  const byId = new Map(db.leads.map((l) => [l.id, l]));
  const tomb = new Map(db.deleted.map((d) => [d.id, d.at]));
  (body.deleted || []).forEach((d) => {
    if (!d || !d.id) return;
    if (!tomb.has(d.id) || tomb.get(d.id) < d.at) tomb.set(d.id, d.at);
  });
  (body.leads || []).forEach((l) => {
    if (!l || !l.id || typeof l.updatedAt !== 'string') return;
    const cur = byId.get(l.id);
    if (!cur || l.updatedAt >= cur.updatedAt) byId.set(l.id, l);
  });
  tomb.forEach((at, id) => { const l = byId.get(id); if (l && l.updatedAt <= at) byId.delete(id); });
  db.leads = Array.from(byId.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  // Keep tombstones for 60 days so offline browsers learn about deletions.
  const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();
  db.deleted = Array.from(tomb, ([id, at]) => ({ id, at })).filter((d) => d.at > cutoff);
  if (body.settings && typeof body.settingsUpdatedAt === 'string' && body.settingsUpdatedAt > (db.settingsUpdatedAt || '')) {
    db.settings = body.settings;
    db.settingsUpdatedAt = body.settingsUpdatedAt;
  }
  save(db);
}

function authorised(req) {
  if (!PASSWORD) return true;
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const pass = Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':');
  const a = Buffer.from(crypto.createHash('sha256').update(pass).digest('hex'));
  const b = Buffer.from(crypto.createHash('sha256').update(PASSWORD).digest('hex'));
  return crypto.timingSafeEqual(a, b);
}

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (!authorised(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Point Vision Lead Engine"' });
    return res.end('Authentication required');
  }
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') return send(res, 200, { app: 'pv-lead-engine' });
  if (url.pathname === '/api/sync' && req.method === 'POST') {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      try { merge(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { return send(res, 400, { error: 'Bad JSON' }); }
      send(res, 200, db);
    });
    return;
  }
  const p = url.pathname === '/' ? '/index.html' : url.pathname;
  if (req.method !== 'GET' || !PUBLIC.test(p)) return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(path.join(ROOT, p), (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, buf, TYPES[path.extname(p)] || 'application/octet-stream');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Point Vision Lead Engine: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (HOST !== '127.0.0.1' && !PASSWORD) console.warn('Warning: listening beyond this machine without PV_PASSWORD. Anyone on the network can read your leads.');
});
