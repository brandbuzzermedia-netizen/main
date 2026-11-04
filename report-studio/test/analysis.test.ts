// Unit tests for the pure analysis, conflict and copy modules, run with the
// built-in Node test runner (node --test) on the Thrishank August 2026 fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, delta, engagementRate, hasPrevious, topBy } from "../src/lib/analysis.ts";
import { NA, gen } from "../src/lib/copy/generators.ts";
import { thrishankAugust2026 } from "../src/lib/fixtures/thrishank-2026-08.ts";
import { K, f0 } from "../src/lib/format.ts";
import { detectConflicts, resolveData } from "../src/lib/report/conflicts.ts";
import type { ContentItem } from "../src/lib/report/types.ts";

const fixture = () => thrishankAugust2026();
const A = analyze(fixture().data);
const id = (x: ContentItem | undefined) => x?.id;

test("engagement rate is (likes + comments + shares + saves) / reach", () => {
  const c1 = fixture().data.content[0];
  assert.equal(engagementRate(c1), ((57 + 4 + 6 + 11) / 9640) * 100);
  assert.equal(engagementRate({ ...c1, reach: null }), null);
  assert.equal(engagementRate({ ...c1, reach: 0 }), null);
});

test("formats are ranked by average views", () => {
  assert.deepEqual(A.fm.map((f) => f.name), ["Reels", "Posts"]);
  assert.equal(A.lead?.avg, (12900 + 11430 + 9860 + 8120) / 4);
  assert.equal(K(A.lead?.avg), "10.6K");
  assert.equal(K(A.other?.avg), "5K");
  assert.equal(A.ratio?.toFixed(2), "2.11");
  assert.deepEqual(A.counts, { reels: 4, posts: 3, car: 0, stories: null });
});

test("top-by metrics pick a separate winner for each metric", () => {
  assert.equal(id(A.topViews), "c1");
  assert.equal(id(A.topReach), "c1");
  assert.equal(id(A.topShares), "c1");
  assert.equal(id(A.topSaves), "c6");
  assert.equal(id(A.topComm), "c5");
  assert.equal(id(A.topReelE), "c6");
  assert.equal(id(A.topPostE), "c2");
  assert.equal(topBy([], (x) => x.views), undefined);
});

test("pieces without a figure are skipped, never treated as zero", () => {
  const d = fixture().data;
  d.content[4].comments = null; // c5 led on comments
  assert.equal(id(analyze(d).topComm), "c2");
  d.content[0].views = null; // c1 led on views
  assert.equal(id(analyze(d).topViews), "c4");
});

test("ratings compare views with the average across pieces", () => {
  assert.equal(A.avgV, 57330 / 7);
  const by = (cid: string) => A.rating(A.c.find((x) => x.id === cid)!)[1];
  assert.equal(by("c1"), "top"); // 12,900 >= 1.25 x 8,190
  assert.equal(by("c7"), "mid"); // 8,120 >= 0.85 x 8,190
  assert.equal(by("c3"), "low"); // 4,870
});

test("themes are ranked by average views", () => {
  assert.equal(A.themes[0].name, "Behind the scenes");
  assert.equal(A.themes.at(-1)?.name, "Engagement");
  const showcase = A.themes.find((t) => t.name === "Product showcase")!;
  assert.equal(showcase.n, 3);
  assert.equal(id(showcase.best), "c1");
});

test("paid and follower ratios use only confirmed figures", () => {
  assert.equal(A.cpr?.toFixed(2), "23.35");
  assert.equal(A.freq?.toFixed(2), "2.95");
  assert.equal(A.cpm?.toFixed(2), "73.69");
  assert.equal(A.ctr, null); // no clicks in the uploaded data
  assert.equal(A.cpc, null);
  assert.equal(f0(A.vpf), "1,664");
  assert.equal(A.calcGrowth?.toFixed(2), "7.24");
});

test("month-over-month change, with cost metrics inverted", () => {
  assert.deepEqual(delta(110, 100), { p: 10, a: "up", good: "up", txt: "↑ 10.0%" });
  assert.equal(delta(110, 100, true)?.good, "down"); // a cost going up is bad
  assert.equal(delta(90, 100, true)?.good, "up");
  assert.equal(delta(101, 100)?.a, "flat");
  assert.equal(delta(5, 0), null);
  assert.equal(delta(null, 100), null);
  assert.equal(delta(100, null), null);
  assert.equal(hasPrevious(fixture().data), false);
});

test("a follower-growth conflict is flagged and never silently resolved", () => {
  const doc = fixture();
  const [c] = detectConflicts(doc.data);
  assert.equal(c.metric, "ig.growth");
  assert.equal(c.reported, 7.4);
  assert.equal(c.chosen, null);
  assert.equal(resolveData({ ...doc, resolutions: {} }).data.ig.growth, null);
  assert.equal(resolveData({ ...doc, resolutions: { "ig.growth": "reported" } }).data.ig.growth, 7.4);
  assert.equal(resolveData({ ...doc, resolutions: { "ig.growth": "calculated" } }).data.ig.growth?.toFixed(2), "7.24");
  const agreeing = fixture().data;
  agreeing.ig.growth = 7.2;
  assert.deepEqual(detectConflicts(agreeing), []);
});

test("copy is built from the figures and says so when data is missing", () => {
  assert.equal(
    gen("exec", A),
    "August 2026 was driven mainly by Instagram Reels, which averaged 10.6K views per piece against 5K for Posts. 98.4% of views came from people who do not yet follow the account, while net follower growth was +49. Paid media on Meta produced 363 messaging conversations at ₹23.35 each.",
  );
  const noMeta = fixture().data;
  noMeta.meta.spend = null;
  assert.equal(gen("t.3", analyze(noMeta)), "Meta Ads data was not included in this report.");
  const empty = fixture().data;
  empty.content = [];
  assert.equal(gen("t.0", analyze(empty)), "Content was seen 81,560 times by 35,217 accounts.");
  empty.ig.views = null;
  assert.equal(gen("t.0", analyze(empty)), NA);
  assert.equal(gen("unknown", A), "");
});
