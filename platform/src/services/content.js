import { find, findBy, insert, list, update } from '../db/repo.js';
import { agents } from '../ai/agents/index.js';
import { adaptForPlatforms } from '../engines/adaptation.js';
import { buildHashtags } from '../engines/hashtags.js';
import { bestTimeToPost, nextSlot } from '../engines/best-time.js';
import { runSafetyGate } from '../engines/safety-gate.js';
import { engagementOf } from '../engines/analytics.js';
import { enqueueApproval } from './approvals.js';
import { audit } from '../core/audit.js';
import { log } from '../core/logger.js';

/**
 * Content creation engine (§16, §17, §21).
 *
 * "Create next week's Instagram content for Ashvee Diagnostics" runs the whole
 * chain: read the trends, read what performed, avoid what's already scheduled,
 * generate ideas, write platform-specific copy, pick times, run the safety
 * gate, and put everything in the approval queue. Nothing schedules itself past
 * a reviewer.
 */

/** @param {{agencyId:string, client:any, count?:number, platforms?:string[], actor?:any}} input */
export async function generateIdeas(input) {
  const { agencyId, client } = input;
  const pillars = list('content_pillars', agencyId, { client_id: client.id, status: 'active' }, { limit: 20 });
  const trends = list('trending_topics', agencyId, { client_id: client.id, status: 'active' },
    { orderBy: 'trend_score DESC', limit: 8 });
  const scheduled = list('scheduled_content', agencyId, { client_id: client.id, status: ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED'] },
    { limit: 50 });
  const published = list('published_content', agencyId, { client_id: client.id },
    { orderBy: 'published_at DESC', limit: 50 });

  const performance = summarisePerformance(published);

  const run = await agents.contentStrategist.run({ agencyId, clientId: client.id }, {
    client_name: client.name,
    industry: client.industry,
    location: client.location,
    target_audience: client.target_audience,
    pillars: pillars.map((p) => ({ name: p.name, kind: p.kind, target_share: p.target_share })),
    topics: trends.map((t) => t.topic),
    performance,
    scheduled: scheduled.map((s) => String(s.caption ?? s.hook ?? '').slice(0, 120)).filter(Boolean),
    platforms: input.platforms ?? [],
    count: input.count ?? 5,
  });

  const created = [];
  for (const idea of run.output.ideas ?? []) {
    const pillar = pillars.find((p) => p.name?.toLowerCase() === String(idea.pillar ?? '').toLowerCase());
    const trend = trends.find((t) => String(idea.title ?? '').toLowerCase().includes(String(t.topic).toLowerCase()));
    const row = insert('content_ideas', {
      agency_id: agencyId,
      client_id: client.id,
      title: idea.title,
      angle: idea.angle ?? null,
      pillar_id: pillar?.id ?? null,
      format: idea.format ?? null,
      hook: idea.hook ?? null,
      outline: idea.outline ?? null,
      platforms: idea.platforms ?? input.platforms ?? [],
      source_trend_id: trend?.id ?? null,
      priority: idea.priority ?? 50,
      status: 'idea',
    });
    created.push(row);
  }

  audit({
    agencyId, clientId: client.id,
    actorType: input.actor?.type ?? 'agent', actorId: input.actor?.id,
    actorLabel: input.actor?.label ?? 'content_strategist',
    action: 'ideas.generated', objectType: 'clients', objectId: client.id,
    next: { count: created.length, prompt_version: run.promptVersionId },
  });

  return { ideas: created, count: created.length, prompt_version_id: run.promptVersionId };
}

/**
 * Turn one idea into platform-specific drafts, timed and queued for approval.
 * @param {{agencyId:string, client:any, ideaId:string, platforms:string[],
 *          media?:any[], actor?:any, weekOf?:string}} input
 */
export async function draftFromIdea(input) {
  const { agencyId, client } = input;
  const idea = find('content_ideas', agencyId, input.ideaId);
  if (!idea) throw new Error('Content idea not found');

  const brand = findBy('brand_profiles', agencyId, { client_id: client.id }) ?? {};
  const keywords = list('keywords', agencyId, { client_id: client.id, status: 'active' }, { limit: 40 });
  const trends = list('trending_topics', agencyId, { client_id: client.id, status: 'active' },
    { orderBy: 'trend_score DESC', limit: 5 });

  // --- copy (§21) ------------------------------------------------------------
  const caption = await agents.captionWriter.run({ agencyId, clientId: client.id }, {
    client_name: client.name, industry: client.industry, location: client.location,
    tone: brand.tone, personality: brand.personality, formality: brand.formality,
    emoji_preference: brand.emoji_preference, cta_style: brand.cta_style,
    words_to_avoid: brand.words_to_avoid ?? [],
    title: idea.title, topic: idea.title, angle: idea.angle, format: idea.format,
    keywords: keywords.map((k) => k.term),
    trending: trends.map((t) => t.topic),
  });

  // --- per-platform adaptation (§19) ----------------------------------------
  const adapted = adaptForPlatforms({
    base: { hook: caption.output.hook, caption: caption.output.caption, cta: caption.output.cta, title: idea.title },
    platforms: input.platforms,
    aiVersions: caption.output.platform_versions ?? {},
    hashtagInput: {
      clientName: client.name, industry: client.industry, location: client.location,
      keywords, topic: idea.title, trendingTopics: trends.map((t) => t.topic),
    },
  });

  const published = list('published_content', agencyId, { client_id: client.id },
    { orderBy: 'published_at DESC', limit: 100 });
  const history = published.map((p) => ({
    published_at: p.published_at, platform: p.platform,
    content_type: p.content_type, engagement: engagementOf(p),
  }));

  const drafts = [];
  for (const [platform, version] of Object.entries(adapted)) {
    // Always reconcile the idea's format against what the platform can carry —
    // an idea authored as "text" must not become an Instagram text post, because
    // Instagram has no such type.
    const contentType = defaultTypeFor(platform, idea.format);
    const timing = bestTimeToPost({ history, platform, contentType });
    const scheduledFor = nextSlot(timing, input.weekOf ? new Date(input.weekOf) : new Date());

    const account = findBy('social_accounts', agencyId, { client_id: client.id, platform, connection_status: 'connected' });

    const draft = insert('scheduled_content', {
      agency_id: agencyId, client_id: client.id, idea_id: idea.id,
      social_account_id: account?.id ?? null,
      platform, content_type: contentType,
      caption: version.caption,
      hook: caption.output.hook,
      cta: caption.output.cta,
      hashtags: version.hashtags,
      media: input.media ?? [],
      scheduled_for: scheduledFor,
      time_source: timing.source === 'history' ? 'best_time' : 'manual',
      time_confidence: timing.confidence,
      status: 'AI_GENERATED',
      approval_status: 'pending',
    });

    // --- safety gate preview, shown to the reviewer (§26) --------------------
    const gate = runSafetyGate({
      item: { ...draft, content_type: contentType },
      brand,
      recentCaptions: published.map((p) => p.caption).filter(Boolean),
    });
    update('scheduled_content', agencyId, draft.id, {
      safety_report: { ...gate, timing },
      status: gate.publishable ? 'IN_REVIEW' : 'IN_REVIEW',
    });

    enqueueApproval({
      agencyId, clientId: client.id, kind: 'content',
      subjectType: 'scheduled_content', subjectId: draft.id,
      platform, title: `${platform} ${contentType}: ${idea.title}`,
      preview: version.caption.slice(0, 400),
      riskFlags: gate.failed_checks,
      qualityScore: gate.score,
      actor: input.actor,
    });

    drafts.push({ ...draft, safety: gate, timing });
  }

  update('content_ideas', agencyId, idea.id, { status: 'in_review' });

  audit({
    agencyId, clientId: client.id,
    actorType: input.actor?.type ?? 'agent', actorId: input.actor?.id,
    actorLabel: input.actor?.label ?? 'content_strategist',
    action: 'content.drafted', objectType: 'content_ideas', objectId: idea.id,
    next: { platforms: input.platforms, drafts: drafts.length },
  });

  return { idea, drafts, caption: caption.output };
}

/**
 * The full §16 flow: ideas → drafts → approval queue, for a whole cycle.
 * @param {{agencyId:string, client:any, platforms:string[], count?:number, actor?:any}} input
 */
export async function buildContentPlan(input) {
  const { ideas } = await generateIdeas({ ...input, count: input.count ?? 5 });
  const results = [];
  for (const idea of ideas) {
    try {
      const drafted = await draftFromIdea({
        agencyId: input.agencyId, client: input.client, ideaId: idea.id,
        platforms: input.platforms, actor: input.actor,
      });
      results.push({ idea_id: idea.id, title: idea.title, drafts: drafted.drafts.length });
    } catch (err) {
      log.warn('draft_failed', { idea_id: idea.id, err: String(err.message ?? err) });
      results.push({ idea_id: idea.id, title: idea.title, error: String(err.message ?? err) });
    }
  }
  return {
    ideas: ideas.length,
    drafted: results.reduce((n, r) => n + (r.drafts ?? 0), 0),
    items: results,
    note: 'Every draft is in the approval queue. Nothing publishes until a person approves it.',
  };
}

function summarisePerformance(published) {
  if (!published.length) return { note: 'No published history yet.' };
  /** @type {Map<string, {total:number, n:number}>} */
  const byType = new Map();
  for (const p of published) {
    const g = byType.get(p.content_type) ?? { total: 0, n: 0 };
    g.total += engagementOf(p);
    g.n += 1;
    byType.set(p.content_type, g);
  }
  return {
    sample_size: published.length,
    by_content_type: [...byType.entries()]
      .map(([type, g]) => ({ type, average_engagement: Number((g.total / g.n).toFixed(1)), samples: g.n }))
      .sort((a, b) => b.average_engagement - a.average_engagement),
  };
}

function defaultTypeFor(platform, ideaFormat) {
  const supported = {
    instagram: ['reel', 'carousel', 'image'],
    facebook: ['image', 'text', 'link', 'reel'],
    linkedin: ['text', 'image', 'document', 'link'],
    x: ['text', 'image', 'link'],
    threads: ['text', 'image'],
    youtube: ['short_video', 'long_video'],
    reddit: ['text', 'link'],
    quora: ['text'],
  }[platform] ?? ['text'];
  return supported.includes(ideaFormat) ? ideaFormat : supported[0];
}

export { buildHashtags };
