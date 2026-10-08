import test from "node:test";
import assert from "node:assert/strict";
import { parseCSV, publicSheet, missingColumns, snapshotsToPrune } from "../server/sheets-public.mjs";

const source = { key: "lapsed", title: "Lapsed", id: "book", gid: "0", columns: ["Member Id", "Total Sessions Completed", "Total Sessions"] };
const csvResponse = (body: string, type = "text/csv") => ({ ok: true, status: 200, headers: new Headers({ "content-type": type }), text: async () => body });

test("CSV parsing keeps quoted commas, doubled quotes, embedded newlines and CRLF", () => {
  assert.deepEqual(parseCSV('a,b\r\n"x, y","say ""hi"""\r\n"line\nbreak",\r\n'), [["a", "b"], ["x, y", 'say "hi"'], ["line\nbreak", ""]]);
});

test("public reads keep minority-type cells that gviz blanked", async () => {
  // Mostly numeric with a text value: gviz typed the column and dropped values like these.
  const body = "Member Id,Total Sessions Completed\n1,8\n2,None\n3,12\n,\n,\n";
  const result = await publicSheet(source, { titles: ["Lapsed"], request: async () => csvResponse(body) as any });
  assert.deepEqual(result.rows, [["1", "8"], ["2", "None"], ["3", "12"]], "trailing blank rows dropped, values kept");
  assert.match(result.mode, /CSV/);
});

test("public reads reject a missing tab, a private workbook and a schema mismatch", async () => {
  await assert.rejects(() => publicSheet(source, { titles: ["Other"], request: async () => csvResponse("") as any }), /Tab 'Lapsed' missing/);
  await assert.rejects(() => publicSheet(source, { titles: ["Lapsed"], request: async () => csvResponse("<html>", "text/html; charset=utf-8") as any }), /not publicly readable/);
  await assert.rejects(() => publicSheet(source, { titles: ["Lapsed"], request: async () => csvResponse("Member Id\n1\n") as any }), /Schema mismatch.*Total Sessions Completed/);
});

test("optional columns never flag a healthy source as a warning", () => {
  assert.deepEqual(missingColumns(source, ["Member Id", "Total Sessions Completed"]), []);
  assert.deepEqual(missingColumns({ ...source, key: "sessions" }, ["Member Id", "Total Sessions Completed"]), ["Total Sessions"]);
});

test("snapshot retention keeps the newest versions of one source only", () => {
  const files = ["sales-100.json", "sales-300.json", "sales-200.json", "sales_x-1.json", "sessions-50.json"];
  assert.deepEqual(snapshotsToPrune(files, "sales", 2), ["sales-100.json"]);
});

test("the freshness probe is routed before the per-source endpoint", async () => {
  // No cloud store or Google credentials: the probe must answer from local state only.
  Object.assign(process.env, { SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", GOOGLE_CREDENTIALS_JSON: "", GOOGLE_APPLICATION_CREDENTIALS: "", GOOGLE_CLIENT_ID: "" });
  const { createApp } = await import("../server/app.mjs");
  const app = await createApp();
  const server = app.listen(0);
  try {
    const { port } = server.address() as any;
    const response = await fetch(`http://127.0.0.1:${port}/api/sheets/freshness`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(Array.isArray(body.sources) && body.sources.some((s: any) => s.key === "sessions"));
  } finally {
    server.close();
  }
});
