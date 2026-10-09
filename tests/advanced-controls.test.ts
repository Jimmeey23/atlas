import test from "node:test";
import assert from "node:assert/strict";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  compileFilters,
  completeRange,
  grainSQL,
  displayCalculation,
  deltaValues,
  sortRows,
  type FilterGroup,
} from "../src/data/advanced-controls.ts";
import {
  comparisonDates,
  alignedComparisonPeriod,
} from "../src/data/periods.ts";
import { compileAnalyticalSQL } from "../src/data/analytical-query.ts";
import { buildCSV, csvValue } from "../src/data/export-format.ts";
const types = {
  location: "VARCHAR",
  revenue: "DOUBLE",
  member_id: "VARCHAR",
  attended: "BOOLEAN",
};
const group: FilterGroup = {
  id: "root",
  join: "and",
  rules: [
    {
      id: "a",
      field: "revenue",
      operator: "between",
      value: "10",
      upper: "100",
    },
    {
      id: "g",
      join: "or",
      rules: [
        {
          id: "b",
          field: "location",
          operator: "in",
          value: "Bandra|O'Reilly",
        },
        { id: "c", field: "member_id", operator: "missing", value: "" },
      ],
    },
  ],
};
test("nested filters escape values, preserve missing values and reject invalid fields/numbers", () => {
  const sql = compileFilters(group, types);
  assert.ok(sql.includes("'O''Reilly'"));
  assert.ok(sql.includes(" OR "));
  assert.ok(sql.includes('"revenue" BETWEEN 10 AND 100'));
  assert.throws(
    () =>
      compileFilters(
        {
          ...group,
          rules: [
            {
              id: "x",
              field: 'bad";DROP TABLE sales',
              operator: "eq",
              value: "1",
            },
          ],
        },
        types,
      ),
    /Unknown/,
  );
  assert.throws(
    () =>
      compileFilters(
        {
          ...group,
          rules: [{ id: "x", field: "revenue", operator: "gte", value: "abc" }],
        },
        types,
      ),
    /number/,
  );
  assert.throws(
    () =>
      compileFilters(
        {
          ...group,
          rules: [
            {
              id: "x",
              field: "revenue",
              operator: "between",
              value: "10",
              upper: "1",
            },
          ],
        },
        types,
      ),
    /minimum/,
  );
});
test("complete periods trim partial boundaries and do not invent available periods", () => {
  assert.deepEqual(
    completeRange("2026-01-10", "2026-04-08", "month", "2026-04-09"),
    { from: "2026-02-01", to: "2026-03-31" },
  );
  assert.deepEqual(
    completeRange("2026-01-01", "2026-06-30", "quarter", "2026-07-03"),
    { from: "2026-01-01", to: "2026-06-30" },
  );
  assert.deepEqual(
    completeRange("2026-01-06", "2026-01-25", "week", "2026-01-26"),
    { from: "2026-01-12", to: "2026-01-25" },
  );
  assert.throws(
    () => completeRange("2026-04-01", "2026-04-08", "month", "2026-04-09"),
    /no complete/,
  );
});
test("equal elapsed and matching weekdays compare comparable date spans", () => {
  assert.deepEqual(comparisonDates("2026-03-01", "2026-03-31", "elapsed"), {
    from: "2026-01-29",
    to: "2026-02-28",
  });
  const dates = comparisonDates("2026-03-03", "2026-03-12", "weekdays");
  assert.equal(
    new Date(dates.from).getUTCDay(),
    new Date("2026-03-03").getUTCDay(),
  );
  assert.equal(Date.parse(dates.to) - Date.parse(dates.from), 9 * 86400000);
  assert.equal(
    alignedComparisonPeriod(
      "2026-03-01",
      "2026-01-01",
      "2026-03-31",
      "year",
      "month",
    ),
    "2025-03-01",
  );
  assert.equal(
    alignedComparisonPeriod(
      "2026-03-01",
      "2026-01-01",
      "2026-03-31",
      "custom:2025-01-01:2025-03-31",
      "month",
    ),
    "2025-03-01",
  );
});
test("zero baselines stay unavailable and percentage points differ from percentage change", () => {
  assert.equal(displayCalculation(10, "share", 0, 2), null);
  assert.equal(displayCalculation(10, "per_member", 20, 0), null);
  assert.deepEqual(deltaValues(0.6, 0.5, true), {
    absolute: 0.6 - 0.5,
    relative: (0.6 - 0.5) / 0.5,
    points: (0.6 - 0.5) * 100,
  });
  assert.equal(deltaValues(10, 0).relative, null);
  assert.equal(deltaValues(null, 0).absolute, null);
  assert.deepEqual(
    sortRows(
      [
        { a: 1, b: 2 },
        { a: 1, b: 3 },
        { a: null, b: 0 },
      ],
      [
        { id: "a", desc: false },
        { id: "b", desc: true },
      ],
    ).map((r) => r.b),
    [3, 2, 0],
  );
});
test("cumulative weighted rates and selected distincts are recomputed over the union of facts", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    await c.run(
      `CREATE TABLE facts_source(date VARCHAR,location VARCHAR,checked_in DOUBLE,capacity DOUBLE,member_id VARCHAR);INSERT INTO facts_source VALUES ('2026-01-01','Bandra',1,2,'a'),('2026-02-01','Bandra',9,10,'a'),('2026-02-02','Bandra',0,8,'b'),('2026-01-01','Kemps',3,3,'c')`,
    );
    const queries = compileAnalyticalSQL({
      facts: "facts_source",
      period: grainSQL("date", "month"),
      dimension: "location",
      measure: "SUM(checked_in)/NULLIF(SUM(capacity),0)",
      denominator: "SUM(capacity)",
      calculation: "cumulative",
    });
    const rows = (await c.runAndReadAll(queries.grouped)).getRowObjectsJS();
    assert.equal(
      rows.find((r) => r.period === "2026-02-01" && r.segment === "Bandra")!
        .value,
      0.5,
    );
    const count = compileAnalyticalSQL({
      facts: "facts_source",
      period: grainSQL("date", "month"),
      dimension: "location",
      measure: "COUNT(DISTINCT member_id)",
    });
    const [selected] = (
      await c.runAndReadAll(
        count.selected([
          { period: "2026-01-01", segment: "Bandra" },
          { period: "2026-02-01", segment: "Bandra" },
        ]),
      )
    ).getRowObjectsJS();
    assert.equal(
      Number(selected.value),
      2,
      "member a appears in two buckets but is counted once",
    );
    const [overlap] = (
      await c.runAndReadAll(
        queries.selected([
          { period: "2026-01-01", segment: "Bandra" },
          { period: "2026-02-01", segment: "Bandra" },
        ]),
      )
    ).getRowObjectsJS();
    assert.equal(
      Number(overlap.records),
      3,
      "overlapping cumulative prefixes do not duplicate facts",
    );
  } finally {
    c.closeSync();
    db.closeSync();
  }
});
test("exports retain provenance, definitions, negatives and protect spreadsheet formulas", () => {
  assert.equal(csvValue(-10), '"-10"');
  assert.equal(csvValue(' =HYPERLINK("x")'), '"\' =HYPERLINK(""x"")"');
  const csv = buildCSV([{ value: 10 }], {
    scope: "All filtered records",
    filters: { from: "2026-01-01" },
    generatedAt: "now",
    rowCount: 1,
    definitions: { value: "count of records" },
    sources: [{ name: "sales", fetchedAt: 123 }],
  });
  for (const expected of [
    "All filtered records",
    "count of records",
    "sales",
    "Exported rows: 1",
    "2026-01-01",
  ])
    assert.ok(csv.includes(expected));
});

