import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { sqlTypes } from '../src/data/normalise.ts';
import { metricSQL } from '../src/semantics/metrics.ts';
import { acquisitionAggregate, acquisitionFactsSQL } from '../src/data/acquisition.ts';
import { contributesToMetric } from '../src/data/acquisition-reference.ts';
import { renewalCohortSQL, renewalDrillPredicate } from '../src/data/renewals.ts';
import { salesScorecardFactsSQL, salesScorecardAggregate } from '../src/data/sales-scorecards.ts';
async function database(tables:string[], work:(c:any)=>Promise<void>) {
  const db=await DuckDBInstance.create(':memory:');const c=await db.connect();
  try { for(const table of tables) await c.run(`CREATE TABLE ${table} (${Object.entries(sqlTypes).map(([k,t])=>`"${k}" ${t}`).join(',')})`);await work(c); }
  finally {c.closeSync();db.closeSync();}
}
test('lead outcomes use exact stages even when status contradicts them',async()=>database(['leads'],async c=>{
  await c.run(`INSERT INTO leads(stage,status) VALUES ('Membership Sold','Open'),('Trial Completed','Won'),('Trial Completed - Unresponsive','Trial Completed'),('Initial Contact','Won'),(' membership sold ','Lost')`);
  const [r]=(await c.runAndReadAll(`SELECT ${metricSQL(['leads','converted_leads','trials_completed','lead_conversion_rate','open_leads'],{rate:1200,today:'2026-10-06'})} FROM leads`)).getRowObjectsJS();
  assert.equal(Number(r.converted_leads),2);assert.equal(Number(r.trials_completed),1);assert.equal(r.lead_conversion_rate,.4);assert.equal(Number(r.open_leads),3);
}));
test('same-month conversion and retention include 30-day-spanning months and reject cross-month or return-only outcomes',async()=>database(['new'],async c=>{
  await c.run(`INSERT INTO new(member_id,date,month,entry_type,conversion,retention,first_purchase_date,second_visit_days) VALUES
    ('same','2026-01-01','2026-01','New - Trial','Converted','Retained','2026-01-31',1),
    ('cross','2026-01-31','2026-01','New - Trial','Converted','Retained','2026-02-01',0),
    ('return','2026-01-01','2026-01','New - Trial','Not Converted','Retained',NULL,1),
    ('notRetained','2026-01-01','2026-01','New - Trial','Converted','Not Retained','2026-01-03',1),
    ('newMonth','2026-10-01','2026-10','New - Trial','Converted','Retained','2026-10-02',1),
    ('before','2026-01-20','2026-01','New - Trial','Converted','Retained','2026-01-01',1)`);
  const facts=acquisitionFactsSQL('','2026-10-06');
  const rows=(await c.runAndReadAll(facts)).getRowObjectsJS();
  const [agg]=(await c.runAndReadAll(`WITH facts AS (${facts}) SELECT ${acquisitionAggregate} FROM facts`)).getRowObjectsJS();
  assert.equal(Number(agg.converted_30),3);assert.equal(Number(agg.retained_30),2);
  for(const metric of ['converted_30','retained_30','mature_30']) assert.equal(rows.filter((r:any)=>contributesToMetric(r,metric)).length,Number(agg[metric]));
  assert.equal(rows.find((r:any)=>r.member_id==='cross').converted_in_30,false);
  assert.equal(rows.find((r:any)=>r.member_id==='newMonth').returned_in_30,true);
}));
test('renewal cell drills reconcile to deduplicated cohort counts and retain later entitlement evidence',async()=>database(['lapsed'],async c=>{
  await c.run(`INSERT INTO lapsed(source_row,member_id,product,revenue,session_limit,start_date,end_date) VALUES
    (2,'renew','Monthly Membership',1000,10,'2026-07-01','2026-08-01'),
    (3,'renew','Monthly Membership',1000,10,'2026-08-02','2026-09-02'),
    (4,'lost','Monthly Membership',1000,10,'2026-07-01','2026-08-01'),
    (5,'lost','Monthly Membership',1000,10,'2026-07-01','2026-08-01'),
    (6,'free','Free Trial',0,1,'2026-07-01','2026-08-01')`);
  const scope=" WHERE end_date<='2026-08-31'";
  const [r]=(await c.runAndReadAll(renewalCohortSQL(scope,'2026-10-06'))).getRowObjectsJS();
  assert.equal(Number(r.due),2);assert.equal(Number(r.renewed),1);assert.equal(Number(r.lapsed),1);
  for(const state of ['due','renewed','lapsed','grace','upcoming']) {
    const [drill]=(await c.runAndReadAll(`SELECT COUNT(*) AS n FROM lapsed WHERE ${renewalDrillPredicate(scope,'2026-10-06','2026-08',state)}`)).getRowObjectsJS();
    assert.equal(Number(drill.n),Number(r[state]));
  }
}));
test('sales trackers use earlier purchase history, successful payments and nonduplicated upgrades',async()=>database(['sales'],async c=>{
  await c.run(`INSERT INTO sales(source_row,member_id,sale_id,membership_id,date,month,product,category,revenue,vat,discount,units,status,imported) VALUES
    (2,'a','s1','m1','2026-08-01','2026-08','Studio 1 Month Unlimited','Memberships',1000,50,0,1,'succeeded',false),
    (3,'a','s2','m2','2026-09-01','2026-09','Studio Annual Unlimited','Memberships',6000,300,200,1,'succeeded',false),
    (4,'a','s2','m2','2026-09-01','2026-09','Studio Annual Unlimited','Memberships',6000,300,200,1,'succeeded',false),
    (5,'b','s3','m3','2026-09-02','2026-09','Studio Private Class','Privates',2000,100,0,1,'succeeded',false),
    (6,'c','s4','m4','2026-09-03','2026-09','Studio Annual Unlimited','Memberships',99999,500,0,1,'failed',false),
    (7,'a','s5','m2','2026-09-08','2026-09','Studio Annual Unlimited','Memberships',2000,100,0,1,'succeeded',false)`);
  const facts=salesScorecardFactsSQL(" WHERE date>='2026-09-01' AND date<='2026-09-30'",false);
  const rows=(await c.runAndReadAll(facts)).getRowObjectsJS();
  assert.equal(rows.length,4);assert.equal(rows.filter((r:any)=>r.is_upgrade).length,2);
  const [up]=(await c.runAndReadAll(`WITH facts AS (${facts}) SELECT ${salesScorecardAggregate} FROM facts WHERE is_upgrade`)).getRowObjectsJS();
  assert.equal(Number(up.purchase_count),1);assert.equal(Number(up.transactions),1);assert.equal(Number(up.buyers),1);assert.equal(up.gross_revenue,12000);assert.equal(up.discount_value,400);
  assert.equal(rows.filter((r:any)=>r.is_annual).length,3);assert.equal(rows.filter((r:any)=>r.is_private).length,1);
}));
