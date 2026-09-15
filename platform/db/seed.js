import { insert, list, findBy } from '../src/db/repo.js';
import { getDb } from '../src/db/index.js';
import { hashPassword, seal } from '../src/core/crypto.js';
import { newId, isoIn, now } from '../src/core/ids.js';

/**
 * Demo seed.
 *
 * Creates one agency, three users and two clients with sample intelligence, so
 * the product can be explored without connecting live accounts.
 *
 * Everything written here is clearly marked as demo data: trends and
 * opportunities carry `"source": "demo-seed"` in their sources, and the demo
 * social accounts are created in the `disconnected` state with no credentials.
 * Nothing in this file pretends to be research the system actually performed.
 */

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'change-me-please-1234';

export function seedDemoAgency({ reset = false } = {}) {
  const db = getDb();
  if (reset) {
    for (const table of [
      'audit_logs', 'agent_runs', 'notifications', 'ai_recommendations', 'analytics',
      'action_ledger', 'approval_items', 'job_queue', 'publishing_jobs', 'automation_rules',
      'published_content', 'scheduled_content', 'content_ideas', 'published_comments',
      'generated_comments', 'engagement_opportunities', 'inspiration_items', 'social_posts',
      'trending_topics', 'oauth_states', 'social_accounts', 'competitors', 'keywords',
      'content_pillars', 'brand_profiles', 'clients', 'sessions', 'teams', 'users',
    ]) db.exec(`DELETE FROM ${table} WHERE agency_id IN (SELECT id FROM agencies WHERE slug = 'get-bee-seen')`);
    db.exec(`DELETE FROM agencies WHERE slug = 'get-bee-seen'`);
  }

  const existing = db.prepare('SELECT * FROM agencies WHERE slug = ?').get('get-bee-seen');
  if (existing) {
    return { skipped: true, agency_id: existing.id, note: 'Demo agency already exists. Re-run with --reset to rebuild it.' };
  }

  const agencyId = newId('ag');
  const ts = now();
  db.prepare(`INSERT INTO agencies (id, name, slug, plan, settings, automation_paused, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, '{}', 0, 'active', ?, ?)`)
    .run(agencyId, 'Get Bee Seen', 'get-bee-seen', 'agency', ts, ts);

  const users = [
    { email: 'admin@getbeeseen.test', name: 'Agency Admin', role: 'admin' },
    { email: 'manager@getbeeseen.test', name: 'Social Media Manager', role: 'social_media_manager' },
    { email: 'reviewer@getbeeseen.test', name: 'Reviewer', role: 'reviewer' },
  ].map((u) => insert('users', {
    agency_id: agencyId, ...u, password_hash: hashPassword(DEMO_PASSWORD), client_scope: [],
  }));

  const clients = [];
  for (const spec of CLIENT_SPECS) {
    const client = insert('clients', {
      agency_id: agencyId,
      name: spec.name, company_name: spec.company, website: spec.website,
      industry: spec.industry, location: spec.location, description: spec.description,
      products: spec.products, target_audience: spec.audience,
      target_geography: spec.geography,
      onboarding_step: 'complete', onboarding_complete: 1,
    });

    insert('brand_profiles', { agency_id: agencyId, client_id: client.id, ...spec.brand });

    for (const pillar of spec.pillars) {
      insert('content_pillars', { agency_id: agencyId, client_id: client.id, ...pillar });
    }
    for (const kw of spec.keywords) {
      insert('keywords', { agency_id: agencyId, client_id: client.id, ...kw });
    }
    for (const competitor of spec.competitors) {
      insert('competitors', { agency_id: agencyId, client_id: client.id, ...competitor });
    }

    // Demo accounts are DISCONNECTED and hold no credentials. Connecting one is
    // a real OAuth flow against the real platform.
    for (const platform of spec.platforms) {
      insert('social_accounts', {
        agency_id: agencyId, client_id: client.id, platform,
        handle: spec.handles?.[platform] ?? null,
        connection_status: 'disconnected', api_status: 'unknown',
        last_error: 'Demo account — connect it through OAuth to make it live.',
      });
    }

    for (const trend of spec.trends) {
      insert('trending_topics', {
        agency_id: agencyId, client_id: client.id,
        topic: trend.topic, classification: trend.classification,
        trend_score: trend.score,
        score_breakdown: { recency: 80, velocity: trend.velocity, engagement: 60, relevance: 85, cross_platform: 65, mentions: 12 },
        velocity_pct: trend.velocity,
        urgency: trend.score >= 85 ? 'high' : 'normal',
        why_it_matters: trend.why,
        platforms: trend.platforms,
        sources: [{ title: 'Demo seed data', url: null, platform: 'demo', source: 'demo-seed' }],
        detected_at: now(), expires_at: isoIn(60 * 24 * 7),
      });
    }

    for (const opp of spec.opportunities) {
      insert('engagement_opportunities', {
        agency_id: agencyId, client_id: client.id,
        platform: opp.platform, external_id: `demo_${newId()}`,
        url: null, author: opp.author, excerpt: opp.excerpt, context: opp.context,
        posted_at: isoIn(-120),
        relevance_score: opp.relevance, brand_fit_score: opp.brandFit,
        conversation_quality_score: opp.quality,
        promotional_risk_score: opp.promoRisk, spam_risk_score: opp.spamRisk,
        recommended_action: opp.relevance >= 80 && opp.brandFit >= 75 && opp.spamRisk <= 20 ? 'engage' : 'review',
        reasoning: opp.reasoning,
        status: 'new',
      });
    }

    for (const item of spec.inspiration) {
      insert('inspiration_items', {
        agency_id: agencyId, client_id: client.id,
        platform: item.platform, url: null, creator: item.creator,
        topic: item.topic, content_format: item.format,
        language: 'en', geography: spec.location,
        posted_at: isoIn(-60 * 24 * 3),
        views: item.views, likes: item.likes, comments: item.comments, shares: item.shares,
        engagement_rate: Number(((item.likes + item.comments + item.shares) / Math.max(item.views, 1)).toFixed(4)),
        viral_score: item.viral, relevance_score: item.relevance,
        hook: item.hook, why_it_worked: item.why,
        suggested_adaptation: item.adaptation,
      });
    }

    insert('automation_rules', {
      agency_id: agencyId, client_id: client.id, kind: 'autopilot',
      mode: 'approval_required',
      config: { allowed_content_types: ['educational'], sensitive_topics: false },
    });

    clients.push(client);
  }

  return {
    agency: { id: agencyId, slug: 'get-bee-seen', name: 'Get Bee Seen' },
    users: users.map((u) => ({ email: u.email, role: u.role })),
    password: DEMO_PASSWORD,
    clients: clients.map((c) => ({ id: c.id, name: c.name })),
    note: 'Demo data only. Social accounts are disconnected and hold no credentials; connect them through OAuth to publish anything.',
  };
}

