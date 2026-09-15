import { all, one, getDb } from '../db/index.js';
import { newId } from '../core/ids.js';
import { insert, update } from '../db/repo.js';
import { notFound } from '../core/errors.js';

/**
 * Centralised prompt management (§49).
 *
 * Prompts are data, not code: admins edit them in the UI and every edit creates
 * a new version rather than overwriting the old one. Resolution order, most
 * specific first:
 *
 *   client + platform  →  client  →  agency + platform  →  agency  →  system default
 *
 * Every agent run records the prompt_version_id it used, so a change in output
 * can always be traced back to a change in prompt.
 */

/** System defaults, seeded on first migrate. */
export const DEFAULT_PROMPTS = [
  {
    key: 'trend_detection_prompt', agent: 'trend_scout', task: 'trend.explain',
    template: `You assess whether a detected signal deserves a client's attention.

CLIENT: {{client_name}} — {{industry}}, {{location}}
WHAT THEY DO: {{description}}
SIGNAL: {{topic}} (classification: {{classification}}, score: {{trend_score}}/100)
SOURCES: {{sources}}

Answer as JSON with keys: why_it_matters, urgency (low|normal|high|critical),
recommended_angle, recommended_format, suggested_hook, recommended_platforms.

Be concrete about THIS client. If the signal is not genuinely relevant to them,
say so plainly in why_it_matters and set urgency to "low" — a weak connection
dressed up as a strong one wastes the team's morning.`,
  },
  {
    key: 'inspiration_analysis_prompt', agent: 'content_analyst', task: 'inspiration.analyze',
    template: `You explain why a piece of public content performed, so the team can learn
from its structure.

CLIENT: {{client_name}} — {{industry}}
CONTENT: {{platform}} {{content_format}} by {{creator}}
METRICS: {{metrics}}
TEXT: {{excerpt}}

Answer as JSON with keys: hook, caption_structure, cta, why_it_worked,
suggested_adaptation, relevance_score (0-100).

suggested_adaptation must describe an ORIGINAL piece for {{client_name}} that
borrows only the structural idea. Never reproduce the original's wording, script
or media, and never suggest re-uploading it.`,
  },
  {
    key: 'engagement_assessment_prompt', agent: 'engagement_scout', task: 'engagement.assess',
    template: `You judge whether a client should join a public conversation.

CLIENT: {{client_name}} — {{industry}}. Expertise: {{expertise}}
CONVERSATION ({{platform}}, {{context}}): {{excerpt}}

Answer as JSON with keys: relevance_score, brand_fit_score,
conversation_quality_score, promotional_risk_score, spam_risk_score (all 0-100)
and reasoning.

Score for genuine usefulness only. A thread the client cannot add anything real
to scores low on relevance no matter how many keywords it contains. Anything
that would read as marketing in that thread scores high on promotional risk.`,
  },
  {
    key: 'brand_comment_prompt', agent: 'comment_writer', task: 'comment.generate',
    template: `Write three alternative replies for a real public conversation.

CLIENT: {{client_name}} ({{client_company}}) — {{industry}}
BRAND VOICE: tone {{tone}}; personality {{personality}}; formality {{formality}}
COMMENT STYLE: {{comment_style}}
NEVER USE: {{words_to_avoid}}
EMOJI: {{emoji_preference}}
{{platform_rules}}

THREAD ({{platform}}, {{context}}): {{excerpt}}

Return JSON: {"variants":[{"variant":"professional","body":"..."},
{"variant":"conversational","body":"..."},{"variant":"expert","body":"..."}]}

Every reply must:
- answer the specific thing that was asked, referencing its details
- be useful even to someone who never becomes a customer
- read as a person participating, never as a brand broadcasting
- disclose the commercial connection if the reply mentions the client's services
- contain no invented statistics, no testimonials, no claims about results
- never pretend to be a customer or an unaffiliated bystander
- respect the platform's and community's own rules

If the client has nothing genuinely useful to add, return an empty variants array.`,
  },
  {
    key: 'content_ideas_prompt', agent: 'content_strategist', task: 'content.ideas',
    template: `Propose content ideas for the next cycle.

CLIENT: {{client_name}} — {{industry}}, {{location}}
AUDIENCE: {{target_audience}}
PILLARS: {{pillars}}
LIVE TRENDS: {{topics}}
WHAT ALREADY PERFORMED: {{performance}}
ALREADY SCHEDULED (do not duplicate): {{scheduled}}

Return JSON {"ideas":[{title, angle, format, hook, outline, pillar, platforms, priority}]}
with {{count}} ideas, spread across the pillars rather than clustered on one.`,
  },
  {
    key: 'caption_prompt', agent: 'content_strategist', task: 'caption.generate',
    template: `Write the copy for one piece of content, adapted per platform.

CLIENT: {{client_name}} — {{industry}}
BRAND VOICE: {{tone}}, {{personality}}, formality {{formality}}, emoji {{emoji_preference}}
CTA STYLE: {{cta_style}}
NEVER USE: {{words_to_avoid}}
IDEA: {{title}} — {{angle}}
FORMAT: {{format}}
KEYWORDS: {{keywords}}

Return JSON with keys: hook, caption, cta, hashtags (array of {tag, kind}),
keywords, platform_versions (an object keyed by platform).

Each platform version must be genuinely rewritten for that platform, not the
same caption with different hashtags.`,
  },
  {
    key: 'brand_guard_prompt', agent: 'brand_guardian', task: 'brand.review',
    template: `Check a draft against the client's brand rules before a person sees it.

BRAND: tone {{tone}}; personality {{personality}}; formality {{formality}}
PREFERRED WORDS: {{preferred_vocabulary}}
NEVER USE: {{words_to_avoid}}
EMOJI PREFERENCE: {{emoji_preference}}
COMPLIANCE NOTES: {{compliance_notes}}

DRAFT: {{text}}

Return JSON: {aligned (boolean), score (0-100), issues (array of strings),
suggested_fix (string or null)}.`,
  },
  {
    key: 'performance_analysis_prompt', agent: 'performance_analyst', task: 'performance.analyze',
    template: `Find what is actually working for this client.

CLIENT: {{client_name}}
PUBLISHED CONTENT AND RESULTS: {{samples}}

Return JSON: {findings (array of specific sentences), confidence (0-100),
groups (array of {group, average, sample}), recommendation}.

State sample sizes. If the data is too thin to support a conclusion, say that
rather than finding a pattern in noise.`,
  },
  {
    key: 'daily_brief_prompt', agent: 'content_strategist', task: 'brief.compose',
    template: `Write this client's morning briefing.

CLIENT: {{client_name}}
TRENDS: {{top_trends}}
INSPIRATION: {{inspiration_count}} new items
OPPORTUNITIES: {{opportunity_count}}
IDEAS: {{idea_count}}
AWAITING APPROVAL: {{pending_approvals}}
COMPETITORS: {{competitor_updates}}

Return JSON: {greeting, headline, recommended_action, summary (array of lines)}.
recommended_action names at most two concrete things to do today.`,
  },
  {
    key: 'assistant_prompt', agent: 'assistant', task: 'assistant.answer',
    template: `You are the in-product assistant for a social media agency.

You answer ONLY from the stored data provided below for the selected client.
If the answer is not in this data, say what is missing and which job would
produce it. Never invent metrics, trends or conversations.

CLIENT: {{client_name}}
STORED DATA: {{context}}

QUESTION: {{question}}`,
  },
];

