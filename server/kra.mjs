import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {normalise} from '../src/data/normalise.ts';
import {performanceMarketingTopics} from './kra-curriculum.mjs';
import {kraPerformance} from './kra-metrics.mjs';
const digest=value=>createHash('sha256').update(value).digest();
export function kraRoutes(app,root,config,load) {
  const sessions=new Map(),attempts=new Map(),cookie='p57_kra_session';
  const protectedCode=digest(process.env.KRA_PASSCODE||'9818');
  const file=path.join(root,'.floor','kra-jimmeey-jun-nov-2026.json');
  const asOf=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
  const auth=(req,res,next)=>{
    res.set('Cache-Control','no-store');
    for(const [key,expires] of sessions)if(expires<Date.now())sessions.delete(key);
    const token=String(req.headers.cookie??'').split(';').map(part=>part.trim()).find(part=>part.startsWith(cookie+'='))?.slice(cookie.length+1);
    if(!token||!sessions.has(token))return res.status(401).json({error:'Unlock the KRA view to continue.'});
    req.kraToken=token;next();
  };
  app.post('/api/kra/unlock',(req,res)=>{
    res.set('Cache-Control','no-store');
    const key=req.ip,old=attempts.get(key);
    const attempt=old&&old.until>Date.now()?old:{count:0,until:Date.now()+5*60*1000};
    if(attempt.count>=10)return res.status(429).json({error:'Too many attempts. Try again in five minutes.'});
    attempt.count++;attempts.set(key,attempt);
    if(typeof req.body?.code!=='string'||!timingSafeEqual(protectedCode,digest(req.body.code)))return res.status(401).json({error:'Incorrect passcode.'});
    attempts.delete(key);
    const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*60*60*1000);
    res.cookie(cookie,token,{httpOnly:true,sameSite:'strict',secure:req.secure||req.headers['x-forwarded-proto']==='https',maxAge:8*60*60*1000,path:'/api/kra'});
    res.json({unlocked:true});
  });
  app.post('/api/kra/lock',auth,(req,res)=>{sessions.delete(req.kraToken);res.clearCookie(cookie,{path:'/api/kra'});res.json({locked:true});});
  app.get('/api/kra/session',auth,(_req,res)=>res.json({unlocked:true}));
  const evidence=async()=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw error;}};
  let writes=Promise.resolve();
  app.get('/api/kra/performance',auth,async(req,res)=>{
    try {
      const sources={};
      await Promise.all(['sales','leads','bookings','lapsed'].map(async key=>{
        const source=config.find(item=>item.key===key);
        let data;
        if(req.query.refresh!=='true')try{data=JSON.parse(await readFile(path.join(root,'.cache',key+'.json'),'utf8'));data.stale=Date.now()-data.fetchedAt>=15*60*1000;}catch{}
        if(!data)data=await load(source,req.query.refresh==='true');
        const normalized=normalise(data,false).rows;
        if(key==='leads'){const index=data.columns.indexOf('ID');normalized.forEach((row,i)=>{row.lead_id=index>=0?String(data.rows[i][index]??'').trim()||null:null;});}
        sources[key]={...data,rows:normalized};
      }));
      const result=kraPerformance(sources,asOf(),{imports:req.query.imports==='true'});
      await writes;
      res.json({...result,evidence:await evidence(),trainingTopics:performanceMarketingTopics});
    } catch {res.status(500).json({error:'KRA source analysis could not be completed. Retry or refresh the source snapshots.'});}
  });
  app.put('/api/kra/training/:id',auth,async(req,res)=>{
    const body=req.body??{};
    if(!performanceMarketingTopics.some(topic=>topic.id===req.params.id)||!['Not started','In progress','Completed'].includes(body.status)||typeof body.note!=='string'||body.note.length>4000)return res.status(400).json({error:'Invalid training progress.'});
    const record={status:body.status,note:body.note.trim(),date:asOf(),updatedAt:new Date().toISOString(),basis:'Manually reported by user'};
    const job=writes.then(async()=>{const records=await evidence();records.marketingTopics??={};records.marketingTopics[req.params.id]=record;await writeFile(file+'.tmp',JSON.stringify(records));await rename(file+'.tmp',file);return record;});
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
    const job=writes.then(async()=>{const records=await evidence();records[req.params.id]=record;await writeFile(file+'.tmp',JSON.stringify(records));await rename(file+'.tmp',file);return record;});
    writes=job.catch(()=>undefined);
    try{res.json(await job);}catch{res.status(500).json({error:'Evidence could not be saved.'});}
  });
}