import { alignedGrainSQL } from "../src/data/advanced-controls.ts";
import { metricDenominatorSQL } from "../src/semantics/metrics.ts";
import { toolScope } from "../server/agent-scope.mjs";
test("matching-weekday comparison rows are rebased before grouping across month boundaries", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    await c.run(
      `CREATE TABLE payments(date VARCHAR,location VARCHAR,revenue DOUBLE);INSERT INTO payments VALUES ('2026-06-27','Bandra',10),('2026-07-27','Bandra',20)`,
    );
    const period = alignedGrainSQL(
      "date",
      "month",
      { from: "2026-08-01", to: "2026-08-31" },
      { from: "2026-06-27", to: "2026-07-27" },
      "weekdays",
    );
    const compiled = compileAnalyticalSQL({
      facts: "payments",
      period,
      dimension: "location",
      measure: "SUM(revenue)",
    });
    const rows = (await c.runAndReadAll(compiled.grouped)).getRowObjectsJS();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].period, "2026-08-01");
    assert.equal(Number(rows[0].value), 30);
  } finally {
    c.closeSync();
    db.closeSync();
  }
});
test("rate denominator follows the shared metric definition and advanced tool scopes are validated", () => {
  const ctx = { today: "2026-01-01", rate: 1200 };
  assert.equal(metricDenominatorSQL("fill_rate", ctx), "(SUM(capacity))");
  assert.equal(
    metricDenominatorSQL("conversion_rate", ctx),
    "(COUNT(*) FILTER (WHERE is_new))",
  );
  assert.deepEqual(
    toolScope({ advanced: group }, { location: ["Bandra"] }).advanced,
    group,
  );
  assert.throws(
    () =>
      toolScope(
        {
          advanced: {
            id: "bad",
            join: "or",
            rules: [{ id: "a", field: "wrong", operator: "eq", value: "1" }],
          },
        },
        {},
      ),
    /Unknown filter/,
  );
});

