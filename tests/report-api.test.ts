import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { reportRoutes } from '../server/reports.mjs';
import { intelligenceRoutes } from '../server/intelligence.mjs';
import { forwardScenarios, generateNarratives } from '../src/report/narrative.ts';
import { chapters } from '../src/report/chapters.ts';
import { figuresHash } from '../src/report/period.ts';

async function serve(app: ReturnType<typeof express>) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  return { url: `http://127.0.0.1:${(server.address() as any).port}`, close: () => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }) };
}
const snapshot = () => ({ scope: { studio: 'Kenkere House', month: '2026-09' }, builtAt: '2026-10-06T10:00:00Z',
  chapters: {}, narratives: { overview: { summary: 'Recorded performance.', cards: [], generated: true } }, figuresHash: 'abc' });

test('report database snapshots survive a new route instance and preserve immutable versions', async () => {
  const documents = new Map<string, any>();
  const store = { read: async (k: string) => documents.get(k) ?? null, write: async (k: string, v: any) => { documents.set(k, v); return v; } };
  const cloud = { from: () => ({ select: () => ({ like: () => ({ order: () => ({ limit: async () => ({ data: [...documents.keys()].map(key => ({ key })), error: null }) }) }) }) }) };
  const start = async () => { const app = express(); app.use(express.json()); reportRoutes(app, store, cloud); return serve(app); };
  let api = await start();
  try {
    const saved = await (await fetch(api.url + '/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot()) })).json();
    assert.ok(saved.id); assert.ok(saved.savedAt);
    const second = await (await fetch(api.url + '/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(saved) })).json();
    assert.notEqual(second.id, saved.id);
    await api.close(); api = await start();
    const restored = await (await fetch(api.url + '/api/reports/' + saved.id)).json();
    assert.deepEqual(restored.narratives, snapshot().narratives);
    const history = await (await fetch(api.url + '/api/reports')).json();
    assert.equal(history.length, 2); assert.equal(history[0].aiChapters, 1);
    assert.equal((await fetch(api.url + '/api/reports/not-an-id')).status, 400);
    assert.equal((await fetch(api.url + '/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
  } finally { await api.close(); }
});

test('missing database is an explicit failure, never a false save confirmation', async () => {
  const app = express(); app.use(express.json()); reportRoutes(app, {}, null);
  const api = await serve(app);
  try { const response = await fetch(api.url + '/api/reports'); assert.equal(response.status, 503); assert.match((await response.json()).error, /not configured/); }
  finally { await api.close(); }
});

test('report narration bypasses chat tools and returns a structured chapter', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-report-'));
  let call: any;
  const narrative = { summary: 'Earned revenue rose.', cards: [{ headline: 'A recorded increase', meaning: 'A comparison, not proof of causation.', evidence: 'Source figures.', action: 'Studio management to review the mix this week.' }] };
  const ai = { responses: { create: async (request: any) => { call = request; return { status: 'completed', output_text: JSON.stringify(narrative) }; } } };
  const app = express(); app.use(express.json()); intelligenceRoutes(app, root, [], undefined, { ai });
  const api = await serve(app);
  try {
    const response = await fetch(api.url + '/api/reports/narrative', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Write revenue analysis for the frozen September snapshot.' }) });
    assert.equal(response.status, 200); assert.deepEqual(JSON.parse((await response.json()).answer), narrative);
    assert.equal(call.text.format.type, 'json_schema'); assert.equal(call.tools, undefined);
    await fetch(api.url + '/api/reports/narrative', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Write the client type breakdown.',editorial:true,focusIds:['entry_type','format_group','slot-combinations']})});
    const schema=call.text.format.schema.properties.cards.items;
    assert.deepEqual(schema.properties.focus.enum,['kpis','trend','cross','entry_type','format_group','slot-combinations']);
    assert.ok(schema.required.includes('plainLanguage')); assert.ok(schema.required.includes('confidence'));
    assert.ok(schema.required.includes('impact')); assert.ok(schema.required.includes('watch'));
    assert.match(call.instructions, /Session-attributed revenue is not cash collections/);
  } finally { await api.close(); await rm(root, { recursive: true, force: true }); }
});

test('AI failures remain visible for every chapter and are never cached as AI analysis', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => { throw Error('failed chapters must not be cached'); } };
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'OpenAI rejected the configured key.' }), { status: 400 });
  try {
    const narratives = await generateNarratives({ ...snapshot(), chapters: Object.fromEntries(chapters.filter(c => !c.derived).map(c => [c.id, { id: c.id, n: 5, total: { revenue: 100 }, prior: { revenue: 80 }, priorYear: {}, history: [], groups: [] }])) });
    assert.equal(Object.keys(narratives).length, chapters.length);
    for (const narrative of Object.values(narratives)) { assert.equal(narrative.generated, false); assert.match(narrative.error!, /rejected/); }
  } finally { globalThis.fetch = originalFetch; (globalThis as any).localStorage = originalStorage; }
});

test('historical and prior-year changes invalidate report analysis', () => {
  const base: any = { id: 'sessions', total: { revenue: 100 }, prior: {}, priorYear: { revenue: 80 }, groups: [], history: [{ month: '2026-08', revenue: 90 }], n: 5 };
  assert.notEqual(figuresHash({ sessions: base }), figuresHash({ sessions: { ...base, priorYear: { revenue: 70 } } }));
  assert.notEqual(figuresHash({ sessions: base }), figuresHash({ sessions: { ...base, history: [{ month: '2026-08', revenue: 95 }] } }));
});


test('forward view uses explicit what-if arithmetic and skips missing baselines', () => {
  const model: any = { ...snapshot(), chapters: { sessions: { total: { sessions: 120, fill_rate: .9 }, prior: { sessions: 100, fill_rate: .5 } } } };
  const scenarios = forwardScenarios(model);
  assert.match(scenarios, /flat scenario 120; repeat-last-month-movement scenario 144/);
  assert.match(scenarios, /100.0%/);
  assert.match(scenarios, /conditional scenarios, not estimates of likelihood/);
  assert.doesNotMatch(scenarios, /Revenue per session/);
});

test('custom report chapters, editorial preferences and narrative cache remain isolated', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = (globalThis as any).localStorage;
  const cache = new Map<string,string>();
  (globalThis as any).localStorage = { getItem: (k:string) => cache.get(k) ?? null, setItem: (k:string,v:string) => cache.set(k,v) };
  const messages: string[] = [];
  globalThis.fetch = async (_url,init) => {
    messages.push(JSON.parse(String(init?.body)).message);
    return new Response(JSON.stringify({answer:JSON.stringify({summary:'A grounded decision brief.',cards:[{headline:'Review studio demand',meaning:'Check the mix.',evidence:'Recorded figures.',action:'Manager to review.',plainLanguage:'Review demand.',focus:'kpis',category:'meaning',confidence:'medium'}]})}));
  };
  const customization = {title:'Board pack',subtitle:'September',preparedFor:'Leadership',preparedBy:'Operations',audience:'Executive board',tone:'Plain language',detail:'Concise',instructions:'Prioritise retention',chapterIds:['recommendations','executive-summary'],theme:'dark' as const};
  const model = {...snapshot(),customization,chapters:{'executive-summary':{id:'executive-summary',n:5,total:{revenue:100},prior:{revenue:80},priorYear:{},history:[],groups:[]}}};
  try {
    const progress:string[]=[];
    const first=await generateNarratives(model,(_done,_total,label)=>progress.push(label));
    assert.deepEqual(Object.keys(first),customization.chapterIds);
    assert.equal(messages.length,2);
    assert.match(messages[0],/Audience: Executive board/);
    assert.match(messages[0],/Prioritise retention/);
    await generateNarratives(model);
    assert.equal(messages.length,2,'same customized report should reuse its cache');
    await generateNarratives({...model,customization:{...customization,tone:'Professional'}});
    assert.equal(messages.length,4,'changed editorial preferences must generate fresh prose');
    assert.ok(progress.includes('Narratives complete'));
  } finally {globalThis.fetch=originalFetch;(globalThis as any).localStorage=originalStorage;}
});
