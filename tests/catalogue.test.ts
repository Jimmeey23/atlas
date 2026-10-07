import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { sqlTypes } from '../src/data/normalise.ts';
import { metrics, metricSQL } from '../src/semantics/metrics.ts';
import { catalogue, metricTable, domains } from '../src/semantics/catalogue.ts';

test('every registered metric is attributed to a real source table', () => {
  const unmapped = Object.keys(metrics).filter((id) => id !== 'records' && !metricTable(id));
  assert.deepEqual(unmapped, [], 'a metric with no table cannot be measured or drilled');
  const total = [...catalogue().values()].reduce((a, b) => a + b.length, 0);
  assert.equal(total, Object.keys(metrics).length - 1, 'every metric but the row counter is listed exactly once');
  for (const list of catalogue().values())
    for (const entry of list)
      assert.ok(domains.includes(entry.domain as never), `${entry.id} has domain ${entry.domain}`);
});

test('each table measures its whole metric set in one query', async () => {
  const db = await DuckDBInstance.create(':memory:');
  const c = await db.connect();
  try {
    // metricFacts wraps three sources in a subquery that adds these window
    // columns; several metrics read them, so the fixture must carry them too.
    const derivedColumns = {
      slot_fill: 'DOUBLE',
      membership_balance_rank: 'BIGINT',
      teaching_session_rank: 'BIGINT',
    };
    const columns = Object.entries({ ...sqlTypes, ...derivedColumns })
      .map(([k, t]) => `"${k}" ${t}`)
      .join(',');
    for (const [table, entries] of catalogue()) {
      await c.run(`CREATE TABLE "${table}" (${columns})`);
      const sql = `SELECT ${metricSQL(entries.map((e) => e.id), { rate: 1200, today: '2026-10-07' })}, COUNT(*) AS n FROM "${table}"`;
      // An empty table still has to produce one row per metric without error:
      // this is what the catalogue runs for every source when it opens.
      const [row] = (await c.runAndReadAll(sql)).getRowObjectsJS();
      for (const entry of entries)
        assert.ok(entry.id in (row as object), `${entry.id} missing from the ${table} query`);
    }
  } finally {
    c.closeSync();
    db.closeSync();
  }
});
