import { clamp, listToSentence, matchedPhrases } from "./text";

export interface ScoringPost {
  content: string;
  authorHandle: string | null;
  authorName: string | null;
  authorBio: string | null;
  authorFollowers: number | null;
  authorIsBusiness: boolean | null;
  postedAt: Date | null;
  metrics: { likes?: number; comments?: number };
  replyToText?: string | null;
  opportunityType: "third_party_post" | "own_post_comment" | "mention" | "manual";
}

export interface ScoringSegment {
  id: string;
  name: string;
  industries: string[];
  jobTitles: string[];
  locations: string[];
  keywords: string[];
  hashtags: string[];
  negativeKeywords: string[];
}

export interface ScoringContext {
  campaignKeywords: string[];
  campaignHashtags: string[];
  campaignLocations: string[];
  brandTerms: string[]; // products, services, brand keywords
  excludedTopics: string[];
  competitors: string[];
  targetHandles: string[];
  segments: ScoringSegment[];
}

export const SCORE_WEIGHTS = {
  audienceMatch: 0.25,
  contentRelevance: 0.25,
  conversationPotential: 0.15,
  brandRelevance: 0.15,
  authorRelevance: 0.1,
  freshness: 0.1,
} as const;

export type FactorKey = keyof typeof SCORE_WEIGHTS;

export interface ScoreResult {
  score: number;
  label: "Strong opportunity" | "Good opportunity" | "Moderate opportunity" | "Weak opportunity" | "Excluded";
  factors: Record<FactorKey, number>;
  explanation: string;
  topic: string | null;
  bestSegmentId: string | null;
  audienceMatch: string;
  brandRelevance: string;
  excludedReason: string | null;
}

export function scoreLabel(score: number): ScoreResult["label"] {
  if (score >= 80) return "Strong opportunity";
  if (score >= 60) return "Good opportunity";
  if (score >= 40) return "Moderate opportunity";
  return "Weak opportunity";
}

export const SCORE_DISCLAIMER =
  "Scores estimate how relevant a conversation is to this client. They do not predict or guarantee engagement.";

/**
 * Deterministic 0–100 opportunity score from six weighted factors.
 * Uses only this client's campaign, audience and brand data.
 */
