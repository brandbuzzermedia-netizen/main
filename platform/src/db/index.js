import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../core/logger.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, '..', '..', 'db', 'schema.sql');

/**
 * Database access.
 *
 * Dev/CI runs on SQLite through node's built-in driver, so the platform has no
 * runtime dependencies. The schema and every query are written in the SQL
 * subset shared with PostgreSQL; docs/ARCHITECTURE.md describes the production
 * deployment, where DATABASE_URL points at Postgres and this module is the one
 * place that changes.
 */

/** @type {DatabaseSync|null} */
let db = null;

export function getDb() {
  if (db) return db;
  const file = process.env.DATABASE_FILE ?? join(HERE, '..', '..', 'data', 'social-os.db');
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

export function closeDb() {
  if (db) { db.close(); db = null; }
}

/** Apply the schema. Idempotent — every statement is CREATE ... IF NOT EXISTS. */
export function migrate() {
  const conn = getDb();
  conn.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  const version = '0001_initial';
  const exists = conn.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version);
  if (!exists) {
    conn.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(version, new Date().toISOString());
    log.info('migration_applied', { version });
  }
  return version;
}

/** @param {string} sql @param {any[]} [params] */
export function all(sql, params = []) {
  return getDb().prepare(sql).all(...params).map(toPlain);
}

/** @param {string} sql @param {any[]} [params] */
export function one(sql, params = []) {
  const row = getDb().prepare(sql).get(...params);
  return row ? toPlain(row) : undefined;
}

/** @param {string} sql @param {any[]} [params] */
export function run(sql, params = []) {
  return getDb().prepare(sql).run(...params);
}

/** Run `fn` inside a transaction; rolls back on any throw. */
export function tx(fn) {
  const conn = getDb();
  conn.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    conn.exec('COMMIT');
    return result;
  } catch (err) {
    try { conn.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

/** node:sqlite returns null-prototype objects; normalise for JSON and spread. */
function toPlain(row) {
  return { ...row };
}
