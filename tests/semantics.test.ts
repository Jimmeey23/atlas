import { test } from "node:test";
import assert from "node:assert/strict";
import {
  number,
  date,
  month,
  percent,
  boolean,
  topTrainers,
  normalise,
  contactable,
} from "../src/data/normalise.ts";
import { metrics } from "../src/semantics/metrics.ts";
import { delta, fmt } from "../src/semantics/formats.ts";
test("normalisation preserves null versus genuine zero and parses Indian currency", () => {
  assert.equal(number("-"), null);
  assert.equal(number(""), null);
  assert.equal(number("0"), 0);
  assert.equal(number("₹1,64,821"), 164821);
  assert.equal(number("1,942.50"), 1942.5);
});
test("date and month formats never guess DD/MM dates", () => {
  assert.equal(date("05/08/2026 08:02:02"), "2026-08-05 08:02:02");
  assert.equal(month("Feb-2024"), "2024-02");
  assert.equal(month("January 2024"), "2024-01");
  assert.ok(Math.abs(percent("45.16%")! - 0.4516) < 1e-12);
  assert.equal(percent("50"), 0.5);
  assert.equal(boolean("FALSE"), false);
});
test("Sheets date-formatted minutes are recovered; valid attendance survives", () => {
  const d = normalise({
    key: "checkins",
    title: "Checkins",
    id: "test",
    status: "ok",
    fetchedAt: 0,
    loadMs: 0,
    columns: ["Duration (Minutes)", "Checked In", "Member ID", "Date (IST)"],
    rows: [["1900-02-25", "TRUE", "123", "2024-01-02"]],
  });
  assert.equal(d.rows[0].duration, 57);
  assert.equal(d.rows[0].checked_in, 1);
  assert.equal(d.defects.length, 0);
});
test("trainer attendance parsing handles apostrophes, commas and sorted order", () => {
  assert.deepEqual(
    topTrainers(
      "Cauveri Vikrant (15.0), Richard D'Costa (13.0), Reshma Sharma (0.0)",
    ).map((t) => t.attendance),
    [15, 13, 0],
  );
});
test("placeholder emails are excluded from contactability", () => {
  assert.equal(contactable("noemail+382@gmail.com"), false);
  assert.equal(contactable("test@example.com"), true);
});
test("every registry metric defines sources and a minimum sample", () => {
  for (const metric of Object.values(metrics)) {
    assert.ok(metric.sources.length);
    assert.ok(metric.minSample > 0);
    assert.ok(metric.sql({ rate: 1200, today: "2026-10-05" }));
  }
  assert.equal(metrics.fill_rate.aggregation, "weighted");
  assert.match(
    metrics.fill_rate.sql({ rate: 1200, today: "2026-10-05" }),
    /SUM\(checked_in\).*SUM\(capacity\)/,
  );
});
test("rate deltas use points, count and currency use relative percent", () => {
  assert.equal(delta("fill_rate", 0.5, 0.4), "+10.0pp");
  assert.equal(delta("revenue", 120, 100), "+20.0%");
  assert.equal(fmt("revenue", null), "—");
  assert.equal(fmt("revenue", 194250), "₹1.9L");
});

test("source snapshot stays attached to each normalised row", () => {
  const d = normalise({
    key: "new",
    title: "New",
    id: "test",
    status: "ok",
    fetchedAt: 1770020000000,
    loadMs: 0,
    columns: ["Member Id"],
    rows: [["member-1"], ["member-2"]],
  });
  assert.deepEqual(
    d.rows.map((r) => [r.source_row, r.source_snapshot]),
    [
      [2, 1770020000000],
      [3, 1770020000000],
    ],
  );
});
