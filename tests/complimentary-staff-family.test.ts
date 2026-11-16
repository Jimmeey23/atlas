import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { normalise, staffFamily } from '../src/data/normalise.ts';
import { metrics, contributorPredicate } from '../src/semantics/metrics.ts';
import { blueprints } from '../src/data/blueprints.ts';

const ctx = { rate: 1200, today: '2026-11-16' };

test('staff and family access labels are recognised; unlabelled rows stay unknown', () => {
  assert.equal(staffFamily('Staff', null), true);
  assert.equal(staffFamily(null, 'Friends & Family Complimentary'), true);
  assert.equal(staffFamily('Existing', 'Studio Staff Membership'), true);
  assert.equal(staffFamily('Existing', 'Studio 8 Class Package'), false);
  assert.equal(staffFamily('New', 'Complimentary Class'), false);
  assert.equal(staffFamily(null, ''), null);
});

test('member attendance complimentary visits exclude staff/family and are drillable', async () => {
  const { rows } = normalise({
    key: 'checkins', title: 'Checkins', id: 't', status: 'ok', fetchedAt: 0, loadMs: 0,
    columns: ['Member ID', 'Checked In', 'Complementary', 'Is New', 'Cleaned Product', 'Cleaned Category', 'Date (IST)'],
    rows: [
      ['1', 'TRUE', 'TRUE', 'New', 'Complimentary Class', 'Complimentary/Promotional', '2026-10-02'],
      ['2', 'TRUE', 'TRUE', 'Staff', 'Staff Membership', 'Membership', '2026-10-02'],
      ['3', 'TRUE', 'FALSE', 'Existing', 'Friends & Family', 'Complimentary/Promotional', '2026-10-03'],
      ['4', 'TRUE', 'FALSE', 'Existing', 'Studio 8 Class Package', 'Package', '2026-10-03'],
      ['5', 'TRUE', 'FALSE', 'Existing', 'Hosted Guest', 'Complimentary/Promotional', '2026-10-04'],
      ['6', 'FALSE', 'TRUE', 'Existing', 'Complimentary Class', 'Complimentary/Promotional', '2026-10-04'],
    ],
  });
  assert.deepEqual(rows.map((r) => r.staff_family), [false, true, true, false, false, false]);
  const db = await DuckDBInstance.create(':memory:');
  const c = await db.connect();
  try {
    await c.run(`CREATE TABLE t(attended BOOLEAN, complimentary BOOLEAN, category VARCHAR, staff_family BOOLEAN)`);
    for (const r of rows)
      await c.run(`INSERT INTO t VALUES (${r.attended}, ${r.complimentary}, ${r.category == null ? 'NULL' : `'${r.category}'`}, ${r.staff_family})`);
    const out = (await c.runAndReadAll(`SELECT ${metrics.member_complimentary_visits.sql(ctx)} AS comps, ${metrics.member_complimentary_rate.sql(ctx)} AS share, ${metrics.staff_family_visits.sql(ctx)} AS staff FROM t`)).getRowObjectsJS()[0];
    // Rows 1 and 5 are complimentary member/guest visits; 2 and 3 are staff/family; 6 never attended.
    assert.equal(Number(out.comps), 2);
    assert.equal(Number(out.staff), 2);
    assert.equal(Number(out.share), 2 / 3);
    const predicate = contributorPredicate('member_complimentary_visits', ctx);
    assert.ok(predicate, 'the card must expose the contributing check-ins');
    const listed = (await c.runAndReadAll(`SELECT COUNT(*) AS n FROM t WHERE ${predicate}`)).getRowObjectsJS()[0];
    assert.equal(Number(listed.n), 2);
  } finally { c.closeSync(); db.closeSync(); }
  const attendance = blueprints[9];
  assert.equal(attendance.source, 'checkins');
  assert.ok(attendance.kpis.includes('member_complimentary_visits'));
  assert.ok(!attendance.kpis.includes('complimentary_visits'), 'Sessions-level comps cannot exclude staff/family');
});
