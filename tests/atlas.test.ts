import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { relativePeriod } from "../src/data/periods";
import { renewalCohortSQL } from "../src/data/renewals";
// @ts-ignore Server helper is JavaScript.
import { credentialStore } from "../server/credentials.mjs";
test("relative periods use Monday weeks and handle year boundaries", () => {
  assert.deepEqual(relativePeriod("Last month", "2026-01-05"), {
    from: "2025-12-01",
    to: "2025-12-31",
  });
  assert.deepEqual(relativePeriod("This week", "2026-10-05"), {
    from: "2026-10-05",
    to: "2026-10-05",
  });
  assert.deepEqual(relativePeriod("Last week", "2026-10-05"), {
    from: "2026-09-28",
    to: "2026-10-04",
  });
  assert.deepEqual(relativePeriod("Last quarter", "2026-10-05"), {
    from: "2026-07-01",
    to: "2026-09-30",
  });
});
test("UI credentials remain encrypted, private and recover after a server restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-credentials-"));
  try {
    const store = credentialStore(root);
    const fake = "sk-test-fixture-not-a-real-key";
    await store.save({ apiKey: fake, model: "gpt-4.1" });
    const file = path.join(root, ".atlas/provider.enc");
    assert.equal((await readFile(file, "utf8")).includes(fake), false);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal((await credentialStore(root).read()).apiKey, fake);
    await store.save({ apiKey: "", model: "gpt-4.1" });
    assert.equal((await credentialStore(root).read()).apiKey, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("renewal cohorts use expiry month instead of purchase month and have exhaustive outcomes", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const c = await instance.connect();
  try {
    await c.run(
      "CREATE TABLE lapsed(member_id VARCHAR,revenue DOUBLE,end_date VARCHAR,start_date VARCHAR,session_limit DOUBLE,product VARCHAR,month VARCHAR,source_row INTEGER)",
    );
    await c.run(
      "INSERT INTO lapsed VALUES ('renewed',1000,'2026-08-31','2026-08-01',10,'10 pack','2026-07',2),('renewed',1000,'2026-09-30','2026-09-01',10,'10 pack','2026-08',3),('lapsed',1000,'2026-08-31','2026-08-01',10,'10 pack','2026-07',4),('grace',1000,'2026-09-30','2026-09-01',10,'10 pack','2026-08',5),('upcoming',1000,'2026-10-31','2026-10-01',10,'10 pack','2026-09',6),('free',0,'2026-08-31','2026-08-01',10,'Complimentary','2026-07',7)",
    );
    // Lapsed needs a recorded Churned Date; amount_paid drives paid eligibility.
    await c.run("ALTER TABLE lapsed ADD COLUMN amount_paid DOUBLE; ALTER TABLE lapsed ADD COLUMN status VARCHAR; ALTER TABLE lapsed ADD COLUMN churned_date VARCHAR");
    await c.run("UPDATE lapsed SET amount_paid=revenue, churned_date=CASE WHEN member_id IN ('lapsed','grace') THEN end_date END, status=CASE WHEN member_id='grace' THEN 'Frozen' END");
    const result = await c.runAndReadAll(renewalCohortSQL("", "2026-10-05"));
    const rows = result.getRowObjectsJson();
    const august = rows.find((r) => r.month === "2026-08")!;
    assert.equal(Number(august.due), 2);
    assert.equal(Number(august.renewed), 1);
    assert.equal(Number(august.lapsed), 1);
    const september = rows.find((r) => r.month === "2026-09")!;
    assert.equal(Number(september.renewed), 1);
    assert.equal(Number(september.frozen), 1);
    assert.equal(rows.find((r) => r.month === "2026-10"), undefined, "unexpired memberships are not yet due");
    for (const row of rows)
      assert.equal(
        Number(row.due),
        ["renewed", "lapsed", "frozen"].reduce(
          (s, k) => s + Number(row[k]),
          0,
        ),
      );
  } finally {
    c.closeSync();
    instance.closeSync();
  }
});
