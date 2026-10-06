import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {kraRoutes} from '../server/kra.mjs';import {acquisitionCounts} from '../server/kra-acquisition.mjs';import {kraPerformance} from '../server/kra-metrics.mjs';
test('trials count Is New contains new; referrals require exactly New - Referral Class',()=>{
 const rows=[{date:'2026-06-01',member_id:'same',entry_type:'New - Trial Class'},{date:'2026-06-02',member_id:'same',entry_type:'NEW - Trial Class'},{date:'2026-06-03',entry_type:'New - Referral Class'},{date:'2026-06-04',entry_type:'NEW - REFERRAL CLASS'},{date:'2026-06-05',entry_type:'Referral Class'},{date:'2026-07-01',entry_type:'New - Referral Class'},{date:null,entry_type:'new'}];
 const result=acquisitionCounts(rows,'2026-06-01','2026-06-30');assert.equal(result.trials,4);assert.equal(result.referrals,2);assert.equal(result.rows.length,4);assert.equal(result.rows.filter(row=>row.trial_included).length,4);assert.equal(result.rows.filter(row=>row.referral_included).length,2);
 const performance=kraPerformance({new:{rows,status:'ok'}},'2026-10-06');assert.equal(performance.monthly[0].acquisition.trials,4);assert.equal(performance.comparisonPeriods.current.referrals,3); // Includes July record too.
});
test('protected KRA edits persist across server reinitialisation, retain revision history and reject stale writes',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'p57-kra-edits-'));await mkdir(path.join(root,'.floor'));await mkdir(path.join(root,'.cache'));
 for(const key of ['sales','leads','bookings','lapsed','new'])await writeFile(path.join(root,'.cache',key+'.json'),JSON.stringify({key,columns:[],rows:[],status:'ok',fetchedAt:Date.now()}));
 let server;const start=async()=>{const app=express();app.use(express.json());kraRoutes(app,root,[],async()=>{throw Error('No remote reads');});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));return 'http://127.0.0.1:'+server.address().port;};
 const login=async base=>(await fetch(base+'/api/kra/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'9818'})})).headers.get('set-cookie').split(';')[0];
 const data={current:'55 trials · 4 referrals',lastYear:'50 trials · 3 referrals',preceding:'48 trials · 2 referrals',yoy:.1,previousGrowth:.15,status:'On track',explanation:'Manually reconciled source counts',note:'Follow up on referrals',annotation:'Reconciled on 6 Oct'};
 const body={info:{area:'Trials & Referrals',target:'Reviewed target',weight:15},data,expectedUpdatedAt:null};
 try{
  let base=await start();assert.equal((await fetch(base+'/api/kra/scorecard/2026-10/trials',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,401);
  let cookie=await login(base);const put=body=>fetch(base+'/api/kra/scorecard/2026-10/trials',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await put({...body,info:{...body.info,weight:101}})).status,400);const response=await put(body);assert.equal(response.status,200);const first=await response.json();assert.equal(first.record.note,data.note);
  assert.equal((await put(body)).status,409);await new Promise(resolve=>server.close(resolve));base=await start();cookie=await login(base);
  const loaded=await(await fetch(base+'/api/kra/performance',{headers:{Cookie:cookie}})).json();assert.equal(loaded.scorecardEdits['2026-10/trials'].current,data.current);assert.equal(loaded.scorecardHistory.length,1);assert.equal(loaded.definitions.find(row=>row.id==='trials').target,'Reviewed target');assert.equal(loaded.definitions.find(row=>row.id==='trials').targetEdited,true);
  const restored={...data,current:null,lastYear:null,preceding:null,yoy:null,previousGrowth:null,status:null,explanation:null};const restore=await fetch(base+'/api/kra/scorecard/2026-10/trials',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({...body,data:restored,expectedUpdatedAt:first.record.updatedAt})});assert.equal(restore.status,200);const result=await restore.json();assert.equal(result.record.current,null);assert.equal(result.record.note,data.note);assert.equal(result.history.length,2);assert.equal(result.history[0].after.current,data.current);
 }finally{if(server?.listening)await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
test('bulk training progress applies to every selected topic in one write and rejects unknown ids',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'p57-kra-bulk-'));await mkdir(path.join(root,'.floor'));await mkdir(path.join(root,'.cache'));
 for(const key of ['sales','leads','bookings','lapsed','new'])await writeFile(path.join(root,'.cache',key+'.json'),JSON.stringify({key,columns:[],rows:[],status:'ok',fetchedAt:Date.now()}));
 const app=express();app.use(express.json());kraRoutes(app,root,[],async()=>{throw Error('No remote reads');});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{
  const cookie=(await fetch(base+'/api/kra/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'9818'})})).headers.get('set-cookie').split(';')[0];
  const put=body=>fetch(base+'/api/kra/training',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await fetch(base+'/api/kra/training',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[],status:'Completed'})})).status,401);
  const topics=(await(await fetch(base+'/api/kra/performance',{headers:{Cookie:cookie}})).json()).trainingTopics;
  assert.ok(topics.length>2);
  assert.equal((await put({ids:[],status:'Completed'})).status,400);
  assert.equal((await put({ids:[topics[0].id,'not-a-topic'],status:'Completed'})).status,400);
  assert.equal((await put({ids:[topics[0].id],status:'Done'})).status,400);
  const ids=topics.slice(0,3).map(topic=>topic.id);
  const result=await(await put({ids:[...ids,ids[0]],status:'Completed'})).json();
  assert.deepEqual(Object.keys(result).sort(),[...ids].sort());
  ids.forEach(id=>assert.equal(result[id].status,'Completed'));
  const loaded=await(await fetch(base+'/api/kra/performance',{headers:{Cookie:cookie}})).json();
  ids.forEach(id=>assert.equal(loaded.evidence.marketingTopics[id].status,'Completed'));
  assert.equal(loaded.evidence.marketingTopics[topics[3].id],undefined);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
