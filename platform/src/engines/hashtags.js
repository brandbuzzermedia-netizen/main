/**
 * Hashtag engine (§22).
 *
 * Hashtags are classified by what they are for — brand, industry, topic,
 * location, trending, niche — and an irrelevant tag is never added just because
 * it is popular. Relevance is the filter; reach is a consequence.
 */

export const HASHTAG_KINDS = /** @type {const} */ (['brand', 'industry', 'topic', 'location', 'trending', 'niche']);

/** Per-platform sensible ceilings. Not platform maximums — usable counts. */
const LIMITS = {
  instagram: 12, facebook: 3, linkedin: 4, x: 2,
  threads: 2, youtube: 5, reddit: 0, quora: 0,
};

/**
 * @param {{
 *   clientName?: string, industry?: string, location?: string,
 *   keywords?: {term:string, kind:string}[],
 *   topic?: string, trendingTopics?: string[], platform?: string,
 * }} input
 */
export function buildHashtags(input) {
  /** @type {{tag:string, kind:string, reason:string}[]} */
  const tags = [];
  const seen = new Set();

  const push = (value, kind, reason) => {
    const tag = toTag(value);
    if (!tag || tag.length < 3 || seen.has(tag.toLowerCase())) return;
    seen.add(tag.toLowerCase());
    tags.push({ tag, kind, reason });
  };

  if (input.clientName) push(input.clientName, 'brand', 'The client’s own brand tag');
  if (input.topic) push(input.topic, 'topic', 'Names what the post is actually about');

  for (const kw of input.keywords ?? []) {
    const kind = kw.kind === 'location' ? 'location'
      : kw.kind === 'industry' ? 'industry'
      : kw.kind === 'hashtag' ? 'niche' : 'topic';
    push(kw.term, kind, `From the client’s ${kw.kind} keywords`);
  }

  if (input.industry) push(input.industry, 'industry', 'Industry context');
  if (input.location) push(input.location, 'location', 'Local discovery');

  // Trending tags are only included when they overlap the post's own subject.
  const subject = `${input.topic ?? ''} ${(input.keywords ?? []).map((k) => k.term).join(' ')}`.toLowerCase();
  for (const trend of input.trendingTopics ?? []) {
    const words = String(trend).toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const related = words.some((w) => subject.includes(w));
    if (related) push(trend, 'trending', 'Trending and genuinely on-topic for this post');
  }

  const limit = LIMITS[input.platform ?? 'instagram'] ?? 8;
  return {
    hashtags: tags.slice(0, limit),
    excluded: tags.slice(limit),
    limit,
    note: limit === 0
      ? `${input.platform} conversations do not use hashtags — none added.`
      : `Capped at ${limit} for ${input.platform ?? 'instagram'}; only tags related to this post's subject are included.`,
  };
}

function toTag(value) {
  const cleaned = String(value ?? '')
    .replace(/^#/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  return cleaned ? `#${cleaned}` : '';
}
