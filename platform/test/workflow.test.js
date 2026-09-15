import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshAgency } from './helpers.js';
import { find, insert, list, update } from '../src/db/repo.js';
import { enqueueApproval, decide } from '../src/services/approvals.js';
import { generateComments, approveComment } from '../src/services/engagement.js';
import { generateIdeas, draftFromIdea } from '../src/services/content.js';
import { executePublishingJob, queuePublish } from '../src/services/publishing.js';
import { checkAction, recordAction } from '../src/core/anti-spam.js';
import { enqueue, claim, complete, failJob, queueStats } from '../src/jobs/queue.js';
import { agents } from '../src/ai/agents/index.js';
import { resolvePrompt, publishPromptVersion, renderPrompt } from '../src/ai/prompts.js';
import { config } from '../src/config.js';
import { textFingerprint } from '../src/core/crypto.js';

/** End-to-end behaviour of the approval, publishing and automation pipeline. */

function opportunityFor(agencyId, clientId, overrides = {}) {
  return insert('engagement_opportunities', {
    agency_id: agencyId, client_id: clientId, platform: 'x',
    external_id: `ext_${Math.random()}`, author: 'someone',
    excerpt: 'Can anyone explain what a vitamin D result of 18 ng/mL actually means in practice?',
    relevance_score: 92, brand_fit_score: 88, conversation_quality_score: 85,
    promotional_risk_score: 15, spam_risk_score: 5,
    recommended_action: 'engage', status: 'new', ...overrides,
  });
}

// --- human approval is the default (§15) ------------------------------------
test('generated comments land in the approval queue, never published directly', async () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-a' });
  const opp = opportunityFor(agencyId, client.id);

  const result = await generateComments({ agencyId, clientId: client.id, opportunityId: opp.id });
  assert.ok(result.comments.length > 0);
  assert.equal(list('published_comments', agencyId, { client_id: client.id }).length, 0,
    'nothing may be published by generation alone');

  const queue = list('approval_items', agencyId, { client_id: client.id, kind: 'comment' });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].status, 'pending');
});

test('a blocked comment cannot be approved', async () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-b' });
  const opp = opportunityFor(agencyId, client.id);
  const comment = insert('generated_comments', {
    agency_id: agencyId, client_id: client.id, opportunity_id: opp.id,
    variant: 'professional', body: 'Guaranteed cure, DM us now!',
    quality_score: 20, blocked: 1, status: 'rejected',
  });
  assert.throws(
    () => approveComment({ agencyId, clientId: client.id, commentId: comment.id, userId: 'u' }),
    /critical quality check/,
  );
});

test('approving a comment under the default mode does not queue it for publishing', async () => {
  const { agencyId, client, user } = freshAgency({ slug: 'wf-c' });
  const opp = opportunityFor(agencyId, client.id);
  const comment = insert('generated_comments', {
    agency_id: agencyId, client_id: client.id, opportunity_id: opp.id,
    variant: 'professional', body: 'A genuinely useful reply about testing intervals.',
    quality_score: 90, blocked: 0, status: 'in_review',
  });

  const result = approveComment({ agencyId, clientId: client.id, commentId: comment.id, userId: user.id });
  assert.equal(result.queued, false);
  assert.equal(result.mode, 'approval_required');
  assert.equal(list('publishing_jobs', agencyId, { client_id: client.id }).length, 0);
});

test('an approval decision moves the subject row with it', () => {
  const { agencyId, client, user } = freshAgency({ slug: 'wf-d' });
  const content = insert('scheduled_content', {
    agency_id: agencyId, client_id: client.id, platform: 'linkedin',
    content_type: 'text', caption: 'Draft', status: 'IN_REVIEW', approval_status: 'pending',
  });
  const item = enqueueApproval({
    agencyId, clientId: client.id, kind: 'content',
    subjectType: 'scheduled_content', subjectId: content.id, title: 'A draft',
  });

  decide({ agencyId, itemId: item.id, decision: 'approved', userId: user.id });

  const updated = find('scheduled_content', agencyId, content.id);
  assert.equal(updated.status, 'APPROVED');
  assert.equal(updated.approval_status, 'approved');
  assert.equal(updated.approved_by, user.id);
});

test('enqueueing the same subject twice does not duplicate the queue entry', () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-e' });
  const content = insert('scheduled_content', {
    agency_id: agencyId, client_id: client.id, platform: 'x', content_type: 'text', caption: 'x',
  });
  const args = {
    agencyId, clientId: client.id, kind: 'content',
    subjectType: 'scheduled_content', subjectId: content.id, title: 'A draft',
  };
  const first = enqueueApproval(args);
  const second = enqueueApproval(args);
  assert.equal(first.id, second.id);
});

