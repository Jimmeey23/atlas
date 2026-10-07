import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { sqlTypes } from '../src/data/normalise.ts';
import { contributorPredicate } from '../src/semantics/metrics.ts';
import { derived, cellDelta, provenance } from '../src/semantics/cells.ts';

async function database(tables: string[], work: (c: any) => Promise<void>) {
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try { for (const table of tables) await c.run(`CREATE TABLE ${table} (${Object.entries(sqlTypes).map(([k, t]) => `"${k}" ${t}`).join(',')})`); await work(c); }
  finally { c.closeSync(); db.closeSync(); }
}

test('a cell drill-down is scoped to the metric that was clicked', async () => database(['leads'], async c => {
  await c.run(`INSERT INTO leads(stage) VALUES ('Membership Sold'),('Membership Sold'),('Trial Completed'),('Initial Contact')`);
  const count = async (id: string) => {
    const predicate = contributorPredicate(id, { rate: 1200, today: '2026-03-15' });
    const [row] = (await c.runAndReadAll(`SELECT COUNT(*) AS n FROM leads${predicate ? ` WHERE ${predicate}` : ''}`)).getRowObjectsJS();
    return Number((row as any).n);
  };
  // The rate metric drills to its numerator: the leads that actually converted.
  assert.equal(await count('lead_conversion_rate'), 2);
  assert.equal(await count('converted_leads'), 2);
  assert.equal(await count('trials_completed'), 1);
  assert.equal(await count('leads'), 4, 'an unfiltered metric still drills to every row');
}));

test('a cell only shows a comparison and a small-sample mark when they mean something', () => {
  // Counts are exact at any size; rates and averages are not.
  assert.equal(derived('fill_rate'), true);
  assert.equal(derived('avg_class_size_incl'), true);
  assert.equal(derived('sessions'), false);
  assert.equal(derived('empty_sessions'), false);

  // Rates move in points, everything else in percent, and direction follows
  // whether the metric is better when it rises.
  assert.deepEqual(cellDelta('fill_rate', 0.6, 0.5), { text: '+10.0pp', tone: 'positive' });
  assert.deepEqual(cellDelta('no_show_rate', 0.2, 0.1), { text: '+10.0pp', tone: 'negative' });
  assert.deepEqual(cellDelta('sessions', 120, 100), { text: '+20.0%', tone: 'positive' });
  assert.equal(cellDelta('sessions', 120, null), null, 'no comparison period means no delta');
  assert.equal(cellDelta('sessions', 120, 0), null, 'a zero baseline cannot carry a percentage');
  assert.equal(cellDelta('sessions', 100, 100)?.tone, 'muted');

  const text = provenance('fill_rate', 0.6, 3, true, 0.5);
  assert.match(text, /Formula: /);
  assert.match(text, /Source columns: /);
  assert.match(text, /Comparison period/);
  assert.match(text, /Fewer than 5 records/);
  assert.doesNotMatch(provenance('fill_rate', 0.6, 40, false, null), /Fewer than/);
  assert.doesNotMatch(provenance('fill_rate', 0.6, 40, false, null), /Comparison period/);
});
