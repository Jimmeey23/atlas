import test from 'node:test';
import assert from 'node:assert/strict';
import {DuckDBInstance} from '@duckdb/node-api';
// @ts-ignore
import {compileMetricQuery} from '../server/agent-metrics.mjs';
// @ts-ignore
import {resolveQuestionScope} from '../server/agent-scope.mjs';
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
