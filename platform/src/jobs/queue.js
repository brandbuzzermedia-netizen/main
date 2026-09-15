import { all, one, run, tx } from '../db/index.js';
import { newId, now, isoIn } from '../core/ids.js';
import { log } from '../core/logger.js';
import { config } from '../config.js';

/**
 * Background job queue (§47).
 *
 * SQLite-backed for single-node deployments; the interface is deliberately the
 * small set any queue offers (enqueue / claim / complete / fail), so production
 * can swap in Redis or SQS by reimplementing this one module — see
 * docs/ARCHITECTURE.md.
 *
 * Guarantees: at-least-once delivery, exponential backoff, a dead-letter state
 * after max_attempts, and dedupe keys so a job that is already pending is not
 * queued twice.
 */

/**
 * @param {{agencyId?:string|null, clientId?:string|null, kind:string,
 *          payload?:Record<string,any>, priority?:number, runAfter?:string,
 *          dedupeKey?:string, maxAttempts?:number}} input
 */
export function enqueue(input) {
  const dedupeKey = input.dedupeKey ?? null;
  if (dedupeKey) {
    const existing = one(
      `SELECT id FROM job_queue WHERE dedupe_key = ? AND status IN ('queued','running')`,
      [dedupeKey],
    );
    if (existing) return { id: existing.id, deduped: true };
  }

  const id = newId('job');
  const ts = now();
  run(
    `INSERT INTO job_queue
      (id, agency_id, client_id, kind, payload, priority, attempt, max_attempts,
       run_after, dedupe_key, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'queued', ?, ?)`,
    [
      id, input.agencyId ?? null, input.clientId ?? null, input.kind,
      JSON.stringify(input.payload ?? {}), input.priority ?? 50,
      input.maxAttempts ?? 5, input.runAfter ?? ts, dedupeKey, ts, ts,
    ],
  );
  log.debug('job_enqueued', { id, kind: input.kind, client_id: input.clientId });
  return { id, deduped: false };
}

/**
 * Claim up to `limit` due jobs for this worker. The claim happens inside a
 * transaction so two workers cannot take the same job.
 */
export function claim(workerId, limit = 1) {
  return tx(() => {
    const due = all(
      `SELECT * FROM job_queue
        WHERE status = 'queued' AND run_after <= ?
        ORDER BY priority DESC, run_after ASC
        LIMIT ?`,
      [now(), limit],
    );
    const claimed = [];
    for (const job of due) {
      const result = run(
        `UPDATE job_queue SET status = 'running', locked_by = ?, locked_at = ?, updated_at = ?
          WHERE id = ? AND status = 'queued'`,
        [workerId, now(), now(), job.id],
      );
      if (Number(result.changes) === 1) {
        claimed.push({ ...job, payload: parse(job.payload) });
      }
    }
    return claimed;
  });
}

export function complete(jobId) {
  run(`UPDATE job_queue SET status = 'succeeded', locked_by = NULL, updated_at = ? WHERE id = ?`, [now(), jobId]);
}

/** Retry with exponential backoff, or dead-letter once attempts are exhausted. */
export function failJob(job, err) {
  const attempt = Number(job.attempt) + 1;
  const message = String(err?.message ?? err).slice(0, 1000);

  if (attempt >= Number(job.max_attempts)) {
    run(
      `UPDATE job_queue SET status = 'dead_letter', attempt = ?, last_error = ?, locked_by = NULL, updated_at = ?
        WHERE id = ?`,
      [attempt, message, now(), job.id],
    );
    log.error('job_dead_lettered', { id: job.id, kind: job.kind, attempt, error: message });
    return { status: 'dead_letter', attempt };
  }

  const backoffMinutes = Math.min(2 ** (attempt - 1), 60);
  run(
    `UPDATE job_queue SET status = 'queued', attempt = ?, last_error = ?, locked_by = NULL,
        run_after = ?, updated_at = ? WHERE id = ?`,
    [attempt, message, isoIn(backoffMinutes), now(), job.id],
  );
  log.warn('job_retry_scheduled', { id: job.id, kind: job.kind, attempt, in_minutes: backoffMinutes });
  return { status: 'queued', attempt, backoffMinutes };
}

/** Recover jobs whose worker died mid-run. */
export function reclaimStale(olderThanMinutes = 15) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const result = run(
    `UPDATE job_queue SET status = 'queued', locked_by = NULL, updated_at = ?
      WHERE status = 'running' AND locked_at < ?`,
    [now(), cutoff],
  );
  const n = Number(result.changes);
  if (n) log.warn('stale_jobs_reclaimed', { count: n });
  return n;
}

/** Queue depth by kind and status, for the ops dashboard. */
export function queueStats() {
  return {
    jobs: all(`SELECT kind, status, COUNT(*) AS n FROM job_queue GROUP BY kind, status`),
    publishing: all(`SELECT status, COUNT(*) AS n FROM publishing_jobs GROUP BY status`),
    dead_letter: all(
      `SELECT id, kind, last_error, updated_at FROM job_queue
        WHERE status = 'dead_letter' ORDER BY updated_at DESC LIMIT 25`,
    ),
    worker: { id: config.worker.id, concurrency: config.worker.concurrency },
  };
}

/** Publishing jobs that are due. Kept separate so publishing has its own lane. */
export function duePublishingJobs(limit = 10) {
  return all(
    `SELECT * FROM publishing_jobs WHERE status = 'queued' AND run_after <= ?
      ORDER BY run_after ASC LIMIT ?`,
    [now(), limit],
  ).map((j) => ({ ...j, retry_history: parse(j.retry_history, []) }));
}

/** Scheduled content that is due and approved, promoted into publishing jobs. */
export function promoteDueContent(limit = 50) {
  const rows = all(
    `SELECT * FROM scheduled_content
      WHERE status IN ('APPROVED','SCHEDULED')
        AND approval_status IN ('approved','auto_approved')
        AND scheduled_for IS NOT NULL AND scheduled_for <= ?
      ORDER BY scheduled_for ASC LIMIT ?`,
    [now(), limit],
  );
  const promoted = [];
  for (const item of rows) {
    const existing = one(
      `SELECT id FROM publishing_jobs WHERE scheduled_content_id = ? AND status IN ('queued','running','succeeded')`,
      [item.id],
    );
    if (existing) continue;
    const id = newId('pj');
    const ts = now();
    run(
      `INSERT INTO publishing_jobs
        (id, agency_id, client_id, scheduled_content_id, platform, kind, attempt,
         max_attempts, run_after, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'post', 0, 5, ?, 'queued', ?, ?)`,
      [id, item.agency_id, item.client_id, item.id, item.platform, ts, ts, ts],
    );
    run(`UPDATE scheduled_content SET status = 'SCHEDULED', updated_at = ? WHERE id = ?`, [ts, item.id]);
    promoted.push(id);
  }
  return promoted;
}

function parse(value, fallback = {}) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
