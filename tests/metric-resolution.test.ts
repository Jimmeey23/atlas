import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { metricSQL, metrics } from '../src/semantics/metrics.ts';
import { metricTable } from '../src/semantics/catalogue.ts';
import { blueprints } from '../src/data/blueprints.ts';
import { chapters } from '../src/report/chapters.ts';
import { definition } from '../src/report/definitions.ts';
const context = { rate: 1200, today: '2026-10-18' };

test('workspace and non-renewal report queries resolve every configured metric', () => {
  for (const [tab, blueprint] of blueprints.entries()) {
    assert.doesNotThrow(() => metricSQL([...new Set([...blueprint.kpis, ...blueprint.columns])], { ...context, source: blueprint.source }), `tab ${tab}`);
  }
  for (const chapter of chapters.filter(chapter => !chapter.renewal)) {
    const ids = [...new Set([...chapter.metrics, ...chapter.history, ...chapter.groups.flatMap(group => group.columns), ...(chapter.segmentHistory?.metrics ?? [])])];
    assert.doesNotThrow(() => metricSQL(ids, { ...context, source: chapter.source }), chapter.id);
    for (const id of ids) assert.ok(definition(id), `${chapter.id}: ${id} remains visible in reports`);
  }
});

test('legacy session IDs preserve reported totals and source identity without duplicating catalogue entries', async () => {
  const db = await DuckDBInstance.create(':memory:');
  const connection = await db.connect();
  try {
    await connection.run('CREATE TABLE payroll(sessions INTEGER); INSERT INTO payroll VALUES (12),(9)');
    await connection.run('CREATE TABLE recurring(sessions INTEGER); INSERT INTO recurring VALUES (10),(5)');
    for (const [source, id, expected] of [['payroll', 'payroll_sessions', 21], ['recurring', 'recurring_sessions', 15]] as const) {
      const [row] = (await connection.runAndReadAll(`SELECT ${metricSQL(['sessions', id], { ...context, source })} FROM ${source}`)).getRowObjectsJS();
      assert.equal(Number(row[id]), expected);
      assert.equal(row[id], row.sessions);
      assert.equal(metricTable(id), source);
      assert.equal(Object.keys(metrics).includes(id), false);
    }
  } finally { connection.closeSync(); db.closeSync(); }
});

test('invalid saved metric IDs produce a useful validation error rather than an undefined sql crash', () => {
  for (const id of ['removed_metric', 'svg', 'toString', '__proto__', undefined]) {
    assert.throws(() => metricSQL([id as string], context), error => error instanceof Error && !(error instanceof TypeError) && error.message.includes(`Unknown metric: ${String(id)}`));
  }
});
