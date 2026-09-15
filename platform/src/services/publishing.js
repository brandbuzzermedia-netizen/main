import { find, findBy, insert, list, update } from '../db/repo.js';
import { getAdapter } from '../platforms/registry.js';
import { usableCredentials } from './credentials.js';
import { runSafetyGate } from '../engines/safety-gate.js';
import { checkAction, recordAction, detectAbnormalActivity } from '../core/anti-spam.js';
import { ManualActionRequired, TransientError, AppError } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { notify } from './notifications.js';
import { log } from '../core/logger.js';
import { now, isoIn } from '../core/ids.js';
import { textFingerprint } from '../core/crypto.js';
import { enqueue } from '../jobs/queue.js';

/**
 * Publishing engine (§18, §51, §52).
 *
 * The path to a live post is deliberately narrow, and every gate below has to
 * open before anything leaves the building:
 *
 *   automation not paused  →  account connected  →  platform supports the type
 *   →  safety gate clears  →  anti-spam ceiling not reached  →  approved
 *   →  publish  →  verify  →  record  →  start the post-publish loop
 *
 * Failures are classified: transient ones retry with exponential backoff,
 * permanent ones stop immediately, and anything a platform cannot do through
 * its official API becomes MANUAL_ACTION_REQUIRED.
 */

/** Queue a publishing job for an approved, scheduled item. */
export function queuePublish({ agencyId, clientId, scheduledContentId, runAfter }) {
  return insert('publishing_jobs', {
    agency_id: agencyId,
    client_id: clientId,
    scheduled_content_id: scheduledContentId,
    platform: find('scheduled_content', agencyId, scheduledContentId)?.platform,
    kind: 'post',
    run_after: runAfter ?? now(),
    status: 'queued',
  });
}

export function queueComment({ agencyId, clientId, commentId, platform, runAfter }) {
  return insert('publishing_jobs', {
    agency_id: agencyId,
    client_id: clientId,
    comment_id: commentId,
    platform,
    kind: 'comment',
    run_after: runAfter ?? now(),
    status: 'queued',
  });
}

/**
 * Execute one publishing job. Called by the worker; never from an HTTP handler.
 * @param {any} job a publishing_jobs row
 */
export async function executePublishingJob(job) {
  const agencyId = job.agency_id;
  const agency = find('agencies', agencyId, agencyId);
  const client = find('clients', agencyId, job.client_id);

  // --- emergency stop (§31) --------------------------------------------------
  if (agency?.automation_paused) {
    return hold(job, 'Automation is paused agency-wide', 'paused');
  }
  if (client?.automation_paused) {
    return hold(job, `Automation is paused for ${client.name}`, 'paused');
  }

  return job.kind === 'comment'
    ? publishComment(job, { agencyId, client })
    : publishPost(job, { agencyId, client });
}

