// Turns the report form into report data. Blank fields become null, which
// the report shows as "not available"; nothing is ever estimated. Values that
// cannot be true (reach above impressions, a post dated outside the month)
// are rejected with a message instead of being stored.
import { RESULT_TYPES, SECTION_KEYS, type ResultType, type ContentItem, type ContentType, type ReportData, type SectionKey, type Template } from "./types.ts";

export type FormErrors = Record<string, string>;

export interface ContentRowInput {
  date?: string; type?: string; theme?: string; caption?: string; tags?: string;
  views?: string; reach?: string; likes?: string; comments?: string; shares?: string; saves?: string;
}

export interface ParsedReport {
  template: Template;
  sections: Record<SectionKey, boolean>;
  data: ReportData;
}

type Get = (name: string) => string | null;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (s: string | null): s is string => !!s && ISO_DAY.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const TYPES: ContentType[] = ["Reel", "Post", "Carousel"];
const TEMPLATES: Template[] = ["premium", "minimal", "dark"];
export const POST_METRICS = ["views", "reach", "likes", "comments", "shares", "saves"] as const;

export function parseReportForm(get: Get, contentJson: string | null, getAll: (name: string) => string[]): { ok: true; value: ParsedReport } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};

  /** A number field. Commas, spaces, ₹ and % are allowed as people type them. */
  const num = (name: string, label: string, opts: { min?: number; max?: number } = {}): number | null => {
    const raw = (get(name) ?? "").replace(/[,\s₹%]/g, "");
    if (!raw) return null;
    const n = Number(raw.replace(/^−/, "-"));
    if (!Number.isFinite(n)) { errors[name] = `${label} must be a number.`; return null; }
    if (opts.min != null && n < opts.min) { errors[name] = `${label} cannot be below ${opts.min}.`; return null; }
    if (opts.max != null && n > opts.max) { errors[name] = `${label} cannot be above ${opts.max}.`; return null; }
    return n;
  };
  const count = (name: string, label: string) => num(name, label, { min: 0 });
  const text = (name: string, max = 200) => (get(name) ?? "").trim().slice(0, max);

  const start = get("periodStart"), end = get("periodEnd");
  if (!validDay(start)) errors.periodStart = "Choose the first day of the reporting period.";
  if (!validDay(end)) errors.periodEnd = "Choose the last day of the reporting period.";
  if (validDay(start) && validDay(end)) {
    if (end < start) errors.periodEnd = "The period must end on or after its first day.";
    else if ((Date.parse(end) - Date.parse(start)) / 86400000 > 62) errors.periodEnd = "A report covers up to two months.";
  }

  const template = TEMPLATES.includes(get("template") as Template) ? (get("template") as Template) : "premium";
  const on = new Set(getAll("sections"));
  const sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, on.has(k)])) as Record<SectionKey, boolean>;

  const ig = {
    views: count("ig.views", "Views"),
    unique: count("ig.unique", "Accounts reached"),
    nonFol: num("ig.nonFol", "Views from non-followers", { min: 0, max: 100 }),
    net: num("ig.net", "Net followers"),
    followers: count("ig.followers", "Total followers"),
    growth: num("ig.growth", "Follower growth", { min: -100 }),
    profileVisits: count("ig.profileVisits", "Profile visits"),
    websiteClicks: count("ig.websiteClicks", "Website clicks"),
    messages: count("ig.messages", "Organic messages"),
    followersStart: count("ig.followersStart", "Followers at the start"),
    engaged: count("ig.engaged", "Accounts engaged"),
    likes: count("ig.likes", "Likes"),
    comments: count("ig.comments", "Comments"),
    shares: count("ig.shares", "Shares"),
    saves: count("ig.saves", "Saves"),
    posts: count("ig.posts", "Posts published"),
    reels: count("ig.reels", "Reels published"),
    stories: count("ig.stories", "Stories published"),
  };
  // Net change follows from the start and end follower counts when it was not typed.
  if (ig.net == null && ig.followersStart != null && ig.followers != null) ig.net = ig.followers - ig.followersStart;
  else if (ig.net != null && ig.followersStart != null && ig.followers != null && ig.followers - ig.followersStart !== ig.net) {
    errors["ig.net"] = `Net followers (${ig.net}) does not match the start and end counts (${ig.followers - ig.followersStart}). Check the three figures.`;
  }
  if (ig.net != null && ig.followers != null && ig.net > ig.followers) errors["ig.net"] = "Net new followers cannot exceed total followers.";
  if (ig.engaged != null && ig.unique != null && ig.engaged > ig.unique) errors["ig.engaged"] = "Accounts engaged cannot be more than accounts reached.";

  const meta = {
    campaign: text("meta.campaign"),
    objective: text("meta.objective", 80),
    spend: count("meta.spend", "Amount spent"),
    conv: count("meta.conv", "Results"),
    impr: count("meta.impr", "Impressions"),
    reach: count("meta.reach", "Reach"),
    clicks: count("meta.clicks", "Link clicks"),
    resultType: (RESULT_TYPES as readonly string[]).includes(get("meta.resultType") ?? "") ? (get("meta.resultType") as ResultType) : ("" as const),
    ctr: num("meta.ctr", "CTR", { min: 0, max: 100 }),
    cpc: count("meta.cpc", "Cost per click"),
    cpm: count("meta.cpm", "CPM"),
  };
  if (meta.conv != null && !meta.resultType) errors["meta.resultType"] = "Choose what the results are (leads, calls, conversations…).";
  if (meta.reach != null && meta.impr != null && meta.reach > meta.impr) errors["meta.reach"] = "Reach cannot be more than impressions. Check both figures.";
  if (meta.spend != null && !meta.campaign) errors["meta.campaign"] = "Name the campaign the spend belongs to.";

  const outcomes = {
    qualified: count("outcomes.qualified", "Qualified leads"),
    bookings: count("outcomes.bookings", "Bookings"),
    sales: count("outcomes.sales", "Sales"),
    revenue: count("outcomes.revenue", "Revenue"),
  };
  const prev = {
    views: count("prev.views", "Previous views"), unique: count("prev.unique", "Previous accounts reached"),
    followers: count("prev.followers", "Previous followers"), net: num("prev.net", "Previous net followers"),
    posts: count("prev.posts", "Previous posts"), reels: count("prev.reels", "Previous Reels"),
    spend: count("prev.spend", "Previous spend"), conv: count("prev.conv", "Previous results"),
    impr: count("prev.impr", "Previous impressions"), reach: count("prev.reach", "Previous reach"),
  };

  let rows: ContentRowInput[] = [];
  try {
    const parsed = JSON.parse(contentJson || "[]");
    if (Array.isArray(parsed)) rows = parsed.slice(0, 60);
  } catch {
    errors.content = "The content list could not be read. Reload the page and try again.";
  }
  const content: ContentItem[] = [];
  rows.forEach((r, i) => {
    const at = `content.${i}`;
    const label = `Post ${i + 1}`;
    if (!validDay(r.date ?? null)) { errors[`${at}.date`] = `${label}: choose the date it was published.`; return; }
    if (validDay(start) && validDay(end) && (r.date! < start || r.date! > end)) {
      errors[`${at}.date`] = `${label} is dated outside the reporting period.`;
      return;
    }
    const type = TYPES.includes(r.type as ContentType) ? (r.type as ContentType) : null;
    if (!type) { errors[`${at}.type`] = `${label}: choose Reel, Post or Carousel.`; return; }
    const m: Record<string, number | null> = {};
    for (const k of POST_METRICS) {
      const raw = String(r[k] ?? "").replace(/[,\s]/g, "");
      if (!raw) { m[k] = null; continue; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) { errors[`${at}.${k}`] = `${label}: ${k} must be a number of 0 or more.`; m[k] = null; continue; }
      m[k] = n;
    }
    if (m.reach != null && m.views != null && m.reach > m.views) errors[`${at}.reach`] = `${label}: reach cannot be more than views.`;
    content.push({
      id: `p${i + 1}`, date: r.date!, type,
      theme: (r.theme ?? "").trim().slice(0, 60) || "Uncategorised",
      caption: (r.caption ?? "").trim().slice(0, 2200),
      tags: (r.tags ?? "").trim().slice(0, 300),
      views: m.views, reach: m.reach, likes: m.likes, comments: m.comments, shares: m.shares, saves: m.saves,
      provenance: "manual", brief: [],
    });
  });

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { template, sections, data: { period: { start: start!, end: end! }, ig, meta, outcomes, prev, content } },
  };
}
