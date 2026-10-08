import test from 'node:test';
import assert from 'node:assert/strict';
import {DuckDBInstance} from '@duckdb/node-api';
// @ts-ignore
import {compileMetricQuery} from '../server/agent-metrics.mjs';
// @ts-ignore
import {rankEntities, resolveMentions, resolveQuestionScope} from '../server/agent-scope.mjs';
test('follow-up month retains the studio and year of the preceding answer',()=>{
 const history=[{role:'user',content:'How much sales did Kwality House do in April 2026?'},{role:'assistant',content:'Answer',scope:{from:'2026-04-01',to:'2026-04-30',location:['Kwality House, Kemps Corner'],imports:false}}];
 const scope=resolveQuestionScope('What about May?',{from:'2026-09-01',to:'2026-09-30',location:['Kenkere House']},history).filters;
 assert.equal(scope.from,'2026-05-01');assert.equal(scope.to,'2026-05-31');assert.deepEqual(scope.location,['Kwality House, Kemps Corner']);
 assert.deepEqual(resolveQuestionScope('Compare Bandra and Kwality House in April 2026').filters.location,['Supreme HQ, Bandra','Kwality House, Kemps Corner']);
});
test('governed agent attendance and fill use the dashboard weighted definitions',async()=>{
 const db=await DuckDBInstance.create(':memory:');const c=await db.connect();
 try{
  await c.run(`CREATE TABLE sessions AS SELECT * FROM (VALUES ('A',2,10,1),('A',8,10,1),('B',1,20,1)) t(location,checked_in,capacity,sessions)`);
  const compiled=compileMetricQuery({source:'sessions',metric_ids:['attendance','fill_rate'],group_by:['location'],scope_json:null},{},['sessions']);
  const rows=(await c.runAndReadAll(compiled.sql)).getRowObjectsJS();assert.equal(rows[0].attendance,10n);assert.equal(rows[0].fill_rate,.5);assert.equal(rows[1].fill_rate,.05);
 }finally{c.closeSync();db.closeSync();}
});
test('current membership counts clear dates and do not mix historical and current metrics',()=>{
 const compiled=compileMetricQuery({source:'lapsed',metric_ids:['active_memberships'],group_by:[],scope_json:null},{from:'2026-04-01',to:'2026-04-30',location:['A']},['lapsed']);
 assert.equal(compiled.snapshot,true);assert.equal(compiled.filters.from,undefined);assert.deepEqual(compiled.filters.location,['A']);
 assert.throws(()=>compileMetricQuery({source:'sessions',metric_ids:['gross_revenue'],group_by:[],scope_json:null},{},['sessions']));
});
test('recurring classes group by class name, weekday and time, and can drop hosted sessions',async()=>{
 const db=await DuckDBInstance.create(':memory:');const c=await db.connect();
 try{
  await c.run(`CREATE TABLE sessions AS SELECT * FROM (VALUES
   ('Mat 57','Saturday','10:15','Regular',12,1,1),('Mat 57','Saturday','10:15','Regular',13,1,1),
   ('Mat 57','Monday','08:30','Regular',8,1,1),
   ('Hosted Class','Sunday','09:00','Hosted',20,1,1)) t(format,day,time,session_type,checked_in,sessions,non_empty)`);
  const compiled=compileMetricQuery({source:'sessions',metric_ids:['avg_class_size_excl','sessions'],group_by:['class_slot'],exclude_hosted:true,scope_json:null},{},['sessions']);
  const rows=(await c.runAndReadAll(compiled.sql)).getRowObjectsJS();
  assert.deepEqual(rows.map(r=>r.class_slot),['Mat 57 · Monday 08:30','Mat 57 · Saturday 10:15']);
  assert.equal(rows[1].avg_class_size_excl,12.5);
  assert.throws(()=>compileMetricQuery({source:'sales',metric_ids:['gross_revenue'],group_by:['class_slot'],exclude_hosted:false,scope_json:null},{},['sales']));
 }finally{c.closeSync();db.closeSync();}
});
test('studio shortforms, quarters and to-date periods resolve to exact scope',()=>{
 const scope=(q:string)=>resolveQuestionScope(q,{from:'2026-09-01',to:'2026-09-30'}).filters;
 assert.deepEqual(scope('best class at KH in sept 2026').location,['Kwality House, Kemps Corner']);
 assert.deepEqual(scope('KK vs SHQ').location,['Kenkere House','Supreme HQ, Bandra']);
 assert.deepEqual(scope('revenue at C+C').location,['The Studio by Copper + Cloves']);
 assert.deepEqual(scope('mumbai attendance').location,['Kwality House, Kemps Corner','Supreme HQ, Bandra']);
 const q=scope('fill at kemps in Q2 2025');assert.equal(q.from,'2025-04-01');assert.equal(q.to,'2025-06-30');
 const s=scope("attendance sep'25");assert.equal(s.from,'2025-09-01');assert.equal(s.to,'2025-09-30');
 assert.equal(scope('rev YTD').from.slice(5),'01-01');
});
test('entity ranking resolves first names, misspellings and initials',()=>{
 const trainers=['Rohan Dahima','Reshma Sharma','Pranjali Jain','Mrigakshi Jaiswal','Karanvir Bhatia'];
 assert.equal(rankEntities(trainers,'rohan')[0].value,'Rohan Dahima');
 assert.equal(rankEntities(trainers,'mrigaksi')[0].value,'Mrigakshi Jaiswal');
 assert.equal(rankEntities(trainers,'karan')[0].value,'Karanvir Bhatia');
});
test('question pre-pass resolves fuzzy names without matching ordinary words',()=>{
 const lists={instructor:['Rohan Dahima','Reshma Sharma','Pranjali Jain','Mrigakshi Jaiswal','Cauveri Vikrant'],associate:['Shifa Ali'],class:['Studio Cardio Barre','Studio Mat 57']};
 const names=(q:string)=>resolveMentions(q,lists).map((m:any)=>m.value);
 assert.deepEqual(names('compare mrigaksi and pranjal fill rate'),['Mrigakshi Jaiswal','Pranjali Jain']);
 assert.deepEqual(names('how is cauvery doing'),['Cauveri Vikrant']);
 assert.deepEqual(names('what did shifa sell in sept'),['Shifa Ali']);
 assert.deepEqual(names('how many people came yesterday'),[]);
});