async function publishPost(job, { agencyId, client }) {
  const item = find('scheduled_content', agencyId, job.scheduled_content_id);
  if (!item) return fail(job, new AppError(404, 'not_found', 'Scheduled content no longer exists'), 'permanent');

  if (item.approval_status !== 'approved' && item.approval_status !== 'auto_approved') {
    return hold(job, 'Item is not approved', 'awaiting_approval');
  }

  update('scheduled_content', agencyId, item.id, { status: 'PUBLISHING' });

  const account = item.social_account_id
    ? find('social_accounts', agencyId, item.social_account_id)
    : findBy('social_accounts', agencyId, { client_id: item.client_id, platform: item.platform, connection_status: 'connected' });

  if (!account) {
    return manual(job, item, new ManualActionRequired(item.platform,
      `No connected ${item.platform} account for ${client?.name ?? 'this client'}.`,
      'Connect the account on the Social Accounts page, then retry.'), agencyId);
  }
  if (account.automation_paused) return hold(job, 'Publishing is paused for this account', 'paused');

  // --- capability re-check at publish time (§20) -----------------------------
  const adapter = getAdapter(item.platform);
  if (!adapter.supportsPublishing(item.content_type)) {
    return manual(job, item, new ManualActionRequired(item.platform,
      `${item.platform} offers no official API publishing for ${item.content_type}.`,
      adapter.capabilities.notes?.[item.content_type]), agencyId);
  }

  // --- safety gate (§26) -----------------------------------------------------
  const brand = findBy('brand_profiles', agencyId, { client_id: item.client_id });
  const recent = list('published_content', agencyId, { client_id: item.client_id },
    { orderBy: 'published_at DESC', limit: 25 });
  const gate = runSafetyGate({
    item,
    brand,
    recentCaptions: recent.map((r) => r.caption).filter(Boolean),
    factsVerified: item.safety_report?.facts_verified === true,
  });
  update('scheduled_content', agencyId, item.id, { safety_report: gate });

  if (!gate.publishable) {
    update('scheduled_content', agencyId, item.id, { status: 'IN_REVIEW', approval_status: 'pending' });
    audit({
      agencyId, clientId: item.client_id, actorType: 'system', actorLabel: 'safety_gate',
      action: 'publish.blocked', objectType: 'scheduled_content', objectId: item.id,
      platform: item.platform, result: 'blocked', next: { failed: gate.critical_failures },
    });
    notify({
      agencyId, clientId: item.client_id, kind: 'publishing_failed', severity: 'warning',
      title: `Held before publishing: ${item.platform} ${item.content_type}`,
      body: `Safety gate: ${gate.critical_failures.join(', ')}`,
      link: `/calendar?item=${item.id}`,
    });
    return fail(job, new AppError(422, 'safety_gate_failed',
      `Safety gate blocked this item: ${gate.critical_failures.join(', ')}`), 'permanent');
  }

  // --- anti-spam ceilings (§43) ----------------------------------------------
  const verdict = checkAction({
    agencyId, clientId: item.client_id, platform: item.platform,
    action: 'publish_post', body: item.caption,
  });
  if (!verdict.allowed) {
    audit({
      agencyId, clientId: item.client_id, actorType: 'system', actorLabel: 'anti_spam',
      action: 'publish.rate_limited', objectType: 'scheduled_content', objectId: item.id,
      platform: item.platform, result: 'blocked', next: verdict,
    });
    // A ceiling is a reason to wait, not to fail.
    return retryLater(job, `Anti-spam: ${verdict.reasons.join('; ')}`, 60);
  }

  // --- publish ---------------------------------------------------------------
  const creds = await usableCredentials(agencyId, account);
  if (!creds) {
    notify({
      agencyId, clientId: item.client_id, kind: 'account_needs_reconnect', severity: 'warning',
      title: `${item.platform} needs reconnecting`, link: '/accounts',
    });
    return fail(job, new AppError(401, 'account_disconnected',
      `The ${item.platform} account needs reconnecting`), 'permanent');
  }

  try {
    const result = await adapter.publish(creds, {
      contentType: item.content_type,
      caption: item.caption,
      hashtags: (item.hashtags ?? []).map((h) => (typeof h === 'string' ? h : h.tag)),
      media: item.media ?? [],
      linkUrl: item.link_url,
      title: item.hook,
      extra: item.safety_report?.extra ?? {},
    });

    const published = insert('published_content', {
      agency_id: agencyId,
      client_id: item.client_id,
      scheduled_content_id: item.id,
      social_account_id: account.id,
      platform: item.platform,
      content_type: item.content_type,
      caption: item.caption,
      hashtags: item.hashtags ?? [],
      external_post_id: result.externalId,
      url: result.url,
      scheduled_for: item.scheduled_for,
      published_at: result.publishedAt,
      publish_method: 'official_api',
      api_response: JSON.stringify(result.raw ?? {}).slice(0, 8000),
      status: 'published',
    });

    update('scheduled_content', agencyId, item.id, { status: 'PUBLISHED' });
    update('publishing_jobs', agencyId, job.id, {
      status: 'succeeded', result: JSON.stringify({ post_id: result.externalId, url: result.url }),
    });
    recordAction({ agencyId, clientId: item.client_id, platform: item.platform, action: 'publish_post', body: item.caption });

    audit({
      agencyId, clientId: item.client_id, actorType: 'system', actorLabel: 'publishing_engine',
      action: 'content.published', objectType: 'published_content', objectId: published.id,
      platform: item.platform, next: { external_post_id: result.externalId, url: result.url },
    });

    // --- post-publish automation (§27) --------------------------------------
    enqueue({
      agencyId, clientId: item.client_id, kind: 'post_publish_loop',
      payload: { published_content_id: published.id }, runAfter: isoIn(5),
    });
    enqueue({
      agencyId, clientId: item.client_id, kind: 'sync_metrics',
      payload: { published_content_id: published.id }, runAfter: isoIn(60),
    });

    return { status: 'succeeded', publishedId: published.id, url: result.url };
  } catch (err) {
    if (err instanceof ManualActionRequired) return manual(job, item, err, agencyId);
    if (err instanceof TransientError) {
      return retryLater(job, String(err.message), err.retryAfterSeconds ?? 60);
    }
    update('scheduled_content', agencyId, item.id, { status: 'FAILED' });
    notify({
      agencyId, clientId: item.client_id, kind: 'publishing_failed', severity: 'critical',
      title: `Publishing failed: ${item.platform} ${item.content_type}`,
      body: String(err.message ?? err), link: `/calendar?item=${item.id}`,
    });
    return fail(job, err, 'permanent');
  }
}

