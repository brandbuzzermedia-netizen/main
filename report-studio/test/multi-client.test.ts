// Multi-client behaviour: copy follows each client's own data and result
// type, nothing assumes the sample client, and copies stay within a client.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/lib/analysis.ts";
import { G, gen } from "../src/lib/copy/generators.ts";
import { thrishankAugust2026 } from "../src/lib/fixtures/thrishank-2026-08.ts";
import { parseReportForm } from "../src/lib/report/parse.ts";
import { duplicateData, nextMonthData } from "../src/lib/report/next-month.ts";
import { resultWords } from "../src/lib/report/results.ts";
import type { ReportData, ResultType } from "../src/lib/report/types.ts";

/** Every generated sentence for a dataset, joined. */
const allCopy = (d: ReportData) => {
  const A = analyze(d);
  return Object.keys(G).flatMap((b) => (G[b](A) as (string | string[])[]).flat()).join("\n");
};

const leadsMonth = (): ReportData => {
  const d = thrishankAugust2026().data;
  d.meta = { ...d.meta, campaign: "Wudgres – Lead form", objective: "Leads", resultType: "Leads", spend: 12000, conv: 48 };
  return d;
};

test("the sample client's wording is unchanged (messaging campaign)", () => {
  const A = analyze(thrishankAugust2026().data);
  assert.equal(gen("t.3", A), "Meta campaigns generated 363 direct messaging conversations at ₹23.35 each.");
  assert.match(gen("imp", A), /Messaging conversations show people raising a hand\./);
});

test("a leads campaign is described as leads, never as messaging conversations", () => {
  const copy = allCopy(leadsMonth());
  assert.doesNotMatch(copy, /messaging|conversations/i);
  assert.match(copy, /48 leads at ₹250\.00 each/);
  assert.match(gen("camp_obs", analyze(leadsMonth())), /per lead\./);
});

test("each result type gets its own words", () => {
  const types: ResultType[] = ["Messaging conversations", "Leads", "Calls", "Link clicks", "Landing page views", "Purchases", "Other results"];
  const ones = types.map((t) => resultWords({ resultType: t }).one);
  assert.equal(new Set(ones).size, types.length);
  assert.equal(resultWords({}).key, "messaging", "reports saved before result types were messaging campaigns");
});

test("a month without Meta Ads leads with engagement and makes no paid claims", () => {
  const d = thrishankAugust2026().data;
  d.meta = { campaign: "", objective: "", spend: null, conv: null, impr: null, reach: null, clicks: null, resultType: "" };
  d.ig = { ...d.ig, engaged: 2140, likes: 1800, comments: 95, shares: 60, saves: 120 };
  const A = analyze(d);
  assert.equal(A.focus, "engagement");
  assert.equal(A.interactions, 2075);
  assert.match(gen("exec", A), /2,140 accounts engaged/);
  assert.doesNotMatch(allCopy(d), /messaging|conversations|cost per/i);
});

test("posts and Reels counts come from Insights when posts are not listed", () => {
  const d = thrishankAugust2026().data;
  d.content = [];
  d.ig = { ...d.ig, posts: 9, reels: 5, stories: 22 };
  const A = analyze(d);
  assert.deepEqual(A.counts, { reels: 5, posts: 9, car: 0, stories: 22 });
  assert.equal(A.listed, false);
  assert.match(gen("w.0", A), /14 pieces of content \(5 Reels, 9 posts, 22 stories\)/);
});

test("the result type is required once results are entered", () => {
  const f = (extra: Record<string, string>) => parseReportForm((k) => ({ periodStart: "2026-09-01", periodEnd: "2026-09-30", "meta.spend": "100", "meta.campaign": "C", "meta.conv": "4", ...extra })[k] ?? null, "[]", () => []);
  const r = f({});
  assert.ok(!r.ok && r.errors["meta.resultType"]);
  const ok = f({ "meta.resultType": "Calls" });
  assert.ok(ok.ok && ok.value.data.meta.resultType === "Calls");
});

test("net follows are calculated from start and end followers, and a mismatch is refused", () => {
  const f = (extra: Record<string, string>) => parseReportForm((k) => ({ periodStart: "2026-09-01", periodEnd: "2026-09-30", ...extra })[k] ?? null, "[]", () => []);
  const r = f({ "ig.followersStart": "1,200", "ig.followers": "1,260" });
  assert.ok(r.ok && r.value.data.ig.net === 60);
  const bad = f({ "ig.followersStart": "1200", "ig.followers": "1260", "ig.net": "75" });
  assert.ok(!bad.ok && bad.errors["ig.net"]);
});

test("start next month resets the figures and carries the opening follower count", () => {
  const src = thrishankAugust2026();
  const n = nextMonthData(src);
  assert.equal(n.period.start, "2026-09-01");
  assert.equal(n.ig.views, null);
  assert.equal(n.ig.followersStart, 726);
  assert.equal(n.meta.spend, null);
  assert.equal(n.meta.resultType, "Messaging conversations");
  assert.equal(n.prev.views, 81560);
  assert.equal(n.content.length, 0);
});

test("duplicate copies the figures into the chosen month, posts included", () => {
  const src = thrishankAugust2026();
  const d = duplicateData(src, { start: "2026-09-01", end: "2026-09-30" });
  assert.equal(d.ig.views, 81560);
  assert.equal(d.content.length, src.data.content.length);
  assert.ok(d.content.every((c) => c.date.startsWith("2026-09-")));
  assert.equal(src.data.period.start, "2026-08-01", "the source report is not changed");
});
