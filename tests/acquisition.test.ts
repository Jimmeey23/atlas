import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { acquisitionAggregate, acquisitionFactsSQL, acquisitionMonths, priorMonth } from '../src/data/acquisition.ts';
import { normalise, sqlTypes } from '../src/data/normalise.ts';

test('entry types, hosted first visits and source purchase journey retain detail',()=>{
  const d=normalise({key:'new',title:'New',id:'test',columns:['Member Id','First Visit Date','Is New','First Visit Entity Name','First Purchase Date','Memberships Bought Post Trial','Avg Purchase Value Post Trial'],rows:[['1','2026-08-01','New - Hosted Class','Partner Experience','2026-08-04','Intro, Monthly',4500],['2','2026-08-02','Repeat Visit','Barre',null,null,null]],fetchedAt:1,loadMs:0,status:'ok'});
  assert.equal(d.rows[0].entry_type,'New - Hosted Class');assert.equal(d.rows[0].session_type,'Hosted');assert.equal(d.rows[0].purchase_journey,'Intro, Monthly');assert.equal(d.rows[0].avg_purchase_value,4500);assert.equal(d.rows[1].entry_type,'Repeat Visit');
});
test('comparison windows contain 14 completed months and all prior-year baselines',()=>{
  const months=acquisitionMonths('2026-10-06');assert.equal(months.length,14);assert.equal(months[0],'2025-08');assert.equal(months.at(-1),'2026-09');assert.equal(acquisitionMonths('2026-10-06',26)[0],priorMonth(months[0],12));
});
test('acquisition aggregates use calendar-month purchases and preserve unavailable purchase dates',async()=>{
  const db=await DuckDBInstance.create(':memory:');const c=await db.connect();
  try {
    await c.run(`CREATE TABLE new (${Object.entries(sqlTypes).map(([k,t])=>`"${k}" ${t}`).join(',')})`);
    await c.run(`INSERT INTO new (member_id,date,month,entry_type,is_new,conversion,retention,conversion_days,second_visit_days,ltv,avg_purchase_value,first_purchase_date) VALUES
      ('1','2026-08-01','2026-08','New - Trial Class',true,'Converted','Retained',5,2,10000,5000,'2026-08-06'),
      ('2','2026-08-02','2026-08','New - Trial Class',true,'Not Converted','Not Retained',NULL,NULL,0,NULL,NULL),
      ('3','2026-10-01','2026-10','New - Trial Class',true,'Converted','Retained',1,2,8000,4000,'2026-10-02'),
      ('4','2026-08-03','2026-08','Repeat Visit',false,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
      (NULL,'2026-08-04','2026-08','Repeat Visit',false,NULL,NULL,NULL,NULL,NULL,NULL,NULL)`);
    const result=await c.runAndReadAll(`WITH facts AS (${acquisitionFactsSQL('','2026-10-06')}) SELECT entry,${acquisitionAggregate} FROM facts GROUP BY entry ORDER BY entry`);
    const [trial,repeat]=result.getRowObjectsJS();
    assert.equal(Number(trial.converted_members),2);assert.equal(trial.conversion_rate,2/3);assert.equal(Number(trial.mature_30),3);assert.equal(Number(trial.converted_30),2);assert.equal(trial.conversion_30_rate,2/3);assert.equal(trial.retention_30_rate,2/3);assert.equal(trial.avg_spend,4500);
    assert.equal(Number(repeat.cohort_rows),2);assert.equal(Number(repeat.unique_members),1);assert.equal(repeat.conversion_rate,null);assert.equal(repeat.retained_30,null);
  }finally{c.closeSync();db.closeSync();}
});

import { acquisitionYoYMonths, acquisitionPivotSQL, acquisitionPeriodLabel } from '../src/data/acquisition.ts';
test('YoY groups matching calendar months across years with newest periods first', () => {
  const periods = acquisitionYoYMonths('2026-10-06');
  assert.equal(periods.length, 26);
  assert.deepEqual(periods.slice(0,6), ['2026-09','2025-09','2024-09','2026-08','2025-08','2024-08']);
  assert.equal(acquisitionPeriodLabel('2026-08'), 'Aug - 2026');
  const groups = [...new Set(periods.map(period => period.slice(5)))];
  for (const month of groups) {
    const group = periods.filter(period => period.slice(5) === month);
    const start = periods.indexOf(group[0]);
    assert.deepEqual(periods.slice(start, start + group.length), group);
    assert.deepEqual(group, [...group].sort().reverse());
  }
});
test('pivot children show source memberships and experiences and selection recomputes totals', async () => {
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try {
    await c.run(`CREATE TABLE new (${Object.entries(sqlTypes).map(([k,t]) => `"${k}" ${t}`).join(',')})`);
    await c.run(`INSERT INTO new (member_id,date,month,entry_type,membership_sequence,format,conversion) VALUES
      ('1','2026-08-01','2026-08','New - Trial Class','["Trial","Monthly"]','Barre','Converted'),
      ('2','2026-08-02','2026-08','New - Trial Class','["Trial"]','Barre','Not Converted'),
      ('3','2026-08-03','2026-08','Repeat Visit','["Monthly"]','Signature Strength','Converted')`);
    const selected = await c.runAndReadAll(acquisitionPivotSQL('', '2026-10-06', 'entry', 'membership', ['New - Trial Class']));
    const rows = selected.getRowObjectsJS();
    assert.deepEqual(rows.filter(r => !Number(r.is_parent)).map(r => r.child).sort(), ['Trial','Trial, Monthly']);
    const total = rows.find(r => Number(r.is_total));
    assert.equal(Number(total?.cohort_rows),2);
    assert.equal(total?.conversion_rate,.5);
    const experiences = await c.runAndReadAll(acquisitionPivotSQL('', '2026-10-06', 'membership', 'experience'));
    assert.deepEqual([...new Set(experiences.getRowObjectsJS().filter(r => !Number(r.is_parent)).map(r => r.child))].sort(), ['Barre','Signature Strength']);
    const empty = await c.runAndReadAll(acquisitionPivotSQL('', '2026-10-06', 'entry', 'membership', []));
    assert.equal(empty.getRowObjectsJS().length,0);
  } finally { c.closeSync(); db.closeSync(); }
});

