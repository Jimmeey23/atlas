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
  // The executive brief folds into the overview tab: one consolidated cover.
  assert.deepEqual(tabs.map(t => t.id), ['overview']);
  assert.equal(tabs[0].chapter, 'executive-summary');
  const pages = deckPages(tabs);
  assert.deepEqual(pages[0], { tab: 'overview', section: 'cover' });
  // The script never repeats on-screen copy, and leadership questions are answered from the report.
  const notes = liveNotes(model, tabs, 'overview', 'cover');
  assert.ok(!notes.points.some(p => p.includes('Attendance fell 15%')) && notes.opener !== 'Attendance fell 15%');
  assert.ok(notes.questions.some(q => q.a.includes('Barre slots')));
  assert.equal(liveNotes({ ...model, speakerNotes: { 'overview:cover': { opener: 'Saved', points: [], numbers: [], questions: [], transition: '' } } }, tabs, 'overview', 'cover').opener, 'Saved');
  assert.ok(JSON.parse(sectionContext(model, 'overview', 'cover')).narrative.summary.startsWith('September'));
  assert.deepEqual(setIn({ a: [{ b: 1 }] }, ['a', 0, 'b'], 2), { a: [{ b: 2 }] });
});

test('AI component replacement sends a strict JSON schema and requires admin', async () => {
  const { intelligenceRoutes } = await import('../server/intelligence.mjs');
  const { unlockAdmin } = await import('../server/report-admin.mjs');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  process.env.ATLAS_ADMIN_PASSCODE = 'schema-test';
  let call: any;
  const component = { kind: 'callout', title: 'T', subtitle: '', body: 'B', tone: 'info', items: [], chart: { type: 'bar', categories: [], series: [], unit: '' }, columns: [], rows: [], bullets: [], left: { label: '', points: [] }, right: { label: '', points: [] } };
  const ai = { responses: { create: async (request: any) => { call = request; return { status: 'completed', output_text: JSON.stringify(component) }; } } };
  const app = express(); app.use(express.json()); intelligenceRoutes(app, await mkdtemp(path.join(tmpdir(), 'atlas-component-')), [], undefined, { ai });
  const api = await serve(app);
  try {
    assert.equal((await post(api.url + '/api/reports/component', { context: '{}', prompt: 'x' })).status, 403);
    const { token } = unlockAdmin('schema-test');
    const response = await post(api.url + '/api/reports/component', { context: '{"metrics":[]}', prompt: 'A callout' }, { 'x-atlas-admin': token });
    assert.equal(response.status, 200);
    assert.equal(call.text.format.type, 'json_schema');
    assert.ok(call.text.format.schema?.properties?.kind, 'schema is sent');
    assert.equal((await response.json()).component.title, 'T');
  } finally { await api.close(); delete process.env.ATLAS_ADMIN_PASSCODE; }
});

test('v3 chapter analysis sends a strict schema with the briefing, decision, performers and questions', async () => {
  const { intelligenceRoutes } = await import('../server/intelligence.mjs');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  let call: any;
  const answer = { summary: 'S', briefing: { takeaways: ['t'], whatChanged: '', whyItMoved: '', whereItSits: '', whatHeldUp: '', outlook: '', soWhat: '' },
    decision: { call: 'C', rationale: '', evidence: [], expectedImpact: '', successMeasure: '', risks: '', alternative: '', owner: 'Finance', horizon: 'Monitor' },
    performers: { leaders: '', laggards: '', pattern: '' }, questions: [{ q: 'Q', a: 'A' }],
    cards: [{ headline: 'H', meaning: 'M', evidence: 'E', action: '', lens: 'risk', focus: 'kpis', confidence: 'high' }] };
  const ai = { responses: { create: async (request: any) => { call = request; return { status: 'completed', output_text: JSON.stringify(answer), usage: {} }; } } };
  const app = express(); app.use(express.json()); intelligenceRoutes(app, await mkdtemp(path.join(tmpdir(), 'atlas-v3-')), [], undefined, { ai });
  const api = await serve(app);
  try {
    const response = await post(api.url + '/api/reports/narrative', { message: 'Chapter', focusIds: ['format'], editorial: true, insightVersion: 3, metricIds: ['attendance'] });
    assert.equal(response.status, 200);
    const schema = call.text.format.schema;
    for (const key of ['briefing', 'decision', 'performers', 'questions']) assert.ok(schema.required.includes(key), `${key} is required`);
    // Strict mode: every object lists every property as required and forbids extras.
    const walk = (node: any) => { if (node?.type === 'object') { assert.equal(node.additionalProperties, false); assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort()); Object.values(node.properties).forEach(walk); } if (node?.items) walk(node.items); };
    walk(schema);
  } finally { await api.close(); }
});

test('an empty OpenAI account is reported as a billing problem, not throttling', async () => {
  const { isQuotaError, reportProviderError } = await import('../server/report-errors.mjs');
  const empty = { status: 429, code: 'credit_balance_exhausted', type: 'insufficient_quota', message: '429 You have no credits remaining.' };
  assert.equal(isQuotaError(empty), true);
  assert.equal(reportProviderError(empty).retryable, false);
  assert.equal(isQuotaError({ status: 429, code: 'rate_limit_exceeded', message: 'Rate limit reached for requests' }), false);
});

test('a clicked figure narrows to the records that make it up', async () => {
  const { metricRecordFocus } = await import('../src/report/source-records.ts');
  assert.equal(metricRecordFocus('booking_late_cancelled')?.where, 'late_cancelled>0');
  const fill = metricRecordFocus('fill_rate')!;
  assert.ok(fill.rate && fill.where?.includes('capacity') && fill.flag?.includes('checked_in'), 'rates keep the denominator and flag the numerator');
  assert.equal(metricRecordFocus('not_a_metric'), null);
});
