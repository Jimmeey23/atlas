import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
// @ts-ignore
import {resolveQuestionScope,simpleSalesQuestion,toolScope} from '../server/agent-scope.mjs';
// @ts-ignore
import {intelligenceRoutes} from '../server/intelligence.mjs';
test('explicit April sales scope replaces conflicting September dashboard scope and studio filters',()=>{
 const resolved=resolveQuestionScope('howmuch sales did kwality house do in april 2026?',{from:'2026-09-01',to:'2026-09-30',location:['Kenkere House'],trainer:['Instructor A'],cross:[{field:'month',value:'2026-09'}]});
 assert.deepEqual(resolved,{explicit:true,filters:{imports:false,from:'2026-04-01',to:'2026-04-30',location:['Kwality House, Kemps Corner']}});
 assert.deepEqual(resolveQuestionScope('Compare Kwality House and Kenkere House in April 2026').filters.location,['Kwality House, Kemps Corner','Kenkere House']);
 assert.deepEqual(toolScope('{"from":null,"location":["Kemps Corner"]}',{from:'2026-09-01'}),{location:['Kwality House, Kemps Corner']});
 assert.throws(()=>toolScope('{"location":"Kemps Corner"}',{}));
 assert.equal(resolveQuestionScope('Compare April 2026 and May 2026').filters.to,'2026-05-31');
 assert.equal(resolveQuestionScope('Build monthly sales for 2026').filters.from,'2026-01-01');
 assert.equal(resolveQuestionScope('Sales in February 2024').filters.to,'2024-02-29');
 assert.equal(resolveQuestionScope('Sales in February 2026').filters.to,'2026-02-28');
 assert.deepEqual(resolveQuestionScope('Attendance in current scope',{trainer:['A']}).filters,{trainer:['A']});
 for(const question of ['Compare sales April 2026 and May 2026','How many sales in April 2026?','Build a sales table','What is revenue per session?','What were sales last month?','How much membership revenue did Kwality House make in April 2026?' ]) assert.equal(simpleSalesQuestion(question),false,question);
});
test('Ask returns governed payment totals without GPT or cloud, and does not invoke creation tools',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'p57-scope-'));await mkdir(path.join(root,'.cache'));
 const columns=['Payment Date','Payment Value','Payment VAT','Payment Status','Calculated Location','Sale ID','Sec. Is Voided','Payment Source'];
 const rows=[['2026-04-01',100.15,5,'succeeded','Kemps Corner','s1',null,'pos'],['2026-04-30',50.15,2,'succeeded','Kwality House','s1',false,'pos'],['2026-04-20',1000,50,'failed','Kemps Corner','s2',false,'pos'],['2026-04-20',2000,100,'succeeded','Kemps Corner','s3',true,'pos'],['2026-09-01',9000,450,'succeeded','Kemps Corner','s4',false,'pos'],['2026-04-01',3000,150,'succeeded','Kenkere House','s5',false,'pos']];
 await writeFile(path.join(root,'.cache/sales.json'),JSON.stringify({key:'sales',columns,rows,fetchedAt:1791000000000}));
 let calls=0;const ai={responses:{create:async(request:any)=>{
  calls++;assert.deepEqual(request.tools.map((t:any)=>t.name),['query_studio','inspect_source','query_sales','find_entity','query_metrics']);
  if(request.input.at(-1)?.role === 'user' && /Compare/.test(request.input.at(-1).content)) return {output:[{type:'function_call',name:'query_sales',call_id:'canonical-sales',arguments:JSON.stringify({group_by:'studio',scope_json:null})}]};
  return {output:[],output_text:'Read-only question answered.'};
 }}};
 const app=express();app.use(express.json());intelligenceRoutes(app,root,[{key:'sales',columns}],undefined,{ai});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+(server.address() as any).port;
 const send=async(message:string,endpoint='ask')=>{const response=await fetch(url+'/api/intelligence/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,saveHistory:false,filters:{from:'2026-09-01',to:'2026-09-30',location:['Kenkere House']}})});return {status:response.status,body:await response.json() as any};};
 try {
  const gross=await send('How much sales did Kwality House do in April 2026?');assert.equal(gross.status,200,JSON.stringify(gross.body));assert.match(gross.body.answer,/₹150.3/);assert.equal(gross.body.evidence[0].result[0].sales,'1');assert.equal(gross.body.evidence[0].result[0].source_lines,'2');assert.equal(calls,0);assert.deepEqual(gross.body.saved,[]);
  const net=await send('What were net sales at Kwality House in April 2026?');assert.match(net.body.answer,/₹143.3/);
  const empty=await send('What were sales at Kwality House in April 2025?');assert.match(empty.body.answer,/does not establish zero sales/);
  await send('Create a sales chart for April 2026');assert.equal(calls,1);
  const comparison=await send('Compare April 2026 sales for Kwality House and Kenkere House');assert.equal(comparison.status,200);assert.equal(comparison.body.evidence[0].result.length,2);assert.equal(comparison.body.evidence[0].result.find((r:any)=>r.location==='Kwality House, Kemps Corner').gross_revenue,150.3);assert.deepEqual(comparison.body.saved,[]);
 } finally {await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});
