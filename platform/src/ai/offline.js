import { clampScore } from '../core/validate.js';

/**
 * Offline AI provider.
 *
 * Deterministic, dependency-free stand-ins for every agent task, so the
 * platform is fully operable — and testable — with no API key and no network.
 * The output shape is identical to the live provider's, so switching between
 * them changes quality, not behaviour.
 *
 * These are honest heuristics, not a simulation of having researched something:
 * they only ever recombine data the system already holds about the client.
 */

/** @param {{task:string, input:any}} req */
export async function offlineComplete(req) {
  const handler = HANDLERS[req.task] ?? (() => ({}));
  const json = handler(req.input ?? {});
  const text = JSON.stringify(json, null, 2);
  return { json, text, model: 'offline-heuristic/v1', tokensIn: 0, tokensOut: 0 };
}

const sentence = (s) => (s ? String(s).trim().replace(/\s+/g, ' ') : '');
const titleCase = (s) => String(s ?? '').replace(/\b\w/g, (c) => c.toUpperCase());

/** Shared vocabulary describing why a signal matters, keyed by classification. */
const WHY = {
  TREND: 'Mention volume is climbing across several platforms at once, so the window for a native-feeling take is open now rather than next week.',
  NEWS: 'This is a live news moment; commentary published in the first 24-48 hours is what gets indexed and shared.',
  VIRAL: 'A specific piece of content is outperforming its baseline, which usually means the format — not just the topic — is doing the work.',
  INDUSTRY_DISCUSSION: 'Practitioners are actively debating this, which is where thought-leadership content earns credibility.',
  COMPETITOR: 'A competitor is getting traction here; being absent from the conversation cedes the topic to them.',
  CUSTOMER_QUESTION: 'Real prospects are asking this out loud. Answering it well is both content and demand capture.',
  MEME: 'A format is circulating that the audience already understands; borrow the structure, never the asset.',
  EDUCATIONAL: 'There is a knowledge gap the brand is qualified to close.',
  PRODUCT: 'Product-adjacent interest is elevated, so a promotional angle will land less coldly than usual.',
  LOCAL: 'The signal is concentrated in the client’s own geography, where their offer actually reaches.',
  SEASONAL: 'A recurring calendar moment is approaching and can be planned for rather than reacted to.',
};

