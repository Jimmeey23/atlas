import test from "node:test";
import assert from "node:assert/strict";
import {
  rankOperations,
  comparableInstructors,
  scheduleChanges,
} from "../src/data/studio-operations";
const base = {
  location: "Studio A",
  format: "Barre",
  day: "Monday",
  time: "09:00",
  sessions: 5,
  fill_rate: 0.6,
  instructor_roster: "A",
  capacity_per_session: 20,
};
test("operational rankings respect direction, minimum samples, nulls and disjoint sides", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    ...base,
    entity: String(i),
    late_cancel_rate: i / 100,
  }));
  const ranked = rankOperations(
    [
      ...rows,
      { ...base, entity: "missing", late_cancel_rate: null },
      { ...base, entity: "small", sessions: 1, late_cancel_rate: 0 },
    ],
    "late_cancel_rate",
    3,
    5,
  );
  assert.equal(ranked.top[0].entity, "0");
  assert.equal(ranked.bottom[0].entity, "11");
  assert.equal(ranked.eligible.length, 12);
  assert.ok(
    ranked.bottom.every((r) => !ranked.top.some((t) => r.entity === t.entity)),
  );
});
test("face-offs compare named instructors on the same exact studio and recurring slot", () => {
  const rows = [
    { ...base, trainer: "A" },
    { ...base, trainer: "B" },
    { ...base, time: "10:00", trainer: "A" },
    { ...base, location: "Studio B", trainer: "C" },
    { ...base, trainer: null },
  ];
  assert.deepEqual(
    comparableInstructors(rows, ["location", "format", "day", "time"]).map(
      (r) => r.trainer,
    ),
    ["A", "B"],
  );
});
test("schedule detects roster/capacity changes without treating simultaneous teachers as replacements", () => {
  const rows = [
    { ...base, month: "2026-01", instructor_roster: "A / B" },
    { ...base, month: "2026-02", instructor_roster: "A / B" },
    {
      ...base,
      month: "2026-03",
      instructor_roster: "A / C",
      capacity_per_session: 15,
    },
  ];
  const changes = scheduleChanges(rows);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, "Instructor roster + Capacity");
});
test("only unique day/time moves are paired; ambiguous disappearances remain unconfirmed", () => {
  const changes = scheduleChanges([
    { ...base, month: "2026-01" },
    { ...base, time: "10:00", month: "2026-02" },
  ]);
  assert.equal(changes[0].kind, "Possible time move");
  assert.match(changes[0].evidence, /inferred/);
  const ambiguous = scheduleChanges([
    { ...base, month: "2026-01" },
    { ...base, time: "10:00", month: "2026-02" },
    { ...base, time: "11:00", month: "2026-02" },
  ]);
  assert.equal(ambiguous.filter((c) => c.kind === "Newly observed").length, 2);
  assert.equal(
    ambiguous.filter((c) => c.kind === "No longer observed").length,
    1,
  );
});
test("missing calendar months are never interpreted as changes and null capacity is not measured zero", () => {
  assert.equal(
    scheduleChanges([
      { ...base, month: "2026-01" },
      { ...base, month: "2026-03", instructor_roster: "B" },
    ]).length,
    0,
  );
  assert.equal(
    scheduleChanges([
      { ...base, month: "2026-01", capacity_per_session: null },
      { ...base, month: "2026-02" },
    ]).length,
    0,
  );
});

