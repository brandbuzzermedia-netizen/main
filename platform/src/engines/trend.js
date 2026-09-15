import { clampScore } from '../core/validate.js';

/**
 * Trend Engine (§7).
 *
 * Trend Score = Recency + Velocity + Engagement + Relevance + Cross-platform,
 * each component scored 0-100 and combined with published weights, so a score
 * can always be explained rather than just asserted. The breakdown is stored
 * alongside the score and shown in the UI.
 */

export const TREND_WEIGHTS = {
  recency: 0.20,
  velocity: 0.25,
  engagement: 0.20,
  relevance: 0.25,
  crossPlatform: 0.10,
};

export const CLASSIFICATIONS = /** @type {const} */ ([
  'TREND', 'NEWS', 'VIRAL', 'INDUSTRY_DISCUSSION', 'COMPETITOR',
  'CUSTOMER_QUESTION', 'MEME', 'EDUCATIONAL', 'PRODUCT', 'LOCAL', 'SEASONAL',
]);

/**
 * @param {{
 *   firstSeenAt?: string, mentions?: number, previousMentions?: number,
 *   totalEngagement?: number, sampleSize?: number,
 *   keywordHits?: number, keywordTotal?: number, industryMatch?: boolean, geoMatch?: boolean,
 *   platforms?: string[],
 * }} signal
 */
export function scoreTrend(signal) {
  const breakdown = {
    recency: recencyScore(signal.firstSeenAt),
    velocity: velocityScore(signal.mentions, signal.previousMentions),
    engagement: engagementScore(signal.totalEngagement, signal.sampleSize),
    relevance: relevanceScore(signal),
    cross_platform: crossPlatformScore(signal.platforms),
  };

  const total =
    breakdown.recency * TREND_WEIGHTS.recency +
    breakdown.velocity * TREND_WEIGHTS.velocity +
    breakdown.engagement * TREND_WEIGHTS.engagement +
    breakdown.relevance * TREND_WEIGHTS.relevance +
    breakdown.cross_platform * TREND_WEIGHTS.crossPlatform;

  const score = clampScore(total);
  return {
    score,
    breakdown,
    velocityPct: velocityPercent(signal.mentions, signal.previousMentions),
    urgency: urgencyFor(score, breakdown),
  };
}

/** Full marks for the last 6 hours, decaying to zero over a week. */
function recencyScore(firstSeenAt) {
  if (!firstSeenAt) return 50;
  const hours = (Date.now() - new Date(firstSeenAt).getTime()) / 3_600_000;
  if (hours < 0) return 100;
  if (hours <= 6) return 100;
  if (hours >= 168) return 0;
  return clampScore(100 * (1 - (hours - 6) / (168 - 6)));
}

/** Rate of change, not absolute volume: a small topic doubling matters. */
function velocityScore(mentions = 0, previous = 0) {
  if (!mentions) return 0;
  if (!previous) return mentions >= 5 ? 70 : 40;
  const growth = (mentions - previous) / previous;
  if (growth <= 0) return clampScore(20 + growth * 20);
  // +100% growth ≈ 85, +200% ≈ 100
  return clampScore(35 + growth * 50);
}

export function velocityPercent(mentions = 0, previous = 0) {
  if (!previous) return mentions ? 100 : 0;
  return Math.round(((mentions - previous) / previous) * 100);
}

/** Engagement per observed item, on a log curve so one viral post can't dominate. */
function engagementScore(totalEngagement = 0, sampleSize = 0) {
  if (!sampleSize || !totalEngagement) return 0;
  const perItem = totalEngagement / sampleSize;
  return clampScore((Math.log10(perItem + 1) / Math.log10(10_001)) * 100);
}

/** How much of THIS client's vocabulary the signal touches. */
function relevanceScore(signal) {
  const hits = Number(signal.keywordHits ?? 0);
  const total = Math.max(Number(signal.keywordTotal ?? 0), 1);
  const coverage = Math.min(hits / Math.min(total, 5), 1) * 70;
  return clampScore(coverage + (signal.industryMatch ? 20 : 0) + (signal.geoMatch ? 10 : 0));
}

/** A topic moving on several platforms at once is a trend, not an artefact. */
function crossPlatformScore(platforms = []) {
  const unique = new Set(platforms).size;
  return clampScore([0, 35, 65, 85, 100][Math.min(unique, 4)]);
}

function urgencyFor(score, breakdown) {
  if (score >= 85 && breakdown.recency >= 80) return 'critical';
  if (score >= 75) return 'high';
  if (score >= 55) return 'normal';
  return 'low';
}

/**
 * Classify a raw signal from what was observed about it. Deliberately rule-based:
 * classification drives downstream automation, so it must be predictable.
 * @param {{excerpt?:string, title?:string, platform?:string, sourceKind?:string,
 *          author?:string, isCompetitor?:boolean, metrics?:Record<string, number>}} raw
 */
export function classifySignal(raw) {
  const text = `${raw.title ?? ''} ${raw.excerpt ?? ''}`.toLowerCase();
  if (raw.isCompetitor) return 'COMPETITOR';
  if (/\?|recommend|suggest|anyone know|looking for|which is better|how do i/.test(text)) return 'CUSTOMER_QUESTION';
  if (raw.sourceKind === 'news' || /announce|launch|report says|study finds|regulat/.test(text)) {
    return /launch|introduc|new product|now available/.test(text) ? 'PRODUCT' : 'NEWS';
  }
  if ((raw.metrics?.views ?? 0) > 100_000 || (raw.metrics?.score ?? 0) > 5_000) return 'VIRAL';
  if (/meme|pov:|nobody:|caption this/.test(text)) return 'MEME';
  if (/how to|guide|explained|tips|mistakes|checklist/.test(text)) return 'EDUCATIONAL';
  if (/diwali|christmas|new year|world .* day|season|monsoon|summer|festival/.test(text)) return 'SEASONAL';
  if (raw.platform === 'reddit' || raw.platform === 'linkedin') return 'INDUSTRY_DISCUSSION';
  return 'TREND';
}

/** A topic is "local" when it names the client's own geography. */
export function isLocalSignal(text, geographies = []) {
  const haystack = String(text ?? '').toLowerCase();
  return geographies.some((g) => g && haystack.includes(String(g).toLowerCase()));
}

/** Count how many of the client's keywords a piece of text touches. */
export function countKeywordHits(text, keywords = []) {
  const haystack = ` ${String(text ?? '').toLowerCase()} `;
  let hits = 0;
  /** @type {string[]} */
  const matched = [];
  for (const kw of keywords) {
    const term = String(kw.term ?? kw).toLowerCase().trim();
    if (term.length < 3) continue;
    if (haystack.includes(` ${term} `) || haystack.includes(`${term} `) || haystack.includes(term)) {
      hits++;
      matched.push(term);
    }
  }
  return { hits, matched };
}