const HANDLERS = {
  // --- Trend Scout -----------------------------------------------------------
  'trend.explain': (input) => ({
    why_it_matters: WHY[input.classification] ?? WHY.TREND,
    urgency: input.trend_score >= 85 ? 'high' : input.trend_score >= 65 ? 'normal' : 'low',
    recommended_angle: `Explain what "${sentence(input.topic)}" actually means for ${input.client_name ?? 'this audience'}, in plain language, with one concrete example from the client's own work.`,
    recommended_format: input.classification === 'NEWS' ? 'text' : 'reel',
    suggested_hook: hookFor(input.topic, input.classification),
    recommended_platforms: input.platforms?.length ? input.platforms : ['instagram', 'linkedin'],
  }),

  // --- Content Analyst (inspiration) ----------------------------------------
  'inspiration.analyze': (input) => {
    const er = Number(input.engagement_rate ?? 0);
    return {
      hook: sentence(input.excerpt)?.split(/[.!?]/)[0]?.slice(0, 120)
        || `Opens on the problem rather than the brand`,
      caption_structure: er > 0.05
        ? 'Hook → one surprising fact → three-beat explanation → single clear CTA'
        : 'Hook → context → explanation → CTA',
      cta: 'Invites a reply rather than a click, which is what the format rewards',
      why_it_worked: [
        `The opening line states a problem the viewer already has.`,
        `The topic ("${sentence(input.topic) || 'the subject'}") is specific enough to be useful and broad enough to share.`,
        er > 0.05 ? 'Engagement rate is well above the platform baseline for this format.' : 'Steady engagement for the format and follower count.',
      ].join(' '),
      suggested_adaptation: `Build an original piece on the same underlying question for ${input.client_name ?? 'the client'}: same structure, entirely the client's own footage, data and examples. Do not reuse the original's media, script or captions.`,
      relevance_score: clampScore(40 + (input.keyword_hits ?? 0) * 12 + (er > 0.05 ? 15 : 0)),
    };
  },

  // --- Engagement Scout ------------------------------------------------------
  'engagement.assess': (input) => {
    const hits = Number(input.keyword_hits ?? 0);
    const isQuestion = /\?|recommend|suggest|looking for|anyone know|help/i.test(input.excerpt ?? '');
    const promotional = /buy now|discount|dm me|link in bio|promo/i.test(input.excerpt ?? '');
    return {
      relevance_score: clampScore(35 + hits * 15 + (isQuestion ? 20 : 0)),
      brand_fit_score: clampScore(45 + hits * 10 + (input.industry_match ? 20 : 0)),
      conversation_quality_score: clampScore(
        (input.excerpt ?? '').length > 120 ? 75 : 50) - (promotional ? 25 : 0),
      promotional_risk_score: clampScore(promotional ? 70 : isQuestion ? 20 : 35),
      spam_risk_score: clampScore(promotional ? 60 : 10),
      reasoning: isQuestion
        ? 'A direct question where the client has first-hand expertise. A specific, non-promotional answer adds real value to the thread.'
        : 'Topically related discussion. Participation is only worthwhile if the client can add something the thread does not already contain.',
    };
  },

  // --- Comment Writer --------------------------------------------------------
  'comment.generate': (input) => {
    const topic = sentence(input.topic) || 'this';
    const excerpt = sentence(input.excerpt).slice(0, 180);
    const who = input.client_company ?? input.client_name ?? 'our team';
    const detail = (input.expertise ?? []).slice(0, 2).join(' and ') || topic;
    return {
      variants: [
        {
          variant: 'professional',
          body: `On ${topic}: the thing that usually decides the outcome is ${detail}. From what you have described, the first step worth taking is the least expensive one — confirm the basics before committing to anything bigger. Happy to point you to a neutral explainer if that helps.`,
        },
        {
          variant: 'conversational',
          body: `Came across this and wanted to add one thing. ${excerpt ? 'You mentioned something specific there' : 'Good question'} — in practice ${detail} is where most people get tripped up. Worth checking that before anything else. Genuinely no agenda here, just something we see a lot.`,
        },
        {
          variant: 'expert',
          body: `Short answer: it depends on ${detail}. Longer answer — there are two variables that matter, and most guidance online conflates them. Get the first one right and the second usually sorts itself out. ${who} deals with this regularly, so if you want the detail behind that I can share it.`,
        },
      ],
    };
  },

  // --- Content Strategist ----------------------------------------------------
  'content.ideas': (input) => {
    const pillars = input.pillars?.length ? input.pillars : [{ name: 'Educational', kind: 'educational' }];
    const topics = input.topics?.length ? input.topics : ['what the audience keeps asking about'];
    const formats = ['reel', 'carousel', 'text', 'image', 'short_video'];
    const ideas = [];
    for (let i = 0; i < Math.min(Number(input.count ?? 5), 12); i++) {
      const pillar = pillars[i % pillars.length];
      const topic = topics[i % topics.length];
      ideas.push({
        title: `${titleCase(pillar.name)}: ${sentence(topic)}`,
        angle: `Answer one narrow question about ${sentence(topic)} that ${input.client_name ?? 'the client'} can answer better than a generic search result.`,
        format: formats[i % formats.length],
        hook: hookFor(topic, pillar.kind?.toUpperCase?.() ?? 'EDUCATIONAL'),
        outline: [
          'Open on the misconception, not the brand.',
          `State the one fact that changes the reader's mind about ${sentence(topic)}.`,
          'Show it with a real example from the client’s own work.',
          'Close with a next step that costs the reader nothing.',
        ].join('\n'),
        pillar: pillar.name,
        platforms: input.platforms?.length ? input.platforms : ['instagram', 'linkedin'],
        priority: clampScore(90 - i * 6),
      });
    }
    return { ideas };
  },

  // --- Caption engine --------------------------------------------------------
  'caption.generate': (input) => {
    const topic = sentence(input.topic) || sentence(input.title) || 'this';
    const base = {
      hook: hookFor(topic, 'EDUCATIONAL'),
      // The hook is returned separately; the caption must not repeat it, or
      // platform adaptation ends up printing the same line twice.
      caption: `Most advice about ${topic} skips the part that actually matters. Here is the short version, without the jargon.\n\nIf you take one thing away: start with the simplest check, not the most expensive one.`,
      cta: input.cta_style
        ? sentence(input.cta_style)
        : 'Have a question about this? Ask below and we will answer it properly.',
      hashtags: buildHashtags(input),
      keywords: (input.keywords ?? []).slice(0, 8),
    };
    return { ...base, platform_versions: platformVersions(base, input) };
  },

  // --- Brand Guardian --------------------------------------------------------
  'brand.review': (input) => {
    const text = String(input.text ?? '');
    const avoid = (input.words_to_avoid ?? []).filter((w) => w && new RegExp(`\\b${escapeRe(w)}\\b`, 'i').test(text));
    const emojis = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
    const emojiLimit = input.emoji_preference === 'none' ? 0 : input.emoji_preference === 'liberal' ? 6 : 2;
    const issues = [];
    if (avoid.length) issues.push(`Uses words the brand avoids: ${avoid.join(', ')}`);
    if (emojis > emojiLimit) issues.push(`Uses ${emojis} emoji; the brand's preference is "${input.emoji_preference ?? 'sparing'}"`);
    return {
      aligned: issues.length === 0,
      score: clampScore(100 - issues.length * 22),
      issues,
      suggested_fix: issues.length ? 'Rewrite the flagged phrasing in the brand’s own register and reduce decorative language.' : null,
    };
  },

  // --- Performance Analyst ---------------------------------------------------
  'performance.analyze': (input) => {
    const rows = input.samples ?? [];
    const byGroup = new Map();
    for (const row of rows) {
      const key = row.group ?? 'all';
      const bucket = byGroup.get(key) ?? { n: 0, total: 0 };
      bucket.n += 1;
      bucket.total += Number(row.engagement ?? 0);
      byGroup.set(key, bucket);
    }
    const averages = [...byGroup.entries()]
      .map(([group, b]) => ({ group, average: b.total / Math.max(b.n, 1), sample: b.n }))
      .sort((a, b) => b.average - a.average);
    const best = averages[0];
    const worst = averages[averages.length - 1];
    const findings = [];
    if (best && worst && best.group !== worst.group && worst.average > 0) {
      const ratio = (best.average / worst.average).toFixed(1);
      findings.push(`${titleCase(best.group)} content performs ${ratio}x better than ${worst.group} for this client.`);
    }
    if (best) findings.push(`Highest average engagement: ${titleCase(best.group)} (${best.average.toFixed(1)} across ${best.sample} posts).`);
    if (rows.length < 8) findings.push(`Only ${rows.length} data points so far — treat this as directional, not conclusive.`);
    return {
      findings,
      confidence: clampScore(rows.length * 8),
      groups: averages,
      recommendation: best
        ? `Shift the next cycle's mix toward ${best.group} while keeping at least one test of a weaker format so the comparison stays honest.`
        : 'Not enough published content yet to draw a conclusion. Publish a spread of formats first.',
    };
  },

  // --- Daily brief -----------------------------------------------------------
  'brief.compose': (input) => ({
    greeting: `Good morning — ${input.client_name ?? 'your client'}`,
    headline: input.top_trends?.length
      ? `${input.top_trends.length} things worth acting on today`
      : 'Quiet morning — no urgent signals',
    recommended_action: input.top_trends?.length
      ? `Create one ${input.top_trends[0].suggested_format ?? 'educational'} piece around "${input.top_trends[0].topic}" and take part in ${Math.min(input.opportunity_count ?? 0, 2)} of the highest-relevance conversations.`
      : 'No trend is urgent enough to reshuffle the calendar. Keep to the scheduled plan and clear the approval queue.',
    summary: [
      input.top_trends?.length ? `${input.top_trends.length} trends detected` : null,
      input.inspiration_count ? `${input.inspiration_count} new inspiration items` : null,
      input.opportunity_count ? `${input.opportunity_count} engagement opportunities` : null,
      input.idea_count ? `${input.idea_count} content ideas ready` : null,
      input.pending_approvals ? `${input.pending_approvals} items awaiting approval` : null,
    ].filter(Boolean),
  }),

  // --- Assistant -------------------------------------------------------------
  'assistant.answer': (input) => ({
    answer: buildAssistantAnswer(input),
    used_context: Object.keys(input.context ?? {}),
  }),
};

