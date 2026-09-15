import { config } from '../config.js';
import { clampScore } from '../core/validate.js';

/**
 * Engagement scoring and the recommendation threshold (§12).
 *
 * The default gate is deliberately narrow:
 *   relevance >= 80 AND brand_fit >= 75 AND spam_risk <= 20
 *
 * Administrators can move these, but two things are not configurable:
 *  - Reddit and Quora always require human approval, whatever the score.
 *  - A recommendation of "engage" still goes through the approval workflow
 *    unless the client is explicitly in controlled-auto mode for that platform.
 */

/** Platforms where community norms make automated participation inappropriate. */
export const ALWAYS_REVIEW_PLATFORMS = new Set(['reddit', 'quora']);

/**
 * @param {{relevance:number, brandFit:number, conversationQuality:number,
 *          promotionalRisk:number, spamRisk:number}} scores
 * @param {{platform:string, thresholds?:Partial<typeof config.thresholds>}} ctx
 */
export function recommendAction(scores, ctx) {
  const t = { ...config.thresholds, ...(ctx.thresholds ?? {}) };
  const reasons = [];

  if (scores.relevance < t.relevance) reasons.push(`Relevance ${scores.relevance} is below the ${t.relevance} threshold`);
  if (scores.brandFit < t.brandFit) reasons.push(`Brand fit ${scores.brandFit} is below the ${t.brandFit} threshold`);
  if (scores.spamRisk > t.spamRisk) reasons.push(`Spam risk ${scores.spamRisk} is above the ${t.spamRisk} ceiling`);
  if (scores.promotionalRisk >= 70) reasons.push(`Promotional risk ${scores.promotionalRisk} is high for a public thread`);
  if (scores.conversationQuality < 40) reasons.push(`Conversation quality ${scores.conversationQuality} is too low to be worth joining`);

  if (scores.relevance < 45 || scores.spamRisk > 60) {
    return { action: 'ignore', reasons, requiresApproval: true };
  }
  if (reasons.length) {
    return { action: 'review', reasons, requiresApproval: true };
  }
  return {
    action: 'engage',
    reasons: ['Meets every relevance, brand-fit and spam threshold'],
    // "engage" is a recommendation to a person, not permission to publish.
    requiresApproval: true,
  };
}

/**
 * Whether an approved comment may be published without a person pressing the
 * button. This is the only place that answers that question.
 * @param {{platform:string, mode:string, scores:any, qualityScore:number, contentType?:string}} input
 */
export function mayAutoPublish(input) {
  if (input.mode !== 'controlled_auto') {
    return { allowed: false, reason: 'Client automation mode requires human approval' };
  }
  if (ALWAYS_REVIEW_PLATFORMS.has(input.platform)) {
    return { allowed: false, reason: `${input.platform} participation always requires a person` };
  }
  if (input.qualityScore < config.thresholds.commentQuality) {
    return { allowed: false, reason: `Quality score ${input.qualityScore} is below the automation floor` };
  }
  const s = input.scores ?? {};
  if (s.relevance_score < 90 || s.brand_fit_score < 85 || s.spam_risk_score > 10 || s.promotional_risk_score > 25) {
    return { allowed: false, reason: 'Scores are inside the manual-review band for automation' };
  }
  return { allowed: true, reason: 'Low-risk, high-relevance and within the client’s controlled-auto policy' };
}

/**
 * Heuristic pre-scoring applied before the agent sees an item. Cheap, and it
 * keeps obviously irrelevant conversations out of the model's input entirely.
 * @param {{excerpt:string, keywordHits:number, keywordTotal:number, industryMatch:boolean}} input
 */
export function prescore(input) {
  const text = String(input.excerpt ?? '');
  const isQuestion = /\?/.test(text) || /recommend|suggest|looking for|anyone know/i.test(text);
  const promotional = /buy now|discount|coupon|dm me|link in bio|limited offer/i.test(text);
  const thin = text.trim().length < 40;

  return {
    relevance: clampScore((input.keywordHits / Math.max(input.keywordTotal, 1)) * 60 + (isQuestion ? 25 : 0) + (input.industryMatch ? 15 : 0)),
    conversationQuality: clampScore(thin ? 25 : Math.min(text.length / 4, 85)),
    spamRisk: clampScore(promotional ? 65 : thin ? 35 : 10),
    isQuestion,
  };
}
