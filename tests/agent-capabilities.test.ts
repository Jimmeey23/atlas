import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-ignore
import { calculate, dataQualitySQL, publicResearchQuery, capabilityToolDefs, agentSkills } from '../server/agent-capabilities.mjs';
// @ts-ignore
import { intelligenceRoutes } from '../server/intelligence.mjs';
import { agentIntent } from '../src/semantics/agent-intent.ts';

test('calculator supports formulas and precedence without executing arbitrary code', () => {
  for (const [expression, value] of [ ['2+3*4', 14], ['(2+3)*4', 20], ['-2^2', -4], ['2^-2', .25], ['2^3^2', 512], ['round(125/3,2)', 41.67], ['percent_change(125000,147500)',18], ['max(2,5,3)+sqrt(16)',9], ['1e3*.02',20] ] as const) assert.equal(calculate(expression),value,expression);
  for(const expression of ['process.exit()', 'globalThis', '1/0', 'sqrt(-1)', 'percent_change(0,100)', 'pow(2)', 'min()', 'round(2,1000)', 'constructor(1)', '1;2', '1e999']) assert.throws(()=>calculate(expression),undefined,expression);
});
test('public research rejects contacts, and source quality fields are whitelisted', () => {
  assert.equal(publicResearchQuery('Boutique fitness trends India 2026'),'Boutique fitness trends India 2026');
  assert.throws(()=>publicResearchQuery('member@example.com'));
  assert.throws(()=>publicResearchQuery('call +91 9876543210'));
  assert.throws(()=>dataQualitySQL('other',['location'],['sales'],{location:'VARCHAR'}));
  assert.throws(()=>dataQualitySQL('sales',['location); DROP TABLE sales'],['sales'],{location:'VARCHAR'}));
  assert.throws(()=>dataQualitySQL('sales',['email'],['sales'],{email:'VARCHAR'}));
  assert.match(dataQualitySQL('sales',['revenue'],['sales'],{revenue:'DOUBLE'}),/revenue_missing/);
  for (const tool of capabilityToolDefs(['sales'],['revenue'],['gross_revenue'])) {
    assert.equal(tool.strict,true);
    assert.equal(tool.parameters.additionalProperties,false);
    assert.deepEqual(tool.parameters.required,Object.keys(tool.parameters.properties));
  }
  assert.equal(Object.keys(agentSkills).length,8);
});
test('intent detects advanced element requests and preserves explanatory questions', () => {
  for(const text of ['Create a pivot by instructor and month','Make KPI cards for Bandra','Plot a scatter of fill vs yield','Generate a heatmap of weekday by time']) assert.equal(agentIntent(text),'build',text);
  for(const text of ['How do I create a chart?','Explain how to build a pivot','Create a follow-up communication plan','Do not create a table; explain the trend']) assert.equal(agentIntent(text),'ask',text);
});

