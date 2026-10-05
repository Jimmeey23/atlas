import { test } from "node:test";
import assert from "node:assert/strict";
import { metrics } from "../src/semantics/metrics.ts";
import { fmt } from "../src/semantics/formats.ts";
test("class size and intro count rates display as counts per session", () => {
  assert.equal(fmt("avg_class_size_incl", 5.4), "5.4");
  assert.equal(metrics.intro_penetration.format, "decimal");
});
