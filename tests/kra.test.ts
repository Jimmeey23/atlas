import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {kraPerformance,kraDefinitions} from '../server/kra-metrics.mjs';
import {kraRoutes} from '../server/kra.mjs';

test('KRA weights and completed-month revenue comparisons use full prior months and preserve unavailable periods',()=>{
  const source=rows=>({rows,status:'ok',fetchedAt:Date.now()});
  const result=kraPerformance({sales:source([
    {date:'2025-06-01',revenue:450,status:'succeeded'},{date:'2025-06-30',revenue:450,status:'succeeded'},
    {date:'2026-05-01',revenue:500,status:'succeeded'},{date:'2026-05-31',revenue:600,status:'succeeded'},
    {date:'2026-06-01',revenue:500,status:'succeeded',associate:'Jimmeey Gondaa'},{date:'2026-06-30',revenue:500,status:'succeeded'},
    {date:'2026-06-30',revenue:99000,status:'failed'},{date:'2026-06-30',revenue:99000,status:'succeeded',voided:true},
    {date:'2026-06-30',revenue:99000,status:'succeeded',imported:true}
  ])},'2026-10-06');
  assert.equal(kraDefinitions.reduce((sum,kra)=>sum+kra.weight,0),100);
  assert.equal(result.monthly[0].revenue,1000);assert.equal(result.monthly[0].previousRevenue,1100);
  assert.equal(result.monthly[0].revenueTarget,true);assert.equal(result.monthly[0].stabilityTarget,true);
  assert.equal(result.monthly[1].revenue,null);assert.equal(result.monthly[1].revenueTarget,null);
  assert.equal(result.monthly[5].state,'Upcoming');assert.equal(result.monthly[5].revenue,null);
  assert.equal(result.directSales.revenue,500);assert.equal(result.period.from,'2026-06-01');
});
test('KRA first-class outcomes reject prior attendances, cancellations, future attendance and late observation outcomes',()=>{
  const source=rows=>({rows,status:'ok'});
  const result=kraPerformance({leads:source([
    {date:'2026-06-01',member_id:'new',member:'New',lead_id:'1'},
    {date:'2026-06-01',member_id:'repeat',member:'Repeat',lead_id:'2'},
    {date:'2026-06-01',member_id:'late',lead_id:'3'},
    {date:'2026-06-01',email:'noemail+unknown@example.com',lead_id:'4'},
    {date:'2026-06-01',member_id:'new',lead_id:'1'}, // Duplicate lead ID is not a second prospect.
  ]),bookings:source([
    {member_id:'new',date:'2026-06-02',attended:true},
    {member_id:'new',date:'2026-06-01',cancelled:true},
    {member_id:'repeat',date:'2026-05-01',attended:true},
    {member_id:'repeat',date:'2026-06-02',attended:true},
    {member_id:'late',date:'2026-08-01',attended:true},
    {member_id:'new',date:'2026-11-01',attended:true},
    {email:'noemail+unknown@example.com',date:'2026-06-02',attended:true},
  ])},'2026-10-06');
  const june=result.monthly[0];
  assert.equal(june.trials.leads,4);assert.equal(june.trials.scheduled,1);assert.equal(june.trials.completed,1);
  assert.equal(june.observationEnd,'2026-07-30');
  assert.equal(june.trials.rows.find(row=>row.member_id==='repeat').completed,null);
  assert.equal(june.trialsTarget,null);
});
test('KRA churn uses recorded Lapsed dates across all membership records without expiry inference',()=>{
  const rows=[
    {member_id:'a',start_date:'2026-05-01',end_date:'2026-06-20',product:'Monthly Membership',revenue:500,status:'Renewed',source_row:2},
    {member_id:'a',start_date:'2026-05-02',end_date:'2026-06-25',product:'Monthly Membership',revenue:500,status:'Renewed',source_row:3},
    {member_id:'a',start_date:'2026-06-26',end_date:'2026-07-26',product:'Monthly Membership',revenue:500,source_row:4},
    {member_id:'b',start_date:'2026-05-01',end_date:'2026-06-30',product:'Monthly Membership',revenue:500,churned_date:'2026-06-30',status:'Lapsed',source_row:5},
    {member_id:'x',start_date:'2025-05-01',end_date:'2025-06-30',product:'Monthly Membership',revenue:500,churned_date:'2025-06-30',source_row:6},
    {member_id:'y',start_date:'2025-05-01',end_date:'2025-06-30',product:'Monthly Membership',revenue:500,churned_date:'2025-06-30',source_row:7},
    {member_id:'z',start_date:'2026-08-01',end_date:'2026-09-30',product:'Monthly Membership',revenue:500,source_row:8},
    {member_id:'free',start_date:'2026-05-01',end_date:'2026-06-30',product:'Free Membership',revenue:0,source_row:9},
  ];
  const result=kraPerformance({lapsed:{rows,status:'ok'}},'2026-10-06');
  const june=result.monthly[0];assert.equal(june.churn.due,4);assert.equal(june.churn.renewed,2);assert.equal(june.churn.rate,.25);
  assert.equal(june.churnReduction,.75);assert.equal(june.churnTarget,true);
  assert.equal(result.monthly[3].churn.rate,0);assert.equal(result.monthly[3].churnTarget,null);
});
test('protected KRA API rejects direct access, validates evidence and revokes sessions on lock',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'p57-kra-'));await mkdir(path.join(root,'.floor'));await mkdir(path.join(root,'.cache'));
  for(const key of ['sales','leads','bookings','lapsed'])await writeFile(path.join(root,'.cache',key+'.json'),JSON.stringify({key,columns:[],rows:[],status:'ok',fetchedAt:Date.now()}));
  const app=express();app.use(express.json());kraRoutes(app,root,[],async()=>{throw Error('Unexpected remote read');});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
  try {
    assert.equal((await fetch(base+'/api/kra/performance')).status,401);
    const wrong=await fetch(base+'/api/kra/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'bad'})});assert.equal(wrong.status,401);
    const unlock=await fetch(base+'/api/kra/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'9818'})});
    assert.equal(unlock.status,200);assert.match(unlock.headers.get('set-cookie'),/HttpOnly/i);const cookie=unlock.headers.get('set-cookie').split(';')[0];
    const loaded=await fetch(base+'/api/kra/performance',{headers:{Cookie:cookie}});assert.equal(loaded.status,200);assert.equal(loaded.headers.get('cache-control'),'no-store');
    const data=await loaded.json();assert.equal(data.definitions.length,7);assert.equal(data.trainingTopics.length,28);
    const topicURL=base+'/api/kra/training/'+data.trainingTopics[0].id;
    assert.equal((await fetch(topicURL,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'Completed',note:''})})).status,401);
    assert.equal((await fetch(topicURL,{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({status:'Completed',note:'Manually verified training'})})).status,200);
    const topicSaved=await(await fetch(base+'/api/kra/performance',{headers:{Cookie:cookie}})).json();
    assert.equal(topicSaved.evidence.marketingTopics[data.trainingTopics[0].id].status,'Completed');
    assert.equal(topicSaved.evidence.marketingTopics[data.trainingTopics[0].id].basis,'Manually reported by user');
    const send=body=>fetch(base+'/api/kra/evidence/growth',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await send({status:'Completed',note:'Onboarding',checks:[],date:'2026-06-20',url:''})).status,400);
    const valid=await send({status:'Completed',note:'Documented hiring and onboarding outcomes',checks:['Hired','Fully trained'],date:'2026-06-20',url:''});assert.equal(valid.status,200);
    const saved=await (await fetch(base+'/api/kra/performance',{headers:{Cookie:cookie}})).json();assert.equal(saved.evidence.growth.basis,'Self-reported evidence');
    await fetch(base+'/api/kra/lock',{method:'POST',headers:{Cookie:cookie}});
    assert.equal((await fetch(base+'/api/kra/performance',{headers:{Cookie:cookie}})).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});

