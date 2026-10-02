// "Start next month" and "Duplicate report": a new report for the same
// client, pre-filled from one of its existing reports.
//
// Next month: this month's figures become the previous-month figures, so
// month-over-month works without retyping. The campaign, result type,
// template, pages and action plan carry over; every figure, post and
// screenshot for the new month starts empty. Nothing for it is guessed.
//
// Duplicate: a full copy of the figures and posts into another month, as a
// starting point to edit. Screenshots are never copied (they belong to their
// own month), and the review panel flags the copy until it is replaced.
import { daysInMonth, parseDay } from "../format.ts";
import type { ReportData, ReportDoc } from "./types.ts";

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** First and last day of the month after `periodStart`. */
export function followingMonth(periodStart: string) {
  const s = parseDay(periodStart);
  const y = s.m === 11 ? s.y + 1 : s.y, m = (s.m + 1) % 12;
  return { start: iso(y, m, 1), end: iso(y, m, daysInMonth(y, m)) };
}

export function nextMonthData(source: ReportDoc): ReportData {
  const d = source.data, posts = d.content.filter((c) => c.type === "Post").length, reels = d.content.filter((c) => c.type === "Reel").length;
  return {
    period: followingMonth(d.period.start),
    ig: {
      views: null, unique: null, nonFol: null, net: null, followers: null, growth: null, profileVisits: null, websiteClicks: null, messages: null,
      // Last month's closing follower count is this month's opening count.
      followersStart: d.ig.followers ?? null,
      engaged: null, likes: null, comments: null, shares: null, saves: null, posts: null, reels: null, stories: null,
    },
    meta: { campaign: d.meta.campaign, objective: d.meta.objective, resultType: d.meta.resultType ?? "Messaging conversations", spend: null, conv: null, impr: null, reach: null, clicks: null, ctr: null, cpc: null, cpm: null },
    outcomes: { qualified: null, bookings: null, sales: null, revenue: null },
    prev: {
      views: d.ig.views, unique: d.ig.unique, followers: d.ig.followers, net: d.ig.net,
      posts: d.content.length ? posts : d.ig.posts ?? null, reels: d.content.length ? reels : d.ig.reels ?? null,
      spend: d.meta.spend, conv: d.meta.conv, impr: d.meta.impr, reach: d.meta.reach,
    },
    content: [],
  };
}

/** The source's figures and posts moved into `period`. Post dates keep their day of the month. */
export function duplicateData(source: ReportDoc, period: { start: string; end: string }): ReportData {
  const d = structuredClone(source.data);
  const p = parseDay(period.start), last = daysInMonth(p.y, p.m);
  return {
    ...d,
    period,
    content: d.content.map((c) => ({ ...c, date: iso(p.y, p.m, Math.min(parseDay(c.date).d, last)), img: null, provenance: c.provenance, brief: c.brief })),
  };
}
