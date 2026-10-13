import test from "node:test";
import assert from "node:assert/strict";
import { elementSpecError, elementSpec, pivotRows, elementTypes } from "../src/semantics/element-spec.ts";
import { elementChartOption } from "../src/components/elementChart.ts";

const theme = { palette: ["#1", "#2", "#3", "#4", "#5", "#6"], text: "#t", line: "#l", surface: "#s" };
const format = (_key: string, value: unknown) => String(value);

test("legacy single-measure bodies still read as one series", () => {
  assert.deepEqual(elementSpec({ type: "bar", sql: "SELECT 1", x: "month", y: "attendance" }).series, ["attendance"]);
  assert.equal(elementSpecError({ type: "bar", sql: "SELECT 1", x: "month", y: "attendance" }), null);
});

test("every advanced type is accepted when its fields are present", () => {
  const ok = {
    bar: { x: "m", series: ["a", "b"] },
    horizontal_bar: { x: "m", series: ["a"] },
    stacked_bar: { x: "m", series: ["a", "b", "c"] },
    line: { x: "m", series: ["a", "b"] },
    area: { x: "m", series: ["a"] },
    combo: { x: "m", series: ["revenue"], y2: ["fill_rate"] },
    pie: { x: "m", series: ["a"] },
    donut: { x: "m", series: ["a"] },
    scatter: { x: "a", series: ["b"] },
    heatmap: { x: "day", group: "time", value: "attendance" },
    pivot: { x: "trainer", group: "month", value: "sessions" },
    kpi: { series: ["attendance", "fill_rate"], compare: ["attendance_prev", null] },
    table: {},
    list: {},
  } as Record<string, object>;
  assert.deepEqual(Object.keys(ok).sort(), [...elementTypes].sort());
  for (const [type, fields] of Object.entries(ok))
    assert.equal(elementSpecError({ type, sql: "SELECT 1", ...fields }), null, type);
});

test("missing or mismatched fields explain exactly what to fix", () => {
  assert.match(elementSpecError({ type: "gauge", sql: "SELECT 1" })!, /Unsupported element type "gauge".*combo/);
  assert.match(elementSpecError({ type: "combo", sql: "SELECT 1", x: "m", series: ["a"] })!, /y2/);
  assert.match(elementSpecError({ type: "pivot", sql: "SELECT 1", x: "trainer", value: "v" })!, /group/);
  assert.match(elementSpecError({ type: "donut", sql: "SELECT 1", x: "m", series: ["a", "b"] })!, /exactly one/);
  assert.match(elementSpecError({ type: "kpi", sql: "SELECT 1", series: ["a", "b"], compare: ["x"] })!, /compare/);
  assert.match(elementSpecError({ type: "bar", x: "m", series: ["a"] })!, /sql/);
  const columns = ["month", "revenue"];
  assert.match(
    elementSpecError({ type: "combo", sql: "SELECT 1", x: "month", series: ["revenue"], y2: ["fill_rate"] }, columns)!,
    /"fill_rate" is not a column of the query result\. Result columns: month, revenue/,
  );
});

test("pivot lays rows by columns and totals only additive values", () => {
  const rows = [
    { trainer: "A", month: "2026-08", sessions: 3 },
    { trainer: "A", month: "2026-09", sessions: 4 },
    { trainer: "B", month: "2026-09", sessions: 5 },
  ];
  const p = pivotRows(rows, "trainer", "month", "sessions");
  assert.deepEqual(p.rowKeys, ["A", "B"]);
  assert.deepEqual(p.colKeys, ["2026-08", "2026-09"]);
  assert.equal(p.cell("A", "2026-09"), 4);
  assert.equal(p.cell("B", "2026-08"), null);
  assert.equal(p.rowTotal("A"), 7);
  assert.equal(p.colTotal("2026-09"), 9);
  assert.equal(p.total, 12);
  const rates = pivotRows([{ t: "A", m: "x", fill_rate: 0.5 }], "t", "m", "fill_rate");
  assert.equal(rates.totals, false);
});

test("chart options carry every series, stacking, second axis and heatmap grid", () => {
  const rows = [
    { month: "2026-08", revenue: 10, attendance: 4, fill_rate: 0.4 },
    { month: "2026-09", revenue: 12, attendance: 5, fill_rate: 0.5 },
  ];
  const stacked: any = elementChartOption(elementSpec({ type: "stacked_bar", sql: "", x: "month", series: ["revenue", "attendance"] }), rows, theme, format);
  assert.equal(stacked.series.length, 2);
  assert.ok(stacked.series.every((s: any) => s.type === "bar" && s.stack === "total"));
  const combo: any = elementChartOption(elementSpec({ type: "combo", sql: "", x: "month", series: ["revenue"], y2: ["fill_rate"] }), rows, theme, format);
  assert.equal(combo.yAxis.length, 2);
  assert.deepEqual(combo.series.map((s: any) => [s.type, s.yAxisIndex]), [["bar", 0], ["line", 1]]);
  const horizontal: any = elementChartOption(elementSpec({ type: "horizontal_bar", sql: "", x: "month", series: ["revenue"] }), rows, theme, format);
  assert.equal(horizontal.yAxis.type, "category");
  const area: any = elementChartOption(elementSpec({ type: "area", sql: "", x: "month", series: ["revenue"] }), rows, theme, format);
  assert.ok(area.series[0].areaStyle);
  const heat: any = elementChartOption(
    elementSpec({ type: "heatmap", sql: "", x: "day", group: "time", value: "attendance" }),
    [{ day: "Mon", time: "07:00", attendance: 8 }, { day: "Tue", time: "18:00", attendance: 3 }],
    theme,
    format,
  );
  assert.deepEqual(heat.yAxis.data, ["Mon", "Tue"]);
  assert.deepEqual(heat.xAxis.data, ["07:00", "18:00"]);
  assert.deepEqual(heat.series[0].data, [[0, 0, 8], [1, 1, 3]]);
  assert.equal(heat.visualMap.max, 8);
});

test("the form the user names limits the element types the agent may save", async () => {
  const { requestedElementTypes } = await import("../src/semantics/element-spec.ts");
  const table = requestedElementTypes("build a mom table of avg spend per unique member")!;
  assert.ok(table.includes("table") && table.includes("pivot"));
  assert.ok(!table.includes("bar") && !table.includes("line"));
  assert.deepEqual(requestedElementTypes("plot a line chart of attendance"), ["line", "area"]);
  assert.ok(requestedElementTypes("a bar chart and a table of sales")!.includes("bar"));
  assert.ok(requestedElementTypes("a bar chart and a table of sales")!.includes("table"));
  assert.equal(requestedElementTypes("create a chart of late cancellations by instructor"), null);
  assert.equal(requestedElementTypes("show revenue by studio"), null);
  assert.equal(requestedElementTypes("build a timetable view"), null);
});

test("history requests are recognised and ignoreDates is read from the body", async () => {
  const { wantsFullHistory } = await import("../src/semantics/element-spec.ts");
  for (const m of ["build a mom table of avg spend", "month on month revenue", "monthly trend of fill rate", "YoY sales table", "this table should not be affected by the date filters of the tab", "ignore the date filter"])
    assert.equal(wantsFullHistory(m), true, m);
  for (const m of ["sales by studio in september", "top instructors last month"]) assert.equal(wantsFullHistory(m), false, m);
  assert.equal(elementSpec({ type: "table", sql: "x", ignoreDates: true }).ignoreDates, true);
  assert.equal(elementSpec({ type: "table", sql: "x" }).ignoreDates, false);
});
