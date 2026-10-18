import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import registry from '../src/semantics/registry.json';
import { metrics } from '../src/semantics/metrics';
import { simpleMetricDefinitions } from '../src/semantics/metric-simple-definitions';
import { businessDefinitions } from '../src/semantics/metric-business-definitions';
import { metricReference, referenceRatio, sourceReference } from '../src/semantics/metric-reference';
import { metricNotes } from '../src/semantics/evidence';
import { definition } from '../src/report/definitions';
import { rankedRows } from '../src/report/group-query';
import { chapters } from '../src/report/chapters';
import { metricTable } from '../src/semantics/catalogue';

const ctx = { rate: 1200, today: '2026-10-18' };
test('every metric has a business definition and no built-in minimum or threshold-derived name', () => {
  assert.deepEqual(Object.keys(businessDefinitions).sort(), registry.map(m => m.id).sort());
  assert.deepEqual(Object.keys(simpleMetricDefinitions).sort(), registry.map(m => m.id).sort());
  for (const m of registry) {
    assert.ok(businessDefinitions[m.id].length > 30, m.id);
    assert.ok(simpleMetricDefinitions[m.id].meaning.length > 15, m.id);
    assert.ok(simpleMetricDefinitions[m.id].calculation.length > 15, m.id);
    assert.doesNotMatch(simpleMetricDefinitions[m.id].calculation, /SELECT |NULLIF\(|COUNT\(/, m.id);
    assert.equal('minSample' in m, false, m.id);
    assert.equal('minSample' in metrics[m.id], false, m.id);
    assert.doesNotMatch(m.label, /\(Derived\)/i, m.id);
  }
});
test('compound formulas do not get a misleading first-denominator explanation', () => {
  assert.equal(referenceRatio(metrics.draw_premium_pp.sql(ctx)), null);
  assert.equal(referenceRatio(metrics.gap_to_break_even.sql(ctx)), null);
  assert.match(referenceRatio(metrics.break_even_class_size.sql(ctx))!.denominator, /^NULLIF\(SUM\(revenue\)/);
  assert.match(referenceRatio(metrics.fill_rate.sql(ctx))!.denominator, /SUM\(capacity\)/);
});
test('source lineage preserves context and distinguishes unverified headers', () => {
  assert.equal(metricTable('unused_session_liability'), 'lapsed');
  assert.equal(metricTable('new_late_cancels'), 'new');
  assert.equal(metricTable('utilisation'), 'lapsed');
  assert.match(sourceReference('Leads.Conversion Status').status, /absent from configured/);
  assert.match(sourceReference('Bookings.Cancelled').status, /Declared in configured/);
  assert.match(sourceReference('Settings.rate_per_session').status, /not a sheet column/);
  assert.match(metricReference('new_late_cancels').runtimeNote, /distinct newcomer|distinct.*member|distinct newcomer member/);
});
test('renewal counts and rates declare different aggregation without sample policy', () => {
  assert.equal(definition('due')!.aggregation, 'sum');
  assert.equal(definition('renewal_rate')!.aggregation, 'weighted');
  assert.equal('minSample' in definition('due')!, false);
});
test('documented active-base and expiry populations match concrete edge cases', async () => {
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try {
    const active = (await c.runAndReadAll(`SELECT ${metrics.active_base.sql(ctx)}::INTEGER AS n FROM (VALUES ('A','Active'),('A','Inactive'),('B','Inactive')) t(member_id,lifecycle)`)).getRowObjectsJS()[0];
    assert.equal(active.n, 1); // No latest-row selection; an Active source row qualifies.
    const expiry = (await c.runAndReadAll(`SELECT ${metrics.revenue_at_risk_30d.sql(ctx)} AS amount FROM (VALUES ('Frozen','2026-11-01',100.0),('Active','2026-10-18',200.0),('Renewed','2026-10-20',400.0)) t(status,end_date,amount_paid)`)).getRowObjectsJS()[0];
    assert.equal(Number(expiry.amount), 300);
    assert.match(metricNotes.active_base.definition, /No latest-row ranking/);
    assert.match(metricNotes.revenue_at_risk_30d.definition, /Frozen rows/);
  } finally { c.closeSync(); db.closeSync(); }
});
test('one-observation ratios compute rather than being excluded by a built-in minimum', async () => {
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try {
    const row = (await c.runAndReadAll(`SELECT ${metrics.fill_rate.sql(ctx)} AS rate FROM (VALUES (4.0,10.0)) t(checked_in,capacity)`)).getRowObjectsJS()[0];
    assert.equal(Number(row.rate), .4);
  } finally { c.closeSync(); db.closeSync(); }
});

test('report groups include one-observation results by default and honour explicit user cutoffs', () => {
  assert.ok(chapters.every(chapter => chapter.groups.every(group => group.minValue == null)));
  const group = { field: 'location', title: 'Studios', deck: '', columns: ['fill_rate'] };
  const rows = [{ g: 'One', n: 1, is_total: 0, fill_rate: .9 }, { g: 'Six', n: 6, is_total: 0, fill_rate: .4 }];
  assert.equal(rankedRows(rows, group).eligible.length, 2);
  assert.equal(rankedRows(rows, { ...group, minValue: 3 }).eligible.length, 1);
});
