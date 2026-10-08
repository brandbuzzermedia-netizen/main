// Report form parsing: blanks stay unavailable, impossible values are refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReportForm } from "../src/lib/report/parse.ts";

const form = (fields: Record<string, string>, content: unknown[] = [], sections: string[] = ["exec", "ig"]) =>
  parseReportForm((k) => fields[k] ?? null, JSON.stringify(content), (k) => (k === "sections" ? sections : []));

const base = { periodStart: "2026-09-01", periodEnd: "2026-09-30" };

test("blank fields become null, never zero", () => {
  const r = form({ ...base, "ig.views": "81,560", "ig.nonFol": "98.4%", "meta.spend": "₹8,474.59", "meta.campaign": "Leads" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.data.ig.views, 81560);
  assert.equal(r.value.data.ig.nonFol, 98.4);
  assert.equal(r.value.data.meta.spend, 8474.59);
  assert.equal(r.value.data.ig.unique, null);
  assert.equal(r.value.data.outcomes.sales, null);
  assert.equal(r.value.sections.exec, true);
  assert.equal(r.value.sections.meta, false);
  assert.equal(r.value.template, "premium");
});

test("net follows may be negative, counts may not", () => {
  const r = form({ ...base, "ig.net": "-12", "ig.views": "-5" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.errors["ig.net"], undefined);
  assert.match(r.errors["ig.views"], /below 0/);
});

test("impossible combinations are refused", () => {
  const r = form({ ...base, "meta.impr": "100", "meta.reach": "200", "meta.campaign": "A", "ig.nonFol": "120" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.errors["meta.reach"], /more than impressions/);
  assert.match(r.errors["ig.nonFol"], /above 100/);
  const spendNoName = form({ ...base, "meta.spend": "10" });
  assert.equal(spendNoName.ok, false);
});

test("the period must be valid and in order", () => {
  const r = form({ periodStart: "2026-09-30", periodEnd: "2026-09-01" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.errors.periodEnd, /on or after/);
  assert.equal(form({ periodStart: "nope", periodEnd: "2026-09-01" }).ok, false);
});

test("posts are checked against the period and each other", () => {
  const ok = form(base, [{ date: "2026-09-04", type: "Reel", theme: "Showcase", views: "1,200", reach: "900", likes: "" }]);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  const [p] = ok.value.data.content;
  assert.equal(p.views, 1200);
  assert.equal(p.likes, null);
  assert.equal(p.provenance, "manual");

  const bad = form(base, [
    { date: "2026-10-02", type: "Reel" },
    { date: "2026-09-05", type: "Story" },
    { date: "2026-09-06", type: "Post", views: "10", reach: "50" },
  ]);
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.match(bad.errors["content.0.date"], /outside the reporting period/);
  assert.match(bad.errors["content.1.type"], /Reel, Post or Carousel/);
  assert.match(bad.errors["content.2.reach"], /more than views/);
});

test("a blank theme is labelled rather than left empty", () => {
  const r = form(base, [{ date: "2026-09-04", type: "Post" }]);
  assert.ok(r.ok && r.value.data.content[0].theme === "Uncategorised");
});

test("a post keeps its cover image URL", () => {
  const r = parseReportForm((k) => ({ periodStart: "2026-09-01", periodEnd: "2026-09-30" } as Record<string, string>)[k] ?? null,
    JSON.stringify([{ key: "r1", img: "/api/files/wudgres/september-2026/covers/a.png", date: "2026-09-03", type: "Reel", views: "10" }, { key: "r2", date: "2026-09-04", type: "Post" }]), () => []);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.data.content[0].img, "/api/files/wudgres/september-2026/covers/a.png");
  assert.equal(r.value.data.content[1].img, null);
});

test("client web addresses are accepted without https://", async () => {
  const { parseClientForm } = await import("../src/lib/validation.ts");
  const fd = new FormData();
  fd.set("name", "Lykes"); fd.set("website", "www.lykes.in"); fd.set("facebook", "lykesfashion"); fd.set("instagram", "https://www.instagram.com/lykes.store/");
  const r = parseClientForm(fd);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.website, "https://www.lykes.in");
  assert.equal(r.value.facebook, "https://facebook.com/lykesfashion");
  assert.equal(r.value.instagram, "lykes.store");
});
