import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { intelligenceRoutes } from '../server/intelligence.mjs';
import { createStore } from '../server/store.mjs';
import { reportRoutes } from '../server/reports.mjs';
import { generateNarratives, chapterPayload, portfolioPayload } from '../src/report/narrative';
import { chapters } from '../src/report/chapters';
import { saveReport, loadReport } from '../src/report/storage';
import { addCall, summariseUsage } from '../src/report/usage';
import type { ChapterData, ReportModel } from '../src/report/model';

const chapter = (id: string, extra: Partial<ChapterData> = {}): ChapterData => ({ id, n: 20, total: {}, prior: {}, priorYear: {}, history: [], groups: [], ...extra });
const fixture = (): ReportModel => ({ scope: { studio: 'Kenkere House', month: '2026-09' }, builtAt: '2026-10-10T00:00:00Z', figuresHash: 'test', schemaVersion: 6, narratives: {},
  customization: { title: 'Monthly review', subtitle: '', preparedFor: '', preparedBy: '', audience: 'Leadership', tone: 'Professional', detail: 'Comprehensive', instructions: '', chapterIds: ['sessions', 'predictions'], theme: 'light' },
  chapters: { sessions: chapter('sessions', { total: { sessions: 10, attendance: 120, fill_rate: .7123456789 }, prior: { sessions: 8, attendance: 100, fill_rate: .6 }, priorYear: { attendance: 90 }, history: [{ month: '2026-08', attendance: 100, fill_rate: .6 }, { month: '2026-09', attendance: 120, fill_rate: .7123456789 }] }) },
});
const answer = JSON.stringify({ summary: 'Recorded demand increased; this is conditional analysis.', cards: [{ headline: 'More recorded visits', meaning: 'Evidence informs capacity decisions.', evidence: '120 visits versus 100.', action: 'Review capacity.', lens: 'driver', focus: 'kpis', confidence: 'high', metrics: ['attendance'] }] });
const usage = { input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 900, output_tokens_details: { reasoning_tokens: 600 } };

test('retry preserves successful chapters; durable reuse survives fresh browser and server sessions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-reuse-'));
  const originalFetch = globalThis.fetch, originalStorage = (globalThis as any).localStorage, originalModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_MODEL = 'gpt-5';
  const documents = new Map<string, any>();
  // Exercise the actual database-backed createStore contract without live credentials.
  const cloud = { from: () => ({ select: () => ({ eq: (_field: string, key: string) => ({ maybeSingle: async () => ({ data: documents.has(key) ? { value: documents.get(key) } : null, error: null }) }) }),
    upsert: async (row: any) => { documents.set(row.key, row.value); return { error: null }; } }) };
  const requests: any[] = [];
  let rejectOutlook = true;
  const ai = { responses: { create: async (request: any) => {
    requests.push(request);
    if (rejectOutlook && request.input.includes('"What happens next: conditional scenarios"'))
      return { status: 'completed', output_text: JSON.stringify({ summary: '', cards: [] }), usage };
    return { status: 'completed', output_text: answer, usage };
  } } };
  const start = async () => {
    const app = express(); app.use(express.json({ limit: '8mb' }));
    const store = createStore({ root, cloud });
    intelligenceRoutes(app, root, [], undefined, { ai, store, db: cloud }); reportRoutes(app, store, cloud);
    const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
    return { url: `http://127.0.0.1:${(server.address() as any).port}`, close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
  };
  let api = await start();
  const freshBrowser = () => {
    const local = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => local.set(key, value) };
  };
  globalThis.fetch = (url, init) => originalFetch(new URL(String(url), api.url), init);
  freshBrowser();
  try {
    const model = fixture();
    const first = await generateNarratives(model);
    assert.equal(requests.length, 2); assert.equal(first.sessions.generated, true); assert.ok(first.predictions.error);
    assert.equal(documents.size, 1, 'failed provider output must not enter durable storage');
    rejectOutlook = false; freshBrowser();
    const retry = await generateNarratives({ ...model, narratives: first });
    assert.equal(requests.length, 3, 'only the failed chapter reaches the provider');
    assert.deepEqual(retry.sessions.cards, first.sessions.cards);
    assert.equal(retry.sessions.summary, first.sessions.summary); assert.equal(retry.sessions.usage?.fromCache, true);
    assert.equal(summariseUsage(retry).calls, 1); assert.equal(summariseUsage(retry).fromCache, 1);
    const saved = await saveReport({ ...model, narratives: retry });
    await api.close(); api = await start(); freshBrowser();
    const restored = await loadReport(saved.id!);
    assert.equal(restored.narratives.sessions.analysisKey, retry.sessions.analysisKey);
    const rebuilt = await generateNarratives({ ...model, narratives: {} });
    assert.equal(requests.length, 3, 'fresh browser and server reuse the database cache');
    assert.equal(summariseUsage(rebuilt).calls, 0); assert.equal(summariseUsage(rebuilt).costUsd, 0);
    assert.equal(summariseUsage(rebuilt).fromCache, 2);
    assert.deepEqual(rebuilt.sessions.cards, first.sessions.cards);
    const styled = { ...model, narratives: rebuilt, customization: { ...model.customization!, title: 'Board presentation', theme: 'dark' as const, density: 'comfortable' as const, showCharts: false, chapterIds: ['predictions', 'sessions'] } };
    await generateNarratives(styled); assert.equal(requests.length, 3, 'appearance and chapter order incur no provider calls');
    await generateNarratives({ ...styled, customization: { ...styled.customization, tone: 'Plain language' } });
    assert.equal(requests.length, 5, 'editorial changes rewrite both chapters');
    await generateNarratives({ ...model, chapters: { sessions: { ...model.chapters.sessions, total: { ...model.chapters.sessions.total, attendance: 130 } } } });
    assert.equal(requests.length, 7, 'changed evidence refreshes its chapter and dependent Outlook');
    await generateNarratives({ ...model, customization: { ...model.customization!, targets: { attendance: 200 } } });
    assert.equal(requests.length, 9, 'management targets invalidate analysis');
    const oversized = { ...model, additionalContext: [{ title: 'External context', scope: 'Network', status: 'available', limitations: 'Context only', data: { note: 'x'.repeat(100000) } }] };
    await generateNarratives(oversized);
    await generateNarratives({ ...oversized, additionalContext: [{ ...oversized.additionalContext[0], data: { note: 'x'.repeat(99999) + 'y' } }] });
    assert.equal(requests.length, 13, 'changes to omitted evidence invalidate both browser and database reuse');
    assert.equal(requests[9].input, requests[11].input, 'omitted evidence can change without changing the bounded prompt');
    assert.equal(requests[10].input, requests[12].input);
    await api.close(); process.env.OPENAI_MODEL = 'gpt-5-mini'; api = await start(); freshBrowser();
    await generateNarratives({ ...model, narratives: rebuilt });
    assert.equal(requests.length, 15, 'changing the configured model invalidates local, saved and durable reuse');
    assert.ok(requests.every(request => request.reasoning.effort === 'high' && request.max_output_tokens === 20000));
  } finally {
    globalThis.fetch = originalFetch; (globalThis as any).localStorage = originalStorage;
    if (originalModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = originalModel;
    await api.close(); await rm(root, { recursive: true, force: true });
  }
});

