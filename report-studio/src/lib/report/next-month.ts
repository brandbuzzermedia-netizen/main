// "Start next month": a new report pre-filled from an existing one. This
// month's figures become the previous-month figures, so month-over-month
// works without retyping. Nothing for the new month is guessed.
import { daysInMonth, parseDay } from "../format.ts";
import type { ReportData, ReportDoc } from "./types.ts";

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function nextMonthData(source: ReportDoc): ReportData {
  const s = parseDay(source.data.period.start);
  const y = s.m === 11 ? s.y + 1 : s.y, m = (s.m + 1) % 12;
  const d = source.data, posts = d.content.filter((c) => c.type === "Post").length, reels = d.content.filter((c) => c.type === "Reel").length;
  return {
    period: { start: iso(y, m, 1), end: iso(y, m, daysInMonth(y, m)) },
    ig: { views: null, unique: null, nonFol: null, net: null, followers: null, growth: null, profileVisits: null, websiteClicks: null, messages: null },
    meta: { campaign: d.meta.campaign, objective: d.meta.objective, spend: null, conv: null, impr: null, reach: null, clicks: null },
    outcomes: { qualified: null, bookings: null, sales: null, revenue: null },
    prev: {
      views: d.ig.views, unique: d.ig.unique, followers: d.ig.followers, net: d.ig.net,
      posts: d.content.length ? posts : null, reels: d.content.length ? reels : null,
      spend: d.meta.spend, conv: d.meta.conv, impr: d.meta.impr, reach: d.meta.reach,
    },
    content: [],
  };
}