export function scoreOpportunity(post: ScoringPost, ctx: ScoringContext, now = new Date()): ScoreResult {
  const text = [post.content, post.replyToText ?? ""].join("\n");
  const authorText = [post.authorName ?? "", post.authorBio ?? "", post.authorHandle ?? ""].join("\n");
  const all = `${text}\n${authorText}`;

  // Hard exclusions: excluded topics, segment negatives, competitor-authored posts.
  const excludedHit = matchedPhrases(text, ctx.excludedTopics)[0];
  const negativeHit = matchedPhrases(text, ctx.segments.flatMap((s) => s.negativeKeywords))[0];
  const competitorAuthor = ctx.competitors.find(
    (c) => c && (matchedPhrases(post.authorHandle ?? "", [c]).length > 0 || matchedPhrases(post.authorName ?? "", [c]).length > 0),
  );
  const excludedReason = excludedHit
    ? `Post touches an excluded topic ("${excludedHit}").`
    : negativeHit
      ? `Post matches a negative keyword ("${negativeHit}").`
      : competitorAuthor
        ? `Post is by a listed competitor (${competitorAuthor}).`
        : null;

  // Audience match: best segment by job titles / industries / locations found in author + post.
  let best = { segment: null as ScoringSegment | null, score: 0, titles: [] as string[], locations: [] as string[], industries: [] as string[] };
  for (const seg of ctx.segments) {
    const titles = matchedPhrases(authorText || text, seg.jobTitles);
    const industries = matchedPhrases(all, seg.industries);
    const locations = matchedPhrases(all, [...seg.locations, ...ctx.campaignLocations]);
    const kw = matchedPhrases(text, [...seg.keywords, ...seg.hashtags]);
    const s =
      (titles.length ? 45 : 0) +
      Math.min(25, industries.length * 15) +
      (locations.length ? 20 : 0) +
      Math.min(20, kw.length * 8);
    if (s > best.score) best = { segment: seg, score: s, titles, locations, industries };
  }
  const authorKnown = Boolean(post.authorBio || post.authorName || post.authorHandle);
  const audienceMatch = clamp(best.score || (authorKnown ? 15 : 35));

  // Content relevance: campaign + segment keywords/hashtags present in the post.
  const relevanceTerms = [
    ...ctx.campaignKeywords,
    ...ctx.campaignHashtags,
    ...(best.segment ? [...best.segment.keywords, ...best.segment.hashtags] : ctx.segments.flatMap((s) => s.keywords)),
  ];
  const contentHits = matchedPhrases(text, relevanceTerms);
  const contentRelevance = clamp(contentHits.length === 0 ? 10 : 40 + contentHits.length * 18);

  // Conversation potential: questions, invitations to respond, reachable thread size.
  const questions = (text.match(/\?/g) ?? []).length;
  const invites = /(what do you think|thoughts\??|agree\??|how do you|which (one|would)|let me know|share your|any (tips|advice|suggestions))/i.test(text);
  const comments = post.metrics.comments ?? 0;
  const threadSize = comments === 0 ? 10 : comments <= 50 ? 25 : comments <= 300 ? 15 : 0;
  const ownThread = post.opportunityType === "own_post_comment" || post.opportunityType === "mention" ? 25 : 0;
  const length = text.trim().length > 120 ? 15 : 5;
  const conversationPotential = clamp(Math.min(30, questions * 15) + (invites ? 20 : 0) + threadSize + ownThread + length);

  // Brand relevance: products, services and brand keywords.
  const brandHits = matchedPhrases(text, ctx.brandTerms);
  const brandRelevance = clamp(brandHits.length === 0 ? 15 : 45 + brandHits.length * 18);

  // Author relevance: target profile, business account, audience-sized following.
  const handle = (post.authorHandle ?? "").replace(/^@/, "").toLowerCase();
  const isTarget = handle !== "" && ctx.targetHandles.some((t) => t.replace(/^@/, "").toLowerCase() === handle);
  const f = post.authorFollowers;
  const followerFit = f == null ? 10 : f < 300 ? 10 : f <= 100_000 ? 30 : 15;
  const authorRelevance = isTarget ? 100 : clamp(20 + followerFit + (post.authorIsBusiness ? 15 : 0) + (best.titles.length ? 25 : 0));

  // Freshness: full marks under 6 hours, decaying to zero at 14 days.
  const ageHours = post.postedAt ? (now.getTime() - post.postedAt.getTime()) / 3_600_000 : 72;
  const freshness = clamp(ageHours <= 6 ? 100 : 100 - ((ageHours - 6) / (14 * 24 - 6)) * 100);

  const factors = {
    audienceMatch: Math.round(audienceMatch),
    contentRelevance: Math.round(contentRelevance),
    conversationPotential: Math.round(conversationPotential),
    brandRelevance: Math.round(brandRelevance),
    authorRelevance: Math.round(authorRelevance),
    freshness: Math.round(freshness),
  };
  const weighted = (Object.keys(SCORE_WEIGHTS) as FactorKey[]).reduce((sum, k) => sum + factors[k] * SCORE_WEIGHTS[k], 0);
  const score = excludedReason ? 0 : Math.round(clamp(weighted));

  const topicTerms = contentHits.length ? contentHits : brandHits;
  const topic = topicTerms.length ? listToSentence(topicTerms, 3) : null;
  const audienceText = best.segment
    ? [
        best.titles.length ? `${listToSentence(best.titles, 2)}` : null,
        best.locations.length ? `in ${listToSentence(best.locations, 2)}` : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  let explanation: string;
  if (excludedReason) {
    explanation = excludedReason;
  } else {
    const parts: string[] = [];
    parts.push(topic ? `Post discusses ${topic}` : "Post has limited overlap with campaign keywords");
    if (best.segment && best.score >= 45) {
      parts.push(`the author matches the ${best.segment.name} audience${audienceText ? ` (${audienceText})` : ""}`);
    } else if (!authorKnown) {
      parts.push("author details aren't available from this platform's API");
    }
    if (isTarget) parts.push("the author is on the target profile list");
    explanation = `${parts.join(" and ")}.`;
  }

  return {
    score,
    label: excludedReason ? "Excluded" : scoreLabel(score),
    factors,
    explanation,
    topic,
    bestSegmentId: best.segment && best.score > 0 ? best.segment.id : null,
    audienceMatch: best.segment && best.score > 0 ? `${best.segment.name}${audienceText ? ` — ${audienceText}` : ""}` : "No segment match",
    brandRelevance: brandHits.length ? `Mentions ${listToSentence(brandHits, 3)}` : "No direct product or service mention",
    excludedReason,
  };
}
