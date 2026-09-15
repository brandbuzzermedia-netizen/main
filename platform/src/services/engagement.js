import { find, findBy, insert, list, update } from '../db/repo.js';
import { agents } from '../ai/agents/index.js';
import { checkComment } from '../engines/comment-quality.js';
import { mayAutoPublish, ALWAYS_REVIEW_PLATFORMS } from '../engines/engagement.js';
import { getAdapter } from '../platforms/registry.js';
import { usableCredentials } from './credentials.js';
import { enqueueApproval } from './approvals.js';
import { queueComment } from './publishing.js';
import { audit } from '../core/audit.js';
import { log } from '../core/logger.js';
import { config } from '../config.js';

/**
 * AI comment generation (§13) and the quality gate in front of it (§14).
 *
 * Three alternatives are drafted, each is checked independently, and blocked
 * variants are kept (marked blocked) rather than silently dropped — a reviewer
 * should be able to see what the system rejected and why.
 */

/**
 * @param {{agencyId:string, clientId:string, opportunityId:string, actor?:any}} input
 */
export async function generateComments(input) {
  const { agencyId, clientId } = input;
  const opportunity = find('engagement_opportunities', agencyId, input.opportunityId);
  if (!opportunity) throw new Error('Opportunity not found');
  if (opportunity.client_id !== clientId) throw new Error('Opportunity belongs to another client');

  const client = find('clients', agencyId, clientId);
  const brand = findBy('brand_profiles', agencyId, { client_id: clientId }) ?? {};

  // Community rules go into the prompt where the platform publishes them.
  let platformRules = '';
  if (opportunity.platform === 'reddit' && opportunity.context) {
    platformRules = await fetchRedditRules(agencyId, clientId, opportunity.context);
  }

  const run = await agents.commentWriter.run(
    { agencyId, clientId, platform: opportunity.platform },
    {
      client_name: client.name,
      client_company: client.company_name,
      industry: client.industry,
      tone: brand.tone, personality: brand.personality, formality: brand.formality,
      comment_style: brand.comment_style,
      words_to_avoid: brand.words_to_avoid ?? [],
      emoji_preference: brand.emoji_preference ?? 'sparing',
      platform: opportunity.platform,
      platform_rules: platformRules,
      context: opportunity.context ?? '',
      topic: (client.products ?? [])[0] ?? client.industry ?? '',
      expertise: client.products ?? [],
      excerpt: String(opportunity.excerpt).slice(0, 3900),
    },
  );

  if (!run.output.variants?.length) {
    update('engagement_opportunities', agencyId, opportunity.id, {
      status: 'dismissed',
      reasoning: `${opportunity.reasoning ?? ''} — the comment writer found nothing genuinely useful to add.`.trim(),
    });
    return { comments: [], note: 'The agent judged that the client has nothing useful to add here, so nothing was drafted.' };
  }

  const recent = list('published_comments', agencyId, { client_id: clientId },
    { orderBy: 'published_at DESC', limit: 30 }).map((c) => c.body);

  const created = [];
  for (const variant of run.output.variants) {
    // The Brand Guardian reviews before the deterministic checker scores.
    let brandReview = null;
    try {
      const guard = await agents.brandGuardian.run({ agencyId, clientId }, {
        text: variant.body,
        tone: brand.tone, personality: brand.personality, formality: brand.formality,
        preferred_vocabulary: brand.preferred_vocabulary ?? [],
        words_to_avoid: brand.words_to_avoid ?? [],
        emoji_preference: brand.emoji_preference ?? 'sparing',
        compliance_notes: brand.compliance_notes,
      });
      brandReview = guard.output;
    } catch (err) {
      log.warn('brand_guardian_failed', { err: String(err.message ?? err) });
    }

    const quality = checkComment({
      body: variant.body,
      platform: opportunity.platform,
      opportunityExcerpt: opportunity.excerpt,
      brand,
      recentComments: recent,
      clientName: client.name,
      brandReview,
    });

    const comment = insert('generated_comments', {
      agency_id: agencyId,
      client_id: clientId,
      opportunity_id: opportunity.id,
      variant: variant.variant,
      body: variant.body,
      quality_score: quality.score,
      quality_report: { ...quality, brand_review: brandReview },
      blocked: quality.blocked ? 1 : 0,
      prompt_version_id: run.promptVersionId,
      model: run.model,
      status: quality.blocked ? 'rejected' : 'draft',
    });
    created.push({ ...comment, quality });
  }

  update('engagement_opportunities', agencyId, opportunity.id, { status: 'queued' });

  // Queue the best passing variant for a human decision.
  const best = created
    .filter((c) => !c.blocked)
    .sort((a, b) => b.quality_score - a.quality_score)[0];

  if (best) {
    update('generated_comments', agencyId, best.id, { status: 'in_review' });
    enqueueApproval({
      agencyId, clientId, kind: 'comment',
      subjectType: 'generated_comments', subjectId: best.id,
      platform: opportunity.platform,
      title: `${opportunity.platform} reply — ${String(opportunity.excerpt).slice(0, 60)}…`,
      preview: best.body,
      riskFlags: Object.entries(best.quality.checks).filter(([, c]) => !c.pass).map(([name]) => name),
      qualityScore: best.quality_score,
      actor: input.actor,
    });
  }

  audit({
    agencyId, clientId,
    actorType: input.actor?.type ?? 'agent', actorId: input.actor?.id,
    actorLabel: input.actor?.label ?? 'comment_writer',
    action: 'comment.generated',
    objectType: 'engagement_opportunities', objectId: opportunity.id,
    platform: opportunity.platform,
    next: { variants: created.length, blocked: created.filter((c) => c.blocked).length },
  });

  return {
    comments: created.map(({ quality, ...c }) => ({ ...c, quality_report: quality })),
    queued_for_approval: best?.id ?? null,
    note: best
      ? 'The highest-scoring variant is in the approval queue. Nothing is published until a person approves it.'
      : 'Every variant failed a critical quality check, so none was queued. Regenerate or write one by hand.',
  };
}