const present = (headline='Your view is ready') => ({headline,answer:'The requested result has been checked.',highlights:[],chart:{type:'none',title:'',evidence:0,x:'',series:[]},table_evidence:null,caveats:[],follow_ups:[],actions:[]});
const call=(name:string,args:object,id:string)=>({output:[{type:'function_call',name,arguments:JSON.stringify(args),call_id:id}]});
async function fixture(ai:any, db?:any) {
  const root=await mkdtemp(path.join(tmpdir(),'p57-capabilities-'));await mkdir(path.join(root,'.cache'));
  const columns=['Member ID','Late Cancelled','Session Date','Location','Attended'];
  await writeFile(path.join(root,'.cache/bookings.json'),JSON.stringify({key:'bookings',columns,rows:[['1',false,'2026-09-01','Kemps Corner',true],['2',false,'2026-09-02','Kenkere House',true]],fetchedAt:1791000000000}));
  const app=express();app.use(express.json());intelligenceRoutes(app,root,[{key:'bookings',columns}],undefined,{ai,db});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const url='http://127.0.0.1:'+(server.address() as any).port;
  return {url,send:async(message:string,mode='ask')=>{const r=await fetch(url+'/api/intelligence/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,page:6,saveHistory:false,filters:{}})});return {status:r.status,data:await r.json() as any};},close:async()=>{await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}};
}
test('real tool loop audits fixtures, calculates, repairs preview and persists only after validation',async()=>{
  const saved:any[]=[]; const outputs:any[]=[];let step=0;
  const body={type:'kpi',sql:'SELECT COUNT(*) AS bookings FROM bookings',series:['bookings']};
  const sequence=[call('get_skill',{skill:'visualization'},'skill'),call('get_metric_definitions',{metric_ids:['bookings']},'definitions'),call('present_answer',present(),'premature'),call('audit_data_quality',{source:'bookings',fields:['location','date'],scope_json:null},'quality'),call('calculate',{expression:'percent_change(100,120)',basis:'User scenario assumptions'},'calc'),call('validate_element',{body_json:JSON.stringify({...body,sql:'SELECT location, COUNT(*) AS bookings FROM bookings GROUP BY location'}),scope_json:null},'bad'),call('validate_element',{body_json:JSON.stringify(body),scope_json:null},'preview'),call('save_element',{kind:'artifact',title:'Booking KPI',page:0,body_json:JSON.stringify(body)},'save'),call('present_answer',present(),'answer')];
  const ai={responses:{create:async(request:any)=>{outputs.push(...request.input.filter((i:any)=>i.type==='function_call_output').map((i:any)=>({id:i.call_id,...JSON.parse(i.output)})));return sequence[step++] || {output:[],output_text:'done'};}}};
  const db={from:()=>({select(){return this;},eq(){return this;},order(){return this;},limit(){return Promise.resolve({data:[],error:null});},upsert(doc:any){saved.push({...doc,id:'fixture-doc'});return this;},single(){return Promise.resolve({data:saved.at(-1),error:null});}})};
  const f=await fixture(ai,db);
  try {
    const result=await f.send('Create KPI cards of bookings','build');assert.equal(result.status,200,JSON.stringify(result.data));
    assert.equal(saved.length,1);assert.equal(saved[0].page,6,'selected destination overrides model suggestion');
    assert.match(outputs.find(o=>o.id==='premature').error,/No element has been saved/);
    assert.match(outputs.find(o=>o.id==='bad').error,/exactly one aggregated row/);
    assert.equal(outputs.find(o=>o.id==='preview').valid,true);
    assert.equal(Number(outputs.find(o=>o.id==='quality').rows[0].source_rows),2);
    assert.equal(typeof outputs.find(o=>o.id==='definitions').definitions[0].expression,'string');
    assert.ok(outputs.find(o=>o.id==='definitions').definitions[0].sources.length);
    assert.equal(outputs.find(o=>o.id==='calc').value,20);
    assert.equal(result.data.presentation.basis,'source');
    assert.equal(result.data.activity.filter((a:any)=>a.status==='error').length,2);
  } finally {await f.close();}
});
test('public research citations reach the response and general help does not require studio queries',async()=>{
  let step=0;
  const ai={responses:{create:async(request:any)=>{
    if(request.tools?.some((t:any)=>t.type==='web_search')) return {output_text:'Current public evidence.',output:[{type:'message',content:[{annotations:[{type:'url_citation',title:'Primary source',url:'https://example.com/research'}]}]}]};
    return step++===0 ? call('research_web',{query:'Public fitness trends India'},'research') : call('present_answer',present('Public evidence reviewed'),'answer');
  }}};
  const f=await fixture(ai);
  try {const result=await f.send('Research public fitness trends');assert.equal(result.status,200);assert.equal(result.data.presentation.basis,'research');assert.deepEqual(result.data.presentation.sources,[{title:'Primary source',url:'https://example.com/research'}]);assert.deepEqual(result.data.saved,[]);}finally{await f.close();}
  const g=await fixture({responses:{create:async()=>call('present_answer',present('A useful writing plan'),'general')}});
  try {const result=await g.send('Help write a concise follow-up guide');assert.equal(result.status,200);assert.equal(result.data.presentation.basis,'general');assert.deepEqual(result.data.evidence,[]);}finally{await g.close();}
});
