import test from "node:test";
import assert from "node:assert/strict";
import { formatAllocation } from "../src/data/format-allocation";

test("format allocation compares pooled timetable and demand shares rather than per-format averages", () => {
  const rows = [
    { format_group: "Barre", sessions: 80, attendance: 400, revenue: 6000 },
    { format_group: "Cycle", sessions: 20, attendance: 600, revenue: 4000 },
  ];
  const attendance = formatAllocation(rows, "attendance");
  assert.equal(attendance[0].supply_share, 0.8);
  assert.equal(attendance[1].demand_share, 0.6);
  assert.ok(Math.abs(Number(attendance[1].gap_pp) - 40) < 1e-9);
  const revenue = formatAllocation(rows, "revenue");
  assert.equal(revenue[0].demand_share, 0.6);
  assert.ok(Math.abs(Number(revenue[0].gap_pp) + 20) < 1e-9);
  assert.equal(
    attendance.reduce((sum, row) => sum + Number(row.demand_share), 0),
    1,
  );
});
test("unavailable or zero-total demand is not displayed as a measured zero share", () => {
  for (const revenue of [null, 0]) {
    const rows = formatAllocation(
      [{ format_group: "Barre", sessions: 2, attendance: 0, revenue }],
      "revenue",
    );
    assert.equal(rows[0].demand_share, null);
    assert.equal(rows[0].gap_pp, null);
    assert.equal(rows[0].supply_share, 1);
  }
  assert.equal(
    formatAllocation(
      [
        { format_group: "Cycle", sessions: 1, attendance: null },
        { format_group: "Barre", sessions: 1, attendance: 10 },
      ],
      "attendance",
    )[0].demand_share,
    null,
  );
});
