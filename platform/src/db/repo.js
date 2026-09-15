import { all, one, run, getDb } from './index.js';
import { newId, now } from '../core/ids.js';
import { AppError, notFound } from '../core/errors.js';

/**
 * Tenant-scoped repository helpers.
 *
 * Every read and write goes through here, and every one of them requires an
 * agencyId. `assertScope` is the hard stop: a query that would touch rows
 * without an agency predicate throws rather than running. This is the code-level
 * half of tenant isolation (the other half is assertClientAccess in
 * core/tenancy.js).
 */

/**
 * The tenant root. `agencies` has no agency_id column — its own id IS the
 * tenant boundary — so scoped queries against it filter on `id`.
 */
const ROOT_TABLES = new Set(['agencies']);

const AGENCY_SCOPED = new Set([
  'agencies', 'users', 'teams', 'sessions', 'clients', 'brand_profiles', 'content_pillars',
  'keywords', 'competitors', 'social_accounts', 'oauth_states', 'trending_topics',
  'social_posts', 'inspiration_items', 'engagement_opportunities', 'generated_comments',
  'published_comments', 'content_ideas', 'scheduled_content', 'published_content',
  'automation_rules', 'publishing_jobs', 'approval_items', 'action_ledger',
  'analytics', 'ai_recommendations', 'notifications', 'prompt_versions',
  'agent_runs', 'audit_logs',
]);

/** JSON-valued columns, decoded on read and encoded on write. */
const JSON_COLUMNS = new Set([
  'settings', 'client_scope', 'notification_prefs', 'member_ids', 'products',
  'target_geography', 'preferred_vocabulary', 'words_to_avoid', 'handles',
  'scopes', 'score_breakdown', 'platforms', 'sources', 'metrics', 'topics',
  'hashtags', 'media', 'safety_report', 'quality_report', 'retry_history',
  'payload', 'config', 'risk_flags',
]);

/** Which column carries the tenant boundary for this table. */
function scopeColumn(table) {
  return ROOT_TABLES.has(table) ? 'id' : 'agency_id';
}

function assertScope(table, agencyId) {
  if (!AGENCY_SCOPED.has(table)) {
    throw new AppError(500, 'unknown_table', `Unknown table "${table}"`);
  }
  if (!agencyId) {
    throw new AppError(500, 'tenant_scope_missing',
      `Refusing to query ${table} without an agency scope`);
  }
}

/** @param {Record<string,any>} row */
export function decode(row) {
  if (!row) return row;
  /** @type {Record<string, any>} */
  const out = { ...row };
  for (const col of Object.keys(out)) {
    if (JSON_COLUMNS.has(col) && typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col]); } catch { /* keep raw */ }
    }
  }
  return out;
}

function encode(values) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue;
    if (JSON_COLUMNS.has(k) && typeof v === 'object' && v !== null) out[k] = JSON.stringify(v);
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else out[k] = v;
  }
  return out;
}

/**
 * Build a WHERE clause from a simple filter object.
 * Supported: scalar equality, arrays (IN), `{op, value}` for comparisons,
 * and `null` for IS NULL.
 */