// --- publishing gates (§18, §26, §31) ---------------------------------------
test('an unapproved item is held rather than published', async () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-f' });
  const content = insert('scheduled_content', {
    agency_id: agencyId, client_id: client.id, platform: 'linkedin',
    content_type: 'text', caption: 'Not approved', status: 'SCHEDULED', approval_status: 'pending',
  });
  const job = queuePublish({ agencyId, clientId: client.id, scheduledContentId: content.id });

  const result = await executePublishingJob(find('publishing_jobs', agencyId, job.id));
  assert.equal(result.status, 'held');
  assert.match(result.reason, /not approved/);
  assert.equal(list('published_content', agencyId, { client_id: client.id }).length, 0);
});

test('the global emergency stop halts publishing without deleting anything', async () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-g' });
  update('agencies', agencyId, agencyId, { automation_paused: 1, paused_reason: 'Testing' });

  const content = insert('scheduled_content', {
    agency_id: agencyId, client_id: client.id, platform: 'linkedin', content_type: 'text',
    caption: 'Approved but paused', status: 'SCHEDULED', approval_status: 'approved',
  });
  const job = queuePublish({ agencyId, clientId: client.id, scheduledContentId: content.id });

  const result = await executePublishingJob(find('publishing_jobs', agencyId, job.id));
  assert.equal(result.status, 'held');
  assert.match(result.reason, /paused/);
  assert.ok(find('scheduled_content', agencyId, content.id), 'scheduled content must survive the pause');
});

test('publishing without a connected account becomes a manual action', async () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-h' });
  const content = insert('scheduled_content', {
    agency_id: agencyId, client_id: client.id, platform: 'linkedin', content_type: 'text',
    caption: 'Preventive screening uptake is under 20% in urban India. Here is what our booking data shows.',
    status: 'SCHEDULED', approval_status: 'approved',
  });
  const job = queuePublish({ agencyId, clientId: client.id, scheduledContentId: content.id });

  const result = await executePublishingJob(find('publishing_jobs', agencyId, job.id));
  assert.equal(result.status, 'manual_action_required');
  assert.equal(find('scheduled_content', agencyId, content.id).status, 'MANUAL_ACTION_REQUIRED');
});

// --- anti-spam (§43) ---------------------------------------------------------
test('the hourly comment ceiling stops further comments', () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-i' });
  for (let i = 0; i < config.limits.commentsPerHourPerClient; i++) {
    recordAction({
      agencyId, clientId: client.id, platform: 'x',
      action: 'publish_comment', body: `Distinct comment number ${i} about a completely different subject`,
    });
  }
  const verdict = checkAction({
    agencyId, clientId: client.id, platform: 'x', action: 'publish_comment', body: 'One more',
  });
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.reasons.some((r) => /ceiling/i.test(r)));
});

test('engaging the same author twice inside the cooldown is refused', () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-j' });
  recordAction({
    agencyId, clientId: client.id, platform: 'x', action: 'publish_comment',
    targetAuthor: 'someone', body: 'First reply',
  });
  const verdict = checkAction({
    agencyId, clientId: client.id, platform: 'x', action: 'publish_comment',
    targetAuthor: 'someone', body: 'A totally different second reply on another topic entirely',
  });
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.reasons.some((r) => /already engaged/i.test(r)));
});

test('an exact duplicate of a published comment is refused', () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-k' });
  const body = 'Serum 25-hydroxy is the number that matters here for most people.';
  const opp = opportunityFor(agencyId, client.id);
  const comment = insert('generated_comments', {
    agency_id: agencyId, client_id: client.id, opportunity_id: opp.id,
    variant: 'professional', body, quality_score: 90, status: 'approved',
  });
  insert('published_comments', {
    agency_id: agencyId, client_id: client.id,
    comment_id: comment.id, opportunity_id: opp.id,
    platform: 'x', body, body_fingerprint: textFingerprint(body),
    published_at: new Date().toISOString(),
  });
  const verdict = checkAction({
    agencyId, clientId: client.id, platform: 'x', action: 'publish_comment', body,
  });
  assert.equal(verdict.allowed, false);
});

// --- queue (§47) -------------------------------------------------------------
test('a job is claimed exactly once', () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-l' });
  enqueue({ agencyId, clientId: client.id, kind: 'discover_trends' });

  const first = claim('worker-1', 5);
  const second = claim('worker-2', 5);
  assert.equal(first.length, 1);
  assert.equal(second.length, 0, 'a second worker must not claim the same job');
  complete(first[0].id);
});

