import test from 'node:test';
import assert from 'node:assert/strict';
import { reportReleaseIssues, assertRenderedReport } from '../src/report/release-gate.mjs';
import { operationalIntelligence, wilson } from '../src/report/intelligence';
import { controlLimits } from '../src/report/statistics';
import type { ReportModel } from '../src/report/model';
const report = () => ({scope:{studio:'A',month:'2026-09'},customization:{chapterIds:['sessions']},chapters:{sessions:{populationKey:'A|sessions',total:{attendance:2000},prior:{attendance:2503},priorYear:{},groups:[],history:[],n:40}},narratives:{sessions:{summary:'Demand weakened.',generated:true,cards:[{headline:'Fewer visits',meaning:'Demand weakened.',action:'Review timetable',evidence:'Attendance fell 503'}]}}} as unknown as ReportModel);
test('release gate fails closed on failed narratives and unresolved output templates',()=>{
  const m=report();assert.deepEqual(reportReleaseIssues(m),[]);
  m.narratives.sessions.error='Failed to fetch';assert.ok(reportReleaseIssues(m).some(v=>v.includes('narrative incomplete')));
  delete m.narratives.sessions.error;m.narratives.sessions.summary='Behind by {rate} }';assert.ok(reportReleaseIssues(m).some(v=>v.includes('unresolved')));
});
test('release gate catches −503 versus −1768 for the same population and bridge',()=>{
  const m=report();m.chapters.recommendations={...m.chapters.sessions,total:{attendance:735}};
  assert.ok(reportReleaseIssues(m).some(v=>v.includes('disagrees')));
  delete m.chapters.recommendations;
  m.chapters.sessions.groups=[{id:'format',field:'format',columns:['attendance'],rows:[],total:null,title:'Format',deck:'',analysis:{metric:'attendance',totalChange:-1768}}];
  assert.ok(reportReleaseIssues(m).some(v=>v.includes('bridge disagrees')));
  m.chapters.sessions.groups[0].analysis!.totalChange=-503;assert.deepEqual(reportReleaseIssues(m),[]);
});
test('different populations are never forced to reconcile',()=>{
  const m=report();m.chapters.checkins={...m.chapters.sessions,populationKey:'A|checkins',total:{attendance:735}};assert.deepEqual(reportReleaseIssues(m),[]);
});
test('rendered output gate rejects empty KPI and stray braces',()=>{
  assert.throws(()=>assertRenderedReport({textContent:'Demand }',querySelectorAll:()=>[]} as any),/unresolved/);
  assert.throws(()=>assertRenderedReport({textContent:'KPI',querySelectorAll:()=>[{textContent:'—'}]} as any),/empty KPI/);
});
test('D30 and D60 immature cohorts are censored; conversion is independent of retention',()=>{
  const sources={new:[{member_id:'1',first_visit:'2026-09-01',entry_type:'Trial',first_purchase_date:'2026-09-04',post_trial_purchases:1}],checkins:[{member_id:'1',date:'2026-09-02',attended:1}]};
  const data=operationalIntelligence(sources,'2026-09','2026-10-15');
  const row=data.tables.find(t=>t.title.includes('triangle'))!.rows[0];
  assert.match(String(row[3]),/^100/);assert.match(String(row[4]),/^100/);assert.equal(row[5],'Maturing');assert.equal(row[7],'Maturing');
  sources.checkins[0].date='2026-09-01';
  const mature=operationalIntelligence(sources,'2026-09','2026-12-01').tables[0].rows[0];assert.match(String(mature[3]),/^100/);assert.match(String(mature[4]),/^0/);
});
test('member bridge reconciles unique IDs and excludes promotional access',()=>{
  const base={revenue:1000,product:'Monthly',start_date:'2026-08-01',end_date:'2026-09-30'};
  const sources={lapsed:[{...base,member_id:'stay'},{...base,member_id:'lost',end_date:'2026-09-03'},{...base,member_id:'new',start_date:'2026-09-03'},{...base,member_id:'promo',product:'2 for 1'}]};
  const bridge=operationalIntelligence(sources,'2026-09','2026-10-15').tables.find(t=>t.title==='Member-base bridge')!.rows[0];
  assert.deepEqual(bridge,[2,1,1,0,2,.5]);assert.equal(Number(bridge[0])+Number(bridge[1])-Number(bridge[2])+Number(bridge[3]),bridge[4]);
});
test('payroll contribution ranks profit rather than fill; missing costs remain unknown',()=>{
  const sources={sessions:[{date:'2026-09-01',trainer:'A',format:'Mat',sessions:1,capacity:10,checked_in:10,revenue:500},{date:'2026-09-01',trainer:'B',format:'Cycle',sessions:1,capacity:20,checked_in:5,revenue:900}],payroll:[{date:'2026-09-01',trainer:'A',sessions:1,revenue:400},{date:'2026-09-01',trainer:'B',sessions:1,revenue:200}]};
  const rows=operationalIntelligence(sources,'2026-09','2026-10-15').tables.find(t=>t.title==='Slot contribution ranking')!.rows;
  assert.match(String(rows[0][0]),/Cycle/);assert.equal(rows[0][4],700);
});
test('confidence intervals and control limits respect minimum evidence',()=>{
  const interval=wilson(0,6)!;assert.equal(interval[0],0);assert.ok(interval[1]>.3);assert.equal(wilson(0,0),null);
  assert.equal(controlLimits([1,2,3]),null);const limits=controlLimits([...Array(12).fill(10),100])!;assert.equal(limits.mean,10);assert.equal(limits.upper,10);
});
test('derived attendance prose must reconcile to the selected studio bridge',()=>{
  const m=report();m.narratives.sessions.summary='Attendance by format moved −1,768.';
  assert.ok(reportReleaseIssues(m).some(v=>v.includes('narrative change disagrees')));
  m.narratives.sessions.summary='Attendance by format moved −503.';assert.deepEqual(reportReleaseIssues(m),[]);
});
test('recommendations cannot release with an unassigned owner or generic horizon',()=>{
  const m=report();m.customization!.chapterIds=['recommendations'];m.narratives.recommendations={summary:'Act on evidence.',generated:true,cards:[{headline:'Adjust Saturday',meaning:'Supply exceeds demand.',evidence:'Frozen schedule.',action:'Test moving the Saturday session.',ownerArea:'Studio operations',horizon:'Next 30 days',impact:'100 extra visits',watch:'Visits per session'}]};
  assert.ok(reportReleaseIssues(m).some(v=>v.includes('deadline')));assert.ok(reportReleaseIssues(m).some(v=>v.includes('impact range')));assert.ok(reportReleaseIssues(m).some(v=>v.includes('priorActionResult')));
  Object.assign(m.narratives.recommendations.cards[0],{horizon:'Proposed 2026-11-15',impact:'Unavailable: marginal paid-seat yield missing',priorActionResult:'Not recorded'});assert.deepEqual(reportReleaseIssues(m),[]);
});
test('missing attendance outcome flags remain unavailable in the hygiene trend',()=>{
  const result=operationalIntelligence({checkins:[{member_id:'a',date:'2026-09-01',attended:1}]},'2026-09','2026-10-15');
  const row=result.tables.find(t=>t.title.startsWith('Data hygiene'))!.rows.at(-1)!;
  assert.equal(row[4],null);assert.equal(row[5],null);
});
test('transaction concentration aggregates sale lines and applies a common historical outlier threshold',()=>{
  const baseline=Array.from({length:30},(_,i)=>({sale_id:`old-${i}`,date:'2026-08-01',revenue:100,status:'succeeded'}));
  const result=operationalIntelligence({sales:[...baseline,{sale_id:'normal',date:'2026-09-01',revenue:100,status:'succeeded'},{sale_id:'large',date:'2026-09-01',revenue:6000,status:'succeeded'},{sale_id:'large',date:'2026-09-02',revenue:4000,status:'succeeded'},{sale_id:'failed',date:'2026-09-02',revenue:100000,status:'failed'}]},'2026-09','2026-10-15');
  const row=result.tables.find(t=>t.title.startsWith('Transaction concentration'))!.rows[0];
  assert.equal(row[0],2);assert.equal(row[1],10000/10100);assert.equal(row[4],100);assert.equal(row[5],100/3000-1);
});
