import { clampScore } from '../core/validate.js';
import { similarity } from '../core/anti-spam.js';

/**
 * Comment Quality Checker (§14).
 *
 * Ten checks, run in order, before any comment reaches a human reviewer. Each
 * returns pass/fail with a reason; critical failures block the comment outright
 * rather than lowering its score.
 *
 * These are deterministic rules on purpose: the thing that decides whether a
 * comment is publishable should not itself be a model that can be talked round.
 */

const CHECKS = [
  'relevance', 'authenticity', 'brand_voice', 'grammar', 'misinformation',
  'promotional_tone', 'spam', 'repetition', 'platform_suitability', 'legal_compliance',
];

/** Checks whose failure blocks publication regardless of score. */
const CRITICAL = new Set(['authenticity', 'misinformation', 'spam', 'legal_compliance']);

const PLATFORM_LIMITS = {
  x: 280, threads: 500, instagram: 2200, facebook: 8000,
  linkedin: 1250, reddit: 10000, youtube: 10000, quora: 10000,
};

/**
 * @param {{
 *   body: string, platform: string, opportunityExcerpt?: string,
 *   brand?: {tone?:string, words_to_avoid?:string[], preferred_vocabulary?:string[],
 *            emoji_preference?:string, compliance_notes?:string},
 *   recentComments?: string[], clientName?: string,
 *   brandReview?: {aligned:boolean, score:number, issues:string[]},
 * }} input
 */
export function checkComment(input) {
  const body = String(input.body ?? '').trim();
  /** @type {Record<string, {pass:boolean, detail:string, weight:number}>} */
  const results = {};

  const add = (name, pass, detail, weight = 10) => { results[name] = { pass, detail, weight }; };

  // 1. Relevance — does it engage with what was actually said?
  const overlap = input.opportunityExcerpt ? contentOverlap(body, input.opportunityExcerpt) : 0.3;
  add('relevance', overlap >= 0.06 || body.length > 120,
    overlap >= 0.06 ? 'References the specifics of the thread' : 'Reads as generic — it could be pasted under any post', 14);

  // 2. Authenticity — no pretending, no fabricated experience.
  const impersonation = /\bas a (customer|patient|client|user)\b|i bought|i was treated at|my experience with (them|this brand)/i.test(body);
  const fakeSocialProof = /everyone (says|knows)|thousands of (people|customers)|best in (the )?(city|country|india|world)/i.test(body);
  add('authenticity', !impersonation && !fakeSocialProof,
    impersonation ? 'Implies first-person customer experience the brand cannot claim'
      : fakeSocialProof ? 'Contains unverifiable social proof'
      : 'Speaks as the brand without impersonating anyone', 20);

  // 3. Brand voice — the Brand Guardian's verdict, if it ran.
  const brandIssues = input.brandReview?.issues ?? bannedWords(body, input.brand?.words_to_avoid);
  add('brand_voice', brandIssues.length === 0,
    brandIssues.length ? brandIssues.join('; ') : 'Matches the client’s voice rules', 10);

  // 4. Grammar — light structural checks only.
  const grammarIssues = grammarProblems(body);
  add('grammar', grammarIssues.length === 0, grammarIssues.join('; ') || 'Reads cleanly', 8);

  // 5. Misinformation — unsourced numbers and absolute claims.
  const claims = riskyClaims(body);
  add('misinformation', claims.length === 0,
    claims.length ? `Unsupported claim(s): ${claims.join('; ')}` : 'No factual claims that need a source', 18);

  // 6. Promotional tone.
  const promo = promotionalSignals(body, input.clientName);
  add('promotional_tone', promo.length <= 1,
    promo.length ? `Promotional signals: ${promo.join(', ')}` : 'Reads as participation, not marketing', 14);

  // 7. Spam — keyword stuffing, link dumping, emoji spray.
  const spam = spamSignals(body, input.brand?.emoji_preference);
  add('spam', spam.length === 0, spam.join('; ') || 'No spam signals', 18);

  // 8. Repetition against recent comments.
  let worst = 0;
  for (const prev of input.recentComments ?? []) worst = Math.max(worst, similarity(body, prev));
  add('repetition', worst < 0.7,
    worst >= 0.7 ? `${Math.round(worst * 100)}% similar to a recent comment` : 'Distinct from recent comments', 12);

  // 9. Platform suitability.
  const limit = PLATFORM_LIMITS[input.platform] ?? 2000;
  const tooLong = body.length > limit;
  const redditPromo = input.platform === 'reddit' && promo.length > 0;
  add('platform_suitability', !tooLong && !redditPromo,
    tooLong ? `${body.length} characters exceeds ${input.platform}'s ${limit}`
      : redditPromo ? 'Promotional phrasing breaks most subreddit rules'
      : `Fits ${input.platform} norms and limits`, 10);

  // 10. Legal / compliance — client-specific red lines.
  const compliance = complianceProblems(body, input.brand?.compliance_notes);
  add('legal_compliance', compliance.length === 0,
    compliance.join('; ') || 'No compliance flags', 20);

  const totalWeight = Object.values(results).reduce((n, r) => n + r.weight, 0);
  const earned = Object.values(results).reduce((n, r) => n + (r.pass ? r.weight : 0), 0);
  const score = clampScore((earned / totalWeight) * 100);
  const failedCritical = CHECKS.filter((c) => !results[c].pass && CRITICAL.has(c));

  return {
    score,
    blocked: failedCritical.length > 0,
    blocking_checks: failedCritical,
    checks: results,
    summary: summarise(results, score),
  };
}