import { compileOutcomeWindow } from "../src/data/outcome-window.ts";
test("outcome controls distinguish calendar and elapsed-day windows and preserve missing coverage", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    await c.run(
      `CREATE TABLE newcomers(date VARCHAR,member_id VARCHAR,is_new BOOLEAN,conversion VARCHAR,first_purchase_date VARCHAR);CREATE TABLE sales(date VARCHAR);CREATE TABLE checkins(date VARCHAR,member_id VARCHAR,attended BOOLEAN);INSERT INTO newcomers VALUES ('2026-01-25','a',TRUE,'Converted','2026-02-10'),('2026-02-28','b',TRUE,'Converted','2026-03-01')`,
    );
    const run = async (
      kind: "conversion" | "retention",
      mode: "calendar" | "rolling",
    ) => {
      const window = compileOutcomeWindow({
        kind,
        mode,
        days: 30,
        asOf: "2026-03-02",
      });
      return (
        await c.runAndReadAll(
          `SELECT ${window.value} AS value,${window.denominator} AS denominator FROM newcomers f`,
        )
      ).getRowObjectsJS()[0];
    };
    assert.equal((await run("retention", "rolling")).value, null);
    assert.equal(Number((await run("retention", "rolling")).denominator), 0);
    assert.equal((await run("conversion", "rolling")).value, null);
    await c.run(
      `INSERT INTO sales VALUES ('2026-03-01');INSERT INTO checkins VALUES ('2026-02-24','a',TRUE),('2026-03-01','coverage',TRUE)`,
    );
    assert.equal((await run("conversion", "rolling")).value, 1);
    assert.equal((await run("conversion", "calendar")).value, 0);
    assert.equal((await run("retention", "rolling")).value, 1);
    assert.equal((await run("retention", "calendar")).value, 0);
    await c.run(
      `UPDATE newcomers SET first_purchase_date=NULL WHERE member_id='a'`,
    );
    assert.equal(
      (await run("conversion", "rolling")).value,
      null,
      "undated known conversion cannot be silently treated as non-converted",
    );
  } finally {
    c.closeSync();
    db.closeSync();
  }
});

test("unfinished empty groups do not broaden OR filters", () => {
  const expression = compileFilters(
    {
      id: "root",
      join: "or",
      rules: [
        { id: "a", field: "location", operator: "eq", value: "Bandra" },
        { id: "empty", join: "and", rules: [] },
      ],
    },
    types,
  );
  assert.equal(expression, "(\"location\"='Bandra')");
});
