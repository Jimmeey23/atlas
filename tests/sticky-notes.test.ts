import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
// @ts-ignore server module
import { stickyNoteRoutes, validateNote } from "../server/sticky-notes.mjs";
import { DuckDBInstance } from "@duckdb/node-api";
import { metrics } from "../src/semantics/metrics";
test("sticky notes validate placement and persist independent documents across gateway reloads", async () => {
  const docs = new Map<string, any>();
  const store = {
    read: async (k: string) => structuredClone(docs.get(k)),
    write: async (k: string, v: any) => {
      docs.set(k, structuredClone(v));
    },
  };
  const cloud = {
    from: () => ({
      select: () => ({
        like: async () => ({
          data: [...docs.keys()].map((key) => ({ key })),
          error: null,
        }),
      }),
    }),
  };
  const id = randomUUID(),
    note = {
      id,
      tab: 4,
      view: "performance",
      x: 0.5,
      y: 250,
      text: "Review the source rows",
      color: "mint",
      collapsed: false,
      title: "Review revenue",
      pinned: true,
      resolved: true,
      width: 320,
      height: 180,
      fontSize: 16,
      priority: "urgent",
      connections: [
        {
          id: randomUUID(),
          type: "arrow",
          target: {
            selector: '[data-note-anchor="metric-revenue"]',
            x: 0.4,
            y: 0.6,
            label: "Session revenue",
          },
        },
      ],
    };
  assert.throws(() => validateNote({ ...note, id: "../../secrets" }));
  assert.throws(() => validateNote({ ...note, text: "x".repeat(4001) }));
  assert.throws(() => validateNote({ ...note, x: -1 }));
  async function serve() {
    const app = express();
    app.use(express.json());
    stickyNoteRoutes(app, store, cloud);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    return {
      server,
      url: `http://127.0.0.1:${(server.address() as any).port}/api/sticky-notes`,
    };
  }
  let runtime = await serve();
  async function call(path = "", method = "GET", body?: unknown) {
    const response = await fetch(runtime.url + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }
  try {
    assert.equal((await call("/" + id, "PUT", note)).status, 200);
    runtime.server.closeAllConnections();
    await new Promise<void>((r) => runtime.server.close(() => r()));
    runtime = await serve();
    const restored = (await call()).data.notes[0];
    assert.equal(restored.text, note.text);
    assert.equal(restored.x, 0.5);
    assert.equal(restored.color, "mint");
    assert.equal(restored.width, 320);
    assert.equal(restored.height, 180);
    assert.equal(restored.title, "Review revenue");
    assert.equal(restored.pinned, true);
    assert.equal(restored.resolved, true);
    assert.deepEqual(restored.connections, note.connections);
    assert.throws(() =>
      validateNote({
        ...note,
        connections: [
          {
            ...note.connections[0],
            target: { ...note.connections[0].target, x: 2 },
          },
        ],
      }),
    );
    assert.equal(
      (await call("/" + id, "PUT", { ...note, tab: 16 })).status,
      400,
    );
    await call("/" + id, "DELETE");
    assert.deepEqual((await call()).data.notes, []);
  } finally {
    runtime.server.closeAllConnections();
    await new Promise<void>((r) => runtime.server.close(() => r()));
  }
});
test("late cancellation cards count affected sessions once and exclude imported booking value", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    const result = (
      await c.runAndReadAll(
        `SELECT ${metrics.late_affected_sessions.sql({ rate: 1200, today: "2026-10-07" })} AS affected,${metrics.late_recorded_value.sql({ rate: 1200, today: "2026-10-07" })} AS value FROM (VALUES ('s1',1,100,FALSE),('s1',1,200,FALSE),('s2',1,500,TRUE),('s3',0,1000,FALSE)) t(session_id,late_cancelled,revenue,imported), (SELECT NULL::VARCHAR AS unique_id1,NULL::VARCHAR AS unique_id2,'2026-10-01' AS date,'10:00' AS time,'Barre' AS format,'Studio' AS location)`,
      )
    ).getRowObjectsJS()[0];
    assert.equal(Number(result.affected), 2);
    assert.equal(Number(result.value), 300);
  } finally {
    c.closeSync();
    db.closeSync();
  }
});

import { noteRequest } from "../src/data/noteApi";
test("HTML API responses produce a recoverable notes message instead of a JSON parser failure", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response("<!DOCTYPE html><html>Atlas</html>", {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    await assert.rejects(
      () => noteRequest("/api/sticky-notes"),
      /notes API returned a page instead of JSON.*HTTP 404/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
