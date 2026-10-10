import test from 'node:test';
import assert from 'node:assert/strict';
import {chapters} from '../src/report/chapters';
import {yearContextPayload,generateNarratives} from '../src/report/narrative';
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
 globalThis.fetch=async(_url,init)=>{requests.push(JSON.parse(String(init?.body)).message);return new Response(JSON.stringify({error:'Test provider unavailable'}),{status:400});};
 const model:ReportModel={scope:{studio:'Kenkere House',month:'2026-09'},builtAt:'2026-10-10T00:00:00Z',figuresHash:'test',narratives:{},chapters:{'revenue-performance':data('revenue-performance',{total:{gross_revenue:1000},prior:{gross_revenue:800}}),'website-marketing':data('website-marketing',{total:{leads:1234,website_members:30}}),'meta-marketing':data('meta-marketing',{total:{meta_spend:4567}})},customization:{title:'',subtitle:'',preparedFor:'',preparedBy:'',audience:'Executive board',tone:'Professional',detail:'Comprehensive',instructions:'Explain efficiency',chapterIds:['revenue-performance'],theme:'light'}};
 try{await generateNarratives(model);assert.match(requests[0],/website-marketing/);assert.match(requests[0],/1234/);assert.match(requests[0],/meta-marketing/);assert.match(requests[0],/account \/ network; not studio-attributed/);assert.match(requests[0],/Every card answers exactly one leadership question/);assert.match(requests[0],/AVAILABLE METRIC IDS \(id: label\): .*gross_revenue/);assert.ok(requests[0].length<90000);}finally{globalThis.fetch=original;(globalThis as any).localStorage=storage;}
});
test('default display is compact and adaptive, and all core dashboard sources have report chapters',()=>{
 assert.equal(reportOptions().density,'compact');assert.equal(reportOptions().layout,'adaptive');
 for(const source of ['sessions','sales','new','lapsed','bookings','leads','checkins','payroll','recurring','meta'])assert.ok(chapters.some(c=>c.source===source),source);
 assert.ok(chapters.find(c=>c.id==='website-marketing')!.website);
 assert.ok(chapters.find(c=>c.source==='meta')!.network);
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
