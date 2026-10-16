import test from 'node:test';
import assert from 'node:assert/strict';
import {applyReportOperations,reportEditorContext,type ReportEditOperation} from '../src/report/source-edit';
import type {ReportModel} from '../src/report/model';
import {metricRecordFocus} from '../src/report/source-records';
const model=():ReportModel=>({scope:{studio:'Supreme HQ, Bandra',month:'2026-09'},builtAt:'2026-10-13T00:00:00Z',figuresHash:'frozen',narratives:{},chapters:{sessions:{id:'sessions',n:259,total:{sessions:259,attendance:1404},prior:{},priorYear:{},history:[{month:'2026-09',sessions:259,attendance:1404}],groups:[{field:'trainer',title:'Instructors',deck:'',columns:['sessions','attendance'],rows:[{g:'Instructor A',sessions:39,attendance:205}],total:null}]}},importedChapters:[{id:'overview',title:'Performance Review',filename:'source.html',html:'',sha256:'hash',tables:0,charts:0,metrics:[],sections:[{id:'summary',title:'Decision brief',html:'',tables:0,charts:0,blocks:[{id:'finding',kind:'text',title:'Finding',text:'Original prose'}]}]}]});
const operation=(extra:Partial<ReportEditOperation>):ReportEditOperation=>({action:'set',chapterId:'overview',sectionId:'summary',blockId:'finding',element:'text',text:'Updated prose',block:null,...extra});
test('report-wide operations edit, add, replace and delete by stable IDs without mutating frozen source datasets',()=>{
 const original=model();
 const next=applyReportOperations(original,[operation({}),operation({action:'add',blockId:'',block:{id:'chart-1',kind:'chart',title:'Instructor attendance',dataChapterId:'sessions',groupField:'trainer',metricId:'attendance'}}),operation({action:'replace',blockId:'chart-1',block:{id:'ignored',kind:'table',title:'Instructor register',dataChapterId:'sessions',groupField:'trainer'}})]);
 assert.equal(original.importedChapters![0].sections![0].blocks!.length,1);
 assert.equal(next.importedChapters![0].sections![0].blocks![0].text,'Updated prose');
 const table=next.importedChapters![0].sections![0].blocks![1];assert.equal(table.id,'chart-1');assert.deepEqual(table.rows,original.chapters.sessions.groups[0].rows);assert.equal(next.importedChapters![0].tables,1);
 const deleted=applyReportOperations(next,[operation({action:'delete',blockId:'finding'})]);assert.equal(deleted.importedChapters![0].sections![0].blocks![0].id,'chart-1');assert.deepEqual(deleted.chapters,original.chapters);
});
test('AI chart and table additions resolve actual evidence and discard proposed numerical rows',()=>{
 const next=applyReportOperations(model(),[operation({action:'add',blockId:'',block:{id:'monthly',kind:'chart',title:'Monthly',dataChapterId:'sessions',groupField:'month',metricId:'attendance',rows:[{month:'2026-09',attendance:99999}]}})]);
 assert.equal(next.importedChapters![0].sections![0].blocks![1].rows![0].attendance,1404);
 assert.throws(()=>applyReportOperations(model(),[operation({action:'add',blockId:'',block:{id:'bad',kind:'table',title:'Invented',dataChapterId:'unknown'}})]),/governed dataset/);
});
test('metric selections require measured monthly values and can never produce unavailable placeholder cards',()=>{
 const next=applyReportOperations(model(),[operation({sectionId:'',blockId:'',element:'metric:attendance',text:'sessions'})]);assert.equal(next.importedChapters![0].metrics![0].metricId,'attendance');
 assert.throws(()=>applyReportOperations(model(),[operation({sectionId:'',blockId:'',element:'metric:invented',text:'sessions'})]),/measured report/);
});
test('full-report AI context includes every element, definitions and frozen comparisons without dropping off-screen chapters',()=>{
 const m=model();const context=JSON.parse(reportEditorContext(m));assert.equal(context.chapters[0].sections[0].blocks[0].text,'Original prose');assert.equal(context.datasets.sessions.total.attendance,1404);assert.equal(context.metricDefinitions.attendance.label,'Attendance');
});
test('filtered distinct count drilldowns use the same membership and attended-record populations as their metrics',()=>{
 assert.match(metricRecordFocus('lapsed_members')!.where!,/latest_lapse/);
 assert.match(metricRecordFocus('unique_attendees')!.where!,/attended/);
});

test('generated reports support evidence-bound element and metric edits without changing frozen datasets', () => {
 const m=model(); delete m.importedChapters;
 m.customization={title:'Review',subtitle:'',preparedFor:'',preparedBy:'',audience:'Leadership',tone:'Professional',detail:'Comprehensive',instructions:'',chapterIds:['sessions'],theme:'light'};
 m.narratives.sessions={generated:true,summary:'Original narrative',cards:[{headline:'Original verdict',meaning:'Observed demand',evidence:'Frozen figures',action:'',focus:'kpis'},{headline:'Original finding',meaning:'A specific pattern',evidence:'Frozen rows',action:'',focus:'trainer'}]};
 const before=JSON.stringify(m.chapters);
 const operations=[operation({chapterId:'sessions',sectionId:'',blockId:'',element:'summary',text:'Revised narrative'}),operation({chapterId:'sessions',sectionId:'findings',blockId:'finding-1',element:'meaning',text:'Revised interpretation'}),operation({chapterId:'sessions',sectionId:'',blockId:'',element:'metric:attendance',text:'sessions'}),operation({action:'add',chapterId:'sessions',sectionId:'additional',blockId:'',element:'',text:'',block:{id:'attendance-trend',kind:'chart',title:'Attendance history',dataChapterId:'sessions',groupField:'month',metricId:'attendance'}})];
 const next=applyReportOperations(m,operations);
 assert.equal(next.narratives.sessions.summary,'Revised narrative');
 assert.equal(next.narratives.sessions.cards[1].meaning,'Revised interpretation');
 assert.deepEqual(next.documentEdits?.metrics.sessions,[{metricId:'attendance',dataChapterId:'sessions'}]);
 assert.equal(next.documentEdits?.blocks.sessions[0].rows?.[0].attendance,1404);
 assert.equal(JSON.stringify(next.chapters),before);
 assert.equal(m.narratives.sessions.summary,'Original narrative');
 assert.equal(operations[3].block?.rows,undefined,'planning does not mutate the proposed operations');
 const deleted=applyReportOperations(next,[operation({action:'delete',chapterId:'sessions',sectionId:'additional',blockId:'attendance-trend',element:'',text:''}),operation({action:'delete',chapterId:'sessions',sectionId:'',blockId:'',element:'metric:attendance',text:''})]);
 assert.equal(deleted.documentEdits?.blocks.sessions.length,0);
 assert.ok(deleted.documentEdits?.hidden.includes('sessions:metric:attendance'));
 assert.equal(JSON.stringify(deleted.chapters),before);
 const context=JSON.parse(reportEditorContext(next));
 assert.equal(context.chapters[0].sections[0].blocks[1].meaning,'Revised interpretation');
 assert.equal(context.documentEdits.blocks.sessions[0].id,'attendance-trend');
});