function buildWhere(filters) {
  const clauses = [];
  const params = [];
  for (const [column, condition] of Object.entries(filters)) {
    if (condition === undefined) continue;
    if (condition === null) { clauses.push(`${column} IS NULL`); continue; }
    if (Array.isArray(condition)) {
      if (condition.length === 0) { clauses.push('1 = 0'); continue; }
      clauses.push(`${column} IN (${condition.map(() => '?').join(', ')})`);
      params.push(...condition);
      continue;
    }
    if (typeof condition === 'object' && 'op' in condition) {
      const op = { gt: '>', gte: '>=', lt: '<', lte: '<=', ne: '!=', like: 'LIKE' }[condition.op];
      if (!op) throw new AppError(500, 'bad_filter', `Unsupported operator ${condition.op}`);
      clauses.push(`${column} ${op} ?`);
      params.push(condition.value);
      continue;
    }
    clauses.push(`${column} = ?`);
    params.push(typeof condition === 'boolean' ? (condition ? 1 : 0) : condition);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const SAFE_ORDER = /^[a-z_]+ (ASC|DESC)$/i;

/**
 * @param {string} table
 * @param {string} agencyId
 * @param {Record<string,any>} [filters]
 * @param {{orderBy?:string, limit?:number, offset?:number, columns?:string}} [opts]
 */
export function list(table, agencyId, filters = {}, opts = {}) {
  assertScope(table, agencyId);
  const { sql: where, params } = buildWhere({ [scopeColumn(table)]: agencyId, ...filters });
  let sql = `SELECT ${opts.columns ?? '*'} FROM ${table} ${where}`;
  if (opts.orderBy) {
    for (const part of opts.orderBy.split(',').map((s) => s.trim())) {
      if (!SAFE_ORDER.test(part)) throw new AppError(500, 'bad_order', `Unsafe ORDER BY: ${part}`);
    }
    sql += ` ORDER BY ${opts.orderBy}`;
  }
  const limit = Math.min(Number(opts.limit ?? 100), 500);
  sql += ` LIMIT ${limit} OFFSET ${Math.max(0, Number(opts.offset ?? 0))}`;
  return all(sql, params).map(decode);
}

export function count(table, agencyId, filters = {}) {
  assertScope(table, agencyId);
  const { sql: where, params } = buildWhere({ [scopeColumn(table)]: agencyId, ...filters });
  const row = one(`SELECT COUNT(*) AS n FROM ${table} ${where}`, params);
  return Number(row?.n ?? 0);
}

/** @param {string} table @param {string} agencyId @param {string} id */
export function find(table, agencyId, id) {
  assertScope(table, agencyId);
  if (ROOT_TABLES.has(table)) {
    // On the tenant root, the only row in scope is the caller's own agency.
    if (id !== agencyId) return undefined;
    const root = one(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    return root ? decode(root) : undefined;
  }
  const row = one(`SELECT * FROM ${table} WHERE id = ? AND agency_id = ?`, [id, agencyId]);
  return row ? decode(row) : undefined;
}

export function findOrFail(table, agencyId, id, label = 'Record') {
  const row = find(table, agencyId, id);
  if (!row) throw notFound(`${label} not found`);
  return row;
}

export function findBy(table, agencyId, filters, opts = {}) {
  return list(table, agencyId, filters, { ...opts, limit: 1 })[0];
}

/** @param {string} table @param {Record<string,any>} values */
export function insert(table, values) {
  assertScope(table, ROOT_TABLES.has(table) ? values.id : values.agency_id);
  const ts = now();
  const row = encode({
    id: values.id ?? newId(),
    created_at: ts,
    updated_at: ts,
    ...values,
  });
  const columns = Object.keys(row);
  run(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((c) => row[c]),
  );
  return find(table, ROOT_TABLES.has(table) ? row.id : values.agency_id, row.id);
}

/** @param {string} table @param {string} agencyId @param {string} id @param {Record<string,any>} patch */
export function update(table, agencyId, id, patch) {
  assertScope(table, agencyId);
  const row = encode({ ...patch, updated_at: now() });
  delete row.id;
  delete row.agency_id;
  delete row.created_at;
  const columns = Object.keys(row);
  if (!columns.length) return find(table, agencyId, id);
  const result = ROOT_TABLES.has(table)
    ? run(
        `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((c) => row[c]), id],
      )
    : run(
        `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND agency_id = ?`,
        [...columns.map((c) => row[c]), id, agencyId],
      );
  if (Number(result.changes) === 0) throw notFound('Record not found');
  return find(table, agencyId, id);
}

/** Soft delete by default — audit trails should survive deletion. */
export function archive(table, agencyId, id) {
  return update(table, agencyId, id, { status: 'archived' });
}

export function hardDelete(table, agencyId, id) {
  assertScope(table, agencyId);
  if (ROOT_TABLES.has(table)) return run(`DELETE FROM ${table} WHERE id = ?`, [id]);
  return run(`DELETE FROM ${table} WHERE id = ? AND agency_id = ?`, [id, agencyId]);
}

/** Escape hatch for reporting queries; still requires an explicit agency param. */
export function rawScoped(sql, agencyId, params = []) {
  if (!agencyId) throw new AppError(500, 'tenant_scope_missing', 'rawScoped requires an agency id');
  if (!/agency_id\s*=\s*\?/.test(sql)) {
    throw new AppError(500, 'tenant_scope_missing', 'rawScoped SQL must filter on agency_id = ?');
  }
  return all(sql, params).map(decode);
}

export { getDb };
