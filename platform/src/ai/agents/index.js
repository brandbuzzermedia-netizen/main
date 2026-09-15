import { Agent } from './base.js';

/**
 * The eight specialised agents (§39). Each one owns a narrow job and hands off
 * to the next through the database, never by calling another agent directly —
 * so a run can be inspected, replayed and rate-limited at each hop.
 *
 *   Trend Scout → Social Researcher → Content Analyst → Engagement Scout
 *   → Comment Writer → Brand Guardian → Performance Analyst → Content Strategist
 */

const scoreField = { type: 'number', min: 0, max: 100, default: 0 };

/** 1. Trend Scout — decides whether a detected signal deserves attention. */
export class TrendScout extends Agent {
  static name_ = 'trend_scout';
  static responsibility = 'Assess detected signals for client relevance and urgency.';
  static promptKey = 'trend_detection_prompt';
  static task = 'trend.explain';
  static tools = ['db:read:keywords', 'db:read:clients', 'platform:search'];
  static inputSchema = {
    client_name: { type: 'string', required: true },
    industry: { type: 'string' },
    location: { type: 'string' },
    description: { type: 'string' },
    topic: { type: 'string', required: true },
    classification: { type: 'string', required: true },
    trend_score: { type: 'number', default: 0 },
    platforms: { type: 'array', default: [] },
    sources: { type: 'array', default: [] },
  };
  static outputSchema = {
    why_it_matters: { type: 'string', required: true, maxLength: 1200 },
    urgency: { type: 'enum', enum: ['low', 'normal', 'high', 'critical'], default: 'normal' },
    recommended_angle: { type: 'string', maxLength: 1000 },
    recommended_format: { type: 'string', maxLength: 40 },
    suggested_hook: { type: 'string', maxLength: 300 },
    recommended_platforms: { type: 'array', default: [] },
  };
}

/**
 * 2. Social Researcher — turns a client's keywords into the platform queries
 * the research jobs actually run. Deterministic by design: query construction
 * is not a place where a model should improvise.
 */
export class SocialResearcher {
  static name_ = 'social_researcher';
  static responsibility = 'Build platform-appropriate search queries from client keywords.';
  static tools = ['db:read:keywords', 'db:read:competitors'];

  /**
   * @param {{keywords:{term:string, kind:string, weight:number}[], platform:string,
   *          industry?:string, location?:string}} input
   */
  buildQueries(input) {
    const byKind = (kind) => input.keywords.filter((k) => k.kind === kind).map((k) => k.term);
    const primary = byKind('primary');
    const product = byKind('product');
    const industry = byKind('industry');
    const location = byKind('location');
    const queries = [];

    for (const term of primary.slice(0, 5)) {
      queries.push({ query: term, intent: 'primary', platform: input.platform });
      if (location.length) {
        queries.push({ query: `${term} ${location[0]}`, intent: 'local', platform: input.platform });
      }
    }
    for (const term of product.slice(0, 3)) {
      queries.push({ query: term, intent: 'product', platform: input.platform });
    }
    for (const term of industry.slice(0, 3)) {
      queries.push({ query: term, intent: 'industry', platform: input.platform });
    }
    // Question-shaped queries surface the conversations worth joining.
    for (const term of primary.slice(0, 2)) {
      queries.push({ query: `${term} recommend`, intent: 'question', platform: input.platform });
    }
    return dedupe(queries).slice(0, 20);
  }
}

/** 3. Content Analyst — explains why a piece of public content performed. */
export class ContentAnalyst extends Agent {
  static name_ = 'content_analyst';
  static responsibility = 'Explain why public content performed and propose an original adaptation.';
  static promptKey = 'inspiration_analysis_prompt';
  static task = 'inspiration.analyze';
  static tools = ['db:read:inspiration_items', 'db:read:clients'];
  static inputSchema = {
    client_name: { type: 'string', required: true },
    industry: { type: 'string' },
    platform: { type: 'string', required: true },
    content_format: { type: 'string' },
    creator: { type: 'string' },
    topic: { type: 'string' },
    excerpt: { type: 'string', maxLength: 4000 },
    metrics: { type: 'object', default: {} },
    engagement_rate: { type: 'number', default: 0 },
    keyword_hits: { type: 'number', default: 0 },
  };
  static outputSchema = {
    hook: { type: 'string', maxLength: 400 },
    caption_structure: { type: 'string', maxLength: 600 },
    cta: { type: 'string', maxLength: 400 },
    why_it_worked: { type: 'string', required: true, maxLength: 1500 },
    suggested_adaptation: { type: 'string', required: true, maxLength: 1500 },
    relevance_score: scoreField,
  };
}

