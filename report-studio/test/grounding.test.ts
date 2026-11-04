// The grounding check that guards Claude-written copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedFigures, checkGrounding, figures } from "../src/lib/copy/grounding.ts";

test("figures are read the way the report writes them", () => {
  assert.deepEqual(figures("81,560 views, ₹23.35 each, 98.4% new, 10.6K avg, 2.1× more, +49 net, −12 lost"),
    ["81560", "23.35", "98.4", "10.6k", "2.1", "49", "12"]);
  assert.deepEqual(figures("No figures here."), []);
});

test("text using only known figures passes", () => {
  const allowed = allowedFigures(["Views: 81,560. Cost per conversation: ₹23.35. Non-followers: 98.4%."]);
  assert.equal(checkGrounding("The account earned 81,560 views, 98.4% from new people, at ₹23.35 per chat.", allowed).ok, true);
});

test("a figure that is not in the data is caught", () => {
  const allowed = allowedFigures(["Views: 81,560. Messaging conversations: 363."]);
  const r = checkGrounding("Views rose to 81,560 and drove 42 sales worth ₹1,20,000.", allowed);
  assert.equal(r.ok, false);
  assert.deepEqual(r.unknown, ["42", "120000"]);
});

test("re-rounded or recalculated figures are caught", () => {
  const allowed = allowedFigures(["Average views: 10.6K. Ratio: 2.1×."]);
  assert.equal(checkGrounding("Reels averaged 10.6K views, 2.1× posts.", allowed).ok, true);
  assert.equal(checkGrounding("Reels averaged 10,577 views.", allowed).ok, false);
  assert.equal(checkGrounding("Reels earned 2.11× the views.", allowed).ok, false);
});
