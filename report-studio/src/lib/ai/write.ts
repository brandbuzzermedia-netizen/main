// Claude writes the report text from the confirmed figures only.
//
// Claude gets a facts sheet (every figure formatted exactly as the report
// prints it, "Not available in uploaded data" for anything missing) and the
// template text for each block as a draft. Its answer is forced into one
// string per block. Every block is then checked: any figure that is not in
// the facts or the drafts gets the block rejected, and it keeps its current
// text. Nothing is saved until the caller applies the accepted blocks.
import Anthropic from "@anthropic-ai/sdk";
import { analyze, delta, engagementRate, hasPrevious, type Analysis } from "../analysis";
import { reportBlocks } from "../copy/blocks";
import { blockText, gen } from "../copy/generators";
import { allowedFigures, checkGrounding } from "../copy/grounding";
import { INR, K, PCT, f0, f1, f2, fLong, sgn } from "../format";
import { resolveData } from "../report/conflicts";
import type { ReportDoc } from "../report/types";
import { MODEL, anthropic } from "./client";

const NA = "Not available in uploaded data";
const v = (n: number | null | undefined, fmt: (x: number) => string) => (n == null ? NA : fmt(n));

/** Every figure the text may use, as the report prints it. */
export function factsSheet(doc: ReportDoc, A: Analysis) {
  const d = A.data, ig = d.ig, m = d.meta, o = d.outcomes;
  const facts: Record<string, unknown> = {
    client: doc.client.name,
    report_id: doc.id,
    industry: doc.client.industry || NA,
    report_focus: A.focus === "enquiries" ? "enquiries from paid media" : "reach and engagement",
    period: `${fLong(d.period.start)} to ${fLong(d.period.end)}`,
    month: A.month,
    instagram: {
      views: v(ig.views, f0), accounts_reached: v(ig.unique, f0), views_from_non_followers: v(ig.nonFol, (x) => PCT(x)),
      followers_at_month_end: v(ig.followers, f0), net_follows: v(ig.net, sgn), follower_growth: v(ig.growth, (x) => (x > 0 ? "+" : "") + PCT(x)),
      profile_visits: v(ig.profileVisits, f0), external_link_taps: v(ig.websiteClicks, f0), organic_messages: v(ig.messages, f0),
      views_per_new_follower: v(A.vpf, f0),
      followers_at_month_start: v(ig.followersStart, f0), accounts_engaged: v(ig.engaged, f0),
      likes: v(ig.likes, f0), comments: v(ig.comments, f0), shares: v(ig.shares, f0), saves: v(ig.saves, f0),
      total_interactions: v(A.interactions, f0), account_engagement_rate: v(A.accountER, (x) => PCT(x, 2)),
      posts_published: v(ig.posts, f0), reels_published: v(ig.reels, f0), stories_published: v(ig.stories, f0),
    },
    content: {
      pieces: A.counts.reels + A.counts.posts + A.counts.car, reels: A.counts.reels, posts: A.counts.posts, carousels: A.counts.car,
      average_views_per_piece: v(A.avgV, K),
      by_format: A.fm.map((f) => ({ format: f.name, pieces: f.n, total_views: f0(f.views), average_views: K(f.avg), average_engagement_rate: PCT(f.er, 2) })),
      leading_format_vs_next: A.ratio ? `${f1(A.ratio)}×` : NA,
      themes: A.themes.map((t) => ({ theme: t.name, pieces: t.n, average_views: K(t.avg), average_engagement_rate: PCT(t.er, 2) })),
      pieces_list: d.content.map((c) => ({
        id: c.id, date: fLong(c.date), type: c.type, theme: c.theme, views: v(c.views, f0), views_short: v(c.views, K),
        reach: v(c.reach, f0), likes: v(c.likes, f0), comments: v(c.comments, f0), shares: v(c.shares, f0), saves: v(c.saves, f0),
        engagement_rate: PCT(engagementRate(c), 2), rating_on_views: A.rating(c)[0],
      })),
      engagement_rate_definition: "(likes + comments + shares + saves) ÷ reach",
    },
    meta_ads: A.hasMeta ? {
      campaign: m.campaign || NA, objective: m.objective || NA, amount_spent: INR(m.spend),
      result_type: A.rw.Title, results: v(m.conv, f0), [A.rw.many.replace(/ /g, "_")]: v(m.conv, f0),
      [`cost_per_${A.rw.one.replace(/ /g, "_")}`]: v(A.cpr, INR), impressions: v(m.impr, f0), reach: v(m.reach, f0), frequency: v(A.freq, f2),
      cost_per_1000_impressions: v(A.cpm, INR), link_clicks: v(m.clicks, f0), click_through_rate: v(A.ctr, (x) => PCT(x, 2)), cost_per_click: v(A.cpc, INR),
    } : "Meta Ads data was not included in this report.",
    client_reported_results: {
      qualified_leads: v(o.qualified, f0), bookings: v(o.bookings, f0), sales: v(o.sales, f0), revenue: v(o.revenue, INR),
    },
  };
  if (hasPrevious(d)) {
    const p = d.prev, ch = (c: number | null, pr: number | null, inv = false) => delta(c, pr, inv)?.txt ?? "Not comparable";
    facts.previous_month = {
      instagram_views: v(p.views, f0), change_in_views: ch(ig.views, p.views), followers: v(p.followers, f0),
      ad_spend: v(p.spend, INR), ad_results: v(p.conv, f0), change_in_ad_results: ch(m.conv, p.conv),
    };
  }
  return facts;
}

