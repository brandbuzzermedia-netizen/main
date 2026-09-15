import { getAdapter } from '../platforms/registry.js';
import { clampScore } from '../core/validate.js';
import { similarity } from '../core/anti-spam.js';

/**
 * Content Safety Gate (§26).
 *
 * Runs immediately before any automatic publish, and again as a preview for
 * human reviewers. If any critical check fails, the item does NOT publish: it
 * moves to Needs Review with the failing checks attached.
 *
 * Breaking-news content is always held for verification, regardless of mode.
 */

const CRITICAL = new Set(['content_safety', 'fact_check', 'platform_format', 'media_check', 'policy_check']);

/**
 * @param {{
 *   item: {platform:string, content_type:string, caption?:string, hashtags?:any[],
 *          media?:any[], link_url?:string, classification?:string},
 *   brand?: {words_to_avoid?:string[], emoji_preference?:string, compliance_notes?:string},
 *   brandReview?: {aligned:boolean, issues:string[], score:number},
 *   recentCaptions?: string[],
 *   isBreakingNews?: boolean,
 *   factsVerified?: boolean,
 * }} input
 */
export function runSafetyGate(input) {
  const item = input.item;
  const caption = String(item.caption ?? '');
  /** @type {Record<string, {pass:boolean, detail:string}>} */
  const checks = {};
  const add = (name, pass, detail) => { checks[name] = { pass, detail }; };

  // 1. Content safety — slurs, harassment, and anything targeting a person.
  const unsafe = unsafeContent(caption);
  add('content_safety', unsafe.length === 0, unsafe.join('; ') || 'No unsafe content detected');

  // 2. Brand voice.
  const brandIssues = input.brandReview?.issues
    ?? (input.brand?.words_to_avoid ?? []).filter((w) => w && new RegExp(`\\b${esc(w)}\\b`, 'i').test(caption))
      .map((w) => `Uses an avoided word: "${w}"`);
  add('brand_voice', brandIssues.length === 0, brandIssues.join('; ') || 'Within the brand’s voice rules');

  // 3. Fact check — breaking news must be verified by a person first.
  const needsVerification = input.isBreakingNews || /\b(breaking|just announced|reports say|confirmed today)\b/i.test(caption);
  add('fact_check', !needsVerification || input.factsVerified === true,
    needsVerification
      ? (input.factsVerified ? 'Breaking-news claims marked verified by a reviewer' : 'Breaking-news content must be verified by a person before publishing')
      : 'No time-sensitive factual claims');

  // 4. Duplicate check.
  let worst = 0;
  for (const prev of input.recentCaptions ?? []) worst = Math.max(worst, similarity(caption, prev));
  add('duplicate_check', worst < 0.85,
    worst >= 0.85 ? `${Math.round(worst * 100)}% similar to recently published content` : 'Distinct from recent posts');

  // 5. Platform format — asked of the adapter, not hard-coded (§20).
  let formatDetail = '';
  let formatOk = false;
  try {
    const adapter = getAdapter(item.platform);
    formatOk = adapter.supportsPublishing(/** @type {any} */ (item.content_type));
    formatDetail = formatOk
      ? `${item.platform} supports ${item.content_type} through its official API`
      : `${item.platform} offers no official API publishing for ${item.content_type} — manual action required`;
    if (formatOk) {
      const limit = { x: 280, threads: 500, instagram: 2200, linkedin: 3000 }[item.platform];
      if (limit && caption.length > limit) {
        formatOk = false;
        formatDetail = `Caption is ${caption.length} characters; ${item.platform} allows ${limit}`;
      }
    }
  } catch (err) {
    formatDetail = String(err.message ?? err);
  }
  add('platform_format', formatOk, formatDetail);

  // 6. Link check.
  const linkIssues = linkProblems(item.link_url, caption);
  add('link_check', linkIssues.length === 0, linkIssues.join('; ') || 'Links are well-formed and use HTTPS');

  // 7. Media check.
  const mediaIssues = mediaProblems(item);
  add('media_check', mediaIssues.length === 0, mediaIssues.join('; ') || 'Media is present and addressable');

  // 8. Policy check — our own non-negotiables (§55).
  const policyIssues = policyProblems(caption, item);
  add('policy_check', policyIssues.length === 0, policyIssues.join('; ') || 'No policy conflicts');

  const failed = Object.entries(checks).filter(([, c]) => !c.pass).map(([name]) => name);
  const criticalFailures = failed.filter((name) => CRITICAL.has(name));
  const passed = Object.values(checks).filter((c) => c.pass).length;

  return {
    passed: failed.length === 0,
    publishable: criticalFailures.length === 0,
    score: clampScore((passed / Object.keys(checks).length) * 100),
    failed_checks: failed,
    critical_failures: criticalFailures,
    checks,
    verdict: criticalFailures.length ? 'DO NOT PUBLISH' : failed.length ? 'NEEDS REVIEW' : 'CLEARED',
  };
}

function unsafeContent(text) {
  const issues = [];
  if (/\b(idiot|stupid|scam artist|fraudster)\b/i.test(text)) issues.push('Contains a personal attack');
  if (/\b(kill|die|hate)\s+(them|him|her|you)\b/i.test(text)) issues.push('Contains hostile language directed at a person');
  if (/@\w+\s+(is a|are)\s+\w+/i.test(text) && /\b(bad|terrible|worst|awful)\b/i.test(text)) {
    issues.push('Names and criticises a specific account');
  }
  return issues;
}

function linkProblems(linkUrl, caption) {
  const issues = [];
  const urls = [linkUrl, ...(caption.match(/https?:\/\/\S+/g) ?? [])].filter(Boolean);
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') issues.push(`${url.host} is not served over HTTPS`);
      if (/^(bit\.ly|tinyurl\.com|t\.co|goo\.gl)$/i.test(url.host)) {
        issues.push(`${url.host} is a shortener — use the destination URL so reviewers can see where it goes`);
      }
    } catch {
      issues.push(`"${String(raw).slice(0, 60)}" is not a valid URL`);
    }
  }
  return issues;
}

function mediaProblems(item) {
  const issues = [];
  const needsMedia = ['image', 'carousel', 'reel', 'short_video', 'long_video', 'story'].includes(item.content_type);
  const media = item.media ?? [];
  if (needsMedia && media.length === 0) issues.push(`${item.content_type} requires at least one media item`);
  if (item.content_type === 'carousel' && media.length < 2) issues.push('A carousel needs at least two items');
  for (const m of media) {
    if (!m?.url) { issues.push('A media item has no URL'); continue; }
    try {
      const url = new URL(m.url);
      if (url.protocol !== 'https:') issues.push(`Media must be served over HTTPS (${url.host})`);
    } catch { issues.push(`Media URL "${String(m.url).slice(0, 60)}" is invalid`); }
    if (!m.alt && ['image', 'carousel'].includes(item.content_type)) {
      issues.push('Image is missing alt text');
    }
  }
  return issues;
}

function policyProblems(caption, item) {
  const issues = [];
  if (/\b(follow ?for ?follow|f4f|like ?for ?like|engagement ?pod|comment ?below ?and ?i.ll)\b/i.test(caption)) {
    issues.push('Contains engagement-manipulation phrasing');
  }
  if (/\b(giveaway|contest)\b/i.test(caption) && !/\b(terms|rules|eligib)\w*/i.test(caption)) {
    issues.push('Promotion mentions a giveaway without terms — most platforms require them');
  }
  if ((item.hashtags ?? []).length > 30) issues.push('More than 30 hashtags');
  return issues;
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