test('exact 10 percent target boundaries avoid floating point false passes and false failures',()=>{
  const source=rows=>({rows,status:'ok'});
  const payments=[
    {date:'2025-06-01',revenue:450,status:'succeeded'},{date:'2025-06-30',revenue:450,status:'succeeded'},
    {date:'2026-05-01',revenue:550,status:'succeeded'},{date:'2026-05-31',revenue:550,status:'succeeded'},
    {date:'2026-06-01',revenue:495,status:'succeeded'},{date:'2026-06-30',revenue:495,status:'succeeded'}
  ];
  const memberships=[];
  for(let i=0;i<10;i++){
    memberships.push({member_id:'old-'+i,product:'Monthly membership',revenue:500,start_date:'2025-05-01',end_date:'2025-06-30',churned_date:'2025-06-30'});
    memberships.push({member_id:'new-'+i,product:'Monthly membership',revenue:500,start_date:'2026-05-01',end_date:'2026-06-30',churned_date:i===0?null:'2026-06-30'});
  }
  memberships.push({member_id:'new-0',product:'Monthly membership',revenue:500,start_date:'2026-07-01',end_date:'2026-08-01'});
  const june=kraPerformance({sales:source(payments),lapsed:source(memberships)},'2026-10-06').monthly[0];
  assert.equal(june.revenueTarget,true); // exactly 10% YoY growth meets the target
  assert.equal(june.stabilityTarget,false); // exactly 10% dip fails "less than 10%"
  assert.equal(june.churnTarget,true); // exactly 10% relative reduction meets the target
});

 test('KRA period totals use matched elapsed days and recorded historical churn',()=>{
  const source=rows=>({rows,status:'ok'});
  const result=kraPerformance({sales:source([
    {date:'2026-06-02',revenue:110,status:'succeeded',sale_id:'a'},
    {date:'2025-06-02',revenue:100,status:'succeeded'},
    {date:'2025-12-02',revenue:90,status:'succeeded'},
    {date:'2026-04-08',revenue:500,status:'succeeded'}
  ]),lapsed:source([
    {member_id:'old',start_date:'2025-08-01',end_date:'2025-09-01',churned_date:'2025-09-01',product:'Monthly membership',revenue:500},
    {member_id:'old',start_date:'2025-10-10',end_date:'2025-11-10',product:'Monthly membership',revenue:500}
  ])},'2026-10-06');
  const p=result.comparisonPeriods;
  assert.equal(p.current.to,'2026-10-06');assert.equal(p.lastYear.to,'2025-10-06');
  assert.equal(p.precedingMatched.from,'2025-12-01');assert.equal(p.precedingMatched.to,'2026-04-07');
  assert.equal(Date.parse(p.current.to)-Date.parse(p.current.from),Date.parse(p.precedingMatched.to)-Date.parse(p.precedingMatched.from));
  assert.equal(p.current.revenue,110);assert.equal(p.current.knownSales,1);assert.equal(p.precedingMatched.revenue,90);assert.equal(p.precedingFull.revenue,590);
  assert.equal(p.lastYear.lapsed,1);assert.equal(result.trajectories.trials,'Baseline review needed');
});

test('MTD scorecard comparisons restrict historical lead creation and sessions to equal elapsed days',()=>{
  const source=rows=>({rows,status:'ok'});
  const result=kraPerformance({leads:source([
    {date:'2026-10-02',member_id:'current',lead_id:'c'},
    {date:'2025-10-02',member_id:'last',lead_id:'l'},
    {date:'2025-10-20',member_id:'late-last',lead_id:'ll'},
    {date:'2026-09-02',member_id:'previous',lead_id:'p'},
    {date:'2026-09-20',member_id:'late-previous',lead_id:'lp'}
  ]),bookings:source([
    {member_id:'current',date:'2026-10-03',attended:true},
    {member_id:'last',date:'2025-10-03',attended:true},
    {member_id:'late-last',date:'2025-10-21',attended:true},
    {member_id:'previous',date:'2026-09-03',attended:true},
    {member_id:'late-previous',date:'2026-09-21',attended:true}
  ])},'2026-10-06');
  const october=result.monthly[4];
  assert.equal(october.trials.leads,1);assert.equal(october.baselineTrials.leads,1);assert.equal(october.previousTrials.leads,1);
  assert.equal(october.previousTrials.scheduled,1);assert.equal(october.previousTrials.completedRate,1);
});