import {
  referenceGroupings,
  referencePredicate,
  sessionDetailFields,
  referenceGroupPredicate,
} from "../src/data/class-intelligence-reference";
import { DuckDBInstance } from "@duckdb/node-api";
import { normalise, sqlTypes, type SourceData } from "../src/data/normalise";
import {
  operationViews,
  operationsSQL,
  operationsMonthlySQL,
  hostedPredicate,
} from "../src/data/studio-operations";
test("every operational view executes governed metrics; weighted fill and schedule aggregates reconcile", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    await c.run(
      `CREATE TABLE sessions (${Object.entries(sqlTypes)
        .map(([k, t]) => `"${k}" ${t}`)
        .join(",")})`,
    );
    await c.run(
      `INSERT INTO sessions (location,format,format_group,day,time,trainer,date,month,session_id,source_row,sessions,capacity,checked_in,booked,revenue,empty,late_cancelled,non_paid) VALUES ('A','Barre','Barre','Monday','09:00','One','2026-01-05','2026-01','s1',2,1,10,5,7,500,0,1,0),('A','Barre','Barre','Monday','09:00','Two','2026-01-12','2026-01','s2',3,1,30,30,30,3000,0,0,0),('A','Hosted Barre','Barre','Monday','10:00','One','2026-01-12','2026-01','s3',4,1,20,10,15,1000,0,0,0)`,
    );
    const ctx = { rate: 1200, today: "2026-10-07" };
    for (const view of Object.values(operationViews)) {
      const result = await c.runAndReadAll(
        operationsSQL("sessions", view.fields, ctx),
      );
      assert.ok(result.getRowObjectsJS().length > 0, view.label);
    }
    const result = await c.runAndReadAll(
      operationsSQL(
        `(SELECT * FROM sessions WHERE ${hostedPredicate})`,
        operationViews.classes.fields,
        ctx,
      ),
    );
    const row = result.getRowObjectsJS()[0];
    assert.equal(row.sessions, 2);
    assert.equal(row.attendance, 35);
    assert.equal(row.fill_rate, 0.875);
    assert.equal(row.avg_class_size_incl, 17.5);
    assert.equal(row.revenue_per_session, 1750);
    const month = await c.runAndReadAll(operationsMonthlySQL("sessions", ctx));
    const recurring = month
      .getRowObjectsJS()
      .find((r) => r.format === "Barre")!;
    assert.equal(recurring.instructor_roster, "One / Two");
    assert.equal(recurring.capacity_per_session, 20);
    assert.equal(recurring.fill_rate, 0.875);
  } finally {
    c.closeSync();
    db.closeSync();
  }
});

import {
  resolveOperationGroups,
  communityOperationsSQL,
} from "../src/data/studio-operations";
test("curated grouping combinations are distinct and custom fields remain safe and nonempty", () => {
  const curated = Object.entries(operationViews).filter(
    ([key]) => key !== "custom" && !(key in referenceGroupings),
  );
  assert.ok(curated.length >= 25);
  assert.equal(
    new Set(curated.map(([, view]) => JSON.stringify(view.fields))).size,
    curated.length,
  );
  curated.forEach(([, view]) =>
    view.fields.forEach((field) => assert.ok(field in sqlTypes)),
  );
  assert.deepEqual(
    resolveOperationGroups("custom", [
      "trainer",
      "trainer",
      "invalid",
      "location",
    ]),
    ["trainer", "location"],
  );
  assert.deepEqual(resolveOperationGroups("custom", []), [
    "location",
    "format",
  ]);
  assert.deepEqual(resolveOperationGroups("recurring", ["trainer"]), [
    "location",
    "format",
    "day",
    "time",
  ]);
});
test("community registers keep their source grain and support hiding all metric columns", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    await c.run(
      `CREATE TABLE checkins (location VARCHAR,member VARCHAR,member_id VARCHAR,attended BOOLEAN,revenue DOUBLE)`,
    );
    await c.run(
      `INSERT INTO checkins VALUES ('A','one','one',true,100),('A','one','one',true,200),('A','two','two',false,900)`,
    );
    const ctx = { rate: 1200, today: "2026-10-07" };
    const sql = communityOperationsSQL(
      "checkins",
      ["location", "member"],
      ["checkins", "unique_attendees", "checkin_revenue"],
      ctx,
    );
    const totals = (await c.runAndReadAll(sql.total)).getRowObjectsJS()[0];
    assert.equal(Number(totals.checkins), 2);
    assert.equal(Number(totals.unique_attendees), 1);
    assert.equal(totals.checkin_revenue, 300);
    const groups = (await c.runAndReadAll(sql.rows)).getRowObjectsJS();
    assert.ok(
      groups.some(
        (r) => r.g0 === "A" && r.g1 === "one" && r.checkin_revenue === 300,
      ),
    );
    const noMetrics = communityOperationsSQL("checkins", ["location"], [], ctx);
    assert.equal(
      (await c.runAndReadAll(noMetrics.total)).getRowObjectsJS()[0].n,
      3n,
    );
    await c.runAndReadAll(noMetrics.rows);
  } finally {
    c.closeSync();
    db.closeSync();
  }
});

