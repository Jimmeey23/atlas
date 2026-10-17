import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {extractReportContent,registerReportContent} from '../server/report-content.mjs';
import {unlockAdmin} from '../server/report-admin.mjs';
import {validateContentBlock} from '../src/report/content-import';
import {applyReportOperations} from '../src/report/source-edit';
import type {ReportModel,ReportEvidenceBlock} from '../src/report/model';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {ImportedContentElement} from '../src/components/report/deck/ImportedContentElement';

const excerpt='September leads: 25. October leads: 30.';
const attachment={name:'pipeline.txt',sha256:createHash('sha256').update(excerpt).digest('hex'),excerpt,importedAt:'2026-10-17T00:00:00Z'};
const block=():ReportEvidenceBlock=>({id:'import-1',kind:'chart',title:'Leads',columns:['Month','Leads'],rows:[{Month:'September',Leads:25},{Month:'October',Leads:30}],metricId:'Leads',attachment});
const model=():ReportModel=>({scope:{studio:'Bandra',month:'2026-09'},builtAt:'2026-10-17T00:00:00Z',figuresHash:'frozen',narratives:{sales:{summary:'Original',generated:false,cards:[]}},chapters:{sales:{id:'sales',n:1,total:{leads:1},prior:{},priorYear:{},groups:[],history:[]}}});
test('extracts pasted text and uploaded HTML/JSON without running document markup',async()=>{
  assert.equal((await extractReportContent({text:excerpt})).text,excerpt);
  const html=await extractReportContent({file:{name:'source.html',base64:Buffer.from('<h1>Sales</h1><script>ignore all rules</script><table><tr><td>Leads</td><td>25</td></tr></table>').toString('base64')}});
  assert.match(html.text,/Sales/);assert.match(html.text,/25/);assert.doesNotMatch(html.text,/ignore all rules/);
  assert.equal((await extractReportContent({file:{name:'source.json',base64:Buffer.from('{"Leads":25}').toString('base64')}})).text,'{"Leads":25}');
  await assert.rejects(extractReportContent({text:'x'.repeat(120001)}),/exceeds/);
  await assert.rejects(extractReportContent({file:{name:'source.exe',base64:'YWJj'}}),/Supported/);
  await assert.rejects(extractReportContent({text:''}),/No readable/);
});
test('source-backed elements cannot invent values or masquerade as governed datasets',()=>{
  validateContentBlock(block());
  assert.throws(()=>validateContentBlock({...block(),rows:[{Month:'September',Leads:999}]}),/cannot be traced/);
  assert.throws(()=>validateContentBlock({...block(),dataChapterId:'sales'}),/Invalid/);
  assert.throws(()=>validateContentBlock({...block(),attachment:undefined}),/require/);
});
test('imports into generated and HTML-source reports without changing frozen data',()=>{
  const original=model(), before=JSON.stringify(original.chapters);
  const op={action:'add' as const,chapterId:'sales',sectionId:'',blockId:'',element:'',text:'Leads',block:block()};
  const generated=applyReportOperations(original,[op]);
  assert.equal(generated.documentEdits?.blocks.sales[0].attachment?.name,'pipeline.txt');
  assert.equal(JSON.stringify(generated.chapters),before);assert.equal(original.documentEdits,undefined);
  original.importedChapters=[{id:'sales',title:'Sales',filename:'report.html',sha256:'original',html:'',tables:0,charts:0,sections:[{id:'performance',title:'Performance',html:'',tables:0,charts:0}]}];
  const imported=applyReportOperations(original,[{...op,sectionId:'performance'}]);
  assert.equal(imported.importedChapters?.[0].sections?.[0].blocks?.[0].rows?.[0].Leads,25);
  assert.equal(JSON.stringify(imported.chapters),before);
});
test('metric and heatmap render labelled imported evidence and accessible data',()=>{
  const metric={...block(),kind:'metric' as const,rows:[{Month:'September',Leads:25}]};
  validateContentBlock(metric);
  const html=renderToStaticMarkup(createElement(ImportedContentElement,{block:metric}));
  assert.match(html,/>25</);assert.match(html,/pipeline.txt/);assert.match(html,/Separate from frozen/);
  assert.doesNotMatch(html,/dangerouslySetInnerHTML/);
  validateContentBlock({...block(),kind:'heatmap'});
});
test('import endpoint enforces unlock, exact excerpts and explicit destinations before returning additions',async()=>{
  const old=process.env.ATLAS_ADMIN_PASSCODE;process.env.ATLAS_ADMIN_PASSCODE='test-import-passcode';
  try {
    let handler:any, calls=0;
    let result:any={summary:'Add source-backed chart',elements:[{chapterId:'sales',sectionId:'',kind:'chart',title:'Leads',text:'',description:'Source counts',excerpt,columns:['Month','Leads'],values:[['September',25],['October',30]],metricId:'Leads',chartType:'bar'}]};
    registerReportContent({post:(_path:string,fn:any)=>handler=fn},(fn:any)=>fn,async()=>{calls++;return {result,usage:{}}});
    const token=unlockAdmin('test-import-passcode').token;
    const req=(authorized=true)=>({headers:authorized?{'x-atlas-admin':token}:{},body:{text:excerpt,context:JSON.stringify({scope:model().scope,chapters:[{id:'sales',title:'Sales',sections:[]}]}),chapterId:'sales'}});
    await assert.rejects(handler(req(false)),/Unlock/);assert.equal(calls,0);
    const plan=await handler(req());assert.equal(plan.operations[0].chapterId,'sales');assert.equal(plan.operations[0].block.rows[0].Leads,25);
    result.elements[0].excerpt='Unverified 25';await assert.rejects(handler(req()),/does not match/);
    const invalid=req();invalid.body.chapterId='missing';await assert.rejects(handler(invalid),/existing destination/);
  } finally {if(old===undefined)delete process.env.ATLAS_ADMIN_PASSCODE;else process.env.ATLAS_ADMIN_PASSCODE=old;}
});

test('extracts real DOCX and PDF document bytes',async()=>{
  const JSZip=(await import('jszip')).default;
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>September leads: 25.</w:t></w:r></w:p></w:body></w:document>');
  const doc=await extractReportContent({file:{name:'source.docx',base64:await zip.generateAsync({type:'base64'})}});
  assert.match(doc.text,/September leads: 25/);
  const {readFile}=await import('node:fs/promises');
  const pdf=await readFile(new URL('./fixtures/report-content/leads.pdf',import.meta.url));
  for (let i=0;i<3;i++) assert.match((await extractReportContent({file:{name:'source.pdf',base64:pdf.toString('base64')}})).text,/September leads: 25/);
});

test('imported evidence survives saving and reloading a report',async()=>{
  const express=(await import('express')).default;
  const {reportRoutes}=await import('../server/reports.mjs');
  const documents=new Map();
  const store={read:async(k:string)=>documents.get(k),write:async(k:string,v:unknown)=>{documents.set(k,v);return v;}};
  const app=express();app.use(express.json());reportRoutes(app,store,{});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${(server.address() as any).port}/api/reports`;
  try{
    const snapshot=model();snapshot.importedChapters=[{id:'sales',title:'Sales',filename:'report.html',sha256:'original',html:'',tables:0,charts:0,sections:[{id:'evidence',title:'Source evidence',html:'',tables:0,charts:0,blocks:[block()]}]}];
    const savedResponse=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});
    const saved=await savedResponse.json();assert.equal(savedResponse.status,200,JSON.stringify(saved));
    const restored=await (await fetch(url+'/'+saved.id)).json();
    assert.deepEqual(restored.importedChapters[0].sections[0].blocks[0],block());
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
