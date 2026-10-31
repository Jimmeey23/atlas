import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { apiAuth } from '../server/auth.mjs';

test('API authentication fails closed and verifies sessions and allowlist', async () => {
  const client = { auth: { getUser: async (token: string) => token === 'valid'
    ? { data: { user: { id: 'u1', email: 'allowed@example.com', app_metadata: {providers:['google']} } }, error: null }
    : { data: { user: null }, error: new Error('invalid') } } };
  const app = express();
  app.use('/api', apiAuth(client, {allowedEmails: 'Allowed@example.com'}));
  app.get('/api/data', (req: any,res) => res.json({id:req.atlasUser.id}));
  app.use('/unconfigured', apiAuth(null));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    assert.equal((await fetch(url+'/api/data')).status,401);
    assert.equal((await fetch(url+'/api/data',{headers:{Authorization:'Bearer bad'}})).status,401);
    const ok = await fetch(url+'/api/data',{headers:{Authorization:'Bearer valid'}});
    assert.equal(ok.status,200); assert.deepEqual(await ok.json(),{id:'u1'});
    assert.match(ok.headers.get('cache-control')!,/no-store/);
    assert.equal((await fetch(url+'/unconfigured',{headers:{Authorization:'Bearer valid'}})).status,503);
    const restricted = express(); restricted.use(apiAuth(client, {allowedEmails:'other@example.com'})); restricted.get('/',(_req,res)=>res.send('ok'));
    const other = restricted.listen(0,'127.0.0.1'); await new Promise(resolve=>other.once('listening',resolve));
    try { assert.equal((await fetch(`http://127.0.0.1:${(other.address() as any).port}/`,{headers:{Authorization:'Bearer valid'}})).status,403); }
    finally { await new Promise<void>(resolve=>other.close(()=>resolve())); }
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
});

test('the real app gates source, reference and KRA routes before handling requests', async () => {
  const { createApp } = await import('../server/app.mjs');
  const client = {auth:{getUser:async (token:string)=>({data:{user:token==='ok'?{id:'user',email:'google@example.com',app_metadata:{providers:['google']}}:null},error:null})}};
  const app=await createApp({authClient:client});
  const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try {
    for (const path of ['/api/kra/session','/api/sheets/freshness','/api/reference-contracts','/api/reference/metric-definitions.html'])
      assert.equal((await fetch(base+path)).status,401,path);
    const response=await fetch(base+'/api/reference-contracts',{headers:{Authorization:'Bearer ok'}});
    assert.equal(response.status,200);assert.ok(Array.isArray(await response.json()));
    const tooMany=Array.from({length:501},(_,i)=>i+2).join(',');
    assert.equal((await fetch(base+'/api/source-rows/sales?rows='+tooMany,{headers:{Authorization:'Bearer ok'}})).status,400);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