test("legacy studio URLs and navigation actions resolve to the unified operations workspace", async () => {
  const keys = ["location", "localStorage", "document", "history"] as const;
  const originals = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  try {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL("http://localhost/?tab=9"),
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: () => null, setItem: () => {} },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { documentElement: { dataset: {} } },
    });
    let url = "";
    Object.defineProperty(globalThis, "history", {
      configurable: true,
      value: {
        replaceState: (_a: unknown, _b: unknown, value: string) => {
          url = value;
        },
      },
    });
    const { useStore, parentTab } = await import("../src/state/store");
    assert.equal(useStore.getState().tab, 1);
    for (const tab of [1, 2, 7, 9]) {
      assert.equal(parentTab(tab), 1);
      useStore.getState().set({ tab });
      assert.equal(useStore.getState().tab, 1);
      assert.match(url, /tab=1(?:&|$)/);
    }
    useStore.getState().set({ tab: 4 });
    assert.equal(useStore.getState().tab, 4);
  } finally {
    for (const key of keys) {
      const descriptor = originals.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("all reference grouping modes retain their original dimensions and band boundaries", async () => {
  assert.deepEqual(Object.keys(referenceGroupings), [
    "ClassDayTimeLocation",
    "ClassDayTimeLocationTrainer",
    "LocationClass",
    "ClassDay",
    "ClassTime",
    "ClassDayTrainer",
    "ClassTrainer",
    "DayTimeLocation",
    "DayTime",
    "TrainerLocation",
    "DayLocation",
    "TimeLocation",
    "ClassType",
    "TypeLocation",
    "TrainerDay",
    "ClassLocation",
    "TrainerTime",
    "AMSessions",
    "PMSessions",
    "MorningClasses",
    "EveningClasses",
    "Weekday",
    "Weekend",
    "Class",
    "Type",
    "Trainer",
    "Location",
    "Day",
    "Date",
    "Time",
    "SessionName",
  ]);
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    await c.run("CREATE TABLE bands (time VARCHAR,day VARCHAR)");
    await c.run(
      "INSERT INTO bands VALUES ('05:59','Monday'),('06:00','Tuesday'),('11:59','Friday'),('12:00','Saturday'),('17:00','Sunday'),('20:59','Monday'),('21:00','Tuesday'),(NULL,NULL)",
    );
    const expected = {
      AMSessions: 3,
      PMSessions: 4,
      MorningClasses: 2,
      EveningClasses: 2,
      Weekday: 5,
      Weekend: 2,
    };
    for (const [key, count] of Object.entries(expected)) {
      const rows = (
        await c.runAndReadAll(
          `SELECT COUNT(*) AS n FROM bands WHERE ${referencePredicate(key)}`,
        )
      ).getRowObjectsJS();
      assert.equal(Number(rows[0].n), count, key);
    }
  } finally {
    c.closeSync();
    db.closeSync();
  }
});

test("expanded children preserve individual source sessions and pooled totals exclude duplicate group rows", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    await c.run(
      `CREATE TABLE sessions (${Object.entries(sqlTypes)
        .map(([k, t]) => `"${k}" ${t}`)
        .join(",")})`,
    );
    await c.run(
      `INSERT INTO sessions (source_row,session_id,session_name,reference_class,class_type,location,format,day,time,date,trainer,sessions,capacity,checked_in,booked,revenue,empty,waitlisted) VALUES (2,'same','Barre with A','Barre','Signature','A','Barre','Monday','09:00','2026-01-05','One',1,10,5,7,500,0,NULL),(3,'same','Barre with B','Barre','Signature','A','Barre','Monday','09:00','2026-01-12','Two',1,30,30,30,3000,0,NULL)`,
    );
    const ctx = { rate: 1200, today: "2026-10-07" };
    const fields = referenceGroupings.ClassDayTimeLocation.fields;
    const group = (
      await c.runAndReadAll(operationsSQL("sessions", fields, ctx))
    ).getRowObjectsJS()[0];
    assert.equal(group.trainer, "Multiple Values");
    assert.equal(group.sessions, 2);
    assert.equal(group.fill_rate, 0.875);
    assert.equal(group.reference_waitlisted, null);
    const children = (
      await c.runAndReadAll(
        operationsSQL(
          `(SELECT * FROM sessions WHERE ${referenceGroupPredicate(group as any, fields)})`,
          sessionDetailFields,
          ctx,
        ),
      )
    ).getRowObjectsJS();
    assert.equal(
      children.length,
      2,
      "reused session IDs must not merge source rows",
    );
    assert.deepEqual(children.map((r) => r.trainer).sort(), ["One", "Two"]);
    assert.ok(children.every((r) => r.sessions === 1 && r.formats === "Barre"));
    assert.equal(
      children.reduce((n, r) => n + Number(r.attendance), 0),
      Number(group.attendance),
    );
    assert.equal(
      children.reduce((n, r) => n + Number(r.capacity), 0),
      Number(group.capacity),
    );
  } finally {
    c.closeSync();
    db.closeSync();
  }
});

