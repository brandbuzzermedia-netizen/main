// Claude reads platform screenshots and returns the figures it can see, each
// with a confidence level. Missing values come back as null: nothing is
// estimated. The studio fills the report form with these for a person to
// check; they are never saved without that review.
import Anthropic from "@anthropic-ai/sdk";
import { MODEL, anthropic } from "./client";
import { AiError } from "./write";
import { RESULT_TYPES } from "../report/types";

export type ExtractPlatform = "instagram" | "meta";
export type Confidence = "high" | "medium" | "low";

/** Report form field -> [schema key, label Claude looks for]. */
const FIELDS: Record<ExtractPlatform, [string, string, string][]> = {
  instagram: [
    ["ig.views", "views", "Views (Insights overview; older screenshots call this impressions)"],
    ["ig.unique", "accounts_reached", "Accounts reached"],
    ["ig.engaged", "accounts_engaged", "Accounts engaged"],
    ["ig.followersStart", "followers_start", "Followers at the start of the period, only if printed"],
    ["ig.likes", "likes", "Total likes for the account in the period"],
    ["ig.comments", "comments", "Total comments for the account in the period"],
    ["ig.shares", "shares", "Total shares for the account in the period"],
    ["ig.saves", "saves", "Total saves for the account in the period"],
    ["ig.posts", "posts_published", "Number of posts published, only if printed"],
    ["ig.reels", "reels_published", "Number of Reels published, only if printed"],
    ["ig.stories", "stories_published", "Number of stories published, only if printed"],
    ["ig.nonFol", "non_follower_views_pct", "Percentage of views from non-followers"],
    ["ig.followers", "followers", "Total followers"],
    ["ig.net", "net_follows", "Net follows: follows minus unfollows (can be negative)"],
    ["ig.growth", "follower_growth_pct", "Follower growth percentage, only if printed"],
    ["ig.profileVisits", "profile_visits", "Profile visits / profile activity"],
    ["ig.websiteClicks", "external_link_taps", "External link taps / website taps"],
    ["ig.messages", "messages", "Messages / conversations from organic content"],
  ],
  meta: [
    ["meta.spend", "amount_spent", "Amount spent"],
    ["meta.conv", "results", "Results (whatever Ads Manager counts as the result: leads, messaging conversations, calls, link clicks…)"],
    ["meta.impr", "impressions", "Impressions"],
    ["meta.reach", "reach", "Reach"],
    ["meta.clicks", "link_clicks", "Link clicks"],
    ["meta.ctr", "ctr_pct", "CTR (link click-through rate) percentage, only if printed"],
    ["meta.cpc", "cpc", "CPC (cost per link click), only if printed"],
    ["meta.cpm", "cpm", "CPM (cost per 1,000 impressions), only if printed"],
  ],
};
const TEXT_FIELDS: Record<ExtractPlatform, [string, string, string][]> = {
  instagram: [],
  meta: [
    ["meta.campaign", "campaign_name", "Campaign name"],
    ["meta.objective", "objective", "Campaign objective"],
    ["meta.resultType", "result_type", `What the results are, as one of: ${RESULT_TYPES.join(", ")}`],
  ],
};

const nullable = (t: object) => ({ anyOf: [t, { type: "null" }] });
const conf = { type: "string", enum: ["high", "medium", "low"] };
const numField = { type: "object", properties: { value: nullable({ type: "number" }), confidence: conf }, required: ["value", "confidence"], additionalProperties: false };
const textField = { type: "object", properties: { value: nullable({ type: "string" }), confidence: conf }, required: ["value", "confidence"], additionalProperties: false };
const post = {
  type: "object",
  properties: {
    date: nullable({ type: "string", format: "date" }),
    type: nullable({ type: "string", enum: ["Reel", "Post", "Carousel"] }),
    caption: nullable({ type: "string" }),
    views: nullable({ type: "number" }), reach: nullable({ type: "number" }), likes: nullable({ type: "number" }),
    comments: nullable({ type: "number" }), shares: nullable({ type: "number" }), saves: nullable({ type: "number" }),
    confidence: conf,
  },
  required: ["date", "type", "caption", "views", "reach", "likes", "comments", "shares", "saves", "confidence"],
  additionalProperties: false,
};

function schema(p: ExtractPlatform) {
  const props: Record<string, object> = {
    period_start: nullable({ type: "string", format: "date" }),
    period_end: nullable({ type: "string", format: "date" }),
    account_name: nullable({ type: "string" }),
    notes: { type: "string" },
  };
  for (const [, key] of FIELDS[p]) props[key] = numField;
  for (const [, key] of TEXT_FIELDS[p]) props[key] = textField;
  if (p === "instagram") props.posts = { type: "array", items: post };
  return { type: "object", properties: props, required: Object.keys(props), additionalProperties: false };
}