test('deduplication preserves raw precision, missing-value comparisons, history and cross-report evidence', () => {
  const model = fixture(), spec = chapters.find(c => c.id === 'sessions')!;
  model.chapters.sessions.total.empty_session_rate = null;
  model.chapters.sessions.prior.empty_session_rate = .123456789;
  model.chapters.sessions.yearToDate = { n: 50, attendance: 900 };
  model.chapters.sessions.groups = [{ field: 'format', title: 'Formats', deck: '', columns: ['fill_rate', 'attendance'], rows: [{ g: 'Barre', fill_rate: .823456789, attendance: 30 }], total: null }];
  model.chapters['revenue-performance'] = chapter('revenue-performance', { total: { gross_revenue: 1234567.89 } });
  const own = chapterPayload(spec, model.chapters.sessions, model);
  const context = portfolioPayload(model, undefined, spec);
  assert.match(own, /0.7123456789/); assert.match(own, /0.823456789/); assert.match(own, /0.123456789/);
  assert.match(own, /\["empty_session_rate",null,0.123456789/);
  assert.match(own, /900/); assert.match(own, /Trailing months/);
  assert.doesNotMatch(context, /"chapter":"sessions"/); assert.match(context, /"chapter":"revenue-performance"/);
  assert.match(context, /1234567.89/); assert.match(context, /Source freshness and coverage/);
  assert.ok(context.length < portfolioPayload(model).length, 'context is smaller without removing another chapter');
});

test('server cache accounting excludes reused output and preserves already billed retry attempts', () => {
  const hit = { model: 'gpt-4.1', inputTokens: 1200, cachedInputTokens: 200, outputTokens: 900, reasoningTokens: 600, durationMs: 100, fromCache: true };
  const reused = addCall(undefined, hit);
  assert.equal(reused.calls, 0); assert.equal(reused.costUsd, 0); assert.equal(reused.fromCache, true);
  const billed = addCall(undefined, { ...hit, fromCache: false });
  assert.deepEqual(addCall(billed, hit), billed, 'a cache hit never erases cost already incurred by this run');
});

test('cache storage failures leave complete analysis usable and never claim a cache hit', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-cache-unavailable-'));
  let calls = 0;
  const ai = { responses: { create: async () => { calls++; return { status: 'completed', output_text: answer, usage }; } } };
  const store = { read: async () => { throw new Error('Storage offline'); }, write: async () => { throw new Error('Storage offline'); } };
  const app = express(); app.use(express.json()); intelligenceRoutes(app, root, [], undefined, { ai, store });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/reports/narrative`;
  try {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Review recorded demand.' }) });
      assert.equal(response.status, 200);
      const body = await response.json(); assert.equal(body.answer, answer); assert.equal(body.cacheStatus, 'unavailable'); assert.equal(body.usage.fromCache, undefined);
    }
    assert.equal(calls, 2);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test('server policy changes and unavailable provider identity prevent stale browser or saved reuse', async () => {
  const originalFetch = globalThis.fetch, originalStorage = (globalThis as any).localStorage;
  const cache = new Map<string, string>(); let revision = '1', unavailable = false, calls = 0;
  (globalThis as any).localStorage = { getItem: (key: string) => cache.get(key) ?? null, setItem: (key: string, value: string) => cache.set(key, value) };
  globalThis.fetch = async (_url, init) => {
    if (!init?.body) return new Response(JSON.stringify(unavailable ? { error: 'Status unavailable' } : { openai: true, model: 'gpt-5', reportNarrativeVersion: revision }), { status: unavailable ? 503 : 200 });
    calls++; return new Response(JSON.stringify({ answer }));
  };
  try {
    const model = fixture(); const first = await generateNarratives(model);
    await generateNarratives({ ...model, narratives: first }); assert.equal(calls, 2);
    revision = '2'; await generateNarratives({ ...model, narratives: first }); assert.equal(calls, 4);
    unavailable = true; await generateNarratives({ ...model, narratives: first }); assert.equal(calls, 6);
  } finally { globalThis.fetch = originalFetch; (globalThis as any).localStorage = originalStorage; }
});
