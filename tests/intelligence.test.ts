import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
// @ts-ignore Server route is JavaScript; shared normalization is TypeScript.
import { intelligenceRoutes, validateSQL } from "../server/intelligence.mjs";
test("agent refuses writes, file reads, environmental access", () => {
  for (const sql of [
    "DELETE FROM sales",
    "SELECT * FROM '/etc/passwd'",
    "SELECT * FROM read_json('/etc/passwd')",
    "SELECT getenv('OPENAI_API_KEY')",
  ])
    assert.throws(() => validateSQL(sql));
  assert.equal(validateSQL("SELECT 1; SELECT 2;"), "SELECT 1; SELECT 2");
  assert.equal(
    validateSQL("SELECT COUNT(*) FROM sales"),
    "SELECT COUNT(*) FROM sales",
  );
});
test("analytical SQL accepts comments, trailing delimiters and keywords inside values", () => {
  assert.equal(validateSQL("-- Monthly analysis\nSELECT 'update; delete -- label' AS metric FROM sales;"), "SELECT 'update; delete -- label' AS metric FROM sales");
  assert.equal(validateSQL("WITH totals AS (SELECT month, SUM(revenue) revenue FROM sales GROUP BY month) /* chart */ SELECT * FROM totals;"), "WITH totals AS (SELECT month, SUM(revenue) revenue FROM sales GROUP BY month)   SELECT * FROM totals");
  assert.throws(() => validateSQL("SELECT 1; /* comment */ DELETE FROM sales"));
  assert.throws(() => validateSQL("WITH t AS (DELETE FROM sales RETURNING *) SELECT * FROM t"));
});
test("agent queries real raw fields with global filters and reports missing configuration", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "p57-agent-"));
  await mkdir(path.join(root, ".cache"));
  const columns = [
    "Member ID",
    "Late Cancelled",
    "Session Date",
    "Location",
    "Attended",
  ];
  await writeFile(
    path.join(root, ".cache/bookings.json"),
    JSON.stringify({
      key: "bookings",
      columns,
      rows: [
        ["1", true, "2026-09-01", "Kemps Corner", false],
        ["2", false, "2026-09-02", "Kenkere House", true],
      ],
      fetchedAt: 1791000000000,
    }),
  );
  const app = express();
  app.use(express.json());
  intelligenceRoutes(app, root, [{ key: "bookings", columns }]);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const q = async (sql: string, filters: any = {}) => {
      const response = await fetch(url + "/api/intelligence/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, filters }),
      });
      return { response, body: (await response.json()) as any };
    };
    const result = await q('SELECT "Late Cancelled" FROM scoped_raw_bookings', {
      location: ["Kwality House, Kemps Corner"],
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.rows.length, 1);
    assert.equal(result.body.rows[0]["Late Cancelled"], true);
    const multi = await q("-- first result\nSELECT COUNT(*) AS n FROM bookings; /* final element */ SELECT 'update; from unknown' AS label, SUM(late_cancelled) AS late FROM bookings;");
    assert.equal(multi.response.status, 200, JSON.stringify(multi.body));
    assert.equal(multi.body.resultSets.length, 2);
    assert.equal(Number(multi.body.resultSets[0][0].n), 2);
    assert.equal(Number(multi.body.rows[0].late), 1);
    assert.equal(multi.body.rows[0].label, 'update; from unknown');
    const values = Array.from({length: 501}, (_, i) => `(${i})`).join(',');
    const bounded = await q(`WITH v(i) AS (VALUES ${values}) SELECT i FROM v`);
    assert.equal(bounded.response.status, 200, JSON.stringify(bounded.body));
    assert.equal(bounded.body.rows.length, 500);
    assert.equal(bounded.body.truncated, true);
    assert.match(bounded.body.limitation, /incomplete/);
    const complete = await q(`WITH v(i) AS (VALUES ${values}) SELECT i FROM v LIMIT 500`);
    assert.equal(complete.body.truncated, false);
    const blocked = await q("SELECT * FROM facts_bookings");
    assert.equal(blocked.response.status, 400);
    const dates = await q("SELECT COUNT(*) AS n FROM bookings", {
      from: "2026-10-01",
    });
    assert.equal(Number(dates.body.rows[0].n), 0);
    const late = await q("SELECT COUNT(*) AS n FROM bookings", {
      lateOnly: true,
    });
    assert.equal(Number(late.body.rows[0].n), 1);
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    await rm(root, { recursive: true, force: true });
  }
});