async function publishComment(job, { agencyId, client }) {
  const comment = find('generated_comments', agencyId, job.comment_id);
  if (!comment) return fail(job, new AppError(404, 'not_found', 'Comment no longer exists'), 'permanent');
  if (comment.status !== 'approved') return hold(job, 'Comment is not approved', 'awaiting_approval');
  if (comment.blocked) return fail(job, new AppError(422, 'blocked', 'Comment failed its quality checks'), 'permanent');

  const opportunity = find('engagement_opportunities', agencyId, comment.opportunity_id);
  if (!opportunity) return fail(job, new AppError(404, 'not_found', 'Opportunity no longer exists'), 'permanent');

  const account = findBy('social_accounts', agencyId, {
    client_id: comment.client_id, platform: opportunity.platform, connection_status: 'connected',
  });
  if (!account) {
    return fail(job, new ManualActionRequired(opportunity.platform,
      `No connected ${opportunity.platform} account to reply from.`,
      'Connect the account, or post the approved reply manually and mark the opportunity engaged.'), 'manual_required');
  }

  // --- anti-spam, checked immediately before the call ------------------------
  const verdict = checkAction({
    agencyId, clientId: comment.client_id, platform: opportunity.platform,
    action: 'publish_comment', body: comment.body, targetAuthor: opportunity.author,
  });
  if (!verdict.allowed) {
    audit({
      agencyId, clientId: comment.client_id, actorType: 'system', actorLabel: 'anti_spam',
      action: 'comment.rate_limited', objectType: 'generated_comments', objectId: comment.id,
      platform: opportunity.platform, result: 'blocked', next: verdict,
    });
    return retryLater(job, `Anti-spam: ${verdict.reasons.join('; ')}`, 30 * 60);
  }

  const abnormal = detectAbnormalActivity(comment.client_id);
  if (abnormal.abnormal) {
    update('clients', agencyId, comment.client_id, { automation_paused: 1 });
    notify({
      agencyId, clientId: comment.client_id, kind: 'automation_paused', severity: 'critical',
      title: `Automation paused for ${client?.name ?? 'this client'}`,
      body: `${abnormal.actionsLastHour} actions in the last hour is well past the configured ceiling. Automation stopped itself.`,
      link: '/settings',
    });
    return hold(job, 'Abnormal activity detected — automation paused', 'paused');
  }

  const adapter = getAdapter(opportunity.platform);
  const creds = await usableCredentials(agencyId, account);
  if (!creds) return fail(job, new AppError(401, 'account_disconnected', 'Account needs reconnecting'), 'permanent');

  try {
    const result = await adapter.publishComment(creds, {
      targetId: opportunity.external_id, body: comment.body,
    });

    const published = insert('published_comments', {
      agency_id: agencyId,
      client_id: comment.client_id,
      comment_id: comment.id,
      opportunity_id: opportunity.id,
      social_account_id: account.id,
      platform: opportunity.platform,
      external_id: result.externalId,
      url: result.url ?? opportunity.url,
      body: comment.body,
      body_fingerprint: textFingerprint(comment.body),
      published_at: result.publishedAt,
      publish_method: 'official_api',
      status: 'published',
    });

    update('generated_comments', agencyId, comment.id, { status: 'published' });
    update('engagement_opportunities', agencyId, opportunity.id, { status: 'engaged' });
    update('publishing_jobs', agencyId, job.id, { status: 'succeeded', result: JSON.stringify({ id: result.externalId }) });
    recordAction({
      agencyId, clientId: comment.client_id, platform: opportunity.platform,
      action: 'publish_comment', body: comment.body, targetAuthor: opportunity.author,
    });

    audit({
      agencyId, clientId: comment.client_id, actorType: 'system', actorLabel: 'publishing_engine',
      action: 'comment.published', objectType: 'published_comments', objectId: published.id,
      platform: opportunity.platform, next: { external_id: result.externalId },
    });

    return { status: 'succeeded', publishedId: published.id };
  } catch (err) {
    if (err instanceof ManualActionRequired) return fail(job, err, 'manual_required');
    if (err instanceof TransientError) return retryLater(job, String(err.message), err.retryAfterSeconds ?? 60);
    return fail(job, err, 'permanent');
  }
}

