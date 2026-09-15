import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshAgency } from './helpers.js';
import { scoreTrend, classifySignal, countKeywordHits } from '../src/engines/trend.js';
import { recommendAction, mayAutoPublish, ALWAYS_REVIEW_PLATFORMS } from '../src/engines/engagement.js';
import { checkComment } from '../src/engines/comment-quality.js';
import { runSafetyGate } from '../src/engines/safety-gate.js';
import { bestTimeToPost, nextSlot, MIN_SAMPLES } from '../src/engines/best-time.js';
import { buildHashtags } from '../src/engines/hashtags.js';
import { adaptForPlatforms, repurposePlan } from '../src/engines/adaptation.js';
import { similarity } from '../src/core/anti-spam.js';

// --- trend scoring (§7) ------------------------------------------------------
test('trend score stays in 0-100 and is explained by its breakdown', () => {
  const result = scoreTrend({
    firstSeenAt: new Date().toISOString(),
    mentions: 30, previousMentions: 10, totalEngagement: 50_000, sampleSize: 30,
    keywordHits: 4, keywordTotal: 8, industryMatch: true, geoMatch: true,
    platforms: ['instagram', 'reddit', 'linkedin'],
  });
  assert.ok(result.score > 70 && result.score <= 100, `unexpected score ${result.score}`);
  for (const value of Object.values(result.breakdown)) {
    assert.ok(value >= 0 && value <= 100);
  }
  assert.equal(result.velocityPct, 200);
});

test('a stale, low-signal topic scores low', () => {
  const result = scoreTrend({
    firstSeenAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
    mentions: 1, previousMentions: 5, totalEngagement: 3, sampleSize: 1,
    keywordHits: 0, keywordTotal: 10, platforms: ['x'],
  });
  assert.ok(result.score < 30, `expected a low score, got ${result.score}`);
  assert.equal(result.urgency, 'low');
});

test('signal classification is rule-based and predictable', () => {
  assert.equal(classifySignal({ excerpt: 'Can anyone recommend a good lab?' }), 'CUSTOMER_QUESTION');
  assert.equal(classifySignal({ excerpt: 'Big news', isCompetitor: true }), 'COMPETITOR');
  assert.equal(classifySignal({ excerpt: 'how to read your report' }), 'EDUCATIONAL');
  assert.equal(classifySignal({ excerpt: 'a post', metrics: { views: 500_000 } }), 'VIRAL');
});

test('keyword matching counts only the client’s own vocabulary', () => {
  const keywords = [{ term: 'vitamin d test' }, { term: 'thyroid' }, { term: 'ab' }];
  const { hits, matched } = countKeywordHits('Where can I get a vitamin d test done?', keywords);
  assert.equal(hits, 1);
  assert.deepEqual(matched, ['vitamin d test']);
  assert.equal(countKeywordHits('nothing relevant here', keywords).hits, 0);
});

// --- engagement thresholds (§12) --------------------------------------------
test('the default threshold gates what counts as "engage"', () => {
  const strong = recommendAction(
    { relevance: 92, brandFit: 88, conversationQuality: 80, promotionalRisk: 20, spamRisk: 5 },
    { platform: 'x' });
  assert.equal(strong.action, 'engage');

  const weakRelevance = recommendAction(
    { relevance: 70, brandFit: 88, conversationQuality: 80, promotionalRisk: 20, spamRisk: 5 },
    { platform: 'x' });
  assert.equal(weakRelevance.action, 'review');

  const spammy = recommendAction(
    { relevance: 95, brandFit: 90, conversationQuality: 80, promotionalRisk: 20, spamRisk: 75 },
    { platform: 'x' });
  assert.equal(spammy.action, 'ignore');
});

test('"engage" is still a recommendation, never permission to publish', () => {
  const result = recommendAction(
    { relevance: 100, brandFit: 100, conversationQuality: 100, promotionalRisk: 0, spamRisk: 0 },
    { platform: 'x' });
  assert.equal(result.requiresApproval, true);
});