const CLIENT_SPECS = [
  {
    name: 'Ashvee Diagnostics',
    company: 'Ashvee Diagnostics Pvt Ltd',
    website: 'https://example.com/ashvee',
    industry: 'Diagnostics and preventive healthcare',
    location: 'Bengaluru',
    description: 'A diagnostic centre offering pathology, radiology and preventive health packages, with home sample collection across Bengaluru.',
    products: ['preventive health checkups', 'vitamin deficiency panels', 'thyroid testing', 'home sample collection'],
    audience: 'Working adults aged 28-55 in Bengaluru who are health-aware but put off routine testing.',
    geography: ['Bengaluru', 'Karnataka'],
    platforms: ['instagram', 'facebook', 'linkedin', 'reddit'],
    handles: { instagram: '@ashveediagnostics' },
    brand: {
      tone: 'Professional, knowledgeable, friendly and conversational',
      personality: 'A well-informed clinician who explains things plainly and never pushes',
      formality: 'balanced',
      preferred_vocabulary: ['preventive', 'screening', 'evidence', 'your doctor'],
      words_to_avoid: ['cheap', 'miracle', 'cure', 'guaranteed', 'best in class'],
      emoji_preference: 'sparing',
      cta_style: 'Invite a question rather than a booking',
      comment_style: 'Comments should feel like genuine participation in the conversation, never like an advert.',
      compliance_notes: 'Never say we diagnose or treat. Never promise results. Always point readers to their own doctor for clinical decisions.',
    },
    pillars: [
      { name: 'Educational', kind: 'educational', target_share: 40, description: 'Explain one test or one result clearly.' },
      { name: 'Preventive health awareness', kind: 'thought_leadership', target_share: 20 },
      { name: 'Customer stories', kind: 'customer_stories', target_share: 15 },
      { name: 'FAQs', kind: 'faq', target_share: 15 },
      { name: 'Promotional', kind: 'promotional', target_share: 10 },
    ],
    keywords: [
      { term: 'preventive health checkup', kind: 'primary', weight: 90 },
      { term: 'diagnostic centre', kind: 'primary', weight: 85 },
      { term: 'vitamin d test', kind: 'product', weight: 80 },
      { term: 'thyroid test', kind: 'product', weight: 75 },
      { term: 'blood test', kind: 'secondary', weight: 60 },
      { term: 'pathology lab', kind: 'industry', weight: 55 },
      { term: 'bengaluru', kind: 'location', weight: 70 },
      { term: 'preventivehealth', kind: 'hashtag', weight: 50 },
    ],
    competitors: [
      { name: 'Metro Labs', website: 'https://example.com/metro', handles: { instagram: '@metrolabs' } },
      { name: 'CityCare Diagnostics', website: 'https://example.com/citycare', handles: { instagram: '@citycare' } },
    ],
    trends: [
      { topic: 'Preventive health checkups', classification: 'TREND', score: 94, velocity: 82, platforms: ['instagram', 'reddit'], why: 'Searches and discussion around annual checkups climb every year before the financial year end, and the audience is already primed to act.' },
      { topic: 'Vitamin deficiency awareness', classification: 'EDUCATIONAL', score: 88, velocity: 64, platforms: ['instagram', 'linkedin'], why: 'A knowledge gap the brand is genuinely qualified to close, and the format (one test explained plainly) is proven.' },
      { topic: "Women's health screening", classification: 'INDUSTRY_DISCUSSION', score: 84, velocity: 51, platforms: ['reddit', 'linkedin'], why: 'Practitioners are debating screening intervals publicly, which is where credible participation earns trust.' },
      { topic: 'World Heart Day', classification: 'SEASONAL', score: 81, velocity: 120, platforms: ['instagram', 'facebook'], why: 'A recurring calendar moment that can be planned for rather than reacted to.' },
      { topic: 'AI in healthcare diagnostics', classification: 'NEWS', score: 77, velocity: 45, platforms: ['linkedin'], why: 'Live news commentary published in the first 48 hours is what gets shared in this niche.' },
    ],
    opportunities: [
      {
        platform: 'reddit', author: 'u/bangalore_newbie', context: 'r/bangalore',
        excerpt: 'Can anyone recommend a good diagnostic centre in Bangalore? Need a full body checkup and the prices I have been quoted vary wildly.',
        relevance: 97, brandFit: 92, quality: 85, promoRisk: 35, spamRisk: 8,
        reasoning: 'A direct question in the client’s own city where they have first-hand expertise. A specific, non-promotional answer about what drives price differences adds real value.',
      },
      {
        platform: 'reddit', author: 'u/fitness_throwaway', context: 'r/india',
        excerpt: 'My vitamin D came back at 18 ng/mL. Doctor said supplement for 3 months. Should I retest after? How often do people actually retest?',
        relevance: 91, brandFit: 88, quality: 90, promoRisk: 20, spamRisk: 5,
        reasoning: 'A clinical question the client can answer factually while pointing the reader back to their own doctor.',
      },
      {
        platform: 'linkedin', author: 'Dr. Ananya R', context: 'Healthcare leadership post',
        excerpt: 'Preventive screening uptake in urban India is still under 20%. What is actually stopping people — cost, access, or awareness?',
        relevance: 86, brandFit: 84, quality: 92, promoRisk: 25, spamRisk: 5,
        reasoning: 'An open professional question where the client has operational data and can contribute a genuine perspective.',
      },
    ],
    inspiration: [
      {
        platform: 'instagram', creator: '@health_explained', topic: 'vitamin d test', format: 'reel',
        views: 412_000, likes: 31_400, comments: 1_820, shares: 4_600, viral: 92, relevance: 88,
        hook: 'Your vitamin D result is one number. Here is what it actually means.',
        why: 'Opens on the viewer’s own lab report rather than the brand, then resolves one specific confusion in under 30 seconds.',
        adaptation: 'Build an original reel where an Ashvee pathologist reads a (consented, anonymised) sample report on camera and explains the reference ranges. Entirely the client’s own footage and script.',
      },
      {
        platform: 'linkedin', creator: 'Preventive Care Collective', topic: 'preventive health checkup', format: 'text',
        views: 88_000, likes: 2_400, comments: 310, shares: 190, viral: 74, relevance: 81,
        hook: 'We audited 500 “full body checkups”. Most of them test the same 12 things.',
        why: 'Leads with a concrete, verifiable finding instead of an opinion, which is what this audience rewards.',
        adaptation: 'Publish Ashvee’s own breakdown of what a checkup actually covers and what it does not — using only Ashvee’s own panel data.',
      },
    ],
  },
  {
    name: 'Shobha Decor',
    company: 'Shobha Decor & Furniture',
    website: 'https://example.com/shobha',
    industry: 'Interior design and furniture',
    location: 'Bengaluru',
    description: 'A furniture and interior décor studio making custom pieces for homes and small offices.',
    products: ['custom furniture', 'modular kitchens', 'interior styling', 'space planning'],
    audience: 'Homeowners aged 30-50 furnishing a new flat, and small studios fitting out an office.',
    geography: ['Bengaluru'],
    platforms: ['instagram', 'facebook'],
    brand: {
      tone: 'Warm, tasteful, practical',
      personality: 'A designer friend who tells you what is worth spending on',
      formality: 'casual',
      preferred_vocabulary: ['craft', 'grain', 'proportion', 'lived-in'],
      words_to_avoid: ['luxury', 'exclusive', 'unbeatable'],
      emoji_preference: 'sparing',
      cta_style: 'Invite people to reply with their own room',
      comment_style: 'Practical, specific advice about the actual room in the photo.',
    },
    pillars: [
      { name: 'Behind the scenes', kind: 'behind_the_scenes', target_share: 30 },
      { name: 'Educational', kind: 'educational', target_share: 30 },
      { name: 'Customer stories', kind: 'customer_stories', target_share: 25 },
      { name: 'Promotional', kind: 'promotional', target_share: 15 },
    ],
    keywords: [
      { term: 'custom furniture', kind: 'primary', weight: 90 },
      { term: 'modular kitchen', kind: 'product', weight: 85 },
      { term: 'interior design', kind: 'industry', weight: 70 },
      { term: 'home renovation', kind: 'secondary', weight: 65 },
      { term: 'bengaluru', kind: 'location', weight: 60 },
    ],
    competitors: [{ name: 'Urban Grain', website: 'https://example.com/urbangrain', handles: { instagram: '@urbangrain' } }],
    trends: [
      { topic: 'Small apartment storage', classification: 'TREND', score: 86, velocity: 58, platforms: ['instagram'], why: 'Flat sizes in the city keep shrinking and storage content reliably outperforms styling content for this audience.' },
      { topic: 'Solid wood vs engineered', classification: 'CUSTOMER_QUESTION', score: 79, velocity: 40, platforms: ['reddit', 'instagram'], why: 'A recurring buying question where a straight answer builds more trust than a showcase.' },
    ],
    opportunities: [
      {
        platform: 'reddit', author: 'u/first_flat', context: 'r/bangalore',
        excerpt: 'Is it worth paying extra for solid wood over engineered wood for a bed frame? Quotes are nearly double.',
        relevance: 88, brandFit: 86, quality: 84, promoRisk: 30, spamRisk: 10,
        reasoning: 'A buying question where the client can give an honest cost-versus-durability answer that is useful even to someone who never buys from them.',
      },
    ],
    inspiration: [
      {
        platform: 'instagram', creator: '@small_space_design', topic: 'small apartment storage', format: 'carousel',
        views: 210_000, likes: 18_900, comments: 940, shares: 3_100, viral: 81, relevance: 79,
        hook: 'Six inches of wasted wall in every Indian flat. Here is what to do with it.',
        why: 'Names a problem the viewer can see in their own home in the first three words.',
        adaptation: 'An original carousel using Shobha’s own completed projects, showing the same six-inch problem solved three different ways.',
      },
    ],
  },
];