test('dedupe keys prevent queueing the same work twice', () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-m' });
  const a = enqueue({ agencyId, clientId: client.id, kind: 'discover_trends', dedupeKey: 'same-key' });
  const b = enqueue({ agencyId, clientId: client.id, kind: 'discover_trends', dedupeKey: 'same-key' });
  assert.equal(b.deduped, true);
  assert.equal(a.id, b.id);
});

test('a job retries with backoff, then dead-letters', () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-n' });
  enqueue({ agencyId, clientId: client.id, kind: 'discover_trends', maxAttempts: 2 });
  const [job] = claim('worker-1', 1);

  const retry = failJob(job, new Error('temporary'));
  assert.equal(retry.status, 'queued');
  assert.ok(retry.backoffMinutes >= 1);

  const dead = failJob({ ...job, attempt: 1, max_attempts: 2 }, new Error('permanent'));
  assert.equal(dead.status, 'dead_letter');
  assert.ok(queueStats().dead_letter.length >= 1);
});

// --- agents and prompts (§39, §49) ------------------------------------------
test('an agent validates its output against its schema', async () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-o' });
  const run = await agents.trendScout.run({ agencyId, clientId: client.id }, {
    client_name: client.name, topic: 'preventive checkups', classification: 'TREND', trend_score: 88,
  });
  assert.ok(run.output.why_it_matters.length > 0);
  assert.ok(['low', 'normal', 'high', 'critical'].includes(run.output.urgency));
  assert.ok(run.promptVersionId, 'the run must record which prompt version it used');
});

test('an agent refuses input that fails its own schema', async () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-p' });
  await assert.rejects(
    agents.trendScout.run({ agencyId, clientId: client.id }, { topic: 'missing client name' }),
    /Validation failed/,
  );
});

test('every agent run is recorded for debugging', async () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-q' });
  await agents.trendScout.run({ agencyId, clientId: client.id }, {
    client_name: client.name, topic: 'x', classification: 'TREND',
  });
  const runs = list('agent_runs', agencyId, { agent: 'trend_scout' });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'succeeded');
  assert.ok(runs[0].duration_ms >= 0);
});

test('an agency prompt override wins over the system default, and history is kept', () => {
  const { agencyId, user } = freshAgency({ slug: 'wf-r' });
  const systemDefault = resolvePrompt({ key: 'brand_comment_prompt', agencyId });
  assert.equal(systemDefault.agency_id, null);

  publishPromptVersion({
    agencyId, key: 'brand_comment_prompt', agent: 'comment_writer', task: 'comment.generate',
    template: 'An agency-specific override that is long enough to pass validation.',
    userId: user.id,
  });

  const resolved = resolvePrompt({ key: 'brand_comment_prompt', agencyId });
  assert.equal(resolved.agency_id, agencyId);
  assert.match(resolved.template, /agency-specific override/);
  assert.ok(list('prompt_versions', agencyId, { key: 'brand_comment_prompt' }).length >= 1);
});

test('prompt rendering substitutes placeholders and tolerates missing values', () => {
  assert.equal(renderPrompt('Hello {{name}}, {{missing}}!', { name: 'world' }), 'Hello world, !');
});

// --- content creation (§16) --------------------------------------------------
test('the content flow produces drafts that all wait for approval', async () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-s' });
  insert('content_pillars', { agency_id: agencyId, client_id: client.id, name: 'Educational', kind: 'educational' });
  insert('trending_topics', {
    agency_id: agencyId, client_id: client.id, topic: 'vitamin d testing',
    classification: 'TREND', trend_score: 88, detected_at: new Date().toISOString(),
  });

  const { ideas } = await generateIdeas({ agencyId, client, count: 2 });
  assert.equal(ideas.length, 2);

  const drafted = await draftFromIdea({
    agencyId, client, ideaId: ideas[0].id, platforms: ['linkedin', 'x'],
  });
  assert.equal(drafted.drafts.length, 2);

  for (const draft of drafted.drafts) {
    assert.equal(draft.approval_status, 'pending');
    assert.notEqual(draft.status, 'PUBLISHED');
  }
  assert.equal(list('approval_items', agencyId, { client_id: client.id, kind: 'content' }).length, 2);
});

test('each platform draft is adapted, not copied', async () => {
  const { agencyId, client } = freshAgency({ slug: 'wf-t' });
  const { ideas } = await generateIdeas({ agencyId, client, count: 1 });
  const drafted = await draftFromIdea({
    agencyId, client, ideaId: ideas[0].id, platforms: ['linkedin', 'x'],
  });
  const [a, b] = drafted.drafts;
  assert.notEqual(a.caption, b.caption, 'the same caption must not be reused across platforms');
});
