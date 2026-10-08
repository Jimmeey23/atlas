import test from "node:test";
import assert from "node:assert/strict";
import { authenticatedSheet } from "../server/sheets-auth.mjs";
import { fmt } from "../src/semantics/formats";

test("revenue uses one decimal only with L / Cr and whole rupees in full", () => {
  assert.equal(fmt("revenue", 1234567.89), "₹12.3L");
  assert.equal(fmt("revenue", 12345678.91), "₹1.2Cr");
  assert.equal(fmt("revenue", 1234.89, true), "₹1,235");
  assert.equal(fmt("revenue", 11255.5), "₹11,256");
  assert.equal(fmt("revenue", 1200, true), "₹1,200");
  assert.equal(fmt("revenue", null), "—");
});
test("authenticated fallback verifies the tab and preserves item-level values", async () => {
  const calls: string[] = [];
  const result = await authenticatedSheet({id: "workbook", title: "Sales"}, new Error("Public HTTP 403"), {}, async (url, options) => {
    calls.push(String(url));
    assert.equal(options.headers.Authorization, "Bearer test-token");
    return {ok: true, json: async () => calls.length === 1 ? {sheets: [{properties: {title: "Sales"}}]} : {values: [["Item", "Revenue"], ["Membership", "₹1,234.89"]]}};
  }, {getRequestHeaders: async () => ({Authorization: "Bearer test-token"})});
  assert.deepEqual(result.columns, ["Item", "Revenue"]);
  assert.deepEqual(result.rows, [["Membership", "₹1,234.89"]]);
  assert.match(result.mode, /OAuth fallback/);
  assert.match(calls[1], /FORMATTED_VALUE/);
});
test("fallback reports missing credentials without substituting fabricated data", async () => {
  await assert.rejects(() => authenticatedSheet({id: "x", title: "Sales"}, new Error("Public HTTP 403"), {}), /Public HTTP 403.*GOOGLE_CLIENT_ID/);
});
test("fallback rejects a missing tab rather than reading the default tab", async () => {
  await assert.rejects(() => authenticatedSheet({id: "x", title: "Sales"}, new Error("Public HTTP 403"), {}, async () => ({ok: true, json: async () => ({sheets: [{properties: {title: "Other"}}]})}), {getRequestHeaders: async () => ({})}), /Tab 'Sales' missing/);
});