test('auto-publishing is refused unless the client is explicitly in controlled-auto', () => {
  const perfect = { relevance_score: 95, brand_fit_score: 90, spam_risk_score: 5, promotional_risk_score: 10 };
  assert.equal(mayAutoPublish({ platform: 'x', mode: 'approval_required', scores: perfect, qualityScore: 95 }).allowed, false);
  assert.equal(mayAutoPublish({ platform: 'x', mode: 'manual', scores: perfect, qualityScore: 95 }).allowed, false);
  assert.equal(mayAutoPublish({ platform: 'x', mode: 'controlled_auto', scores: perfect, qualityScore: 95 }).allowed, true);
});

test('Reddit and Quora never auto-publish, whatever the scores', () => {
  const perfect = { relevance_score: 100, brand_fit_score: 100, spam_risk_score: 0, promotional_risk_score: 0 };
  for (const platform of ALWAYS_REVIEW_PLATFORMS) {
    const verdict = mayAutoPublish({ platform, mode: 'controlled_auto', scores: perfect, qualityScore: 100 });
    assert.equal(verdict.allowed, false, `${platform} must always require a person`);
  }
});

// --- comment quality (§14) ---------------------------------------------------
test('a genuinely useful comment scores high and is not blocked', () => {
  const result = checkComment({
    body: 'Serum 25-hydroxy is the level that matters here, and most people only need it rechecked once a year unless symptoms persist. Worth asking your doctor whether a repeat test is actually needed before booking one.',
    platform: 'reddit',
    opportunityExcerpt: 'How often should I get my vitamin D level tested? My doctor said yearly.',
    brand: {},
  });
  assert.ok(result.score >= 85, `expected a high score, got ${result.score}`);
  assert.equal(result.blocked, false);
});

test('spam, fabricated claims and impersonation are blocked outright', () => {
  const spam = checkComment({
    body: 'BEST lab!!! 🔥🔥🔥🔥 100% accurate guaranteed cure. DM us now, link in bio! https://a.com https://b.com',
    platform: 'reddit', opportunityExcerpt: 'Any lab recommendations?', brand: {}, clientName: 'Ashvee',
  });
  assert.equal(spam.blocked, true);
  assert.ok(spam.blocking_checks.includes('spam'));

  const impersonation = checkComment({
    body: 'As a customer of theirs, I can say the service was excellent and everyone knows they are the best in the city.',
    platform: 'x', opportunityExcerpt: 'Any recommendations?', brand: {},
  });
  assert.equal(impersonation.blocked, true);
  assert.ok(impersonation.blocking_checks.includes('authenticity'));
});

test('unsourced statistics are treated as a misinformation risk', () => {
  const result = checkComment({
    body: 'Around 87% of people in this city are deficient, which is why routine testing matters so much for everyone.',
    platform: 'linkedin', opportunityExcerpt: 'Is deficiency common?', brand: {},
  });
  assert.equal(result.checks.misinformation.pass, false);
});

test('a comment over the platform limit fails platform suitability', () => {
  const result = checkComment({
    body: `${'This is a long reply. '.repeat(40)}`,
    platform: 'x', opportunityExcerpt: 'Thoughts?', brand: {},
  });
  assert.equal(result.checks.platform_suitability.pass, false);
});

test('brand vocabulary rules are enforced', () => {
  const result = checkComment({
    body: 'We offer a cheap option that works well for most people who ask about this.',
    platform: 'x', opportunityExcerpt: 'What are the options?',
    brand: { words_to_avoid: ['cheap'] },
  });
  assert.equal(result.checks.brand_voice.pass, false);
});

// --- safety gate (§26) -------------------------------------------------------
test('the safety gate refuses content the platform cannot publish', () => {
  const gate = runSafetyGate({
    item: { platform: 'instagram', content_type: 'text', caption: 'A text post', media: [] },
  });
  assert.equal(gate.publishable, false);
  assert.ok(gate.critical_failures.includes('platform_format'));
  assert.equal(gate.verdict, 'DO NOT PUBLISH');
});

test('breaking-news content is held until a person verifies it', () => {
  const item = {
    platform: 'linkedin', content_type: 'text',
    caption: 'Breaking: the regulator just announced a change to screening guidelines.',
    media: [],
  };
  assert.equal(runSafetyGate({ item }).checks.fact_check.pass, false);
  assert.equal(runSafetyGate({ item, factsVerified: true }).checks.fact_check.pass, true);
});

test('engagement-manipulation phrasing fails the policy check', () => {
  const gate = runSafetyGate({
    item: { platform: 'linkedin', content_type: 'text', caption: 'Follow for follow! Like for like!', media: [] },
  });
  assert.equal(gate.checks.policy_check.pass, false);
});

