import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { reportRoutes } from '../server/reports.mjs';
import { deckTabs, deckPages, liveNotes, sectionContext } from '../src/report/deck.ts';
import { setIn } from '../src/components/report/deck/editing.tsx';

async function serve(app: ReturnType<typeof express>) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  return { url: `http://127.0.0.1:${(server.address() as any).port}`, close: () => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }) };
}
const snapshot = (month = '2026-09') => ({ scope: { studio: 'Kenkere House', month }, builtAt: '2026-10-06T10:00:00Z',
  chapters: {}, narratives: { overview: { summary: 'Recorded performance.', cards: [{ headline: 'Attendance fell', meaning: 'm', evidence: 'e', action: 'a', focus: 'kpis' }], generated: true } }, figuresHash: 'abc' });

function harness() {
  const documents = new Map<string, any>();
  let tick = 0;
  const updated = new Map<string, number>();
  const store = {
    read: async (k: string) => documents.get(k) ?? null,
    write: async (k: string, v: any) => { documents.set(k, v); updated.set(k, ++tick); return v; },
    remove: async (k: string) => { documents.delete(k); updated.delete(k); },
  };
  const cloud = { from: () => ({ select: () => ({ like: (_c: string, pattern: string) => ({ order: () => ({ limit: async () => ({
    data: [...documents.keys()].filter(k => k.startsWith(pattern.replace('%', ''))).sort((a, b) => updated.get(b)! - updated.get(a)!).map(key => ({ key })), error: null }) }) }) }) }) };
  return { documents, store, cloud };
}
const post = (url: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') => fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('only the latest five reports survive, plus pinned ones', async () => {
  const { store, cloud } = harness();
  const app = express(); app.use(express.json()); reportRoutes(app, store, cloud, {});
  const api = await serve(app);
  try {
    const first = await (await post(api.url + '/api/reports', snapshot('2026-01'))).json();
    assert.equal((await post(`${api.url}/api/reports/${first.id}/pin`, { pinned: true })).status, 200);
    for (let i = 2; i <= 8; i++) await post(api.url + '/api/reports', snapshot(`2026-0${i}`));
    const list = await (await fetch(api.url + '/api/reports')).json();
    assert.equal(list.length, 6);
    assert.equal(list.filter((r: any) => r.pinned).length, 1);
    assert.ok(list.some((r: any) => r.id === first.id));
    assert.deepEqual(list.filter((r: any) => !r.pinned).map((r: any) => r.scope.month).sort(), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
  } finally { await api.close(); }
});

test('admin edits need an unlocked session and persist in place; notes do not', async () => {
  const { store, cloud } = harness();
  const env = { ATLAS_ADMIN_PASSCODE: 'open-sesame', ATLAS_ADMIN_SECRET: 'x'.repeat(32) };
  const app = express(); app.use(express.json()); reportRoutes(app, store, cloud, env);
  const api = await serve(app);
  try {
    const saved = await (await post(api.url + '/api/reports', snapshot())).json();
    const edited = { ...saved, narratives: { overview: { ...saved.narratives.overview, summary: 'Rewritten by an admin.' } }, replacements: { 'overview:summary:metrics': { kind: 'callout', title: 'One takeaway', body: 'Fill fell.' } } };
    assert.equal((await post(`${api.url}/api/reports/${saved.id}`, edited, {}, 'PUT')).status, 403);
    assert.equal((await post(api.url + '/api/reports/admin', { passcode: 'wrong' })).status, 401);
    const { token } = await (await post(api.url + '/api/reports/admin', { passcode: 'open-sesame' })).json();
    assert.deepEqual(await (await fetch(api.url + '/api/reports/admin', { headers: { 'x-atlas-admin': token } })).json(), { configured: true, unlocked: true });
    const response = await post(`${api.url}/api/reports/${saved.id}`, { ...edited, chapters: { forged: {} } }, { 'x-atlas-admin': token }, 'PUT');
    assert.equal(response.status, 200);
    const reloaded = await (await fetch(`${api.url}/api/reports/${saved.id}`)).json();
    assert.equal(reloaded.id, saved.id);
    assert.equal(reloaded.narratives.overview.summary, 'Rewritten by an admin.');
    assert.equal(reloaded.replacements['overview:summary:metrics'].title, 'One takeaway');
    assert.deepEqual(reloaded.chapters, {}, 'recorded figures stay frozen');
    assert.ok(reloaded.editedAt);
    await post(`${api.url}/api/reports/${saved.id}/notes`, { presenterNotes: { 'overview:cover': 'Open with the dip.' }, speakerNotes: { 'overview:glance': { opener: 'Hi', points: [], numbers: [], questions: [], transition: '' } } }, {}, 'PATCH');
    await post(`${api.url}/api/reports/${saved.id}/notes`, { speakerNotes: { 'overview:glance': null } }, {}, 'PATCH');
    const notes = await (await fetch(`${api.url}/api/reports/${saved.id}`)).json();
    assert.equal(notes.presenterNotes['overview:cover'], 'Open with the dip.');
    assert.equal(notes.speakerNotes['overview:glance'], undefined);
  } finally { await api.close(); }
});

test('deck pages and live speaker notes come from the frozen report', () => {
  const model = { ...snapshot(), narratives: { 'executive-summary': { summary: 'September softened. Fill fell.', generated: true, cards: [{ headline: 'Attendance fell 15%', meaning: 'm', evidence: 'e', action: 'Call dormant members', driver: 'Barre slots', focus: 'kpis' }] } },
    customization: { chapterIds: ['executive-summary'] } } as any;
  const tabs = deckTabs(model);
  assert.deepEqual(tabs.map(t => t.id), ['overview', 'executive-summary']);
  const pages = deckPages(tabs);
  assert.deepEqual(pages[0], { tab: 'overview', section: 'cover' });
  const notes = liveNotes(model, tabs, 'executive-summary', 'summary');
  assert.equal(notes.opener, 'Attendance fell 15%');
  assert.ok(notes.points.some(p => p.includes('Barre slots')));
  assert.equal(liveNotes({ ...model, speakerNotes: { 'executive-summary:summary': { opener: 'Saved', points: [], numbers: [], questions: [], transition: '' } } }, tabs, 'executive-summary', 'summary').opener, 'Saved');
  assert.ok(JSON.parse(sectionContext(model, 'executive-summary', 'summary')).narrative.summary.startsWith('September'));
  assert.deepEqual(setIn({ a: [{ b: 1 }] }, ['a', 0, 'b'], 2), { a: [{ b: 2 }] });
});