test("GPT tool loop queries real fixtures and persists requested elements and conversation through the database adapter", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "p57-agent-loop-"));
  await mkdir(path.join(root, ".cache"));
  const columns = [
    "Member ID",
    "Late Cancelled",
    "Session Date",
    "Location",
    "Attended",
  ];
  await writeFile(
    path.join(root, ".cache/bookings.json"),
    JSON.stringify({
      key: "bookings",
      columns,
      rows: [["1", true, "2026-09-01", "Kemps Corner", false]],
      fetchedAt: 1791000000000,
    }),
  );
  const documents: any[] = [];
  const db = {
    from: () => {
      const filters: any[] = [];
      let write: any;
      return {
        select() {
          return this;
        },
        eq(key: string, value: any) {
          filters.push([key, value]);
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        upsert(value: any) {
          write = { ...value, id: value.id || crypto.randomUUID() };
          const index = documents.findIndex((d) => d.id === write.id);
          if (index >= 0) documents[index] = write;
          else documents.push(write);
          return this;
        },
        async single() {
          return {
            data:
              write ||
              documents.find((d) => filters.every(([k, v]) => d[k] === v)),
            error: null,
          };
        },
        then(resolve: any, reject: any) {
          return Promise.resolve({
            data: documents.filter((d) =>
              filters.every(([k, v]) => d[k] === v),
            ),
            error: null,
          }).then(resolve, reject);
        },
      };
    },
  };
  let steps = 0;
  const calls: any[] = [];
  const ai = {
    responses: {
      create: async (request: any) => {
        calls.push(structuredClone(request));
        if (steps++ === 0)
          return {
            output: [
              {
                type: "function_call",
                name: "query_studio",
                call_id: "query-1",
                arguments: JSON.stringify({
                  sql: "SELECT COUNT(*) AS total FROM bookings",
                }),
              },
            ],
          };
        if (steps === 2)
          return {
            output: [
              {
                type: "function_call",
                name: "save_element",
                call_id: "save-1",
                arguments: JSON.stringify({
                  kind: "artifact",
                  title: "Late cancellation members",
                  page: 12,
                  body_json: JSON.stringify({
                    type: "table",
                    sql: "SELECT member_id,late_cancelled FROM bookings",
                  }),
                }),
              },
            ],
          };
        return {
          output: [],
          output_text:
            "One booking is present in the scoped source. The requested table is saved.",
        };
      },
    },
  };
  const app = express();
  app.use(express.json());
  intelligenceRoutes(app, root, [{ key: "bookings", columns }], undefined, {
    db,
    ai,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const response = await fetch(url + "/api/intelligence/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Create and save the late cancellation members table for September 2026",
        page: 12,
        filters: { from:"2026-10-01", to:"2026-10-31", location: ["Kwality House, Kemps Corner"] },
      }),
    });
    const result: any = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(steps, 3);
    assert.equal(documents.find(d => d.kind === "artifact").body.pinnedScope.from,"2026-09-01");
    // One query is not enough to understand a build request: the agent keeps its tools free
    // to explore and correct, and is only forced to save near the step limit.
    assert.equal(calls[1].tool_choice, "required");
    assert.match(calls[0].instructions, /BUILD MODE/);
    assert.equal(result.saved.length, 1);
    assert.equal(documents.find((d) => d.kind === "artifact").page, 12);
    assert.equal(
      documents.find((d) => d.kind === "conversation").body.messages.length,
      2,
    );
    assert.ok(
      calls[1].input.some(
        (i: any) =>
          i.type === "function_call_output" &&
          JSON.parse(i.output).rows[0].total === "1",
      ),
    );
    assert.equal(result.evidence[0].provenance[0].rows, 1);
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    await rm(root, { recursive: true, force: true });
  }
});

