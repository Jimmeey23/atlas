import { randomBytes, createHash } from 'node:crypto';
const digest = token => createHash('sha256').update(String(token || '')).digest('hex');
const lifetime = 8 * 60 * 60 * 1000;
// Shared durable documents also work across serverless instances; no process-local rooms.
export function presentationRoutes(app, store) {
  const key = code => `.floor/presentations/${code}.json`;
  const route = fn => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(e.status || 500).json({error: e.message}); } };
  const fail = (message, status) => { throw Object.assign(new Error(message), {status}); };
  async function room(req, host = false) {
    const code = String(req.params.code || '');
    if (!/^[a-f0-9]{12}$/.test(code)) fail('Invalid session code.', 400);
    const [r, ended, shared] = await Promise.all([store.read(key(code)),store.read(key(code)+"-ended"),store.read(key(code)+"-state")]);
    if (!r || r.ended || ended || Date.now() - r.createdAt > lifetime) fail('This session has ended or expired.', 410);
    if (host && digest(req.headers['x-host-token']) !== r.hostHash) fail('Only the host can change this session.', 403);
    await Promise.all(Object.keys(r.participants).map(async id => {
      const presence=await store.read(key(code)+'-participant-'+id);if(presence)r.participants[id]=presence;
    }));
    return {...r, ...shared};
  }
  const publicRoom = r => ({code:r.code,name:r.name,createdAt:r.createdAt,updatedAt:r.updatedAt,paused:r.paused,state:r.state,participants:Object.values(r.participants).filter(p=>!p.left && Date.now()-p.seen<15000)});
  function state(value) {
    if (!value || typeof value !== 'object' || JSON.stringify(value).length > 75000) fail('Invalid presentation state.',400);
    const context=value.context;
    if (!context || !Number.isInteger(context.tab) || context.tab<0 || context.tab>15 || !context.filters || typeof context.filters!=='object' || Array.isArray(context.filters)) fail('Invalid workspace context.',400);
    const annotations = Array.isArray(value.annotations) ? value.annotations.slice(-30) : [];
    if (annotations.some(s => !s || !Array.isArray(s.points) || !s.points.length || s.points.length > 101 || !/^#[a-f0-9]{6}$/i.test(s.color) || (s.width!=null && ![2,4,8,16].includes(s.width)) || (s.tool!=null && !['pen','highlight','rectangle','arrow','text'].includes(s.tool)) || (s.text!=null && (typeof s.text!=='string'||s.text.length>180)) || s.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)))) fail('Invalid annotations.',400);
    return {context:{tab:context.tab,view:String(context.view||'').slice(0,60),filters:context.filters,compare:String(context.compare||'prior').slice(0,20),transient:Array.isArray(context.transient)?context.transient.slice(0,50):[]},scroll:Math.max(0,Number(value.scroll)||0),reportId:String(value.reportId||'').slice(0,64),annotations,presenter:{active:!!value.presenter?.active,blackout:!!value.presenter?.blackout,spotlight:!!value.presenter?.spotlight,zoom:[.75,1,1.25,1.5,2].includes(value.presenter?.zoom)?value.presenter.zoom:1,chapter:String(value.presenter?.chapter||'').slice(0,80)}};
  }
  app.post('/api/presentations', route(async(req,res)=>{
    const code=randomBytes(6).toString('hex'), token=randomBytes(32).toString('hex');
    const r={code,hostHash:digest(token),name:String(req.body.name||'Studio review').slice(0,60),createdAt:Date.now(),updatedAt:Date.now(),paused:false,state:state(req.body.state),participants:{}};
    await store.write(key(code),r); await store.write(key(code)+'-state',{state:r.state,paused:false,updatedAt:r.updatedAt}); res.status(201).json({...publicRoom(r),token});
  }));
  app.get('/api/presentations/:code',route(async(req,res)=>{res.set('Cache-Control','no-store').json(publicRoom(await room(req)));}));
  app.put('/api/presentations/:code',route(async(req,res)=>{
    const r=await room(req,true); r.paused=!!req.body.paused;
    if (!r.paused) r.state=state(req.body.state);
    r.updatedAt=Date.now(); await store.write(key(r.code)+'-state',{state:r.state,paused:r.paused,updatedAt:r.updatedAt}); res.json(publicRoom(r));
  }));
  app.post('/api/presentations/:code/join',route(async(req,res)=>{
    const r=await room(req); const id=randomBytes(12).toString('hex');
    r.participants=Object.fromEntries(Object.entries(r.participants).filter(([,p])=>!p.left && Date.now()-p.seen<15000));
    if(Object.keys(r.participants).length>=50)fail('This session is full.',409);
    r.participants[id]={id,name:String(req.body.name||'Guest').slice(0,40),seen:Date.now(),hand:false};
    const {state:_,paused:__,updatedAt:___,...metadata}=r;
    await store.write(key(r.code),metadata); res.json({...publicRoom(r),participantId:id});
  }));
  app.post('/api/presentations/:code/heartbeat',route(async(req,res)=>{
    const r=await room(req); const p=r.participants[String(req.body.participantId)];
    if(!p || p.left)fail('Rejoin this session to continue.',403);
    p.seen=Date.now();p.hand=!!req.body.hand;await store.write(key(r.code)+'-participant-'+p.id,p);res.json(publicRoom(r));
  }));
  app.post('/api/presentations/:code/leave',route(async(req,res)=>{
    const r=await room(req);const id=String(req.body.participantId);const p=r.participants[id];if(p)await store.write(key(r.code)+'-participant-'+id,{...p,left:true});res.json({ok:true});
  }));
  app.delete('/api/presentations/:code',route(async(req,res)=>{
    const r=await room(req,true);await store.write(key(r.code)+'-ended',true);res.json({ok:true});
  }));
}