function summarise(results, score) {
  const lines = [`COMMENT QUALITY SCORE: ${score}/100`];
  const label = {
    relevance: 'Relevant', authenticity: 'Natural', brand_voice: 'Brand aligned',
    grammar: 'Well formed', misinformation: 'Factually safe', promotional_tone: 'Low promotional risk',
    spam: 'Not spammy', repetition: 'Not repetitive', platform_suitability: 'Platform appropriate',
    legal_compliance: 'Compliant',
  };
  for (const [name, r] of Object.entries(results)) {
    lines.push(`${r.pass ? '✓' : '✗'} ${label[name] ?? name}${r.pass ? '' : ` — ${r.detail}`}`);
  }
  return lines.join('\n');
}

function contentOverlap(a, b) {
  const words = (s) => new Set(String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .filter((w) => w.length > 4));
  const A = words(a); const B = words(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}

function bannedWords(body, avoid = []) {
  return (avoid ?? [])
    .filter((w) => w && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(body))
    .map((w) => `Uses a word the brand avoids: "${w}"`);
}

function grammarProblems(body) {
  const issues = [];
  if (!/^[\p{Lu}"'#@]/u.test(body)) issues.push('Does not start with a capital letter');
  if (!/[.!?…]$/.test(body.trim())) issues.push('Does not end with terminal punctuation');
  if (/\s{3,}/.test(body)) issues.push('Contains runs of whitespace');
  if (/(.)\1{4,}/.test(body)) issues.push('Contains repeated character runs');
  if (/\b([A-Z]{5,})\b/.test(body)) issues.push('Contains shouted words');
  return issues;
}

function riskyClaims(body) {
  const claims = [];
  const stats = body.match(/\b\d{2,3}(\.\d+)?\s*%/g);
  if (stats && !/according to|source:|per the|study by/i.test(body)) {
    claims.push(`cites ${stats.join(', ')} without a source`);
  }
  if (/\b(cure|cures|guaranteed|100% accurate|no side effects|risk-free|proven to)\b/i.test(body)) {
    claims.push('makes an absolute efficacy claim');
  }
  if (/\b(number one|#1|best|leading)\b.{0,30}\b(in|across)\b/i.test(body)) {
    claims.push('makes a superiority claim');
  }
  return claims;
}

function promotionalSignals(body, clientName) {
  const signals = [];
  if (/\b(dm us|dm me|link in bio|visit our|book now|call us|whatsapp us|our website|check us out)\b/i.test(body)) signals.push('direct CTA');
  if (/https?:\/\//.test(body)) signals.push('contains a link');
  if (/\b(offer|discount|free consultation|special price|limited time)\b/i.test(body)) signals.push('promotional offer');
  if (clientName && new RegExp(`\\b${String(clientName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi').test(body)) {
    const mentions = body.match(new RegExp(String(clientName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))?.length ?? 0;
    if (mentions > 1) signals.push(`names the brand ${mentions} times`);
  }
  return signals;
}

function spamSignals(body, emojiPreference = 'sparing') {
  const issues = [];
  const emojis = (body.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  const limit = emojiPreference === 'none' ? 0 : emojiPreference === 'liberal' ? 6 : 2;
  if (emojis > limit) issues.push(`${emojis} emoji exceeds the brand's "${emojiPreference}" preference`);

  const hashtags = (body.match(/#\w+/g) ?? []).length;
  if (hashtags > 2) issues.push(`${hashtags} hashtags in a reply reads as keyword stuffing`);

  const links = (body.match(/https?:\/\//g) ?? []).length;
  if (links > 1) issues.push(`${links} links in one comment`);

  const words = body.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 4);
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const stuffed = [...counts.entries()].filter(([, n]) => n >= 4).map(([w]) => w);
  if (stuffed.length) issues.push(`repeats "${stuffed.join('", "')}" excessively`);

  return issues;
}

function complianceProblems(body, notes) {
  const issues = [];
  // Health and finance claims are the two that reliably cause real harm.
  if (/\b(diagnos|treat|cure|prescrib|dosage)\w*\b/i.test(body) && !/consult|doctor|physician|professional/i.test(body)) {
    issues.push('Gives health guidance without directing the reader to a professional');
  }
  if (/\b(returns|profit|roi)\b.{0,20}\b(guaranteed|assured)\b/i.test(body)) {
    issues.push('Implies guaranteed financial returns');
  }
  if (/\b(we are|as)\b.{0,20}\bthe only\b/i.test(body)) {
    issues.push('Exclusivity claim that would need substantiation');
  }
  for (const rule of String(notes ?? '').split('\n').map((s) => s.trim()).filter(Boolean)) {
    const m = rule.match(/^never (?:say|use|mention)\s+(.+)$/i);
    if (m && new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(body)) {
      issues.push(`Breaks a client compliance rule: ${rule}`);
    }
  }
  return issues;
}

export { CHECKS, CRITICAL, PLATFORM_LIMITS };