test('clean content clears every gate', () => {
  const gate = runSafetyGate({
    item: {
      platform: 'linkedin', content_type: 'text',
      caption: 'Preventive screening uptake is under 20% in urban India. Here is what our own booking data suggests about why.',
      media: [], hashtags: ['#health'],
    },
  });
  assert.equal(gate.verdict, 'CLEARED');
  assert.equal(gate.publishable, true);
});

// --- best time (§23) ---------------------------------------------------------
test('with too little history, best-time says so rather than inventing confidence', () => {
  const result = bestTimeToPost({ history: [], platform: 'instagram' });
  assert.equal(result.source, 'default');
  assert.ok(result.confidence < 50);
  assert.match(result.reason, /default/);
});

test('with enough history, best-time learns from the client’s own results', () => {
  const history = [];
  for (let i = 0; i < MIN_SAMPLES + 6; i++) {
    // Tuesday 19:00 UTC consistently outperforms.
    const tuesday = i % 2 === 0;
    const date = new Date(Date.UTC(2026, 0, tuesday ? 6 : 7, tuesday ? 19 : 4));
    history.push({
      published_at: date.toISOString(), platform: 'instagram',
      content_type: 'reel', engagement: tuesday ? 500 : 20,
    });
  }
  const result = bestTimeToPost({ history, platform: 'instagram', contentType: 'reel' });
  assert.equal(result.source, 'history');
  assert.equal(result.day, 'Tuesday');
  assert.equal(result.hour, 19);
  assert.ok(result.confidence > 50);
  assert.ok(new Date(nextSlot(result)) > new Date());
});

// --- hashtags (§22) ----------------------------------------------------------
test('irrelevant trending hashtags are excluded', () => {
  const result = buildHashtags({
    clientName: 'Ashvee', topic: 'vitamin d test', industry: 'diagnostics',
    keywords: [{ term: 'blood test', kind: 'primary' }],
    trendingTopics: ['celebrity wedding', 'vitamin d deficiency'],
    platform: 'instagram',
  });
  const tags = result.hashtags.map((t) => t.tag.toLowerCase());
  assert.ok(tags.some((t) => t.includes('vitamin')));
  assert.ok(!tags.some((t) => t.includes('celebrity')), 'an unrelated viral tag must not be added');
});

test('Reddit gets no hashtags at all', () => {
  const result = buildHashtags({ clientName: 'Ashvee', topic: 'testing', platform: 'reddit' });
  assert.equal(result.hashtags.length, 0);
  assert.equal(result.limit, 0);
});

// --- adaptation (§19, §29) ---------------------------------------------------
test('each platform gets a genuinely different version, within its limits', () => {
  const versions = adaptForPlatforms({
    base: { hook: 'One number on your report', caption: 'A'.repeat(900), cta: 'Ask below.' },
    platforms: ['x', 'linkedin', 'instagram'],
    hashtagInput: { clientName: 'Ashvee', topic: 'testing' },
  });
  assert.ok(versions.x.char_count <= 280, 'X copy must fit 280 characters');
  assert.ok(versions.x.notes.some((n) => /Trimmed/.test(n)));
  assert.notEqual(versions.x.caption, versions.linkedin.caption);
  assert.ok(versions.instagram.hashtags.length > 0);
});

test('repurposing reports MANUAL_ACTION_REQUIRED instead of promising the impossible', () => {
  const plan = repurposePlan({ sourceContentType: 'reel', targetPlatforms: ['youtube', 'quora'] });
  assert.equal(plan.find((p) => p.platform === 'youtube').status, 'SUPPORTED');
  assert.equal(plan.find((p) => p.platform === 'quora').status, 'MANUAL_ACTION_REQUIRED');
});

// --- similarity --------------------------------------------------------------
test('similarity catches a reworded duplicate but not a different comment', () => {
  const a = 'Serum 25-hydroxy is the level that matters and once a year is usually enough for most people';
  const b = 'Serum 25-hydroxy is the level that matters and once a year is usually enough for most folks';
  const c = 'Interior design costs depend far more on the carcass material than on the finish you choose';
  assert.ok(similarity(a, b) > 0.6, 'a reworded duplicate should score high');
  assert.ok(similarity(a, c) < 0.1);
});
