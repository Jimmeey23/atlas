import test from "node:test";
import assert from "node:assert/strict";
import {
  comparePeriods,
  describeCall,
  describeChange,
  explainChange,
  figuresIn,
  forecast,
  periodWindows,
  rankPerformance,
  scoreSeries,
  splitDrivers,
  trend,
  unverifiedFigures,
  whatIf,
} from "../server/agent-analytics.mjs";

const available = ["sessions", "sales", "new", "bookings", "checkins", "lapsed"];
/** A fake studio: August and September totals for two studios, keyed by the period start. */
const data: Record<string, Record<string, Record<string, number>>> = {
  "2026-08-01": { "Kwality House, Kemps Corner": { sessions: 100, attendance: 1000, revenue: 500000, capacity: 2000, fill_rate: 0.5, source_records: 100 }, "Supreme HQ, Bandra": { sessions: 50, attendance: 400, revenue: 200000, capacity: 1000, fill_rate: 0.4, source_records: 50 } },
  "2026-09-01": { "Kwality House, Kemps Corner": { sessions: 110, attendance: 1210, revenue: 605000, capacity: 2200, fill_rate: 0.55, source_records: 110 }, "Supreme HQ, Bandra": { sessions: 50, attendance: 350, revenue: 175000, capacity: 1000, fill_rate: 0.35, source_records: 2 } },
};
function ctx() {
  const run = async (sql: string, filters: any) => {
    const studios = data[filters.from] || data["2026-09-01"];
    const grouped = /GROUP BY/.test(sql) && /"location"/.test(sql);
    const total = (k: string) => Object.values(studios).reduce((s, r) => s + r[k], 0);
    const rows = grouped
      ? Object.entries(studios).map(([location, r]) => ({ location, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])) }))
      : [{ sessions: total("sessions"), attendance: total("attendance"), revenue: total("revenue"), capacity: total("capacity"), fill_rate: total("attendance") / total("capacity"), source_records: total("source_records") }];
    return { rows, provenance: [{ source: "sessions", rows: 4 }], filters };
  };
  return { run, defaults: {}, available, rate: 1200, today: "2026-10-08" };
}
const aug = JSON.stringify({ from: "2026-08-01", to: "2026-08-31" });
const sep = JSON.stringify({ from: "2026-09-01", to: "2026-09-30" });

test("compare_periods reports a, b, change, % change and pp change for rates", async () => {
  const { output, evidence } = await comparePeriods({ source: "sessions", metric_ids: ["attendance", "fill_rate"], group_by: "location", period_a: aug, period_b: sep, exclude_hosted: true }, ctx());
  const kh = output.rows.find((r: any) => r.location === "Kwality House, Kemps Corner");
  assert.equal(kh.attendance_a, 1000);
  assert.equal(kh.attendance_b, 1210);
  assert.equal(kh.attendance_change, 210);
  assert.equal(kh.attendance_change_pct, 0.21);
  assert.equal(kh.fill_rate_change_pp, 5);
  assert.equal(kh.attendance_material, true);
  assert.equal(evidence.length, 1);
});

test("explain_change splits attendance into classes × class size, and the parts add up to the total", async () => {
  const { output } = await explainChange({ source: "sessions", metric_id: "attendance", dimensions: ["location"], period_a: aug, period_b: sep, exclude_hosted: true }, ctx());
  assert.equal(output.value_a, 1400);
  assert.equal(output.value_b, 1560);
  const sum = output.drivers.reduce((s: number, d: any) => s + d.contribution, 0);
  assert.ok(Math.abs(sum - 160) < 0.05, `drivers sum ${sum}`);
  assert.deepEqual(output.drivers.map((d: any) => d.driver), ["Classes run", "Attendees per class"]);
  assert.equal(output.mix.location.biggest_increases[0].location, "Kwality House, Kemps Corner");
  assert.equal(output.mix.location.biggest_decreases[0].change, -50);
  await assert.rejects(explainChange({ source: "sessions", metric_id: "fill_rate", dimensions: [], period_a: aug, period_b: sep, exclude_hosted: false }, ctx()), /average or rate/);
});