test("build rejects an element whose fields are not in its query result, then saves the corrected advanced element", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "p57-agent-loop-"));
  await mkdir(path.join(root, ".cache"));
  const columns = [
    "Member ID",
    "Late Cancelled",
    "Session Date",
    "Location",
    "Attended",
  ];
  await writeFile(
    path.join(root, ".cache/bookings.json"),
    JSON.stringify({
      key: "bookings",
      columns,
      rows: [["1", true, "2026-09-01", "Kemps Corner", false]],
      fetchedAt: 1791000000000,
    }),
  );
  const documents: any[] = [];
  const db = {
    from: () => {
      const filters: any[] = [];
      let write: any;
      return {
        select() {
          return this;
        },
        eq(key: string, value: any) {
          filters.push([key, value]);
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        upsert(value: any) {
          write = { ...value, id: value.id || crypto.randomUUID() };
          const index = documents.findIndex((d) => d.id === write.id);
          if (index >= 0) documents[index] = write;
          else documents.push(write);
          return this;
        },
        async single() {
          return {
            data:
              write ||
              documents.find((d) => filters.every(([k, v]) => d[k] === v)),
            error: null,
          };
        },
        then(resolve: any, reject: any) {
          return Promise.resolve({
            data: documents.filter((d) =>
              filters.every(([k, v]) => d[k] === v),
            ),
            error: null,
          }).then(resolve, reject);
        },
      };
    },
  };
  let steps = 0;
  const calls: any[] = [];
  const save = (id: string, body: object) => ({
    output: [{ type: "function_call", name: "save_element", call_id: id, arguments: JSON.stringify({ kind: "artifact", title: "Bookings vs attended by studio", page: 12, body_json: JSON.stringify(body) }) }],
  });
  const sql = "SELECT location, COUNT(*) AS bookings, COUNT(*) FILTER (WHERE attended) AS attended FROM bookings GROUP BY location";
  const ai = {
    responses: {
      create: async (request: any) => {
        calls.push(structuredClone(request));
        steps++;
        if (steps === 1) return save("bad", { type: "combo", sql, x: "location", series: ["bookings"], y2: ["attendance_rate"] });
        if (steps === 2) return save("good", { type: "combo", sql, x: "location", series: ["bookings"], y2: ["attended"] });
        return { output: [], output_text: "Saved." };
      },
    },
  };
  const app = express();
  app.use(express.json());
  intelligenceRoutes(app, root, [{ key: "bookings", columns }], undefined, {
    db,
    ai,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const response = await fetch(url + "/api/intelligence/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Create and save bookings against attended by studio for September 2026",
        page: 12,
        filters: { from:"2026-10-01", to:"2026-10-31", location: ["Kwality House, Kemps Corner"] },
      }),
    });
    const result: any = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    const rejection = calls[1].input.find((i: any) => i.type === "function_call_output" && i.call_id === "bad");
    assert.match(JSON.parse(rejection.output).error, /"attendance_rate" is not a column of the query result\. Result columns: location, bookings, attended/);
    const artifacts = documents.filter((d) => d.kind === "artifact");
    assert.equal(artifacts.length, 1);
    assert.deepEqual(artifacts[0].body.y2, ["attended"]);
    assert.equal(result.saved.length, 1);
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    await rm(root, { recursive: true, force: true });
  }
});

test("build saves a styled Data Lab element through the agent, rejects bad styling, and restyles only agent-created elements", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "p57-agent-loop-"));
  await mkdir(path.join(root, ".cache"));
  const columns = [
    "Member ID",
    "Late Cancelled",
    "Session Date",
    "Location",
    "Attended",
  ];
  await writeFile(
    path.join(root, ".cache/bookings.json"),
    JSON.stringify({
      key: "bookings",
      columns,
      rows: [["1", true, "2026-09-01", "Kemps Corner", false]],
      fetchedAt: 1791000000000,
    }),
  );
  const documents: any[] = [];
  const db = {
    from: () => {
      const filters: any[] = [];
      let write: any;
      return {
        select() {
          return this;
        },
        eq(key: string, value: any) {
          filters.push([key, value]);
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        upsert(value: any) {
          write = { ...value, id: value.id || crypto.randomUUID() };
          const index = documents.findIndex((d) => d.id === write.id);
          if (index >= 0) documents[index] = write;
          else documents.push(write);
          return this;
        },
        async single() {
          return {
            data:
              write ||
              documents.find((d) => filters.every(([k, v]) => d[k] === v)),
            error: null,
          };
        },
        then(resolve: any, reject: any) {
          return Promise.resolve({
            data: documents.filter((d) =>
              filters.every(([k, v]) => d[k] === v),
            ),
            error: null,
          }).then(resolve, reject);
        },
      };
    },
  };
  let steps = 0;
  const calls: any[] = [];
  const lab = (id: string, name: string, args: object) => ({
    output: [{ type: "function_call", name, call_id: id, arguments: JSON.stringify(args) }],
  });
  const spec = {
    title: "Bookings by studio",
    type: "Pivot table",
    source: "bookings",
    rows: [{ source: "bookings", column: "location" }],
    columns: [],
    measures: [
      { source: "bookings", column: "member_id", aggregate: "COUNT", label: "Bookings" },
      { source: "bookings", column: "location", aggregate: "COUNT", label: "Attended", where: { column: "attended", op: "=", values: ["true"] } },
    ],
    color: "#2f6f5e",
    decimals: 0,
    heat: true,
  };
  let savedId = "";
  const ai = {
    responses: {
      create: async (request: any) => {
        calls.push(structuredClone(request));
        steps++;
        if (steps === 1) return lab("bad", "save_lab_element", { title: "Bookings by studio", page: 12, spec_json: JSON.stringify({ ...spec, color: "green" }) });
        if (steps === 2) return lab("good", "save_lab_element", { title: "Bookings by studio", page: 12, spec_json: JSON.stringify(spec) });
        if (steps === 3) {
          savedId = documents.find((d) => d.kind === "artifact")!.id;
          return lab("restyle", "update_lab_element", { id: savedId, patch_json: JSON.stringify({ color: "#7a3b8f", format: "Percent", density: "Compact" }) });
        }
        if (steps === 4) {
          documents.push({ id: "mine", kind: "artifact", title: "Hand made", page: 12, body: { type: "lab", spec: {}, } });
          return lab("foreign", "update_lab_element", { id: "mine", patch_json: JSON.stringify({ color: "#000000" }) });
        }
        return { output: [], output_text: "Saved." };
      },
    },
  };
  const app = express();
  app.use(express.json());
  intelligenceRoutes(app, root, [{ key: "bookings", columns }], undefined, {
    db,
    ai,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const response = await fetch(url + "/api/intelligence/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Create and save bookings against attended by studio for September 2026",
        page: 12,
        filters: { from:"2026-10-01", to:"2026-10-31", location: ["Kwality House, Kemps Corner"] },
      }),
    });
    const result: any = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    const out = (id: string) => JSON.parse(calls.flatMap((c) => c.input).find((i: any) => i.type === "function_call_output" && i.call_id === id).output);
    assert.match(out("bad").error, /color/i);
    assert.equal(out("good").saved ?? out("good").id !== undefined, true);
    const doc = documents.find((d) => d.id === savedId)!;
    assert.equal(doc.body.type, "lab");
    assert.equal(doc.body.spec.color, "#7a3b8f");
    assert.equal(doc.body.spec.format, "Percent");
    assert.equal(doc.body.spec.density, "Compact");
    assert.equal(doc.body.spec.heat, true);
    assert.equal(doc.body.generatedBy !== undefined, true);
    assert.equal(documents.filter((d) => d.kind === "artifact" && d.id !== "mine").length, 1);
    assert.match(out("foreign").error, /created by the agent/i);
    assert.equal(documents.find((d) => d.id === "mine")!.body.spec.color, undefined);
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    await rm(root, { recursive: true, force: true });
  }
});