const SYSTEM = `You write the commentary in a monthly marketing performance report that the agency Get Bee Seen sends to its client. The reader is the client: a business owner, not a marketer.

Rules, all of them strict:
1. Use only the facts given. Every number you write must appear in FACTS or in that block's draft, written exactly the same way (same rounding, same symbols). Never calculate, round, estimate or invent a figure. Write small counts as numerals only if they appear in FACTS.
2. When the facts do not support a statement, write exactly: Insufficient data to determine.
3. Never claim sales, revenue, bookings or qualified leads unless client_reported_results gives them. Ad results are exactly the kind meta_ads.result_type names (for example messaging conversations are conversations, link clicks are clicks); never describe them as something else.
4. Never state why content performed as it did. For blocks whose id starts with "why.", begin with "Likely contributing factors based on available data:" and keep visual causes as unknown.
5. Keep each block to its role. pd_data states data only; pd_obs states an observation; pd_int interprets; pd_act recommends an action. Recommendations (rc.*, ct.*, ig_next, pd_act) are actions for next month.
6. Public Instagram data is not Insights; never imply private data you were not given.
7. Plain, warm, specific British English, as in the drafts. About the same length as each draft. No headings, lists, emoji or dashes used as punctuation.
8. The report is for one client only, named in FACTS.client. Never mention any other business, brand, client or account.
Improve the drafts' clarity and flow; do not add claims they do not support. Where FACTS.report_focus is "reach and engagement", do not frame the month around enquiries.`;

export interface WriteResult {
  accepted: Record<string, string>;
  rejected: { id: string; reason: string }[];
}

export class AiError extends Error {}

/**
 * @param otherClients names of the agency's other clients. A block naming any
 * of them is rejected, so one client's details never reach another's report.
 */
export async function writeReportText(doc: ReportDoc, otherClients: string[] = []): Promise<WriteResult> {
  const data = resolveData(doc).data;
  const A = analyze(data);
  const blocks = reportBlocks(doc);
  if (!blocks.length) return { accepted: {}, rejected: [] };
  const facts = factsSheet(doc, A);
  const drafts = blocks.map((b) => ({ id: b.id, page: b.page, label: b.label, draft: blockText(doc, A, b.id) }));

  const schema = {
    type: "object",
    properties: Object.fromEntries(blocks.map((b) => [b.id, { type: "string" }])),
    required: blocks.map((b) => b.id),
    additionalProperties: false,
  };

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Refusals are retried server-side on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `FACTS:\n${JSON.stringify(facts, null, 1)}\n\nBLOCKS (rewrite each draft; return one string per id):\n${JSON.stringify(drafts, null, 1)}`,
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The Anthropic API key was not accepted. Check ANTHROPIC_API_KEY on the server.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Claude is busy right now. Try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude could not be reached (${e.status ?? "network"}). Try again.`);
    throw e;
  }
  if (response.stop_reason === "refusal") throw new AiError("Claude declined to write this report. The current text is unchanged.");
  if (response.stop_reason === "max_tokens") throw new AiError("Claude's answer was cut short. Try again; the current text is unchanged.");
  const text = response.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
  let out: Record<string, unknown>;
  try {
    out = JSON.parse(text);
  } catch {
    throw new AiError("Claude's answer could not be read. Try again; the current text is unchanged.");
  }

  // The grounding check: figures must come from the facts or the drafts.
  const allowed = allowedFigures([JSON.stringify(facts), ...drafts.map((d) => d.draft), ...blocks.map((b) => gen(b.id, A))]);
  const result: WriteResult = { accepted: {}, rejected: [] };
  for (const b of blocks) {
    const t = typeof out[b.id] === "string" ? (out[b.id] as string).trim() : "";
    if (!t) { result.rejected.push({ id: b.id, reason: "no text returned" }); continue; }
    if (t.length > 1500) { result.rejected.push({ id: b.id, reason: "too long" }); continue; }
    const g = checkGrounding(t, allowed);
    if (!g.ok) { result.rejected.push({ id: b.id, reason: `figures not in the data: ${g.unknown.join(", ")}` }); continue; }
    const leak = otherClients.find((n) => n.trim().length > 2 && t.toLowerCase().includes(n.trim().toLowerCase()));
    if (leak) { result.rejected.push({ id: b.id, reason: "mentions another client" }); continue; }
    if (b.id.startsWith("why.") && !t.startsWith("Likely contributing factors based on available data")) {
      result.rejected.push({ id: b.id, reason: "did not hedge the cause" }); continue;
    }
    result.accepted[b.id] = t;
  }
  return result;
}
