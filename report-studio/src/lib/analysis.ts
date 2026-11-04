// Pure analysis of a report dataset. No I/O, no randomness: the same data
// always produces the same figures, which the copy and the pages are built on.
// Ported from the prototype's analyze().
import { MONTHS, avg, parseDay, sum } from "./format.ts";
import type { ContentItem, ContentType, ReportData } from "./report/types.ts";
import { resultWords } from "./report/results.ts";

export interface FormatStat {
  name: "Reels" | "Posts" | "Carousels";
  n: number;
  views: number;
  avg: number;
  /** Average engagement rate across pieces with reach. */
  er: number | null;
}

export interface ThemeStat {
  name: string;
  n: number;
  avg: number;
  er: number | null;
  best: ContentItem | undefined;
}

export type Rating = ["Top performing", "top"] | ["On track", "mid"] | ["Below average", "low"];

/** Engagement rate = (likes + comments + shares + saves) / reach x 100. */
export function engagementRate(x: ContentItem): number | null {
  if (!x.reach) return null;
  return (((x.likes || 0) + (x.comments || 0) + (x.shares || 0) + (x.saves || 0)) / x.reach) * 100;
}

/** Highest value of `f`, ignoring pieces where it is unavailable. First wins on ties. */
export function topBy(items: ContentItem[], f: (x: ContentItem) => number | null): ContentItem | undefined {
  return items.filter((x) => f(x) != null).sort((x, y) => (f(y) as number) - (f(x) as number))[0];
}

/** Month-over-month change. Null unless both months have a value and previous is non-zero. */
export function delta(cur: number | null | undefined, prev: number | null | undefined, invert = false) {
  if (cur == null || prev == null || prev === 0) return null;
  const p = ((cur - prev) / prev) * 100;
  const a = Math.abs(p) < 2 ? "flat" : p > 0 ? "up" : "down";
  // Cost metrics invert: a falling cost is good.
  const good = a === "flat" ? "flat" : p > 0 !== invert ? "up" : "down";
  return { p, a, good, txt: (a === "flat" ? "→" : p > 0 ? "↑" : "↓") + " " + Math.abs(p).toFixed(1) + "%" };
}

const FORMATS: [FormatStat["name"], ContentType][] = [["Reels", "Reel"], ["Posts", "Post"], ["Carousels", "Carousel"]];

export function analyze(d: ReportData) {
  const c = d.content.filter((x) => x.views != null);
  const by = (t: ContentType) => c.filter((x) => x.type === t);

  const fm: FormatStat[] = FORMATS.map(([name, t]) => [name, by(t)] as const)
    .filter(([, a]) => a.length)
    .map(([name, a]) => ({
      name,
      n: a.length,
      views: sum(a, (x) => x.views),
      avg: avg(a, (x) => x.views) as number,
      er: avg(a.filter((x) => engagementRate(x) != null), engagementRate),
    }))
    .sort((a, b) => b.avg - a.avg);

  const avgV = avg(c, (x) => x.views);
  const groups: Record<string, ContentItem[]> = {};
  c.forEach((x) => (groups[x.theme] = groups[x.theme] || []).push(x));
  const themes: ThemeStat[] = Object.entries(groups)
    .map(([name, a]) => ({
      name,
      n: a.length,
      avg: avg(a, (x) => x.views) as number,
      er: avg(a.filter((x) => engagementRate(x) != null), engagementRate),
      best: topBy(a, (x) => x.views),
    }))
    .sort((a, b) => b.avg - a.avg);

  const m = d.meta, ig = d.ig;
  const start = parseDay(d.period.start);
  const reels = by("Reel"), posts = by("Post");
  const rw = resultWords(m);
  const hasMeta = m.spend != null;
  const listed = d.content.length > 0;
  // Account-level interactions, when Insights reported them.
  const inter = [ig.likes, ig.comments, ig.shares, ig.saves];
  const interactions = inter.some((v) => v != null) ? inter.reduce<number>((t, v) => t + (v ?? 0), 0) : null;
  const hasEngagement = ig.engaged != null || interactions != null;

  return {
    data: d,
    c,
    fm,
    lead: fm[0] as FormatStat | undefined,
    other: fm[1] as FormatStat | undefined,
    avgV,
    month: MONTHS[start.m] + " " + start.y,
    monthName: MONTHS[start.m],
    hasIG: ig.views != null,
    hasMeta,
    /** Words for this campaign's results (leads, conversations, clicks…). */
    rw,
    /**
     * What the report leads with: enquiries when paid media produced
     * enquiry-type results, otherwise reach and engagement.
     */
    focus: (hasMeta && m.conv && rw.focus === "enquiry" ? "enquiries" : "engagement") as "enquiries" | "engagement",
    /** Cost per result, of the campaign's result type. */
    cpr: m.spend != null && m.conv ? m.spend / m.conv : null,
    freq: m.impr && m.reach ? m.impr / m.reach : null,
    // Calculated where possible; otherwise the rate Ads Manager reported.
    cpm: m.spend != null && m.impr ? (m.spend / m.impr) * 1000 : m.cpm ?? null,
    ctr: m.clicks && m.impr ? (m.clicks / m.impr) * 100 : m.ctr ?? null,
    cpc: m.clicks && m.spend != null ? m.spend / m.clicks : m.cpc ?? null,
    /** Sum of account-level likes, comments, shares and saves. */
    interactions,
    hasEngagement,
    /** Account engagement rate: interactions ÷ accounts reached. */
    accountER: interactions != null && ig.unique ? (interactions / ig.unique) * 100 : null,
    /** How many times more views per piece the leading format earned. */
    ratio: fm.length > 1 ? fm[0].avg / fm[1].avg : null,
    /** Views per net new follower. */
    vpf: ig.net != null && ig.net > 0 && ig.views ? ig.views / ig.net : null,
    calcGrowth:
      ig.followers != null && ig.net != null && ig.followers - ig.net > 0
        ? (ig.net / (ig.followers - ig.net)) * 100
        : null,
    topViews: topBy(c, (x) => x.views),
    topReelV: topBy(reels, (x) => x.views),
    topReelE: topBy(reels, engagementRate),
    topPostE: topBy(posts, engagementRate),
    topShares: topBy(c, (x) => x.shares),
    topSaves: topBy(c, (x) => x.saves),
    topReach: topBy(c, (x) => x.reach),
    topComm: topBy(c, (x) => x.comments),
    themes,
    // From the content list; from the Insights counts when no posts were listed.
    counts: listed
      ? { reels: reels.length, posts: posts.length, car: by("Carousel").length, stories: ig.stories ?? null }
      : { reels: ig.reels ?? 0, posts: ig.posts ?? 0, car: 0, stories: ig.stories ?? null },
    /** True when posts were listed one by one. */
    listed,
    /** False when neither a post list nor Insights counts were supplied. */
    countsKnown: listed || ig.posts != null || ig.reels != null,
    rating(x: ContentItem): Rating {
      const v = x.views ?? 0, a = avgV ?? 0;
      return v >= a * 1.25 ? ["Top performing", "top"] : v >= a * 0.85 ? ["On track", "mid"] : ["Below average", "low"];
    },
  };
}

export type Analysis = ReturnType<typeof analyze>;

export const hasPrevious = (d: ReportData) => Object.values(d.prev).some((v) => v != null);