/**
 * Approve a comment and decide what happens next: queue it for publishing if
 * the client is in controlled-auto and the scores allow, otherwise leave it for
 * a person to send.
 * @param {{agencyId:string, clientId:string, commentId:string, userId:string}} input
 */
export function approveComment(input) {
  const { agencyId, clientId } = input;
  const comment = find('generated_comments', agencyId, input.commentId);
  if (!comment) throw new Error('Comment not found');
  if (comment.blocked) throw new Error('This comment failed a critical quality check and cannot be approved');

  const opportunity = find('engagement_opportunities', agencyId, comment.opportunity_id);
  const rule = findBy('automation_rules', agencyId, { client_id: clientId, kind: 'engagement', status: 'active' });
  const mode = rule?.mode ?? 'approval_required';

  update('generated_comments', agencyId, comment.id, { status: 'approved', edited_by: input.userId });

  const auto = mayAutoPublish({
    platform: opportunity.platform,
    mode,
    scores: opportunity,
    qualityScore: comment.quality_score,
  });

  if (auto.allowed) {
    queueComment({
      agencyId, clientId, commentId: comment.id, platform: opportunity.platform,
    });
    return { queued: true, mode, reason: auto.reason };
  }

  return {
    queued: false,
    mode,
    reason: auto.reason,
    manual_note: ALWAYS_REVIEW_PLATFORMS.has(opportunity.platform)
      ? `${opportunity.platform} replies are always sent by a person. Copy the approved text and post it from the connected account.`
      : 'Approved. Use "Send now" to publish it, or leave it queued for a person.',
  };
}

async function fetchRedditRules(agencyId, clientId, context) {
  const subreddit = String(context).replace(/^r\//, '');
  const account = findBy('social_accounts', agencyId, { client_id: clientId, platform: 'reddit', connection_status: 'connected' });
  if (!account) return 'Follow the subreddit’s own rules; treat any promotion as disallowed unless the subreddit says otherwise.';
  try {
    const creds = await usableCredentials(agencyId, account);
    if (!creds) return '';
    const adapter = /** @type {any} */ (getAdapter('reddit'));
    const rules = await adapter.fetchRules(creds, subreddit);
    if (!rules.length) return `Subreddit r/${subreddit}: rules unavailable — assume no self-promotion.`;
    return `Rules for r/${subreddit}:\n${rules.map((r) => `- ${r.name}: ${String(r.description ?? '').slice(0, 200)}`).join('\n')}`;
  } catch {
    return `Subreddit r/${subreddit}: rules could not be fetched — assume no self-promotion.`;
  }
}

export { config };
