import test from 'node:test';
import assert from 'node:assert/strict';
import {chapters} from '../src/report/chapters';
import {yearContextPayload,generateNarratives,portfolioPayload} from '../src/report/narrative';
import {figuresHash} from '../src/report/period';
import {reportOptions} from '../src/report/options';
import type {ChapterData,ReportModel} from '../src/report/model';
const data=(id:string,extra:Partial<ChapterData>={}):ChapterData=>({id,n:10,total:{},prior:{},priorYear:{},history:[],groups:[],...extra});
test('year context excludes unavailable months and separates monthly rate mean from governed YTD',()=>{
 const spec=chapters.find(c=>c.id==='conversion-funnel')!;
 const d=data(spec.id,{total:{conversion_rate:.4},history:[{month:'2025-12',conversion_rate:.9},{month:'2026-01',conversion_rate:.2},{month:'2026-02'},{month:'2026-03',conversion_rate:.4}],yearToDate:{n:100,conversion_rate:.35},priorYearToDate:{n:80,conversion_rate:.3}});
 const text=yearContextPayload(spec,d,'2026-03');
 assert.match(text,/among 2 observed 2026 months/);assert.match(text,/not an aggregated year-to-date rate/);assert.match(text,/year-to-date value 35.0%/);assert.match(text,/change \+5.0pp/);
 assert.notEqual(figuresHash({[spec.id]:d}),figuresHash({[spec.id]:{...d,yearToDate:{n:100,conversion_rate:.36}}}));
});
test('ordinary chapter gets all-tab context even when those chapters are hidden',async()=>{
 const original=globalThis.fetch,storage=(globalThis as any).localStorage;const requests:string[]=[];
 (globalThis as any).localStorage={getItem:()=>null,setItem:()=>{}};
 globalThis.fetch=async(_url,init)=>{if(!init?.body)return new Response(JSON.stringify({openai:true,model:'gpt-4.1',reportNarrativeVersion:'1'}));requests.push(JSON.parse(String(init?.body)).message);return new Response(JSON.stringify({error:'Test provider unavailable'}),{status:400});};
 const model:ReportModel={scope:{studio:'Kenkere House',month:'2026-09'},builtAt:'2026-10-10T00:00:00Z',figuresHash:'test',narratives:{},chapters:{'revenue-performance':data('revenue-performance',{total:{gross_revenue:1000},prior:{gross_revenue:800}}),'website-marketing':data('website-marketing',{total:{leads:1234,website_members:30}}),'meta-marketing':data('meta-marketing',{total:{meta_spend:4567}})},customization:{title:'',subtitle:'',preparedFor:'',preparedBy:'',audience:'Executive board',tone:'Professional',detail:'Comprehensive',instructions:'Explain efficiency',chapterIds:['revenue-performance'],theme:'light'}};
 try{await generateNarratives(model);assert.match(requests[0],/website-marketing/);assert.match(requests[0],/1234/);assert.match(requests[0],/meta-marketing/);assert.match(requests[0],/account \/ network; not studio-attributed/);assert.match(requests[0],/Every card answers exactly one leadership question/);assert.match(requests[0],/AVAILABLE METRIC IDS \(id: label\): .*gross_revenue/);assert.ok(requests[0].length<90000);}finally{globalThis.fetch=original;(globalThis as any).localStorage=storage;}
});
test('default display is compact and adaptive, and all core dashboard sources have report chapters',()=>{
 assert.equal(reportOptions().density,'compact');assert.equal(reportOptions().layout,'adaptive');
 for(const source of ['sessions','sales','new','lapsed','bookings','leads','checkins','payroll','recurring','meta'])assert.ok(chapters.some(c=>c.source===source),source);
 assert.ok(chapters.find(c=>c.id==='website-marketing')!.website);
 assert.ok(chapters.find(c=>c.source==='meta')!.network);
});

