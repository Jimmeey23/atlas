import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
// @ts-ignore JavaScript server module
import {presentationRoutes} from '../server/presentation.mjs';

test('live presentation: host authority, shared state, pause, independent viewer presence and termination',async()=>{
 const documents=new Map<string,unknown>();const store={read:async(k:string)=>structuredClone(documents.get(k)??null),write:async(k:string,v:unknown)=>{documents.set(k,structuredClone(v));}};
 const app=express();app.use(express.json());presentationRoutes(app,store);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address() as {port:number};const url=`http://127.0.0.1:${address.port}/api/presentations`;
 async function call(path='',method='GET',body?:unknown,token?:string){const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(token?{'X-Host-Token':token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
 const state={context:{tab:4,view:'',filters:{from:'2026-09-01',to:'2026-09-30'},compare:'prior',transient:[]},scroll:0,reportId:'',annotations:[]};
 try{
  const created=await call('','POST',{name:'Studio review',state});assert.equal(created.status,201);const {code,token}=created.data;
  const a=(await call(`/${code}/join`,'POST',{name:'Viewer A'})).data;
  const b=(await call(`/${code}/join`,'POST',{name:'Viewer B'})).data;
  assert.equal((await call(`/${code}`,'PUT',{state})).status,403);
  const changed={...state,context:{...state.context,tab:3},scroll:250,annotations:[{color:'#e5aa29',width:8,tool:'arrow',points:[[.1,50],[.3,80]]},{color:'#e5aa29',tool:'text',text:'Decision',points:[[.1,90]]}],presenter:{active:true,blackout:true,spotlight:false,zoom:1.5,chapter:'sessions'}};
  await call(`/${code}`,'PUT',{state:changed},token);
  const shared=(await call(`/${code}`)).data.state;assert.equal(shared.context.tab,3);assert.equal(shared.presenter.zoom,1.5);assert.equal(shared.presenter.blackout,true);assert.equal(shared.annotations[1].text,'Decision');
  await Promise.all([call(`/${code}/heartbeat`,'POST',{participantId:a.participantId,hand:true}),call(`/${code}/heartbeat`,'POST',{participantId:b.participantId,hand:true})]);
  let room=(await call(`/${code}`)).data;assert.equal(room.participants.length,2);assert.ok(room.participants.every((p:{hand:boolean})=>p.hand));assert.ok(!('hostHash' in room));
  await call(`/${code}`,'PUT',{paused:true,state},token);room=(await call(`/${code}`)).data;assert.equal(room.state.context.tab,3);assert.equal(room.paused,true);
  await call(`/${code}/leave`,'POST',{participantId:a.participantId});assert.equal((await call(`/${code}`)).data.participants.length,1);
  assert.equal((await call(`/${code}`,'DELETE',undefined,token)).status,200);assert.equal((await call(`/${code}`)).status,410);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