function buildAssistantAnswer(input) {
  const ctx = input.context ?? {};
  const lines = [];
  lines.push(`Answering from ${input.client_name ?? 'the selected client'}'s stored data (offline mode — no model call).`);
  if (ctx.trends?.length) {
    lines.push('', 'Trending now:');
    for (const t of ctx.trends.slice(0, 5)) lines.push(`  • ${t.topic} — ${t.trend_score}/100 (${t.classification})`);
  }
  if (ctx.opportunities?.length) {
    lines.push('', 'Engagement opportunities:');
    for (const o of ctx.opportunities.slice(0, 5)) lines.push(`  • [${o.platform}] ${String(o.excerpt).slice(0, 90)}… — relevance ${o.relevance_score}`);
  }
  if (ctx.ideas?.length) {
    lines.push('', 'Content ideas on file:');
    for (const i of ctx.ideas.slice(0, 5)) lines.push(`  • ${i.title} (${i.format})`);
  }
  if (ctx.performance?.findings?.length) {
    lines.push('', 'What performance says:');
    for (const f of ctx.performance.findings) lines.push(`  • ${f}`);
  }
  if (lines.length === 1) {
    lines.push('', 'There is no stored research for this client yet. Run trend discovery and engagement discovery from the client dashboard, then ask again.');
  }
  lines.push('', 'Set ANTHROPIC_API_KEY to get a written answer instead of this structured summary.');
  return lines.join('\n');
}

