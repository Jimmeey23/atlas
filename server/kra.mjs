import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {createStore} from './store.mjs';
import {normalise} from '../src/data/normalise.ts';
import {performanceMarketingTopics} from './kra-curriculum.mjs';
import {validateKraEdit} from './kra-edits.mjs';
import {kraPerformance,kraDefinitions} from './kra-metrics.mjs';
export function kraRoutes(app,root,config,load,store=createStore({root})) {
  const file='.floor/kra-jimmeey-jun-nov-2026.json';
  const cache=key=>`.cache/${key}.json`;
  const asOf=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
  // The passcode gate was removed at the owner's request: these routes are open to anyone who
  // can reach them. Responses stay uncacheable so no proxy retains KRA records.
  const auth=(_req,res,next)=>{res.set('Cache-Control','no-store');next();};
  app.get('/api/kra/session',(_req,res)=>res.set('Cache-Control','no-store').json({unlocked:true}));
  const evidence=async()=>await store.read(file)??{};
  let writes=Promise.resolve();
  // Computing the scorecard means pulling five Google sheets and normalising ~300k rows. On a
  // serverless cold start that took ~60s, which the browser abandons. The finished payload is
  // cached durably; expired results are refreshed once per instance before responding.
  const resultKey=imports=>`.floor/kra-result-${imports?'imports':'direct'}.json`;
  const RESULT_TTL=30*60*1000;
  const computations=new Map();
  function computeOnce(imports,refresh) {
    const key=String(imports);
    if(!computations.has(key))computations.set(key,compute(imports,refresh).finally(()=>computations.delete(key)));
    return computations.get(key);
  }
  async function compute(imports,refresh) {
    const sources={};
    await Promise.all(['sales','leads','bookings','lapsed','new'].map(async key=>{
      const source=config.find(item=>item.key===key);
      let data;
      if(!refresh)try{data=await store.read(cache(key));if(data)data.stale=Date.now()-data.fetchedAt>=15*60*1000;}catch{}
      if(!data)data=await load(source,refresh);
      const normalized=normalise(data,false).rows;
      if(key==='leads'){const index=data.columns.indexOf('ID');normalized.forEach((row,i)=>{row.lead_id=index>=0?String(data.rows[i][index]??'').trim()||null:null;});}
      sources[key]={...data,rows:normalized};
    }));
    const result=kraPerformance(sources,asOf(),{imports});
    // Caching is an optimisation: a failed write must never fail the request.
    await store.write(resultKey(imports),{computedAt:Date.now(),result}).catch(error=>console.error('KRA result cache write skipped:',error?.message??error));
    return result;
  }
  const decorate=(result,saved,computedAt)=>({...result,definitions:result.definitions.map(definition=>{const info=saved.scorecardInfo?.[definition.id];return {...definition,...info,targetEdited:!!info&&info.target!==definition.target,manual:!!info&&(info.area!==definition.area||info.target!==definition.target||info.weight!==definition.weight)};}),evidence:saved,scorecardEdits:saved.scorecardEdits??{},scorecardHistory:saved.scorecardHistory??[],trainingTopics:performanceMarketingTopics,computedAt:computedAt??Date.now()});
  app.get('/api/kra/performance',auth,async(req,res)=>{
    const imports=req.query.imports==='true',refresh=req.query.refresh==='true';
    try {
      // Edits must never be served stale, so saved evidence is always read live and merged
      // onto whichever source computation is used.
      await writes;
      const saved=await evidence();
      if(!refresh){
        const cached=await store.read(resultKey(imports)).catch(()=>null);
        if(cached?.result&&Date.now()-cached.computedAt<RESULT_TTL){
          res.json(decorate(cached.result,saved,cached.computedAt));
          return;
        }
      }
      res.json(decorate(await computeOnce(imports,refresh),saved));
    } catch(error) {console.error('KRA performance failed:',error?.message??error);res.status(500).json({error:'KRA source analysis could not be completed. Retry or refresh the source snapshots.'});}
  });
  app.put('/api/kra/scorecard/:period/:id',auth,async(req,res)=>{
    const error=validateKraEdit(req.params.period,req.params.id,req.body);
    if(error)return res.status(400).json({error});
    const {info,data,expectedUpdatedAt}=req.body,key=req.params.period+'/'+req.params.id;
    const job=writes.then(async()=>{
      const saved=await evidence(),before=saved.scorecardEdits?.[key]??null;
      if((before?.updatedAt??null)!==expectedUpdatedAt){const conflict=Error('This KRA was changed in another session. Reload before saving.');conflict.status=409;throw conflict;}
      const updatedAt=new Date(Math.max(Date.now(),before?Date.parse(before.updatedAt)+1:0)).toISOString(),record={...data,updatedAt,basis:'Manual KRA edit'};
      saved.scorecardInfo??={};saved.scorecardEdits??={};saved.scorecardHistory??=[];
      const previousInfo=saved.scorecardInfo[req.params.id]??null;
      saved.scorecardInfo[req.params.id]={area:info.area.trim(),target:info.target.trim(),weight:info.weight};saved.scorecardEdits[key]=record;
      saved.scorecardHistory.push({id:randomBytes(12).toString('hex'),key,updatedAt,before,after:record,previousInfo,info:saved.scorecardInfo[req.params.id]});
      await store.write(file,saved);
      const base=kraDefinitions.find(definition=>definition.id===req.params.id),editedInfo=saved.scorecardInfo[req.params.id];
      return {key,record,info:{...editedInfo,targetEdited:editedInfo.target!==base.target,manual:editedInfo.area!==base.area||editedInfo.target!==base.target||editedInfo.weight!==base.weight},history:saved.scorecardHistory};
    });writes=job.catch(()=>undefined);
    try{res.json(await job);}catch(error){res.status(error.status??500).json({error:error.status===409?error.message:'The KRA edit could not be saved. Retry.'});}
  });
  // Bulk progress update: one queued write for the whole selection instead of a request per topic.
  app.put('/api/kra/training',auth,async(req,res)=>{
    const body=req.body??{};
    const ids=Array.isArray(body.ids)?[...new Set(body.ids)]:null;
    if(!ids?.length||ids.length>performanceMarketingTopics.length||!ids.every(id=>performanceMarketingTopics.some(topic=>topic.id===id))||!['Not started','In progress','Completed'].includes(body.status)||(body.note!=null&&(typeof body.note!=='string'||body.note.length>4000)))return res.status(400).json({error:'Invalid bulk training progress.'});
    const stamp={status:body.status,date:asOf(),updatedAt:new Date().toISOString(),basis:'Manually reported by user · bulk update'};
    const job=writes.then(async()=>{
      const records=await evidence();records.marketingTopics??={};
      const written={};
      for(const id of ids){const record={...stamp,note:(body.note??records.marketingTopics[id]?.note??'').trim()};records.marketingTopics[id]=record;written[id]=record;}
      await store.write(file,records);return written;
    });
    writes=job.catch(()=>undefined);
    try{res.json(await job);}catch{res.status(500).json({error:'Training progress could not be saved.'});}
  });
  app.put('/api/kra/training/:id',auth,async(req,res)=>{
    const body=req.body??{};
    if(!performanceMarketingTopics.some(topic=>topic.id===req.params.id)||!['Not started','In progress','Completed'].includes(body.status)||typeof body.note!=='string'||body.note.length>4000)return res.status(400).json({error:'Invalid training progress.'});
    const record={status:body.status,note:body.note.trim(),date:asOf(),updatedAt:new Date().toISOString(),basis:'Manually reported by user'};
    const job=writes.then(async()=>{const records=await evidence();records.marketingTopics??={};records.marketingTopics[req.params.id]=record;await store.write(file,records);return record;});
    writes=job.catch(()=>undefined);
    try{res.json(await job);}catch{res.status(500).json({error:'Training progress could not be saved.'});}
  });
  app.put('/api/kra/evidence/:id',auth,async(req,res)=>{
    const requirements={churn:['Action plan'],trials:['Action plan'],stability:['Action plan'],revenue:['Action plan'],upskilling:['Performance marketing'],growth:['Hired','Fully trained'],training:['Empathy','Active listening','Soft skills']};
    const expected=requirements[req.params.id],body=req.body??{};
    if(!expected||!['Not started','In progress','Completed'].includes(body.status)||typeof body.note!=='string'||body.note.length>6000||typeof body.url!=='string'||body.url.length>1000||body.url&&!/^https?:\/\//i.test(body.url)||!Array.isArray(body.checks)||body.checks.some(value=>!expected.includes(value))||typeof body.date!=='string'||body.date&&(!/^2026-(0[6-9]|1[01])-\d{2}$/.test(body.date)||!Number.isFinite(Date.parse(body.date+'T00:00:00Z'))||new Date(body.date+'T00:00:00Z').toISOString().slice(0,10)!==body.date||body.date>asOf()))
      return res.status(400).json({error:'Provide valid review-period evidence fields and a date no later than today.'});
    if(body.status==='Completed'&&(!body.note.trim()||!body.date||!expected.every(item=>body.checks.includes(item))))return res.status(400).json({error:'Completion requires a dated outcome note and every required milestone.'});
    const record={status:body.status,note:body.note.trim(),url:body.url.trim(),date:body.date,checks:[...new Set(body.checks)],updatedAt:new Date().toISOString(),basis:'Self-reported evidence'};
    const job=writes.then(async()=>{const records=await evidence();records[req.params.id]=record;await store.write(file,records);return record;});
    writes=job.catch(()=>undefined);
    try{res.json(await job);}catch{res.status(500).json({error:'Evidence could not be saved.'});}
  });
}
