import { cosine } from "@/lib/ai/embeddings";
import type { CommentRules } from "@/lib/platforms/types";
import { matchedPhrases, normalize, words } from "./text";

export type CheckName =
  | "relevance"
  | "spam"
  | "duplicate"
  | "brand_voice"
  | "promotional"
  | "safety"
  | "platform_policy";

export const CHECK_LABELS: Record<CheckName, string> = {
  relevance: "Relevance",
  spam: "Spam",
  duplicate: "Duplicate",
  brand_voice: "Brand voice",
  promotional: "Promotional language",
  safety: "Safety",
  platform_policy: "Platform policy risk",
};

export interface CheckResult {
  check: CheckName;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface QualityReport {
  score: number;
  passed: boolean;
  checks: CheckResult[];
  warnings: string[];
}

export interface HistoryComment {
  text: string;
  embedding: number[] | null;
  embeddingModel: string | null;
  campaignId: string;
  authorHandle: string | null;
  platform: string;
  createdAt: Date;
}

export interface QualityInput {
  text: string;
  embedding: number[];
  embeddingModel: string;
  platform: string;
  rules: CommentRules;
  postContent: string;
  replyToText?: string | null;
  authorHandle: string | null;
  campaignId: string;
  campaignKeywords: string[];
  brand: {
    wordsToAvoid: string[];
    topicsToAvoid: string[];
    competitors: string[];
    claimsRequiringApproval: string[];
    ctaStyle: "none" | "soft" | "direct";
    emojiPolicy: "none" | "sparing" | "allowed";
    commentLength: "short" | "medium" | "long";
    tone: string[];
  };
  /** Same client only. The caller must never pass another client's comments. */
  history: HistoryComment[];
  now?: Date;
}

export const GENERIC_PHRASES = [
  "great post",
  "nice post",
  "nice information",
  "great information",
  "great content",
  "love this",
  "well said",
  "so true",
  "amazing post",
  "awesome post",
  "thanks for sharing",
  "very informative",
  "nice one",
  "good one",
  "keep it up",
  "keep up the good work",
];

const PROMO_PATTERNS: [RegExp, string][] = [
  [/\b(dm|message|inbox) us\b/i, "asks people to DM"],
  [/\bcheck (out )?our (profile|page|website|site|feed|collection|products?)\b/i, "points to the brand's profile"],
  [/\b(visit|see) our (website|site|page|store|showroom)\b/i, "asks people to visit the website"],
  [/\bcontact us\b/i, "says \"contact us\""],
  [/\blink in (our )?bio\b/i, "mentions link in bio"],
  [/\b(call|whatsapp) us\b/i, "asks people to call"],
  [/\b(shop|buy|order|book) now\b/i, "hard sell"],
  [/\b\d{1,2}\s?% off\b|\bdiscount\b|\bsale\b|\boffer\b/i, "mentions a discount or offer"],
  [/\b(we|our team) (can|could) help you\b/i, "pitches the brand's services"],
  [/https?:\/\/|www\.[a-z]/i, "contains a link"],
];

const PROFANITY = ["fuck", "shit", "bitch", "bastard", "asshole", "crap", "damn"];
const SENSITIVE_TOPICS = ["politics", "election", "religion", "caste", "abortion", "terrorism", "war"];
const DEFAULT_CLAIMS = ["guarantee", "guaranteed", "best in", "number one", "#1", "cheapest", "100%", "certified", "proven", "lifetime"];

const FABRICATED_EXPERIENCE = [
  /\bi (once|recently|remember|visited|installed|worked on|designed|built|bought|used|tried|saw)\b/i,
  /\bwhen i (was|visited|worked|designed|built)\b/i,
  /\bmy (client|clients|wife|husband|home|house|family|friend|kids)\b/i,
  /\bwe (recently |just )?(installed|delivered|completed|fitted|designed|built) [^.]{0,60}\bfor (a|an|our|one)\b/i,
  /\bin my (experience|years)\b/i,
];

const STOP = new Set(
  "the a an and or but if of to in on for with at by from is are was were be been this that these those it its as your you our we they their there here about into than then so very just can will would should could how what when where which who why not no yes more most much many".split(
    " ",
  ),
);

function contentWords(s: string): Set<string> {
  return new Set(words(s).map((w) => w.replace(/^#/, "").replace(/(ing|ed|es|s)$/, "")).filter((w) => w.length > 3 && !STOP.has(w)));
}

const LENGTH_TARGET = { short: 180, medium: 320, long: 600 } as const;

export function runQualityChecks(input: QualityInput): QualityReport {
  const t = input.text.trim();
  const lower = normalize(t);
  const checks: CheckResult[] = [];
  const now = input.now ?? new Date();

  // 1. Relevance — the comment must engage with what the post actually says.
  const postWords = contentWords(`${input.postContent} ${input.replyToText ?? ""}`);
  const commentWords = contentWords(t);
  const overlap = [...commentWords].filter((w) => postWords.has(w)).length;
  const keywordHit = matchedPhrases(t, input.campaignKeywords).length > 0;
  if (overlap === 0 && !keywordHit) {
    checks.push({ check: "relevance", status: "fail", message: "Comment doesn't reference anything specific from the post." });
  } else if (overlap < 2 && !keywordHit) {
    checks.push({ check: "relevance", status: "warn", message: "Comment only loosely connects to the post." });
  } else {
    checks.push({ check: "relevance", status: "pass", message: "References the post's topic." });
  }

  // 2. Spam — generic praise, shouting, emoji/hashtag stuffing, too short.
  const generic = GENERIC_PHRASES.filter((p) => lower.includes(p));
  const letters = t.replace(/[^A-Za-z]/g, "");
  const capsRatio = letters.length ? letters.replace(/[^A-Z]/g, "").length / letters.length : 0;
  const emojis = (t.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  const hashtags = (t.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
  const spamIssues: string[] = [];
  let spamFail = false;
  if (generic.length && t.length < 90) {
    spamIssues.push(`generic praise ("${generic[0]}")`);
    spamFail = true;
  } else if (generic.length) {
    spamIssues.push(`contains generic praise ("${generic[0]}")`);
  }
  if (t.length < 25) {
    spamIssues.push("too short to add value");
    spamFail = true;
  }
  if (capsRatio > 0.5 && letters.length > 10) spamIssues.push("too many capitals");
  if (emojis > 3) spamIssues.push("too many emoji");
  if (/(.)\1{4,}/u.test(t)) spamIssues.push("repeated characters");
  if (hashtags > 3) {
    spamIssues.push("hashtag stuffing");
    spamFail = true;
  }
  checks.push(
    spamIssues.length
      ? { check: "spam", status: spamFail ? "fail" : "warn", message: `Looks spammy: ${spamIssues.join(", ")}.` }
      : { check: "spam", status: "pass", message: "No spam patterns." },
  );

  // 3. Duplicate — semantic similarity against this client's own history only.
  let dup: { sim: number; c: HistoryComment } | null = null;
  for (const h of input.history) {
    const exact = normalize(h.text).replace(/\s+/g, " ") === lower.replace(/\s+/g, " ");
    const sim = exact ? 1 : h.embedding && h.embeddingModel === input.embeddingModel ? cosine(input.embedding, h.embedding) : 0;
    if (!dup || sim > dup.sim) dup = { sim, c: h };
  }
  if (dup && dup.sim >= 0.85) {
    const days = (now.getTime() - dup.c.createdAt.getTime()) / 86_400_000;
    const sameAuthor = !!input.authorHandle && dup.c.authorHandle?.toLowerCase() === input.authorHandle.toLowerCase();
    const sameCampaign = dup.c.campaignId === input.campaignId;
    const strong = dup.sim >= 0.92 && (sameAuthor || sameCampaign || days <= 30);
    const scope = [sameAuthor && "same author", sameCampaign && "same campaign", dup.c.platform === input.platform && "same platform"]
      .filter(Boolean)
      .join(", ");
    checks.push({
      check: "duplicate",
      status: strong ? "fail" : "warn",
      message: `${Math.round(dup.sim * 100)}% similar to a comment from ${Math.max(0, Math.round(days))} day(s) ago${scope ? ` (${scope})` : ""}.`,
    });
  } else {
    checks.push({ check: "duplicate", status: "pass", message: "Not similar to this client's recent comments." });
  }

  // 4. Brand voice — banned words, competitors, length, emoji policy, tone.
  const avoid = matchedPhrases(t, input.brand.wordsToAvoid);
  const competitor = matchedPhrases(t, input.brand.competitors);
  const voice: { status: "warn" | "fail"; msg: string }[] = [];
  if (avoid.length) voice.push({ status: "fail", msg: `uses words to avoid (${avoid.join(", ")})` });
  if (competitor.length) voice.push({ status: "fail", msg: `mentions a competitor (${competitor.join(", ")})` });
  const target = LENGTH_TARGET[input.brand.commentLength];
  if (t.length > target * 1.4) voice.push({ status: "warn", msg: `longer than the preferred ${input.brand.commentLength} length` });
  if (input.brand.emojiPolicy === "none" && emojis > 0) voice.push({ status: "warn", msg: "uses emoji, which this brand avoids" });
  const professional = input.brand.tone.some((x) => /professional|technical|premium|luxury|minimal/i.test(x));
  if (professional && (t.match(/!/g) ?? []).length > 1) voice.push({ status: "warn", msg: "too many exclamation marks for the brand tone" });
  checks.push(
    voice.length
      ? {
          check: "brand_voice",
          status: voice.some((v) => v.status === "fail") ? "fail" : "warn",
          message: `Brand voice: ${voice.map((v) => v.msg).join("; ")}.`,
        }
      : { check: "brand_voice", status: "pass", message: "Matches the brand voice rules." },
  );

  // 5. Promotional language.
  const promo = PROMO_PATTERNS.filter(([re]) => re.test(t)).map(([, why]) => why);
  if (promo.length) {
    const status = input.brand.ctaStyle === "none" ? "fail" : "warn";
    checks.push({ check: "promotional", status, message: `Comment is too promotional: ${promo.join(", ")}.` });
  } else {
    checks.push({ check: "promotional", status: "pass", message: "Not promotional." });
  }

  // 6. Safety — profanity, sensitive or excluded topics, claims, invented experiences.
  const safety: { status: "warn" | "fail"; msg: string }[] = [];
  const profane = PROFANITY.filter((w) => new RegExp(`\\b${w}`, "i").test(t));
  if (profane.length) safety.push({ status: "fail", msg: "contains profanity" });
  const sensitive = matchedPhrases(t, [...SENSITIVE_TOPICS, ...input.brand.topicsToAvoid]);
  if (sensitive.length) safety.push({ status: "fail", msg: `touches a topic to avoid (${sensitive.join(", ")})` });
  const claims = matchedPhrases(t, [...DEFAULT_CLAIMS, ...input.brand.claimsRequiringApproval]);
  if (claims.length) safety.push({ status: "warn", msg: `makes a claim that needs approval (${claims.join(", ")})` });
  if (FABRICATED_EXPERIENCE.some((re) => re.test(t))) {
    safety.push({ status: "fail", msg: "describes a personal experience the brand may not have had" });
  }
  checks.push(
    safety.length
      ? {
          check: "safety",
          status: safety.some((s) => s.status === "fail") ? "fail" : "warn",
          message: `Safety: ${safety.map((s) => s.msg).join("; ")}.`,
        }
      : { check: "safety", status: "pass", message: "No safety concerns." },
  );

  // 7. Platform policy risk.
  const policy: { status: "warn" | "fail"; msg: string }[] = [];
  if (t.length > input.rules.maxLength) policy.push({ status: "fail", msg: `exceeds the ${input.rules.maxLength}-character limit` });
  if (!input.rules.linksClickable && /https?:\/\/|www\./i.test(t)) policy.push({ status: "fail", msg: "links aren't clickable on this platform" });
  const mentions = (t.match(/(^|\s)@[\w.]+/g) ?? []).length;
  if (mentions > input.rules.maxMentions) policy.push({ status: "warn", msg: `${mentions} @mentions (max ${input.rules.maxMentions})` });
  if (hashtags > input.rules.maxHashtags) policy.push({ status: "warn", msg: `${hashtags} hashtags (max ${input.rules.maxHashtags})` });
  checks.push(
    policy.length
      ? {
          check: "platform_policy",
          status: policy.some((p) => p.status === "fail") ? "fail" : "warn",
          message: `Platform risk: ${policy.map((p) => p.msg).join("; ")}.`,
        }
      : { check: "platform_policy", status: "pass", message: "Within platform limits." },
  );

  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const score = Math.max(0, Math.min(100, 100 - fails * 30 - warns * 8));
  const warnings = checks.filter((c) => c.status !== "pass").map((c) => c.message);
  return { score, passed: fails === 0, checks, warnings: warnings.length ? warnings : ["No issues detected"] };
}
