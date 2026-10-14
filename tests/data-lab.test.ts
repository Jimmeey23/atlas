import test from "node:test";
import assert from "node:assert/strict";
import { DuckDBInstance } from "@duckdb/node-api";
import { labSQL, labFrom, type LabSpec } from "../src/data/data-lab";
const spec: LabSpec = {
  id: "test",
  title: "Pivot",
  source: "sales",
  type: "Pivot table",
  rows: [
    { source: "sales", column: "location" },
    { source: "sales", column: "product" },
  ],
  columns: [{ source: "sales", column: "month" }],
  measures: [
    {
      id: "avg",
      source: "sales",
      column: "revenue",
      aggregate: "AVG",
      label: "Average",
    },
    {
      id: "distinct",
      source: "sales",
      column: "member_id",
      aggregate: "COUNT DISTINCT",
      label: "Members",
    },
  ],
  relationships: [],
  limit: 2000,
  sort: "ASC",
  color: "#466a61",
  decimals: 2,
  format: "Number",
  totals: true,
  heat: false,
  density: "Compact",
  filterField: "",
  filterValue: "",
};
test("nested pivots recompute averages and distinct member totals from underlying records", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(
    "CREATE TABLE sales(location VARCHAR, product VARCHAR, month VARCHAR, revenue DOUBLE, member_id VARCHAR)",
  );
  await c.run(
    "INSERT INTO sales VALUES ('A','P','2026-01',10,'m1'),('A','P','2026-01',30,'m2'),('A','Q','2026-02',80,'m1'),(NULL,'Q','2026-02',NULL,NULL)",
  );
  const r = await c.runAndReadAll(labSQL(spec));
  const rows = r.getRowObjectsJS();
  const total = rows.find((r) => Number(r.gr) === 3 && Number(r.gc) === 1)!;
  assert.equal(Number(total.m0), 40);
  assert.equal(Number(total.m1), 2);
  assert.ok(
    rows.some((r) => r.d0 === null && Number(r.gr) === 0),
    "missing keys remain distinct from rollup totals",
  );
  const filtered = await c.runAndReadAll(
    labSQL(spec, { sales: "WHERE location='A' AND month='2026-01'" }),
  );
  const ft = filtered
    .getRowObjectsJS()
    .find((r) => Number(r.gr) === 3 && Number(r.gc) === 1)!;
  assert.equal(Number(ft.m0), 20);
  assert.equal(Number(ft.m1), 2);
  c.closeSync();
});
test("relationship query scopes each sheet before joining and rejects disconnected/cyclic links", () => {
  const joined = {
    ...spec,
    relationships: [
      {
        id: "r",
        from: "sales",
        fromKey: "member_id",
        to: "new",
        toKey: "member_id",
        join: "LEFT" as const,
      },
    ],
  };
  assert.match(
    labSQL(joined, { sales: "WHERE location='A'", new: "WHERE location='B'" }),
    /LEFT JOIN \(SELECT \* FROM "new" WHERE location='B'\)/,
  );
  assert.throws(
    () =>
      labFrom({
        ...joined,
        relationships: [...joined.relationships, ...joined.relationships],
      }),
    /Relationships/,
  );
  assert.throws(
    () => labSQL({ ...spec, rows: [{ source: "new", column: "location" }] }),
    /relationship/,
  );
  assert.throws(
    () =>
      labSQL({
        ...spec,
        rows: [{ source: "sales", column: "bad; DROP TABLE sales" }],
      }),
    /valid source/,
  );
});
test("metric cards ignore row hierarchies, literals escape safely and numeric aggregations validate", () => {
  const sql = labSQL({
    ...spec,
    type: "Metric cards",
    filterField: JSON.stringify({ source: "sales", column: "product" }),
    filterValue: "O'Brien",
  });
  assert.ok(!sql.includes("GROUP BY"));
  assert.match(sql, /O''Brien/);
  assert.throws(
    () =>
      labSQL({
        ...spec,
        measures: [
          { ...spec.measures[0], column: "member_id", aggregate: "SUM" },
        ],
      }),
    /numeric/,
  );
});
test("relationship profiling blocks fan-out and repeated lookup measures while preserving unmatched source rows", async () => {
  const { validateLabRelationships } = await import("../src/data/data-lab");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run("CREATE TABLE sales(member_id VARCHAR, revenue DOUBLE)");
  await c.run('CREATE TABLE "new"(member_id VARCHAR, revenue DOUBLE)');
  await c.run("INSERT INTO sales VALUES ('a',10),('a',20),('b',30),(NULL,40)");
  await c.run("INSERT INTO \"new\" VALUES ('a',100),('a',200)");
  const joined = {
    ...spec,
    relationships: [
      {
        id: "r",
        from: "sales",
        fromKey: "member_id",
        to: "new",
        toKey: "member_id",
        join: "LEFT" as const,
      },
    ],
  };
  const q = async (sql: string) =>
    (await c.runAndReadAll(sql)).getRowObjectsJS();
  await assert.rejects(validateLabRelationships(joined, q), /duplicate keys/);
  await c.run('DELETE FROM "new"');
  await c.run("INSERT INTO \"new\" VALUES ('a',100),(NULL,200)");
  const profile = await validateLabRelationships(joined, q);
  assert.match(profile[0], /2 of 4 source records match/);
  const repeated = {
    ...joined,
    measures: [{ ...spec.measures[0], source: "new", aggregate: "SUM" }],
  };
  await assert.rejects(
    validateLabRelationships(repeated, q),
    /measures repeat/,
  );
  await validateLabRelationships(
    {
      ...repeated,
      measures: [{ ...repeated.measures[0], aggregate: "COUNT DISTINCT" }],
    },
    q,
  );
  c.closeSync();
});
test("rejects ambiguous hierarchy fields, text chart measures, and multiple pie measures", () => {
  assert.throws(
    () => labSQL({ ...spec, rows: [spec.rows[0], spec.rows[0]] }),
    /only be used once/,
  );
  assert.throws(
    () => labSQL({ ...spec, type: "Pie chart" }),
    /exactly one measure/,
  );
  assert.throws(
    () =>
      labSQL({
        ...spec,
        type: "Line chart",
        measures: [
          { ...spec.measures[0], column: "product", aggregate: "MIN" },
        ],
      }),
    /numeric measures/,
  );
});
test("portable collections validate configurations and reject malformed display metadata", async () => {
  const { parseLabCollection } = await import("../src/data/data-lab");
  assert.equal(parseLabCollection(JSON.stringify([spec]))[0].title, "Pivot");
  assert.throws(
    () =>
      parseLabCollection(
        JSON.stringify([
          { ...spec, measures: [{ ...spec.measures[0], label: {} }] },
        ]),
      ),
    /display name/,
  );
  assert.throws(() => parseLabCollection("{}"), /collection/);
});
test("Power Query-style detailed merge combines columns across three sheets and expands all matching records", async () => {
  const { validateLabRelationships, parseLabCollection } = await import(
    "../src/data/data-lab"
  );
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run("CREATE TABLE sales(member_id VARCHAR, revenue DOUBLE)");
  await c.run('CREATE TABLE "new"(member_id VARCHAR, revenue DOUBLE)');
  await c.run("CREATE TABLE lapsed(member_id VARCHAR, category VARCHAR)");
  await c.run("INSERT INTO sales VALUES ('a',10),('a',20),('b',30),(NULL,40)");
  await c.run("INSERT INTO \"new\" VALUES ('a',100),('a',200),('c',300)");
  await c.run("INSERT INTO lapsed VALUES ('a','Expired')");
  const merged: LabSpec = {
    ...spec,
    type: "Merged table",
    rows: [
      { source: "sales", column: "member_id" },
      { source: "sales", column: "revenue" },
      { source: "new", column: "revenue" },
      { source: "lapsed", column: "category" },
    ],
    measures: [],
    columns: [],
    relationships: [
      {
        id: "r1",
        from: "sales",
        fromKey: "member_id",
        to: "new",
        toKey: "member_id",
        join: "LEFT",
      },
      {
        id: "r2",
        from: "new",
        fromKey: "member_id",
        to: "lapsed",
        toKey: "member_id",
        join: "LEFT",
      },
    ],
  };
  const q = async (sql: string) =>
    (await c.runAndReadAll(sql)).getRowObjectsJS();
  const profiles = await validateLabRelationships(merged, q);
  assert.match(profiles[0], /2 of 4 source records match/);
  assert.match(profiles[0], /separate merged rows/);
  const data = await q(labSQL(merged));
  assert.equal(data.length, 6);
  assert.ok(
    data.some(
      (r) => r.d0 === "a" && r.d1 === 10 && r.d2 === 200 && r.d3 === "Expired",
    ),
  );
  assert.ok(data.some((r) => r.d0 === "b" && r.d2 === null));
  const inner = await q(
    labSQL({
      ...merged,
      relationships: merged.relationships.map((r) => ({ ...r, join: "INNER" })),
    }),
  );
  assert.equal(inner.length, 4);
  const filtered = await q(
    labSQL(merged, { sales: "WHERE revenue=10", new: "WHERE revenue=200" }),
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].d2, 200);
  assert.equal(
    parseLabCollection(JSON.stringify([merged]))[0].relationships.length,
    2,
  );
  c.closeSync();
});
test("duplicate lookup rows can use a deterministic latest or earliest complete record without inflating pivot totals", async () => {
  const { validateLabRelationships } = await import("../src/data/data-lab");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run("CREATE TABLE sales(member_id VARCHAR, revenue DOUBLE)");
  await c.run(
    'CREATE TABLE "new"(row_id INTEGER, member_id VARCHAR, date VARCHAR, category VARCHAR)',
  );
  await c.run("INSERT INTO sales VALUES ('a',10),('a',20),('b',30),(NULL,40)");
  await c.run(
    "INSERT INTO \"new\" VALUES (1,'a','2026-01-01','Older'),(2,'a','2026-09-01','Newer'),(3,'a','2026-09-01','Latest tie'),(4,'b',NULL,'Missing date')",
  );
  const latest: LabSpec = {
    ...spec,
    rows: [{ source: "new", column: "category" }],
    columns: [],
    measures: [
      {
        id: "sum",
        source: "sales",
        column: "revenue",
        aggregate: "SUM",
        label: "Sales revenue",
      },
    ],
    relationships: [
      {
        id: "r",
        from: "sales",
        fromKey: "member_id",
        to: "new",
        toKey: "member_id",
        join: "LEFT",
        duplicates: "latest",
        orderBy: "date",
      },
    ],
  };
  const q = async (sql: string) =>
    (await c.runAndReadAll(sql)).getRowObjectsJS();
  const checks = await validateLabRelationships(latest, q);
  assert.match(checks[0], /Using latest record/);
  const rows = await q(labSQL(latest));
  assert.equal(Number(rows.find((r) => Number(r.gr) === 1)?.m0), 100);
  assert.equal(Number(rows.find((r) => r.d0 === "Latest tie")?.m0), 30);
  assert.ok(!rows.some((r) => r.d0 === "Older"));
  const earliest: LabSpec = {
    ...latest,
    relationships: latest.relationships.map((r) => ({
      ...r,
      duplicates: "earliest",
    })),
  };
  const first = await q(labSQL(earliest));
  assert.equal(Number(first.find((r) => r.d0 === "Older")?.m0), 30);
  const scoped = { new: "WHERE date='2026-01-01'" };
  await validateLabRelationships(latest, q, scoped);
  const filtered = await q(labSQL(latest, scoped));
  assert.equal(Number(filtered.find((r) => r.d0 === "Older")?.m0), 30);
  const empty = { new: "WHERE date='2099-01-01'" };
  await validateLabRelationships(latest, q, empty);
  assert.equal(
    Number(
      (await q(labSQL(latest, empty))).find((r) => Number(r.gr) === 1)?.m0,
    ),
    100,
  );
  c.closeSync();
});

