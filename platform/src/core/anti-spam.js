import { all, one } from '../db/index.js';
import { insert } from '../db/repo.js';
import { config } from '../config.js';
import { textFingerprint } from './crypto.js';
import { now } from './ids.js';

/**
 * Anti-spam system (§43).
 *
 * Every outward platform action is checked here first. The checks exist to keep
 * engagement genuine and within what platforms permit — they are ceilings, not
 * a budget to spend. Nothing in this module may be used to evade a platform's
 * own detection: variation counts, cooldowns and similarity checks all reduce
 * output, never disguise it.
 *
 * Returns `{ allowed, reasons[], checks{} }` — the caller records the decision
 * in the audit log whichever way it goes.
 */

/** @typedef {{allowed:boolean, reasons:string[], checks:Record<string,any>}} Verdict */

/**
 * @param {{
 *  agencyId:string, clientId:string, platform:string,
 *  action:'publish_post'|'publish_comment',
 *  body?:string, targetAuthor?:string,
 *  limits?:Partial<typeof config.limits>
 * }} input
 * @returns {Verdict}
 */
export function checkAction(input) {
  const limits = { ...config.limits, ...(input.limits ?? {}) };
  /** @type {string[]} */
  const reasons = [];
  /** @type {Record<string, any>} */
  const checks = {};

  const isComment = input.action === 'publish_comment';

  // --- volume ceilings -------------------------------------------------------
  const lastHour = countSince(input.clientId, input.action, 60);
  const lastDay = countSince(input.clientId, input.action, 60 * 24);
  checks.actions_last_hour = lastHour;
  checks.actions_last_day = lastDay;

  if (isComment) {
    if (lastHour >= limits.commentsPerHourPerClient) {
      reasons.push(`Hourly comment ceiling reached (${lastHour}/${limits.commentsPerHourPerClient})`);
    }
    if (lastDay >= limits.commentsPerDayPerClient) {
      reasons.push(`Daily comment ceiling reached (${lastDay}/${limits.commentsPerDayPerClient})`);
    }
  } else if (lastDay >= limits.postsPerDayPerAccount) {
    reasons.push(`Daily publishing ceiling reached (${lastDay}/${limits.postsPerDayPerAccount})`);
  }

  // --- cooldown --------------------------------------------------------------
  if (isComment) {
    const last = one(
      `SELECT occurred_at FROM action_ledger
        WHERE client_id = ? AND action = ?
        ORDER BY occurred_at DESC LIMIT 1`,
      [input.clientId, input.action],
    );
    if (last) {
      const minutes = (Date.now() - new Date(last.occurred_at).getTime()) / 60_000;
      checks.minutes_since_last = Math.round(minutes);
      if (minutes < limits.commentCooldownMinutes) {
        reasons.push(`Cooldown active — ${Math.ceil(limits.commentCooldownMinutes - minutes)} min remaining`);
      }
    }
  }

  // --- repeated-account detection -------------------------------------------
  if (isComment && input.targetAuthor) {
    const since = new Date(Date.now() - limits.sameAuthorCooldownHours * 3_600_000).toISOString();
    const repeat = one(
      `SELECT COUNT(*) AS n FROM action_ledger
        WHERE client_id = ? AND target_author = ? AND occurred_at > ?`,
      [input.clientId, input.targetAuthor, since],
    );
    checks.recent_interactions_with_author = Number(repeat?.n ?? 0);
    if (Number(repeat?.n ?? 0) > 0) {
      reasons.push(`Already engaged with @${input.targetAuthor} in the last ${limits.sameAuthorCooldownHours}h`);
    }
  }

  // --- duplicate + similarity -----------------------------------------------
  if (input.body) {
    const fingerprint = textFingerprint(input.body);
    checks.fingerprint = fingerprint;

    const duplicate = one(
      'SELECT id FROM published_comments WHERE client_id = ? AND body_fingerprint = ? LIMIT 1',
      [input.clientId, fingerprint],
    );
    if (duplicate) reasons.push('Identical text has already been published for this client');

    const recent = all(
      `SELECT body FROM published_comments
        WHERE client_id = ? ORDER BY published_at DESC LIMIT 50`,
      [input.clientId],
    );
    let worst = 0;
    for (const row of recent) {
      worst = Math.max(worst, similarity(input.body, row.body));
    }
    checks.max_similarity = Number(worst.toFixed(3));
    if (worst >= limits.similarityThreshold) {
      reasons.push(`Too similar to a recent comment (${Math.round(worst * 100)}% overlap)`);
    }
  }

  return { allowed: reasons.length === 0, reasons, checks };
}

/** Record an action that actually went out, so future checks can see it. */
export function recordAction({ agencyId, clientId, platform, action, targetAuthor, body }) {
  return insert('action_ledger', {
    agency_id: agencyId,
    client_id: clientId,
    platform,
    action,
    target_author: targetAuthor ?? null,
    fingerprint: body ? textFingerprint(body) : null,
    occurred_at: now(),
  });
}

function countSince(clientId, action, minutes) {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const row = one(
    'SELECT COUNT(*) AS n FROM action_ledger WHERE client_id = ? AND action = ? AND occurred_at > ?',
    [clientId, action, since],
  );
  return Number(row?.n ?? 0);
}

/**
 * Jaccard similarity over word trigrams. Cheap, dependency-free, and good
 * enough to catch "the same comment with a synonym swapped".
 */
export function similarity(a, b) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}

function trigrams(text) {
  const words = String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set();
  if (words.length < 3) { if (words.length) out.add(words.join(' ')); return out; }
  for (let i = 0; i <= words.length - 3; i++) out.add(words.slice(i, i + 3).join(' '));
  return out;
}

/**
 * Abnormal-activity circuit breaker: if outward actions spike well past the
 * configured ceiling, automation pauses itself rather than pushing on.
 */
export function detectAbnormalActivity(clientId) {
  const lastHour = countSince(clientId, 'publish_comment', 60)
    + countSince(clientId, 'publish_post', 60);
  const ceiling = config.limits.commentsPerHourPerClient + config.limits.postsPerDayPerAccount;
  return { abnormal: lastHour > ceiling * 2, actionsLastHour: lastHour, ceiling };
}
