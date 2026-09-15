/**
 * Platform-specific content adaptation (§19) and repurposing (§29).
 *
 * The same caption is never pushed to every platform. Each platform gets copy
 * written to its own norms, and repurposing checks the target platform's
 * adapter before promising a version at all.
 */

import { getAdapter } from '../platforms/registry.js';
import { buildHashtags } from './hashtags.js';

/** How each platform wants to be spoken to. Used to shape copy and to prompt. */
export const PLATFORM_STYLE = {
  instagram: {
    label: 'Instagram',
    guidance: 'Strong hook in the first line, short engaging caption, relevant hashtags, one clear CTA, reel-friendly phrasing.',
    maxChars: 2200, hookRequired: true, hashtags: 12,
  },
  facebook: {
    label: 'Facebook',
    guidance: 'Conversational, more context than Instagram, a clear CTA, minimal hashtags.',
    maxChars: 8000, hookRequired: false, hashtags: 3,
  },
  linkedin: {
    label: 'LinkedIn',
    guidance: 'Professional register, thought-leadership framing, a concrete business insight, professional CTA.',
    maxChars: 3000, hookRequired: true, hashtags: 4,
  },
  x: {
    label: 'X',
    guidance: 'Concise, strong opening line, oriented toward starting a conversation.',
    maxChars: 280, hookRequired: true, hashtags: 2,
  },
  threads: {
    label: 'Threads',
    guidance: 'Conversational and discussion-oriented; end on something people can respond to.',
    maxChars: 500, hookRequired: true, hashtags: 2,
  },
  youtube: {
    label: 'YouTube',
    guidance: 'SEO-shaped title, descriptive body with the key terms early, tags, CTA to subscribe or watch next.',
    maxChars: 5000, hookRequired: false, hashtags: 5, titleRequired: true,
  },
  reddit: {
    label: 'Reddit',
    guidance: 'Community-specific, non-promotional, written as a participant. Disclose any commercial connection.',
    maxChars: 10000, hookRequired: false, hashtags: 0,
  },
  quora: {
    label: 'Quora',
    guidance: 'Answer the question directly and completely before anything else. Disclose affiliation.',
    maxChars: 10000, hookRequired: false, hashtags: 0,
  },
};

/**
 * Take a base draft and produce one genuinely distinct version per platform.
 * The AI writes the copy (CaptionWriter); this function enforces the structural
 * rules — length, hashtags, titles — and flags what it had to trim.
 *
 * @param {{
 *   base: {hook?:string, caption:string, cta?:string, title?:string},
 *   platforms: string[],
 *   aiVersions?: Record<string, {caption?:string, title?:string, hashtags?:string[]}>,
 *   hashtagInput?: Parameters<typeof buildHashtags>[0],
 * }} input
 */
export function adaptForPlatforms(input) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const platform of input.platforms) {
    const style = PLATFORM_STYLE[platform];
    if (!style) continue;

    const ai = input.aiVersions?.[platform];
    let caption = ai?.caption
      ?? [input.base.hook, input.base.caption, input.base.cta].filter(Boolean).join('\n\n');

    const tags = ai?.hashtags?.length
      ? ai.hashtags.slice(0, style.hashtags).map((t) => ({ tag: t, kind: 'topic', reason: 'From the AI draft' }))
      : buildHashtags({ ...(input.hashtagInput ?? {}), platform }).hashtags;

    const notes = [];
    const withTags = style.hashtags > 0 && tags.length
      ? `${caption}\n\n${tags.map((t) => t.tag).join(' ')}`
      : caption;

    let finalCaption = withTags;
    if (finalCaption.length > style.maxChars) {
      finalCaption = trimTo(finalCaption, style.maxChars);
      notes.push(`Trimmed to ${style.maxChars} characters for ${style.label}`);
    }
    if (style.hookRequired && !ai?.caption && !input.base.hook) {
      notes.push(`${style.label} leads with the hook — none was supplied, so the caption's first line is doing that work`);
    }

    out[platform] = {
      platform,
      caption: finalCaption,
      title: style.titleRequired ? (ai?.title ?? input.base.title ?? input.base.hook ?? '').slice(0, 100) : undefined,
      hashtags: style.hashtags > 0 ? tags : [],
      guidance: style.guidance,
      char_count: finalCaption.length,
      notes,
    };
  }
  return out;
}

/**
 * Repurposing plan (§29): which platforms can actually carry this content type,
 * and which need a person.
 * @param {{sourceContentType:string, targetPlatforms:string[]}} input
 */
export function repurposePlan(input) {
  const plan = [];
  for (const platform of input.targetPlatforms) {
    const adapter = getAdapter(platform);
    const target = mapContentType(input.sourceContentType, platform);
    const supported = target ? adapter.supportsPublishing(/** @type {any} */ (target)) : false;
    plan.push({
      platform,
      target_content_type: target,
      status: supported ? 'SUPPORTED' : 'MANUAL_ACTION_REQUIRED',
      note: supported
        ? `Publishes as ${target} through the official API.`
        : adapter.capabilities.notes?.[target ?? input.sourceContentType]
          ?? `${platform} has no official API path for ${target ?? input.sourceContentType}.`,
    });
  }
  return plan;
}

/** How a source format lands on each platform. */
function mapContentType(source, platform) {
  const map = {
    reel: { instagram: 'reel', facebook: 'reel', youtube: 'short_video', threads: 'short_video', x: 'short_video', linkedin: 'short_video', reddit: 'link', quora: null },
    carousel: { instagram: 'carousel', facebook: 'image', linkedin: 'document', x: 'image', threads: 'image', youtube: null, reddit: 'image', quora: null },
    image: { instagram: 'image', facebook: 'image', linkedin: 'image', x: 'image', threads: 'image', reddit: 'image', youtube: null, quora: null },
    long_video: { youtube: 'long_video', facebook: 'long_video', linkedin: 'short_video', instagram: 'reel', x: 'short_video', threads: 'short_video', reddit: 'link', quora: null },
    text: { linkedin: 'text', x: 'text', threads: 'text', facebook: 'text', reddit: 'text', quora: 'text', instagram: null, youtube: null },
  };
  return map[source]?.[platform] ?? null;
}

function trimTo(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastBreak = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'), cut.lastIndexOf(' '));
  return (lastBreak > max * 0.6 ? cut.slice(0, lastBreak) : cut).trimEnd() + '…';
}
