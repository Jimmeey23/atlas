import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { followupRoutes } from "../server/followups.mjs";
test("local follow-ups persist, preserve history and require a closing outcome", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "floor-followup-"));
  const file = path.join(directory, "followups.json");
  const app = express();
  app.use(express.json());
  followupRoutes(app, file);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const draft = {
    owner: "Test operator",
    status: "Contact planned",
    nextDate: "2026-10-09",
    preference: "Email",
    note: "",
    memberVoice: "Member stated a scheduling barrier.",
    observation: "",
  };
  const put = (id: string, record: object) =>
    fetch(base + "/api/retention-followups/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
  try {
    assert.equal((await put("test-member", draft)).status, 200);
    assert.equal(
      (await put("test-member", { ...draft, status: "Closed" })).status,
      400,
    );
    assert.equal(
      (
        await put("test-member", {
          ...draft,
          status: "Closed",
          note: "Member accepted the proposed solution.",
          closedReasons: ["renewal:test-member:2026-10"],
        })
      ).status,
      200,
    );
    const records = await (
      await fetch(base + "/api/retention-followups")
    ).json();
    assert.equal(records["test-member"].status, "Closed");
    assert.equal(records["test-member"].history.length, 2);
    assert.deepEqual(records["test-member"].closedReasons, [
      "renewal:test-member:2026-10",
    ]);
    // A new route instance reads the same on-disk record rather than memory state.
    const app2 = express();
    app2.use(express.json());
    followupRoutes(app2, file);
    const server2 = app2.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server2.once("listening", resolve));
    const address2 = server2.address();
    assert.ok(address2 && typeof address2 !== "string");
    const loaded = await (
      await fetch(`http://127.0.0.1:${address2.port}/api/retention-followups`)
    ).json();
    assert.equal(
      loaded["test-member"].history[0].memberVoice,
      draft.memberVoice,
    );
    await new Promise<void>((resolve) => server2.close(() => resolve()));
    const concurrent = await Promise.all(
      ["a", "b"].map((id) => put(id, draft)),
    );
    assert.ok(concurrent.every((r) => r.ok));
    const both = await (await fetch(base + "/api/retention-followups")).json();
    assert.ok(both.a && both.b);
    assert.equal(
      (await put("bad", { ...draft, preference: "guessed preference" })).status,
      400,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('cloud follow-up writes use atomic RPC and lists retrieve multiple pages', async () => {
  const docs = new Map<string, any>();
  for (let i = 0; i < 205; i++) docs.set(`m${String(i).padStart(3,'0')}`, {status:'Not started',history:[]});
  let rpcCalls = 0;
  const cloud = {
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({
      range: async (start: number, end: number) => ({data:[...docs.entries()].slice(start,end+1).map(([memberId,record])=>({body:{memberId,record}})),error:null})
    }) }) }) }),
    rpc: async (name: string, args: any) => {
      assert.equal(name,'atlas_save_followup'); rpcCalls++;
      const old = docs.get(args.p_member_id);
      const record = {...args.p_record, history:[...(old?.history || []),args.p_record].slice(-100)};
      docs.set(args.p_member_id,record); return {data:record,error:null};
    },
  };
  const app=express();app.use(express.json());followupRoutes(app,'unused',cloud);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/retention-followups`;
  try {
    const all=await(await fetch(base)).json(); assert.equal(Object.keys(all).length,205);
    const response=await fetch(base+'/m001',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:'Operator',status:'Contacted',preference:'Email',nextDate:'',note:'Called',memberVoice:'',observation:''})});
    assert.equal(response.status,200); assert.equal(rpcCalls,1); assert.equal((await response.json()).history.length,1);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