/** 4. Engagement Scout — scores whether joining a conversation adds value. */
export class EngagementScout extends Agent {
  static name_ = 'engagement_scout';
  static responsibility = 'Score public conversations for genuine, non-promotional relevance.';
  static promptKey = 'engagement_assessment_prompt';
  static task = 'engagement.assess';
  static tools = ['db:read:keywords', 'db:read:brand_profiles'];
  static inputSchema = {
    client_name: { type: 'string', required: true },
    industry: { type: 'string' },
    expertise: { type: 'array', default: [] },
    platform: { type: 'string', required: true },
    context: { type: 'string' },
    excerpt: { type: 'string', required: true, maxLength: 4000 },
    keyword_hits: { type: 'number', default: 0 },
    industry_match: { type: 'boolean', default: false },
  };
  static outputSchema = {
    relevance_score: scoreField,
    brand_fit_score: scoreField,
    conversation_quality_score: scoreField,
    promotional_risk_score: scoreField,
    spam_risk_score: scoreField,
    reasoning: { type: 'string', maxLength: 1200 },
  };
}

/** 5. Comment Writer — drafts three alternatives, never publishes. */
export class CommentWriter extends Agent {
  static name_ = 'comment_writer';
  static responsibility = 'Draft three reply alternatives that add value to a specific thread.';
  static promptKey = 'brand_comment_prompt';
  static task = 'comment.generate';
  static tools = ['db:read:brand_profiles', 'db:read:engagement_opportunities'];
  static heavy = true;
  static inputSchema = {
    client_name: { type: 'string', required: true },
    client_company: { type: 'string' },
    industry: { type: 'string' },
    tone: { type: 'string' },
    personality: { type: 'string' },
    formality: { type: 'string' },
    comment_style: { type: 'string' },
    words_to_avoid: { type: 'array', default: [] },
    emoji_preference: { type: 'string', default: 'sparing' },
    platform: { type: 'string', required: true },
    platform_rules: { type: 'string', default: '' },
    context: { type: 'string' },
    topic: { type: 'string' },
    expertise: { type: 'array', default: [] },
    excerpt: { type: 'string', required: true, maxLength: 4000 },
  };
  static outputSchema = {
    variants: {
      type: 'array', required: true, max: 5,
      items: {
        type: 'object',
        of: {
          variant: { type: 'enum', enum: ['professional', 'conversational', 'expert'], required: true },
          body: { type: 'string', required: true, minLength: 20, maxLength: 2000 },
        },
      },
    },
  };
}

/** 6. Brand Guardian — the last check before a human sees a draft. */
export class BrandGuardian extends Agent {
  static name_ = 'brand_guardian';
  static responsibility = 'Check drafts against the client’s voice, vocabulary and compliance rules.';
  static promptKey = 'brand_guard_prompt';
  static task = 'brand.review';
  static tools = ['db:read:brand_profiles'];
  static inputSchema = {
    text: { type: 'string', required: true, maxLength: 8000 },
    tone: { type: 'string' },
    personality: { type: 'string' },
    formality: { type: 'string' },
    preferred_vocabulary: { type: 'array', default: [] },
    words_to_avoid: { type: 'array', default: [] },
    emoji_preference: { type: 'string', default: 'sparing' },
    compliance_notes: { type: 'string' },
  };
  static outputSchema = {
    aligned: { type: 'boolean', default: true },
    score: scoreField,
    issues: { type: 'array', default: [] },
    suggested_fix: { type: 'string', maxLength: 1200 },
  };
}

/** 7. Performance Analyst — finds what actually worked. */
export class PerformanceAnalyst extends Agent {
  static name_ = 'performance_analyst';
  static responsibility = 'Identify real patterns in published performance, with sample sizes.';
  static promptKey = 'performance_analysis_prompt';
  static task = 'performance.analyze';
  static tools = ['db:read:published_content', 'db:read:analytics'];
  static heavy = true;
  static inputSchema = {
    client_name: { type: 'string', required: true },
    samples: { type: 'array', required: true, max: 500 },
  };
  static outputSchema = {
    findings: { type: 'array', default: [] },
    confidence: scoreField,
    groups: { type: 'array', default: [] },
    recommendation: { type: 'string', maxLength: 1500 },
  };
}

/** 8. Content Strategist — turns intelligence into a plan. */
export class ContentStrategist extends Agent {
  static name_ = 'content_strategist';
  static responsibility = 'Turn trends, inspiration and performance into a concrete content plan.';
  static promptKey = 'content_ideas_prompt';
  static task = 'content.ideas';
  static tools = ['db:read:trending_topics', 'db:read:content_pillars', 'db:read:analytics'];
  static heavy = true;
  static inputSchema = {
    client_name: { type: 'string', required: true },
    industry: { type: 'string' },
    location: { type: 'string' },
    target_audience: { type: 'string' },
    pillars: { type: 'array', default: [] },
    topics: { type: 'array', default: [] },
    performance: { type: 'object', default: {} },
    scheduled: { type: 'array', default: [] },
    platforms: { type: 'array', default: [] },
    count: { type: 'number', default: 5, min: 1, max: 12 },
  };
  static outputSchema = {
    ideas: {
      type: 'array', required: true, max: 12,
      items: {
        type: 'object',
        of: {
          title: { type: 'string', required: true, maxLength: 200 },
          angle: { type: 'string', maxLength: 800 },
          format: { type: 'string', maxLength: 40 },
          hook: { type: 'string', maxLength: 300 },
          outline: { type: 'string', maxLength: 2000 },
          pillar: { type: 'string', maxLength: 100 },
          platforms: { type: 'array', default: [] },
          priority: { type: 'number', min: 0, max: 100, default: 50 },
        },
      },
    },
  };
}

