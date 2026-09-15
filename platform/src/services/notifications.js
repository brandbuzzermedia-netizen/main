import { insert, list } from '../db/repo.js';
import { log } from '../core/logger.js';

/**
 * Notifications (§44). Stored per agency, optionally targeted at one user and
 * one client. Delivery preferences live on the user row; this module writes the
 * record and any future transport (email, push) reads from it.
 */

export const NOTIFICATION_KINDS = /** @type {const} */ ([
  'major_trend', 'high_value_inspiration', 'high_relevance_opportunity',
  'approval_required', 'performance_spike', 'competitor_viral',
  'negative_conversation', 'publishing_failed', 'automation_paused',
  'account_needs_reconnect',
]);

const ICONS = {
  major_trend: '🔥', high_value_inspiration: '🎬', high_relevance_opportunity: '💬',
  approval_required: '⚠️', performance_spike: '📈', competitor_viral: '👀',
  negative_conversation: '🚨', publishing_failed: '❌', automation_paused: '🛑',
  account_needs_reconnect: '🔌',
};

/**
 * @param {{agencyId:string, clientId?:string|null, userId?:string|null,
 *          kind:string, severity?:'info'|'warning'|'critical',
 *          title:string, body?:string, link?:string}} input
 */
export function notify(input) {
  try {
    return insert('notifications', {
      agency_id: input.agencyId,
      client_id: input.clientId ?? null,
      user_id: input.userId ?? null,
      kind: input.kind,
      severity: input.severity ?? 'info',
      title: `${ICONS[input.kind] ?? ''} ${input.title}`.trim(),
      body: input.body ?? null,
      link: input.link ?? null,
      status: 'unread',
    });
  } catch (err) {
    log.error('notification_failed', { kind: input.kind, err: String(err) });
    return undefined;
  }
}

/** Respect each user's per-kind preferences when listing. */
export function forUser(agencyId, user, { limit = 50 } = {}) {
  const prefs = user.notification_prefs ?? {};
  const rows = list('notifications', agencyId, { status: ['unread', 'read'] },
    { orderBy: 'created_at DESC', limit: 200 });
  return rows
    .filter((n) => !n.user_id || n.user_id === user.id)
    .filter((n) => prefs[n.kind] !== false)
    .filter((n) => !user.client_scope?.length || !n.client_id || user.client_scope.includes(n.client_id))
    .slice(0, limit);
}

export { ICONS };
