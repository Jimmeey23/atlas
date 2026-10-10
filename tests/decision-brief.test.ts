import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionBrief, decisionTopic, DECISION_SECTIONS } from '../src/report/decision-brief';
import { findingsFor, analyseGroup } from '../src/report/findings';
import type { InsightCard, ReportModel } from '../src/report/model';
const card:InsightCard={headline:'A recorded movement',meaning:'Evidence is a concentration, not a cause.',evidence:'84 visits lost.',action:''};
test('decision briefs preserve legacy cards and reject malformed shared snapshots',()=>{
 assert.equal(decisionBrief(card),undefined);
 assert.equal(decisionTopic(card,'sessions'),'attendance');
 assert.equal(decisionTopic(card,'renewals'),'retention');
 assert.notDeepEqual(DECISION_SECTIONS.conversion,DECISION_SECTIONS.attendance);
 const brief={topic:'attendance',kind:'performance_anomaly',diagnosis:'Test alternative explanations.',affected:'Verify the cohort.',opportunity:'Conditional scenario.',steps:[{label:'Diagnose',detail:'Compare August.'}],review:'Suggested: 7 days',success:'Suggested +50 visits, capacity permitting.',stats:[{label:'Visits lost',value:'−84',basis:'55% of net decline, not gross losses.',status:'confirmed'}]};
 assert.equal(decisionBrief({...card,decisionBrief:brief as any})?.steps[0].label,'Diagnose');
 assert.equal(decisionBrief({...card,decisionBrief:{...brief,stats:[{value:84}]} as any}),undefined);
 assert.equal(decisionBrief({...card,decisionBrief:{...brief,topic:'constructor'} as any}),undefined);
});
test('net decline contributions retain offsets and do not become shares of gross loss',()=>{
 const rows=[{g:'A',attendance:16},{g:'B',attendance:12},{g:'C',attendance:20}];
 const prior={A:{attendance:100},B:{attendance:100},C:{attendance:0}};
 const group={field:'format',title:'Formats',deck:'',columns:['attendance']};
 const analysis=analyseGroup(group,group.columns,rows,prior,rows,{attendance:48});
 const model:ReportModel={scope:{studio:'Test studio',month:'2026-09'},builtAt:'2026-10-10',figuresHash:'fixture',narratives:{},chapters:{sessions:{id:'sessions',n:20,total:{attendance:48},prior:{attendance:200},priorYear:{},history:[],groups:[{id:'format',field:'format',title:'Formats',deck:'',total:{attendance:48},columns:['attendance'],rows,prior,priorYear:{},minimum:'3 contributing records',analysis}]}}};
 const text=findingsFor(model).sessions.map(f=>f.text).join(' ');
 assert.match(text,/net change, not of gross losses/);
 assert.match(text,/offset/);
});