import { contributesToMetric, eligibleMembership, referenceConverted, referenceNew, referenceSummary } from '../src/data/acquisition-reference.ts';
import { instructorAcquisitionAggregate } from '../src/data/acquisition.ts';
test('reference conversion eligibility and exact metric contributors preserve missing data', () => {
  const credits={entry_type:'New - Trial',conversion:'Converted',purchase_journey:'Money Credits 500; Money Credits 1000',ltv:null};
  // Conversion is the source Conversion Status alone; a money-credit-only journey still converts.
  assert.equal(referenceConverted(credits),true);
  assert.equal(eligibleMembership(credits),false);
  assert.equal(eligibleMembership({...credits,purchase_journey:'Money Credits 500 / Monthly Unlimited'}),true);
  assert.equal(referenceConverted({...credits,purchase_journey:null}),true);
  assert.equal(referenceNew({entry_type:'Newcomer'}),false);
  assert.equal(contributesToMetric({...credits,ltv:0},'avg_ltv'),true);
  assert.equal(contributesToMetric(credits,'avg_ltv'),false);
  assert.equal(contributesToMetric({...credits,conversion_days:0},'conversion_span'),false);
  assert.equal(contributesToMetric({...credits,conversion_days:5},'conversion_span'),true);
  assert.equal(contributesToMetric({...credits,mature:false,converted_in_30:true,member_id:'a'},'converted_30'),true);
  assert.equal(referenceSummary([credits]).avg_ltv,null);
});
test('reference row counts, unique instructor outcomes and calendar month flags reconcile with drill-down contributors', async () => {
  const db=await DuckDBInstance.create(':memory:');const c=await db.connect();
  try {
    await c.run(`CREATE TABLE new (${Object.entries(sqlTypes).map(([k,t])=>`"${k}" ${t}`).join(',')})`);
    await c.run(`INSERT INTO new (member_id,date,month,entry_type,purchase_journey,conversion,retention,first_purchase_date,conversion_days,second_visit_days,ltv) VALUES
      ('a','2026-01-31','2026-01','New - Trial','Monthly','Converted','Retained','2026-02-01',1,1,5000),
      ('a','2026-01-01','2026-01','New - Trial','Monthly','Converted','Retained','2026-01-03',2,2,7000),
      ('b','2026-01-01','2026-01','New - Trial','Money Credits 500','Converted','Not Retained','2026-01-02',1,NULL,NULL),
      ('c','2026-01-01','2026-01','Repeat Visit',NULL,'Converted','Retained','2026-01-02',1,NULL,1000)`);
    const facts=acquisitionFactsSQL('','2026-10-06');
    const records=(await c.runAndReadAll(facts)).getRowObjectsJS();
    const aggregate=(await c.runAndReadAll(`WITH facts AS (${facts}) SELECT ${acquisitionAggregate} FROM facts`)).getRowObjectsJS()[0];
    const instructor=(await c.runAndReadAll(`WITH facts AS (${facts}) SELECT ${instructorAcquisitionAggregate} FROM facts`)).getRowObjectsJS()[0];
    assert.equal(Number(aggregate.converted_members),4);assert.equal(Number(instructor.converted_members),3);
    assert.equal(Number(aggregate.newcomers),3);assert.equal(Number(instructor.newcomers),2);
    const summary=referenceSummary(records);
    assert.equal(summary.converted_members,Number(aggregate.converted_members));
    assert.equal(summary.conversion_rate,aggregate.conversion_rate);
    assert.equal(referenceSummary(records,true).converted_members,Number(instructor.converted_members));
    assert.equal(referenceSummary(records,true).conversion_rate,instructor.conversion_rate);
    for(const key of ['converted_members','retained_members','converted_same_month','retained_same_month','newcomers']){
      assert.equal(records.filter(row=>contributesToMetric(row,key)).length,Number(aggregate[key]));
    }
    const januaryEnd=records.find(r=>r.date==='2026-01-31')!;
    assert.equal(januaryEnd.converted_same_month,false);assert.equal(januaryEnd.converted_in_30,false);
    assert.equal(januaryEnd.returned_same_month,false);assert.equal(januaryEnd.returned_in_30,false);
  } finally {c.closeSync();db.closeSync();}
});