function hookFor(topic, classification) {
  const t = sentence(topic) || 'this';
  switch (classification) {
    case 'NEWS': return `What the ${t} news actually changes for you`;
    case 'CUSTOMER_QUESTION': return `"${t}" — the honest answer`;
    case 'VIRAL': return `Everyone is talking about ${t}. Here is the part they are getting wrong.`;
    case 'LOCAL': return `If you are in the area, ${t} matters more than you think`;
    case 'SEASONAL': return `Before ${t} arrives, do this one thing`;
    default: return `Most people get ${t} wrong. Here is the short version.`;
  }
}

function buildHashtags(input) {
  const out = [];
  const push = (value, kind) => {
    const tag = '#' + String(value).replace(/[^\p{L}\p{N}]/gu, '');
    if (tag.length > 2 && !out.some((h) => h.tag.toLowerCase() === tag.toLowerCase())) out.push({ tag, kind });
  };
  if (input.client_name) push(input.client_name, 'brand');
  for (const k of (input.keywords ?? []).slice(0, 4)) push(k, 'topic');
  if (input.industry) push(input.industry, 'industry');
  if (input.location) push(input.location, 'location');
  for (const k of (input.trending ?? []).slice(0, 2)) push(k, 'trending');
  return out.slice(0, 12);
}

function platformVersions(base, input) {
  const tags = base.hashtags.map((h) => h.tag);
  return {
    instagram: { caption: `${base.hook}\n\n${base.caption}\n\n${base.cta}`, hashtags: tags.slice(0, 10) },
    facebook: { caption: `${base.caption}\n\n${base.cta}`, hashtags: tags.slice(0, 3) },
    linkedin: {
      caption: `${base.hook}\n\n${base.caption}\n\nWhat we take from this: the teams that get it right treat it as a process question, not a tooling question.\n\n${base.cta}`,
      hashtags: tags.slice(0, 4),
    },
    x: { caption: `${base.hook}\n\n${sentence(base.caption).slice(0, 180)}`, hashtags: tags.slice(0, 2) },
    threads: { caption: `${base.hook}\n\n${sentence(base.caption).slice(0, 300)}\n\nCurious what others have seen here.`, hashtags: tags.slice(0, 2) },
    youtube: {
      title: `${base.hook}`.slice(0, 95),
      caption: `${base.caption}\n\n${base.cta}`,
      hashtags: tags.slice(0, 5),
    },
    reddit: {
      caption: `${sentence(base.caption)}\n\n(Context: we work in this area — happy to answer questions, not selling anything here.)`,
      hashtags: [],
    },
  };
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