/** Caption writing shares the strategist's remit but its own prompt and schema. */
export class CaptionWriter extends Agent {
  static name_ = 'content_strategist';
  static responsibility = 'Write platform-adapted copy for one piece of content.';
  static promptKey = 'caption_prompt';
  static task = 'caption.generate';
  static tools = ['db:read:brand_profiles', 'db:read:keywords'];
  static inputSchema = {
    client_name: { type: 'string', required: true },
    industry: { type: 'string' },
    location: { type: 'string' },
    tone: { type: 'string' },
    personality: { type: 'string' },
    formality: { type: 'string' },
    emoji_preference: { type: 'string', default: 'sparing' },
    cta_style: { type: 'string' },
    words_to_avoid: { type: 'array', default: [] },
    title: { type: 'string' },
    topic: { type: 'string' },
    angle: { type: 'string' },
    format: { type: 'string' },
    keywords: { type: 'array', default: [] },
    trending: { type: 'array', default: [] },
  };
  static outputSchema = {
    hook: { type: 'string', maxLength: 400 },
    caption: { type: 'string', required: true, maxLength: 6000 },
    cta: { type: 'string', maxLength: 400 },
    hashtags: { type: 'array', default: [] },
    keywords: { type: 'array', default: [] },
    platform_versions: { type: 'object', default: {} },
  };
}

/** The in-product assistant (§40) — reads only the selected client's data. */
export class AssistantAgent extends Agent {
  static name_ = 'assistant';
  static responsibility = 'Answer questions using only the selected client’s stored data.';
  static promptKey = 'assistant_prompt';
  static task = 'assistant.answer';
  static tools = ['db:read:client_scope'];
  static heavy = true;
  static inputSchema = {
    client_name: { type: 'string', required: true },
    question: { type: 'string', required: true, maxLength: 2000 },
    context: { type: 'object', default: {} },
  };
  static outputSchema = {
    answer: { type: 'string', required: true, maxLength: 12000 },
    used_context: { type: 'array', default: [] },
  };
}

/** Brief composition reuses the strategist agent identity with its own prompt. */
export class BriefWriter extends Agent {
  static name_ = 'content_strategist';
  static responsibility = 'Compose the client’s daily briefing.';
  static promptKey = 'daily_brief_prompt';
  static task = 'brief.compose';
  static tools = ['db:read:client_scope'];
  static inputSchema = {
    client_name: { type: 'string', required: true },
    top_trends: { type: 'array', default: [] },
    inspiration_count: { type: 'number', default: 0 },
    opportunity_count: { type: 'number', default: 0 },
    idea_count: { type: 'number', default: 0 },
    pending_approvals: { type: 'number', default: 0 },
    competitor_updates: { type: 'array', default: [] },
  };
  static outputSchema = {
    greeting: { type: 'string', maxLength: 200 },
    headline: { type: 'string', maxLength: 300 },
    recommended_action: { type: 'string', required: true, maxLength: 1500 },
    summary: { type: 'array', default: [] },
  };
}

function dedupe(queries) {
  const seen = new Set();
  return queries.filter((q) => {
    const key = `${q.platform}:${q.query.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const agents = {
  trendScout: new TrendScout(),
  socialResearcher: new SocialResearcher(),
  contentAnalyst: new ContentAnalyst(),
  engagementScout: new EngagementScout(),
  commentWriter: new CommentWriter(),
  brandGuardian: new BrandGuardian(),
  performanceAnalyst: new PerformanceAnalyst(),
  contentStrategist: new ContentStrategist(),
  captionWriter: new CaptionWriter(),
  assistant: new AssistantAgent(),
  briefWriter: new BriefWriter(),
};

/** Catalogue for the admin UI: who does what, with which tools and prompt. */
export const AGENT_CATALOGUE = [
  TrendScout, SocialResearcher, ContentAnalyst, EngagementScout,
  CommentWriter, BrandGuardian, PerformanceAnalyst, ContentStrategist,
].map((A) => ({
  name: A.name_,
  responsibility: A.responsibility,
  prompt_key: /** @type {any} */ (A).promptKey ?? null,
  tools: A.tools,
  model: /** @type {any} */ (A).heavy ? 'heavy' : 'standard',
}));