test("build holds the agent to the requested table form and a date-independent MoM history", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "p57-agent-loop-"));
  await mkdir(path.join(root, ".cache"));
  const columns = [
    "Member ID",
    "Late Cancelled",
    "Session Date",
    "Location",
    "Attended",
  ];
  await writeFile(
    path.join(root, ".cache/bookings.json"),
    JSON.stringify({
      key: "bookings",
      columns,
      rows: [["1", true, "2026-09-01", "Kemps Corner", false]],
      fetchedAt: 1791000000000,
    }),
  );
  const documents: any[] = [];
  const db = {
    from: () => {
      const filters: any[] = [];
      let write: any;
      return {
        select() {
          return this;
        },
        eq(key: string, value: any) {
          filters.push([key, value]);
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        upsert(value: any) {
          write = { ...value, id: value.id || crypto.randomUUID() };
          const index = documents.findIndex((d) => d.id === write.id);
          if (index >= 0) documents[index] = write;
          else documents.push(write);
          return this;
        },
        async single() {
          return {
            data:
              write ||
              documents.find((d) => filters.every(([k, v]) => d[k] === v)),
            error: null,
          };
        },
        then(resolve: any, reject: any) {
          return Promise.resolve({
            data: documents.filter((d) =>
              filters.every(([k, v]) => d[k] === v),
            ),
            error: null,
          }).then(resolve, reject);
        },
      };
    },
  };
  let steps = 0;
  const calls: any[] = [];
  const save = (id: string, body: object) => ({
    output: [{ type: "function_call", name: "save_element", call_id: id, arguments: JSON.stringify({ kind: "artifact", title: "Avg spend per member, MoM", page: 4, body_json: JSON.stringify(body) }) }],
  });
  const sql = "SELECT strftime(CAST(date AS DATE), '%Y-%m') AS month, COUNT(*) AS bookings FROM bookings GROUP BY 1 ORDER BY 1";
  const ai = {
    responses: {
      create: async (request: any) => {
        calls.push(structuredClone(request));
        steps++;
        if (steps === 1) return save("chart", { type: "bar", sql, x: "month", series: ["bookings"] });
        if (steps === 2) return save("dated", { type: "table", sql });
        if (steps === 3) return save("good", { type: "table", sql, ignoreDates: true });
        return { output: [], output_text: "Saved." };
      },
    },
  };
  const app = express();
  app.use(express.json());
  intelligenceRoutes(app, root, [{ key: "bookings", columns }], undefined, {
    db,
    ai,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const response = await fetch(url + "/api/intelligence/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Build a MoM table of bookings per member, not affected by the date filters of the tab",
        page: 4,
        filters: { from:"2026-09-01", to:"2026-09-30", location: ["Kwality House, Kemps Corner"] },
      }),
    });
    const result: any = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    const error = (id: string) => JSON.parse(calls.at(-1).input.find((i: any) => i.type === "function_call_output" && i.call_id === id).output).error;
    assert.match(error("chart"), /asked for a table.*"bar"/);
    assert.match(error("dated"), /ignoreDates/);
    const artifacts = documents.filter((d) => d.kind === "artifact");
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].body.ignoreDates, true);
    assert.equal(artifacts[0].body.pinnedScope?.from, undefined);
    assert.equal(artifacts[0].body.pinnedScope?.to, undefined);
    // Verified over every month, not just the page's September.
    assert.equal(result.evidence.at(-1).filters.from, undefined);
    assert.match(calls[0].instructions, /ignoreDates/);
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    await rm(root, { recursive: true, force: true });
  }
});

