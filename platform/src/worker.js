#!/usr/bin/env node
import { migrate } from './db/index.js';
import { claim, complete, failJob, reclaimStale, duePublishingJobs, promoteDueContent } from './jobs/queue.js';
import { HANDLERS } from './jobs/handlers/index.js';
import { executePublishingJob } from './services/publishing.js';
import { tick } from './jobs/scheduler.js';
import { assertProductionConfig, config } from './config.js';
import { log } from './core/logger.js';

/**
 * Background worker (§47).
 *
 * Runs three lanes on one loop:
 *   1. the scheduler tick (enqueues due recurring work)
 *   2. the research/analysis queue
 *   3. the publishing queue (its own lane, so slow research never delays a post)
 *
 * Expensive work happens here and only here — never inside an HTTP request.
 */

const logger = log.child({ component: 'worker', worker_id: config.worker.id });
let running = true;
let lastSchedulerMinute = -1;

async function loop() {
  while (running) {
    const started = Date.now();
    try {
      await cycle();
    } catch (err) {
      logger.error('worker_cycle_failed', { err: String(err.stack ?? err) });
    }
    const elapsed = Date.now() - started;
    await sleep(Math.max(config.worker.pollMs - elapsed, 250));
  }
}

async function cycle() {
  // 1. Scheduler — at most once per wall-clock minute.
  const minute = Math.floor(Date.now() / 60_000);
  if (minute !== lastSchedulerMinute) {
    lastSchedulerMinute = minute;
    tick(new Date());
    reclaimStale(15);
    const promoted = promoteDueContent(50);
    if (promoted.length) logger.info('content_promoted_to_publishing', { count: promoted.length });
  }

  // 2. Research and analysis jobs.
  const jobs = claim(config.worker.id, config.worker.concurrency);
  await Promise.all(jobs.map(runJob));

  // 3. Publishing jobs.
  for (const job of duePublishingJobs(5)) {
    try {
      const result = await executePublishingJob(job);
      logger.info('publishing_job_done', { job_id: job.id, kind: job.kind, status: result?.status });
    } catch (err) {
      logger.error('publishing_job_crashed', { job_id: job.id, err: String(err.stack ?? err) });
    }
  }
}

async function runJob(job) {
  const handler = HANDLERS[job.kind];
  if (!handler) {
    failJob(job, new Error(`No handler registered for job kind "${job.kind}"`));
    return;
  }
  const started = Date.now();
  try {
    const result = await handler(job);
    complete(job.id);
    logger.info('job_done', { id: job.id, kind: job.kind, ms: Date.now() - started, result: summarise(result) });
  } catch (err) {
    // Handlers can mark an error permanent to skip the retry ladder.
    if (/** @type {any} */ (err).permanent) {
      failJob({ ...job, attempt: job.max_attempts - 1 }, err);
    } else {
      failJob(job, err);
    }
    logger.error('job_failed', { id: job.id, kind: job.kind, err: String(err.message ?? err) });
  }
}

function summarise(result) {
  if (!result || typeof result !== 'object') return result;
  const { discovered, count, skipped, created, brief_id, findings } = result;
  return { discovered, count, skipped, created, brief_id, findings: findings?.length };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shutdown(signal) {
  logger.info('worker_stopping', { signal });
  running = false;
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

assertProductionConfig();
migrate();
logger.info('worker_started', {
  concurrency: config.worker.concurrency,
  poll_ms: config.worker.pollMs,
  research_enabled: config.research.enabled,
});
loop();
