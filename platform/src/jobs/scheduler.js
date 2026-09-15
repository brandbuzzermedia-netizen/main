import { all } from '../db/index.js';
import { enqueue } from './queue.js';
import { config } from '../config.js';
import { log } from '../core/logger.js';

/**
 * Scheduled jobs (§48).
 *
 * The scheduler enqueues work; the worker executes it. Cadences are
 * configurable, and every job carries a dedupe key derived from its cadence
 * bucket, so a scheduler tick that fires twice does not double the work.
 *
 *   every 15-60 min   → trend detection
 *   every 1-3 hours   → engagement discovery
 *   daily             → client intelligence briefing
 *   after publication → engagement research (queued by the publisher)
 *   weekly            → competitor analysis
 *   monthly           → performance report
 */

export function tick(at = new Date()) {
  if (!config.research.enabled) return { skipped: 'Research is disabled by configuration' };

  const clients = all(
    `SELECT c.id, c.agency_id, c.automation_paused, a.automation_paused AS agency_paused
       FROM clients c JOIN agencies a ON a.id = c.agency_id
      WHERE c.status = 'active' AND c.onboarding_complete = 1`,
  );

  const queued = [];
  const minutes = Math.floor(at.getTime() / 60_000);
  const day = at.toISOString().slice(0, 10);
  const week = `${at.getUTCFullYear()}-W${isoWeek(at)}`;
  const month = at.toISOString().slice(0, 7);

  for (const client of clients) {
    // A paused client still gets nothing enqueued; research is automation too.
    if (client.automation_paused || client.agency_paused) continue;
    const base = { agencyId: client.agency_id, clientId: client.id };

    if (minutes % config.research.trendIntervalMinutes === 0) {
      queued.push(enqueue({
        ...base, kind: 'discover_trends', priority: 60,
        dedupeKey: `trends:${client.id}:${Math.floor(minutes / config.research.trendIntervalMinutes)}`,
      }));
    }
    if (minutes % config.research.engagementIntervalMinutes === 0) {
      queued.push(enqueue({
        ...base, kind: 'discover_engagement', priority: 55,
        dedupeKey: `engagement:${client.id}:${Math.floor(minutes / config.research.engagementIntervalMinutes)}`,
      }));
    }
    if (at.getUTCHours() === config.research.briefHourUtc && at.getUTCMinutes() < 5) {
      queued.push(enqueue({ ...base, kind: 'daily_brief', priority: 80, dedupeKey: `brief:${client.id}:${day}` }));
      queued.push(enqueue({ ...base, kind: 'materialise_recurring_slots', priority: 50, dedupeKey: `slots:${client.id}:${day}` }));
      queued.push(enqueue({ ...base, kind: 'learning_loop', priority: 30, dedupeKey: `learn:${client.id}:${day}` }));
    }
    if (at.getUTCDay() === 1 && at.getUTCHours() === 3 && at.getUTCMinutes() < 5) {
      queued.push(enqueue({ ...base, kind: 'competitor_analysis', priority: 40, dedupeKey: `competitors:${client.id}:${week}` }));
    }
    if (at.getUTCDate() === 1 && at.getUTCHours() === 4 && at.getUTCMinutes() < 5) {
      queued.push(enqueue({ ...base, kind: 'performance_report', priority: 40, dedupeKey: `report:${client.id}:${month}` }));
    }
  }

  const fresh = queued.filter((q) => !q.deduped).length;
  if (fresh) log.info('scheduler_tick', { enqueued: fresh, clients: clients.length });
  return { clients: clients.length, enqueued: fresh, deduped: queued.length - fresh };
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return String(Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)).padStart(2, '0');
}