const sideBySide: LabSpec = {
  ...spec,
  type: "Pivot table",
  rows: [{ source: "sales", column: "location" }],
  columns: [],
  sharedSheets: ["new"],
  measures: [
    {
      id: "rev",
      source: "sales",
      column: "revenue",
      aggregate: "SUM",
      label: "Revenue",
    },
    {
      id: "new",
      source: "new",
      column: "member_id",
      aggregate: "COUNT",
      label: "New clients",
    },
    {
      id: "conv",
      source: "new",
      column: "conversion",
      aggregate: "COUNT",
      label: "Converted",
      where: { column: "conversion", op: "=", values: ["Converted"] },
    },
  ],
};
async function sideBySideDb() {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(
    "CREATE TABLE sales(location VARCHAR, revenue DOUBLE, member_id VARCHAR)",
  );
  await c.run(
    'CREATE TABLE "new"(location VARCHAR, conversion VARCHAR, member_id VARCHAR)',
  );
  await c.run(
    "INSERT INTO sales VALUES ('A',10,'m1'),('A',30,'m2'),('A',5,'m3'),('B',7,'m4')",
  );
  await c.run(
    "INSERT INTO \"new\" VALUES ('A','Converted','n1'),('A','Pending','n2'),('A','Converted','n3'),('C','Converted','n4')",
  );
  return c;
}
test("side-by-side pivot aggregates each sheet by shared field without inflating totals", async () => {
  const c = await sideBySideDb();
  const rows = (await c.runAndReadAll(labSQL(sideBySide))).getRowObjectsJS();
  const at = (loc: string | null, gr: number) =>
    rows.find((r) => r.d0 === loc && Number(r.gr) === gr)!;
  assert.equal(Number(at("A", 0).m0), 45);
  assert.equal(Number(at("A", 0).m1), 3);
  assert.equal(Number(at("A", 0).m2), 2);
  // location only in sales keeps revenue, counts are zero
  assert.equal(Number(at("B", 0).m0), 7);
  assert.equal(Number(at("B", 0).m1), 0);
  // location only in new keeps counts, revenue is zero
  assert.equal(Number(at("C", 0).m0), 0);
  assert.equal(Number(at("C", 0).m2), 1);
  const total = at(null, 1);
  assert.equal(Number(total.m0), 52);
  assert.equal(Number(total.m1), 4);
  assert.equal(Number(total.m2), 3);
  c.closeSync();
});
test("side-by-side scopes each sheet independently", async () => {
  const c = await sideBySideDb();
  const rows = (
    await c.runAndReadAll(
      labSQL(sideBySide, { sales: "WHERE location='A'", new: "WHERE location='A'" }),
    )
  ).getRowObjectsJS();
  assert.ok(!rows.some((r) => r.d0 === "B" || r.d0 === "C"));
  c.closeSync();
});
test("measure filters work on single-sheet pivots and escape values", async () => {
  const c = await sideBySideDb();
  const single: LabSpec = {
    ...sideBySide,
    source: "new",
    sharedSheets: [],
    rows: [{ source: "new", column: "location" }],
    measures: [sideBySide.measures[2]],
  };
  const rows = (await c.runAndReadAll(labSQL(single))).getRowObjectsJS();
  assert.equal(Number(rows.find((r) => r.d0 === "A" && Number(r.gr) === 0)!.m0), 2);
  const tricky: LabSpec = {
    ...single,
    measures: [
      { ...single.measures[0], where: { column: "conversion", op: "=", values: ["x' OR 1=1 --"] } },
    ],
  };
  const t = (await c.runAndReadAll(labSQL(tricky))).getRowObjectsJS();
  assert.equal(Number(t.find((r) => Number(r.gr) === 1)!.m0), 0);
  c.closeSync();
});
test("side-by-side rejects unlinked sheets, relationships, merged tables and bad filters", () => {
  assert.throws(() =>
    labSQL({ ...sideBySide, sharedSheets: [] }),
  );
  assert.throws(() =>
    labSQL({
      ...sideBySide,
      relationships: [
        { id: "r", from: "sales", fromKey: "member_id", to: "new", toKey: "member_id", join: "LEFT" },
      ],
    }),
  );
  assert.throws(() => labSQL({ ...sideBySide, type: "Merged table" }));
  assert.throws(() =>
    labSQL({
      ...sideBySide,
      measures: [
        { ...sideBySide.measures[2], where: { column: "nope", op: "=", values: ["x"] } },
      ],
    }),
  );
  assert.throws(() =>
    labSQL({
      ...sideBySide,
      measures: [
        { ...sideBySide.measures[2], where: { column: "conversion", op: "=", values: [] } },
      ],
    }),
  );
});