export interface ExtractedField { value: number | string; confidence: Confidence }
export interface ExtractedPost {
  date: string | null; type: "Reel" | "Post" | "Carousel" | null; caption: string | null;
  views: number | null; reach: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null;
  confidence: Confidence;
}
export interface ExtractResult {
  /** Keyed by report form field name, e.g. "ig.views". Only values Claude could see. */
  fields: Record<string, ExtractedField>;
  posts: ExtractedPost[];
  period: { start: string | null; end: string | null };
  notes: string;
  /** The account or page name the screenshots show, for the wrong-client check. */
  account: string | null;
}

/** Which client and month the screenshots are for. Each request covers one client only. */
export interface ExtractScope { clientName: string; handle: string | null; month: string | null }

export interface ImageInput { mediaType: "image/png" | "image/jpeg" | "image/webp"; base64: string }

export async function extractFigures(platform: ExtractPlatform, images: ImageInput[], scope?: ExtractScope): Promise<ExtractResult> {
  const label = platform === "instagram" ? "Instagram Insights" : "Meta Ads Manager";
  const wanted = [...FIELDS[platform], ...TEXT_FIELDS[platform]].map(([, key, desc]) => `- ${key}: ${desc}`).join("\n");
  const who = scope ? ` They should belong to the client "${scope.clientName}"${scope.handle ? ` (Instagram @${scope.handle})` : ""}${scope.month ? `, for ${scope.month}` : ""}.` : "";
  const instructions = `These are screenshots from ${label} for one client and one reporting period.${who}

Read the figures that are printed in the screenshots:
${wanted}${platform === "instagram" ? "\n- posts: one entry per post or Reel whose own insights are shown (date, type, caption, views, reach, likes, comments, shares, saves). Empty if none are shown." : ""}

Rules:
- Report only what is printed. Never estimate, calculate or carry a value over from another field. If a value is not shown, return null for it.
- Write numbers as plain numbers: 81560 not "81.5K" unless only "81.5K" is shown, in which case return 81500 and confidence "low". 98.4 for 98.4%. 8474.59 for ₹8,474.59.
- Confidence: "high" when the value and its label are clearly legible; "medium" when the label is ambiguous or partly cut off; "low" when unsure. Prefer null over a low-confidence guess.
- period_start and period_end: the date range the screenshots show, as YYYY-MM-DD, or null. If screenshots show different date ranges, set both to null and say so in notes.
- account_name: the Instagram account, Facebook page or ad account name printed in the screenshots, or null if none is visible.
- result_type: pick the option that matches the Results column label. Use null if it is not shown.
- notes: one or two sentences on anything a reviewer should check (different date ranges, cropped figures, screenshots from another account). Empty string if nothing.`;

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: schema(platform) } },
      messages: [{
        role: "user",
        content: [
          ...images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 } })),
          { type: "text" as const, text: instructions },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The Anthropic API key was not accepted. Check ANTHROPIC_API_KEY on the server.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Claude is busy right now. Try again in a minute, or enter the figures by hand.");
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude could not read the screenshots (${e.status ?? "network"}). Try again, or enter the figures by hand.`);
    throw e;
  }
  if (response.stop_reason === "refusal") throw new AiError("Claude declined to read these screenshots. Enter the figures by hand.");
  if (response.stop_reason === "max_tokens") throw new AiError("Claude's answer was cut short. Try fewer screenshots at a time.");
  const text = response.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text); } catch { throw new AiError("Claude's answer could not be read. Try again, or enter the figures by hand."); }

  const fields: Record<string, ExtractedField> = {};
  for (const [name, key] of [...FIELDS[platform], ...TEXT_FIELDS[platform]]) {
    const f = raw[key] as { value?: unknown; confidence?: unknown } | undefined;
    let ok = f && (typeof f.value === "number" ? Number.isFinite(f.value) : typeof f.value === "string" && f.value.trim() !== "");
    if (ok && name === "meta.resultType" && !(RESULT_TYPES as readonly string[]).includes(f!.value as string)) ok = false;
    const c = f?.confidence;
    if (ok && (c === "high" || c === "medium" || c === "low")) fields[name] = { value: f!.value as number | string, confidence: c };
  }
  const iso = (x: unknown) => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
  return {
    fields,
    posts: Array.isArray(raw.posts) ? (raw.posts as ExtractedPost[]).slice(0, 60) : [],
    period: { start: iso(raw.period_start), end: iso(raw.period_end) },
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 500) : "",
    account: typeof raw.account_name === "string" && raw.account_name.trim() ? raw.account_name.trim().slice(0, 120) : null,
  };
}
