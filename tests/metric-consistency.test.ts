import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { sqlTypes } from '../src/data/normalise.ts';
import { metricSQL } from '../src/semantics/metrics.ts';
import { acquisitionAggregate, acquisitionFactsSQL } from '../src/data/acquisition.ts';
import { retentionSnapshotSQL } from '../src/data/metric-consistency.ts';
const ctx = { rate: 1200, today: '2026-10-18' };

test('Acquisition and registry agree on newcomer rates, value and conversion timing in a mixed cohort', async () => {
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try {
    await c.run(`CREATE TABLE new (${Object.entries(sqlTypes).map(([k,t])=>`"${k}" ${t}`).join(',')})`);
    await c.run(`INSERT INTO new(member_id,entry_type,is_new,conversion,retention,conversion_days,ltv,first_purchase,post_trial_ltv,post_trial_purchases,purchases,visits) VALUES
      ('a','New - Trial',true,'Converted','Retained',0,100,50,80,2,3,4),
      ('b','true',true,'Not Converted','Not Retained',5,0,0,0,0,0,1),
      ('c','Repeat Visit',false,'Converted','Retained',20,900,500,800,8,9,10)`);
    const [acq] = (await c.runAndReadAll(`WITH facts AS (${acquisitionFactsSQL('', ctx.today)}) SELECT ${acquisitionAggregate} FROM facts`)).getRowObjectsJS();
    const pairs = { conversion_rate:'conversion_rate', retention_rate:'retention_rate', avg_ltv:'avg_ltv', conversion_span:'avg_conversion_span', median_span:'median_conversion_span', first_purchase:'avg_first_purchase', total_ltv:'new_total_spend', post_trial_spend:'new_post_trial_spend', total_purchases:'new_total_purchases', total_visits:'new_visits', revenue_per_visit:'new_revenue_per_visit' };
    const [canonical] = (await c.runAndReadAll(`SELECT ${metricSQL(Object.values(pairs),ctx)} FROM new`)).getRowObjectsJS();
    assert.equal(acq.conversion_rate, .5); assert.equal(acq.retention_rate, .5);
    assert.equal(acq.avg_ltv, 50); assert.equal(acq.conversion_span, 0);
    assert.equal(Number(acq.total_ltv), 100); assert.equal(Number(acq.total_visits), 5);
    for (const [alias,id] of Object.entries(pairs)) assert.equal(Number(acq[alias]),Number(canonical[id]),alias);
  } finally { c.closeSync(); db.closeSync(); }
});

test('Retention history excludes the same inactive and renewed statuses as cards', async () => {
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try {
    await c.run(`CREATE TABLE lapsed(status VARCHAR,start_date VARCHAR,end_date VARCHAR,amount_paid DOUBLE)`);
    await c.run(`INSERT INTO lapsed VALUES ('Active','2026-01-01','2026-10-25',100),('Lapsed','2026-01-01','2026-10-25',200),('Renewed','2026-01-01','2026-10-25',300),('Frozen','2026-01-01','2026-10-25',400),('Not Activated','2026-01-01','2026-10-25',500)`);
    const [history] = (await c.runAndReadAll(`SELECT ${retentionSnapshotSQL("DATE '2026-10-18'",ctx)} FROM lapsed`)).getRowObjectsJS();
    const [card] = (await c.runAndReadAll(`SELECT ${metricSQL(['active_memberships','revenue_at_risk_30d'],ctx)} FROM lapsed`)).getRowObjectsJS();
    assert.equal(Number(history.active_memberships),2); assert.equal(history.revenue_at_risk_30d,500);
    assert.equal(history.active_memberships,card.active_memberships); assert.equal(history.revenue_at_risk_30d,card.revenue_at_risk_30d);
  } finally { c.closeSync(); db.closeSync(); }
});