import { sanitizeLabSpec, patchLabSpec } from "../src/data/data-lab";
const agentSpec = {
  title: "Sales and conversion by location",
  type: "Pivot table",
  source: "sales",
  rows: [{ source: "sales", column: "location" }],
  columns: [],
  sharedSheets: ["new"],
  measures: [
    { source: "sales", column: "revenue", aggregate: "SUM", label: "Revenue" },
    { source: "new", column: "member_id", aggregate: "COUNT", label: "New clients" },
  ],
  color: "#123abc",
  decimals: 1,
  format: "Currency",
  heat: true,
  totals: false,
  density: "Compact",
};
test("agent specs are completed, validated and styled within allowed values", () => {
  const s = sanitizeLabSpec(agentSpec);
  assert.ok(s.id && s.measures.every((m) => m.id));
  assert.equal(s.color, "#123abc");
  assert.equal(s.format, "Currency");
  assert.equal(s.heat, true);
  assert.equal(s.totals, false);
  assert.equal(s.density, "Compact");
  assert.doesNotThrow(() => labSQL(s));
  for (const bad of [
    { color: "red" },
    { decimals: 9 },
    { decimals: 1.5 },
    { format: "Euro" },
    { density: "Huge" },
    { type: "Sunburst" },
    { limit: 5000 },
    { valueMode: "Nonsense" },
    { sort: "UP" },
    { title: "x".repeat(201) },
  ])
    assert.throws(() => sanitizeLabSpec({ ...agentSpec, ...bad }), undefined, JSON.stringify(bad));
  assert.throws(() => sanitizeLabSpec({ ...agentSpec, source: "nope" }));
});
test("restyling patches keep configuration and reject invalid values", () => {
  const s = sanitizeLabSpec(agentSpec);
  const p = patchLabSpec(s, { color: "#abcdef", heat: false, title: "Renamed", decimals: 0 });
  assert.equal(p.id, s.id);
  assert.equal(p.color, "#abcdef");
  assert.equal(p.heat, false);
  assert.equal(p.title, "Renamed");
  assert.deepEqual(p.measures, s.measures);
  assert.throws(() => patchLabSpec(s, { color: "blue" }));
  assert.throws(() => patchLabSpec(s, { id: "other" }), /cannot be changed/);
  assert.throws(() => patchLabSpec(s, { bogus: 1 }), /Unknown/);
});
