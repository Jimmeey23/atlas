import test from "node:test";
import assert from "node:assert/strict";
import { funnelSteps, goalProgress, topNWithOther, rankRows } from "../src/data/overview-board";

test("funnel steps carry share of the first step, step-to-step rate and the largest drop", () => {
  const s = funnelSteps([
    { id: "a", label: "Leads", value: 200 },
    { id: "b", label: "Trials", value: 100 },
    { id: "c", label: "Sold", value: 80 },
  ]);
  assert.equal(s[0].ofFirst, 1);
  assert.equal(s[1].ofPrevious, 0.5);
  assert.equal(s[2].ofFirst, 0.4);
  assert.equal(s[2].ofPrevious, 0.8);
  assert.equal(s.filter((x) => x.biggestDrop).length, 1);
  assert.equal(s[1].biggestDrop, true);
});
test("funnel handles zero and missing values without NaN or infinity", () => {
  const s = funnelSteps([
    { id: "a", label: "A", value: 0 },
    { id: "b", label: "B", value: null },
    { id: "c", label: "C", value: 5 },
  ]);
  for (const x of s) {
    assert.ok(x.ofFirst === null || Number.isFinite(x.ofFirst));
    assert.ok(x.ofPrevious === null || Number.isFinite(x.ofPrevious));
  }
  assert.equal(s.some((x) => x.biggestDrop), false);
});
test("goal progress pro-rates a running period and judges a finished one against the full target", () => {
  const running = goalProgress({ value: 40, target: 100, from: "2026-10-01", to: "2026-10-31", today: "2026-10-14" });
  assert.ok(Math.abs(running.elapsed - 14 / 31) < 1e-9);
  assert.ok(Math.abs(running.expected - (100 * 14) / 31) < 1e-9);
  assert.equal(running.progress, 0.4);
  assert.equal(running.status, "behind");
  const ahead = goalProgress({ value: 60, target: 100, from: "2026-10-01", to: "2026-10-31", today: "2026-10-14" });
  assert.equal(ahead.status, "ahead");
  const done = goalProgress({ value: 90, target: 100, from: "2026-09-01", to: "2026-09-30", today: "2026-10-14" });
  assert.equal(done.elapsed, 1);
  assert.equal(done.expected, 100);
  assert.equal(done.status, "behind");
  assert.equal(goalProgress({ value: 120, target: 100, from: "2026-09-01", to: "2026-09-30", today: "2026-10-14" }).status, "met");
});
test("goal progress is unavailable without a positive target or a dated period", () => {
  assert.equal(goalProgress({ value: 5, target: 0, from: "2026-10-01", to: "2026-10-31", today: "2026-10-14" }).status, "none");
  assert.equal(goalProgress({ value: 5, target: 10, from: "", to: "", today: "2026-10-14" }).status, "none");
  assert.equal(goalProgress({ value: null, target: 10, from: "2026-10-01", to: "2026-10-31", today: "2026-10-14" }).status, "none");
});
test("top N keeps the largest groups and folds the rest into Everything else without losing the total", () => {
  const rows = ["a", "b", "c", "d", "e"].map((label, i) => ({ label, value: (i + 1) * 10 }));
  const out = topNWithOther(rows, 3);
  assert.deepEqual(out.map((r) => r.label), ["e", "d", "c", "Everything else"]);
  assert.equal(out.reduce((n, r) => n + r.value, 0), 150);
  assert.equal(topNWithOther(rows, 5).length, 5);
  assert.deepEqual(topNWithOther([{ label: "x", value: 0 }, { label: "y", value: -3 }], 3).length, 1);
});
test("ranking orders by the metric, direction-aware, ignores empty values and reports change vs previous", () => {
  const rows = [
    { label: "A", value: 10, previous: 8 },
    { label: "B", value: 30, previous: null },
    { label: "C", value: null, previous: 5 },
    { label: "D", value: 20, previous: 25 },
  ];
  const high = rankRows(rows, true);
  assert.deepEqual(high.map((r) => r.label), ["B", "D", "A"]);
  assert.equal(high[0].change, null);
  assert.equal(high[1].change, -0.2);
  assert.equal(high[2].change, 0.25);
  assert.deepEqual(rankRows(rows, false).map((r) => r.label), ["A", "D", "B"]);
});
