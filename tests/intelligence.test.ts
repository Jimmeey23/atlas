import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
// @ts-ignore Server route is JavaScript; shared normalization is TypeScript.
import { intelligenceRoutes, validateSQL } from "../server/intelligence.mjs";
test("agent refuses writes, file reads, environmental access and multi-statements", () => {
  for (const sql of [
    "DELETE FROM sales",
    "SELECT * FROM read_json('/etc/passwd')",
    "SELECT getenv('OPENAI_API_KEY')",
    "SELECT 1; SELECT 2",
    "SELECT * FROM sales -- bypass",
  ])
    assert.throws(() => validateSQL(sql));
  assert.equal(
    validateSQL("SELECT COUNT(*) FROM sales"),
    "SELECT COUNT(*) FROM sales",
  );
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
    assert.equal(calls[1].tool_choice.name,"save_element");
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
