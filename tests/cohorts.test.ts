import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { sqlTypes } from '../src/data/normalise.ts';
import { cohortRetentionSQL, cohortDrillPredicate, cohortTriangle, COHORT_MONTHS } from '../src/data/cohorts.ts';
import { contributorPredicate } from '../src/semantics/metrics.ts';

async function database(tables: string[], work: (c: any) => Promise<void>) {
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try { for (const table of tables) await c.run(`CREATE TABLE ${table} (${Object.entries(sqlTypes).map(([k, t]) => `"${k}" ${t}`).join(',')})`); await work(c); }
  finally { c.closeSync(); db.closeSync(); }
}

const seed = `INSERT INTO new(member_id,first_visit,is_new,location,source_row) VALUES
  ('a','2026-01-04',TRUE,'Kemps Corner',1),
  ('b','2026-01-20',TRUE,'Kemps Corner',2),
  ('c','2026-02-02',TRUE,'Bandra',3),
  ('dup','2026-01-05',TRUE,'Kemps Corner',4),
  ('dup','2026-03-05',TRUE,'Bandra',5),
  ('notNew','2026-01-06',FALSE,'Kemps Corner',6);
INSERT INTO checkins(member_id,date,attended) VALUES
  ('a','2026-01-10',TRUE),('a','2026-02-11',TRUE),('a','2026-03-01',TRUE),
  ('b','2026-01-22',TRUE),('b','2026-02-01',FALSE),
  ('c','2026-02-03',TRUE),
  ('dup','2026-01-07',TRUE),
  ('notNew','2026-01-06',TRUE);`;

test('cohort triangle counts each member once, in the month they first visited', async () => database(['new', 'checkins'], async c => {
  await c.run(seed);
  const rows = (await c.runAndReadAll(cohortRetentionSQL('', '2026-03-15'))).getRowObjectsJS();
  const triangle = cohortTriangle(rows as Record<string, unknown>[]);
  const january = triangle.find(r => r.month === '2026-01')!;
  // 'dup' is deduplicated into its earliest cohort and 'notNew' is excluded.
  assert.equal(january.size, 3);
  assert.equal(january.retained[0], 3);
  assert.equal(january.retained[1], 1, 'only a attended in February; b only late-cancelled');
  assert.equal(january.retained[2], 1);
  const february = triangle.find(r => r.month === '2026-02')!;
  assert.equal(february.size, 1);
  assert.equal(february.retained[0], 1);
  assert.equal(february.retained[1], 0);
  // March is the current month, so it cannot report an offset it has not reached.
  const march = triangle.find(r => r.month === '2026-03');
  assert.equal(march, undefined, 'no member first visited in March after deduplication');
  assert.equal(february.retained[2], null, 'future months stay blank rather than reading as zero');
}));

test('cohort drill-down returns exactly the members behind the clicked cell', async () => database(['new', 'checkins'], async c => {
  await c.run(seed);
  const members = async (predicate: string) =>
    (await c.runAndReadAll(`SELECT DISTINCT member_id FROM new WHERE ${predicate} ORDER BY member_id`))
      .getRowObjectsJS().map((r: any) => r.member_id);
  assert.deepEqual(await members(cohortDrillPredicate('', '2026-03-15', '2026-01', null)), ['a', 'b', 'dup']);
  assert.deepEqual(await members(cohortDrillPredicate('', '2026-03-15', '2026-01', 1)), ['a']);
  assert.deepEqual(await members(cohortDrillPredicate('', '2026-03-15', '2026-02', 0)), ['c']);
  assert.throws(() => cohortDrillPredicate('', '2026-03-15', '2026-01', COHORT_MONTHS + 1));
}));

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