test('Sales scorecards and registry agree on split payments, missing tax and missing IDs', async () => {
  const { salesScorecardAggregate, salesScorecardFactsSQL } = await import('../src/data/sales-scorecards.ts');
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try {
    await c.run(`CREATE TABLE sales (${Object.entries(sqlTypes).map(([k,t])=>`"${k}" ${t}`).join(',')})`);
    await c.run(`INSERT INTO sales(sale_id,member_id,revenue,vat,discount,status,voided,imported) VALUES
      ('s1','a',100,10,5,'succeeded',false,false),('s1','a',50,NULL,0,'succeeded',false,false),
      ('s2','b',200,20,0,NULL,false,false),('s3',NULL,30,3,0,'succeeded',false,false),
      ('failed','a',900,90,0,'failed',false,false),('void','a',800,80,0,'succeeded',true,false)`);
    const ids = ['arpu','aov','purchase_frequency','gross_revenue','net_revenue','discount_rate'];
    const [score] = (await c.runAndReadAll(`WITH facts AS (${salesScorecardFactsSQL('',true)}) SELECT ${salesScorecardAggregate} FROM facts`)).getRowObjectsJS();
    const [canonical] = (await c.runAndReadAll(`SELECT ${metricSQL(ids,ctx)} FROM sales WHERE NOT COALESCE(voided,FALSE) AND (status='succeeded' OR status IS NULL)`)).getRowObjectsJS();
    assert.equal(score.gross_revenue,380); assert.equal(score.net_revenue,297); assert.equal(score.purchase_frequency,1); assert.equal(score.discount_penetration,1/3);
    for (const id of ids) assert.equal(score[id],canonical[id],id);
  } finally { c.closeSync(); db.closeSync(); }
});

test('Acquisition all-null outcomes return the same zero rates as registry; cancellations count each newcomer identity once', async () => {
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try {
    for (const table of ['new','bookings']) await c.run(`CREATE TABLE ${table} (${Object.entries(sqlTypes).map(([k,t])=>`"${k}" ${t}`).join(',')})`);
    await c.run(`INSERT INTO new(member_id,entry_type,is_new) VALUES ('a','New - Trial',true),('a','New - Trial',true),('b','New - Trial',true),('c','Repeat Visit',false)`);
    await c.run(`INSERT INTO bookings(member_id,late_cancelled) VALUES ('a',1),('a',1),('b',0),('c',1)`);
    const [acq] = (await c.runAndReadAll(`WITH facts AS (${acquisitionFactsSQL('',ctx.today,true)}) SELECT ${acquisitionAggregate} FROM facts`)).getRowObjectsJS();
    const [canonical] = (await c.runAndReadAll(`SELECT ${metricSQL(['conversion_rate','retention_rate','second_visit_rate','new_late_cancels'],ctx)} FROM new`)).getRowObjectsJS();
    for (const id of ['conversion_rate','retention_rate','second_visit_rate']) { assert.equal(acq[id],0); assert.equal(acq[id],canonical[id]); }
    assert.equal(Number(acq.late_cancels),2); assert.equal(acq.late_cancels,canonical.new_late_cancels);
    const [unavailable] = (await c.runAndReadAll(`WITH facts AS (${acquisitionFactsSQL('',ctx.today,false)}) SELECT ${acquisitionAggregate} FROM facts`)).getRowObjectsJS();
    assert.equal(unavailable.late_cancels,null);
  } finally { c.closeSync(); db.closeSync(); }
});

test('Scorecard cancellation aliases identify Bookings and format cutoffs are controlled by the viewer', async () => {
  const { readFile } = await import('node:fs/promises');
  const scorecard = await readFile(new URL('../src/data/scorecard.ts',import.meta.url),'utf8');
  const view = await readFile(new URL('../src/components/PerformanceScorecard.tsx',import.meta.url),'utf8');
  const formats = await readFile(new URL('../src/components/FormatComparison.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(scorecard,/\blate_cancel_rate\b/);
  assert.match(scorecard,/\["booking_late_rate", true\]/);
  assert.match(view,/id: "booking_late_rate", label: "Booking late-cancel rate"/);
  assert.doesNotMatch(formats,/MIN_SESSIONS/);
  assert.match(formats,/\[minimumSessions, setMinimumSessions\] = useState\(0\)/);
  assert.match(formats,/minimumSessions > 0 \? ` HAVING SUM\(sessions\)>=\$\{minimumSessions\}` : ""/);
  assert.match(formats,/aria-label="Minimum sessions for format comparison"/);
  assert.match(formats,/"late_cancel_rate"/); // Sessions source retains its own definition.
});