// --- job state transitions ---------------------------------------------------

function retryLater(job, reason, seconds) {
  const attempt = Number(job.attempt) + 1;
  if (attempt >= Number(job.max_attempts)) {
    return fail(job, new AppError(503, 'retries_exhausted', `Gave up after ${attempt} attempts: ${reason}`), 'transient');
  }
  // Exponential backoff with a floor from the platform's own Retry-After.
  const backoff = Math.max(seconds, 30 * 2 ** (attempt - 1));
  const history = [...(job.retry_history ?? []), { attempt, at: now(), reason, next_in_seconds: backoff }];
  update('publishing_jobs', job.agency_id, job.id, {
    status: 'queued', attempt, last_error: reason, error_class: 'transient',
    retry_history: history, run_after: isoIn(backoff / 60),
  });
  log.info('publishing_retry', { job_id: job.id, attempt, backoff_seconds: backoff, reason });
  return { status: 'retry', attempt, backoff };
}

function fail(job, err, errorClass) {
  const status = errorClass === 'manual_required' ? 'manual_action_required'
    : Number(job.attempt) + 1 >= Number(job.max_attempts) ? 'dead_letter' : 'failed';
  update('publishing_jobs', job.agency_id, job.id, {
    status, attempt: Number(job.attempt) + 1,
    last_error: String(err.message ?? err), error_class: errorClass,
  });
  audit({
    agencyId: job.agency_id, clientId: job.client_id, actorType: 'system',
    actorLabel: 'publishing_engine', action: 'publish.failed',
    objectType: 'publishing_jobs', objectId: job.id, platform: job.platform,
    result: 'failure', error: String(err.message ?? err),
  });
  return { status, error: String(err.message ?? err) };
}

function manual(job, item, err, agencyId) {
  update('scheduled_content', agencyId, item.id, {
    status: 'MANUAL_ACTION_REQUIRED',
    safety_report: { ...(item.safety_report ?? {}), manual_reason: err.message, how_to: err.howTo },
  });
  notify({
    agencyId, clientId: item.client_id, kind: 'publishing_failed', severity: 'warning',
    title: `Manual publishing required: ${item.platform} ${item.content_type}`,
    body: `${err.message} ${err.howTo ?? ''}`.trim(), link: `/calendar?item=${item.id}`,
  });
  return fail(job, err, 'manual_required');
}

function hold(job, reason, why) {
  update('publishing_jobs', job.agency_id, job.id, {
    last_error: reason, error_class: why, run_after: isoIn(15),
  });
  log.info('publishing_held', { job_id: job.id, reason });
  return { status: 'held', reason };
}