import { scheduleWindow } from "../src/data/studio-operations";

test("hosted experiences recognize the class headers used by bookings and check-ins", () => {
  for (const [key, header] of [
    ["bookings", "Cleaned Class"],
    ["checkins", "SessionName"],
  ]) {
    const source: SourceData = {
      key,
      title: key,
      id: key,
      columns: [header],
      rows: [["Hosted Partnership Barre"], ["Signature Barre"]],
      status: "ready",
      fetchedAt: null,
      loadMs: 0,
    };
    assert.deepEqual(
      normalise(source, false).rows.map((row) => row.session_type),
      ["Hosted", "Regular"],
    );
  }
});
import { tree } from "../src/data/hierarchy";
test("single-month schedule scope automatically includes the preceding calendar month", () => {
  assert.deepEqual(
    scheduleWindow({ from: "2026-01-15", to: "2026-01-31", location: ["A"] }),
    { from: "2025-12-01", to: "2026-01-31", location: ["A"] },
  );
  assert.deepEqual(scheduleWindow({ from: "2024-03-31", to: "2024-03-31" }), {
    from: "2024-02-01",
    to: "2024-03-31",
  });
  assert.deepEqual(scheduleWindow({ from: "", to: "" }), { from: "", to: "" });
});
test("community rollups populate member and class roots with complete expandable details and source totals", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    await c.run(
      "CREATE TABLE checkins (member VARCHAR,format VARCHAR,trainer VARCHAR,member_id VARCHAR,attended BOOLEAN,revenue DOUBLE)",
    );
    await c.run(
      "INSERT INTO checkins VALUES ('Member A','Barre','One','a',true,100),('Member A','Barre','Two','a',true,200),('Member B','Cycle','One','b',true,300)",
    );
    const sql = communityOperationsSQL(
      "checkins",
      ["member", "format", "trainer"],
      ["checkins", "unique_attendees", "checkin_revenue"],
      { rate: 1200, today: "2026-10-07" },
    );
    const rows = (await c.runAndReadAll(sql.rows)).getRowObjectsJS();
    const hierarchy = tree(rows as any, ["member", "format", "trainer"]);
    assert.equal(hierarchy.length, 2);
    assert.equal(
      hierarchy.find((r) => r.label === "Member A")!.children[0].children
        .length,
      2,
    );
    assert.equal(
      hierarchy.find((r) => r.label === "Member A")!.values.checkin_revenue,
      300,
    );
    const total = (await c.runAndReadAll(sql.total)).getRowObjectsJS()[0];
    assert.equal(Number(total.unique_attendees), 2);
    assert.equal(total.checkin_revenue, 600);
  } finally {
    c.closeSync();
    db.closeSync();
  }
});