/** Seed system defaults (agency_id NULL, so they belong to no tenant). Idempotent. */
export function seedDefaultPrompts() {
  const conn = getDb();
  const stmt = conn.prepare(`INSERT INTO prompt_versions
      (id, agency_id, client_id, agent, task, platform, key, version, template,
       notes, is_active, status, created_at, updated_at)
     VALUES (?, NULL, NULL, ?, ?, NULL, ?, 1, ?, 'system default', 1, 'active', ?, ?)`);
  let seeded = 0;
  for (const p of DEFAULT_PROMPTS) {
    const exists = one(
      `SELECT id FROM prompt_versions
        WHERE agency_id IS NULL AND client_id IS NULL AND key = ? AND platform IS NULL`,
      [p.key],
    );
    if (exists) continue;
    const ts = new Date().toISOString();
    stmt.run(newId('pv'), p.agent, p.task, p.key, p.template, ts, ts);
    seeded++;
  }
  return seeded;
}

/**
 * Resolve the prompt to use for a task.
 * @param {{key:string, agencyId?:string|null, clientId?:string|null, platform?:string|null}} query
 */
export function resolvePrompt(query) {
  const candidates = all(
    `SELECT * FROM prompt_versions
      WHERE key = ? AND is_active = 1 AND status = 'active'
        AND (agency_id IS NULL OR agency_id = ?)
        AND (client_id IS NULL OR client_id = ?)
        AND (platform IS NULL OR platform = ?)
      ORDER BY version DESC`,
    [query.key, query.agencyId ?? null, query.clientId ?? null, query.platform ?? null],
  );
  if (!candidates.length) throw notFound(`No prompt registered for key "${query.key}"`);

  const rank = (row) =>
    (row.client_id ? 8 : 0) + (row.agency_id ? 4 : 0) + (row.platform ? 2 : 0);
  candidates.sort((a, b) => rank(b) - rank(a) || b.version - a.version);
  return candidates[0];
}

/** Create the next version of a prompt for an agency (never edits in place). */
export function publishPromptVersion({ agencyId, clientId = null, key, platform = null, agent, task, template, notes, userId }) {
  const latest = one(
    `SELECT MAX(version) AS v FROM prompt_versions
      WHERE key = ? AND agency_id IS ? AND client_id IS ? AND platform IS ?`,
    [key, agencyId, clientId, platform],
  );
  const version = Number(latest?.v ?? 0) + 1;

  for (const old of all(
    `SELECT id FROM prompt_versions WHERE key = ? AND agency_id IS ? AND client_id IS ? AND platform IS ? AND is_active = 1`,
    [key, agencyId, clientId, platform],
  )) {
    update('prompt_versions', agencyId, old.id, { is_active: 0 });
  }

  return insert('prompt_versions', {
    agency_id: agencyId, client_id: clientId, agent, task, platform, key,
    version, template, notes: notes ?? null, is_active: 1, created_by: userId ?? null,
  });
}

export function promptHistory(agencyId, key) {
  return all(
    `SELECT * FROM prompt_versions WHERE key = ? AND (agency_id IS NULL OR agency_id = ?)
      ORDER BY version DESC LIMIT 50`,
    [key, agencyId],
  );
}

/** `{{placeholder}}` substitution. Missing values render as an empty string. */
export function renderPrompt(template, values) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const value = values?.[name];
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}