test("splitDrivers is exact for three multiplicative drivers", () => {
  const parts = splitDrivers([["a", 10, 12], ["b", 5, 4], ["c", 2, 3]], [100, 144])!;
  assert.ok(Math.abs(parts.reduce((s, p) => s + p.contribution, 0) - 44) < 0.05);
  assert.equal(splitDrivers([["a", 0, 1]], [0, 1]), null);
});

test("rank_performance applies the minimum sample and reports peer gaps", async () => {
  const { output } = await rankPerformance({ source: "sessions", metric_ids: ["fill_rate", "attendance"], group_by: "location", min_sample: 3, order: "desc", limit: 5, scope_json: sep, exclude_hosted: true }, ctx());
  assert.equal(output.ranked.length, 1);
  assert.equal(output.ranked[0].location, "Kwality House, Kemps Corner");
  assert.deepEqual(output.excluded_low_sample, [{ location: "Supreme HQ, Bandra", sample: 2 }]);
});

test("what_if models a fill-rate target on regular classes", async () => {
  const { output } = await whatIf({ scope_json: sep, fill_rate_target_pct: 60, class_size_change_pct: null, sessions_change_pct: null, yield_change_pct: null }, ctx());
  const att = output.rows.find((r: any) => r.measure === "attendance");
  assert.equal(att.baseline, 1560);
  assert.equal(Math.round(att.scenario), 1920); // 3200 seats × 60%
  const fill = output.rows.find((r: any) => r.measure === "fill_rate");
  assert.ok(Math.abs(fill.scenario - 0.6) < 1e-9);
});

test("forecast projects a month-end run rate and the gap to a target", async () => {
  const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  const run = async () => ({ rows: months.map((month, i) => ({ month, attendance: String(i === 6 ? 400 : 1000 + i * 100) })), provenance: [], filters: {} });
  const { output } = await forecast({ source: "sessions", metric_id: "attendance", target: 1600, scope_json: null, exclude_hosted: true }, { ...ctx(), run });
  assert.equal(output.month_to_date, 400);
  assert.equal(output.run_rate_projection, 1550); // 400 / 8 days × 31
  assert.equal(output.gap_to_target, 50);
  assert.equal(output.trend_last_6_completed_months.slope, 100);
});

test("period windows, trend and anomaly scoring", () => {
  const weeks = periodWindows("2026-10-08", "week", 2);
  assert.deepEqual(weeks.map((w) => [w.from, w.to]), [["2026-09-21", "2026-09-27"], ["2026-09-28", "2026-10-04"]]);
  assert.equal(periodWindows("2026-10-08", "month", 1)[0].from, "2026-09-01");
  assert.equal(trend([1, 2, 3])?.next, 4);
  const scored = scoreSeries({ steady: [10, 11, 10, 11, 10], spike: [10, 11, 10, 11, 30] });
  assert.equal(scored[0].key, "spike");
  assert.equal(scored[0].unusual, true);
  assert.equal(scored.find((s) => s.key === "steady")!.unusual, false);
  assert.equal(describeChange("fill_rate", 0.5, 0.51).material, false);
});

test("figure check accepts figures from results and simple arithmetic, flags invented ones", () => {
  const evidence = [{ result: [{ location: "KH", attendance: "1210", attendance_a: 1000, fill_rate: 0.5512, revenue: 605000 }] }];
  assert.deepEqual(unverifiedFigures("Attendance rose to 1,210 (+21%), fill 55.1%, revenue ₹6.1L and ₹6,05,000.", evidence), []);
  assert.deepEqual(unverifiedFigures("Attendance was 1,450 with 72% fill.", evidence), ["1,450", "72%"]);
  // Dates, times, years and small counts are not treated as claims.
  assert.deepEqual(unverifiedFigures("Saturday 10:15 in 2026-09 across 3 classes, Q3 2026.", evidence), []);
  assert.deepEqual(unverifiedFigures("Up 37% since last month", evidence, "what changed since 37% target"), []);
  assert.equal(figuresIn("₹1.2Cr")[0].value, 12000000);
});

test("progress lines describe each tool call in plain words", () => {
  assert.equal(describeCall("find_entity", { kind: "studio", text: "kh" }), "Resolving “kh” (studio)");
  assert.match(describeCall("query_metrics", { metric_ids: ["attendance"], group_by: ["location"] }), /by location/);
});
