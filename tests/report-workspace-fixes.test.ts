import test from 'node:test';
import assert from 'node:assert/strict';
import { normalise } from '../src/data/normalise';
import { metrics } from '../src/semantics/metrics';
import { DuckDBInstance } from '@duckdb/node-api';
test('complimentary visits sum numeric Sessions.Complimentary and never NonPaid', async()=>{
  const source={key:'sessions',title:'Sessions',id:'test',status:'ok',fetchedAt:1,loadMs:0,columns:['Complimentary','NonPaid','CheckedIn'],rows:[[3,8,10],[2,7,5],[null,4,6]]};
  const result=normalise(source);assert.deepEqual(result.rows.map(r=>r.complimentary_visits),[3,2,undefined]);
  const db=await DuckDBInstance.create(':memory:');const c=await db.connect();try{const row=(await c.runAndReadAll(`SELECT ${metrics.complimentary_visits.sql({rate:1200,today:'2026-10-06'})} AS visits, ${metrics.session_complimentary_rate.sql({rate:1200,today:'2026-10-06'})} AS share FROM (VALUES (3,10),(2,5),(NULL,6)) t(complimentary_visits,checked_in)`)).getRowObjectsJS()[0];assert.equal(Number(row.visits),5);assert.equal(Number(row.share),5/21);}finally{c.closeSync();db.closeSync();}
});
test('duration recovery preserves numeric minutes, missing values and rejects invalid dates',()=>{
  const source={key:'checkins',title:'Checkins',id:'test',status:'ok',fetchedAt:1,loadMs:0,columns:['Duration (Minutes)'],rows:[[60],['1900-01-29'],['1900-03-30'],['bad'],[null],[900]]};
  const result=normalise(source);assert.deepEqual(result.rows.map(r=>r.duration),[60,30,90,undefined,undefined,undefined]);assert.equal(result.defects.length,2);
});
// @ts-ignore JavaScript gateway
import { intelligenceRoutes } from '../server/intelligence.mjs';
import express from 'express';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('new workspace destinations survive an older database page constraint',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'p57-pages-'));let saved:any;
 const db={from:()=>({upsert(payload:any){saved=payload;return this;},select(){return this;},async single(){return saved.page>13?{data:null,error:{code:'23514',message:'page constraint'}}:{data:{...saved,id:'generated-id'},error:null};}})};
 const app=express();app.use(express.json());intelligenceRoutes(app,root,[],undefined,{db});const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/intelligence/documents`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'artifact',title:'Report chart',page:15,body:{type:'bar',sql:'SELECT 1 AS value',x:'value',y:'value'}})});const result=await response.json() as any;assert.equal(response.status,200);assert.equal(result.page,15);assert.equal(saved.page,13);assert.equal(saved.body.workspacePage,15);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});