test("ask streams progress, re-checks unmatched figures once and returns a structured presentation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "p57-agent-present-"));
  await mkdir(path.join(root, ".cache"));
  const columns = ["Member ID", "Late Cancelled", "Session Date", "Location", "Attended"];
  await writeFile(
    path.join(root, ".cache/bookings.json"),
    JSON.stringify({ key: "bookings", columns, rows: [["1", true, "2026-09-01", "Kemps Corner", false], ["2", false, "2026-09-02", "Kemps Corner", true], ["3", false, "2026-09-03", "Kemps Corner", true]], fetchedAt: 1791000000000 }),
  );
  const calls: any[] = [];
  const present = (headline: string) => ({
    type: "function_call", name: "present_answer", call_id: "p" + calls.length,
    arguments: JSON.stringify({
      headline, answer: "Late cancellations were **1** of 3 bookings.",
      highlights: [{ label: "Bookings", value: "3", change: null, tone: "neutral" }],
      chart: { type: "bar", title: "Bookings", evidence: 0, x: "location", series: ["total"] },
      table_evidence: 7, caveats: ["Small sample."], follow_ups: ["Same for Bandra", "Show by instructor"],
      actions: [{ type: "open_tab", label: "Open late cancellations", tab: 12, compare: null, prompt: null, evidence: null, scope_json: null }],
    }),
  });
  const ai = { responses: { create: async (request: any) => {
    calls.push(structuredClone(request));
    if (calls.length === 1) return { output: [{ type: "function_call", name: "query_studio", call_id: "q1", arguments: JSON.stringify({ sql: "SELECT location, COUNT(*) AS total FROM bookings GROUP BY 1", scope_json: null }) }] };
    if (calls.length === 2) return { output: [present("Kemps had 3 bookings, 48 of them late.")] };
    return { output: [present("Kemps had 3 bookings in September.")] };
  } } };
  const app = express();
  app.use(express.json());
  intelligenceRoutes(app, root, [{ key: "bookings", columns }], undefined, { db: null, ai });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const response = await fetch(url + "/api/intelligence/ask", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "how many bookings at kemps in sept 2026", stream: true, filters: {} }),
    });
    const lines = (await response.text()).trim().split("\n").map((l) => JSON.parse(l));
    const final = lines.at(-1);
    assert.equal(final.type, "result", JSON.stringify(final));
    assert.ok(lines.filter((l) => l.type === "progress").some((l) => /custom query/.test(l.text)));
    assert.ok(lines.some((l) => l.type === "progress" && /Re-checking 1 figure/.test(l.text)));
    // The first present_answer claimed "48", which no result supports, so it was sent back once.
    assert.equal(calls.length, 3);
    assert.match(JSON.parse(calls[2].input.at(-1).output).error, /48/);
    assert.equal(calls[1].tool_choice, "required");
    const p = final.result.presentation;
    assert.equal(p.headline, "Kemps had 3 bookings in September.");
    assert.equal(p.chart.type, "bar");
    assert.equal(p.table_evidence, null); // out-of-range evidence index dropped
    assert.deepEqual(p.follow_ups, ["Same for Bandra", "Show by instructor"]);
    assert.match(final.result.answer, /^Kemps had 3 bookings in September\.\n\nLate cancellations/);
    assert.equal(final.result.evidence[0].result[0].total, "3");
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    await rm(root, { recursive: true, force: true });
  }
});