test('large reports fit the API prompt limit without duplicating portfolio context or cutting evidence records',async()=>{
 const original=globalThis.fetch,storage=(globalThis as any).localStorage;
 const requests:string[]=[];
 (globalThis as any).localStorage={getItem:()=>null,setItem:()=>{}};
 globalThis.fetch=async(_url,init)=>{
  if(!init?.body)return new Response(JSON.stringify({openai:true,model:'gpt-4.1',reportNarrativeVersion:'1'}));
  const message=JSON.parse(String(init?.body)).message;requests.push(message);
  if(message.length>90000)return new Response(JSON.stringify({error:'A report chapter prompt up to 90,000 characters is required.'}),{status:400});
  return new Response(JSON.stringify({answer:JSON.stringify({summary:'Recorded evidence.',cards:[{headline:'Recorded movement',meaning:'Conditional analysis.',evidence:'Supplied figures.',focus:'kpis',lens:'driver',confidence:'medium'}]})}));
 };
 const model:ReportModel={scope:{studio:'Kenkere House',month:'2026-09'},builtAt:'',figuresHash:'large',narratives:{},
  chapters:{'executive-summary':data('executive-summary',{total:{attendance:120},prior:{attendance:100}}),sessions:data('sessions',{total:{attendance:120,sessions:10},prior:{attendance:100,sessions:8},groups:[{id:'formats',field:'format',title:'Format evidence',columns:['attendance'],minimum:'3 contributing records',rows:Array.from({length:4000},(_,i)=>({g:`Format ${i} with a detailed community session description`,attendance:i+3}))}]})},
  additionalContext:[{title:'Large connected context',scope:'network',status:'available',limitations:'Context only',data:{note:'COMPLETE_CONTEXT_START'+'x'.repeat(100000)+'COMPLETE_CONTEXT_END'}}],
  customization:{title:'',subtitle:'',preparedFor:'',preparedBy:'',audience:'Executive board',tone:'Professional',detail:'Comprehensive',instructions:'Review evidence. '.repeat(10000),chapterIds:['predictions','executive-summary','recommendations','sessions'],theme:'light'}};
 const before=JSON.stringify(model);
 assert.ok(portfolioPayload(model).length>90000,'fixture must exceed the API limit');
 try{
  const out=await generateNarratives(model);
  assert.equal(requests.length,4);
  for(const message of requests){
   assert.ok(message.length<=90000,`prompt length ${message.length}`);
   assert.equal(message.split('Chapter headline figures (all tabs, including chapters omitted from display):').length-1,1);
   assert.match(message,/Accuracy rules/);assert.match(message,/Long editorial preferences shortened/);
   assert.match(message,/Evidence omitted/);assert.match(message,/omitted evidence is unavailable, not zero/);
   assert.doesNotMatch(message,/COMPLETE_CONTEXT_START/,'oversized JSON record is omitted whole');
   assert.match(message,/Source freshness and coverage/);
  }
  assert.match(requests[0],/flat scenario 120/);assert.match(requests[0],/conditional scenarios, not estimates of likelihood/);
  assert.match(requests[3],/Headline figures/);assert.match(requests[3],/Format 0 with a detailed community session description/);
  assert.ok(Object.values(out).every(n=>n.generated&&!n.error));
  assert.equal(JSON.stringify(model),before,'the saved report figures and narratives are preserved');
 }finally{globalThis.fetch=original;(globalThis as any).localStorage=storage;}
});

test('report errors distinguish exhausted quota from transient 429 responses',async()=>{
 const {reportProviderError}=await import('../server/report-errors.mjs');
 const quota=reportProviderError({status:429,code:'insufficient_quota'});
 assert.equal(quota.retryable,false);assert.match(quota.error,/billing/);
 const throttle=reportProviderError({status:429,code:'rate_limit_exceeded',headers:new Headers({'retry-after':'20'})});
 assert.equal(throttle.retryable,true);assert.equal(throttle.retryAfterMs,20000);
});

test('fallback verdict prioritises selected-month evidence over follow-up signals',async()=>{
 const {fallbackNarrative}=await import('../src/report/narrative');
 const d=data('executive-summary',{total:{attendance:80},prior:{attendance:100},priorYear:{attendance:60},history:[{month:'2026-01',attendance:90},{month:'2026-09',attendance:80}]});
 const n=fallbackNarrative(chapters.find(c=>c.id===d.id)!,d,[{chapter:d.id,focus:'kpis',kind:'gap',tone:'opportunity',text:'Opportunity ceiling.'},{chapter:d.id,focus:'cross',kind:'signal',tone:'risk',text:'Reconnect members.'},{chapter:d.id,focus:'cross',kind:'cross',tone:'context',text:'Cash and usage diverged. The populations differ.'}],{scope:{studio:'Test',month:'2026-09'},builtAt:'',figuresHash:'',chapters:{[d.id]:d},narratives:{}});
 assert.equal(n.cards[0].headline,'Cash and usage diverged');assert.equal(n.cards[0].focus,'kpis');assert.match(n.cards[0].yearContext!,/2 of 2 observed months/);
 assert.ok(n.cards.every(card=>!card.headline.includes('Reconnect') && !card.action));
});
