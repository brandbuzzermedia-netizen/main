import { insert } from '../db/repo.js';
import { now } from './ids.js';
import { log } from './logger.js';

/**
 * Audit log (§42). Every significant action — by a person, an agent, or the
 * scheduler — lands here with before/after values. This is the accountability
 * record, so writing it must never take the caller down: failures are logged,
 * not thrown.
 */

/**
 * @param {{
 *   agencyId: string, clientId?: string|null,
 *   actorType: 'user'|'agent'|'system', actorId?: string|null, actorLabel?: string,
 *   action: string, objectType?: string, objectId?: string, platform?: string,
 *   previous?: unknown, next?: unknown,
 *   result?: 'success'|'failure'|'blocked', error?: string, ip?: string,
 * }} entry
 */
export function audit(entry) {
  try {
    return insert('audit_logs', {
      agency_id: entry.agencyId,
      client_id: entry.clientId ?? null,
      actor_type: entry.actorType,
      actor_id: entry.actorId ?? null,
      actor_label: entry.actorLabel ?? null,
      action: entry.action,
      object_type: entry.objectType ?? null,
      object_id: entry.objectId ?? null,
      platform: entry.platform ?? null,
      previous_value: entry.previous === undefined ? null : JSON.stringify(redact(entry.previous)),
      new_value: entry.next === undefined ? null : JSON.stringify(redact(entry.next)),
      result: entry.result ?? 'success',
      error: entry.error ?? null,
      ip: entry.ip ?? null,
      occurred_at: now(),
    });
  } catch (err) {
    log.error('audit_write_failed', { action: entry.action, err: String(err) });
    return undefined;
  }
}

const SECRET_KEY = /(token|password|secret|_enc|api_key)/i;

function redact(value, depth = 0) {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}
