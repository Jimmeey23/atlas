import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addCall, costUsd, priceFor, summariseUsage } from '../src/report/usage.ts';
import { generateNarratives } from '../src/report/narrative.ts';
import { intelligenceRoutes } from '../server/intelligence.mjs';

const call = (over = {}) => ({ model: 'gpt-4.1', inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000, reasoningTokens: 0, durationMs: 1000, ...over });

test('dated and variant model names resolve to the right price, unknown ones to none', () => {
  assert.equal(priceFor('gpt-5-mini-2025-08-07')!.input, 0.25, 'gpt-5-mini must not resolve to gpt-5');
  assert.equal(priceFor('gpt-4.1-2025-04-14')!.output, 8);
  assert.equal(priceFor('GPT-5.4')!.input, 2.5);
  assert.equal(priceFor('gpt-5.4o'), null, 'a different model sharing a prefix is not priced as gpt-5.4');
  assert.equal(priceFor('claude-local'), null);
});

test('cost bills cached input at the cached rate and output at the output rate', () => {
  // gpt-4.1: $2 input, $0.50 cached, $8 output per million.
  assert.equal(costUsd(call()), 10);
  assert.equal(costUsd(call({ cachedInputTokens: 500_000 })), 1 + 0.25 + 8);
  assert.equal(costUsd(call({ model: 'mystery' })), null);
});

test('a chapter accumulates retries, and one unpriced call makes its cost unknown', () => {
  const twice = addCall(addCall(undefined, call()), call({ outputTokens: 0 }));
  assert.equal(twice.calls, 2);
  assert.equal(twice.inputTokens, 2_000_000);
  assert.equal(twice.costUsd, 12);
  assert.equal(addCall(twice, call({ model: 'mystery' })).costUsd, null);
});

test('run summary bills only fresh calls and flags incomplete costs', () => {
  const u = (over = {}) => ({ ...addCall(undefined, call()), ...over });
  const run = summariseUsage({
    a: { summary: 's', cards: [], generated: true, usage: u() },
    b: { summary: 's', cards: [], generated: true, usage: u({ fromCache: true }) },
    c: { summary: '', cards: [], generated: false, error: 'x', usage: u({ costUsd: null, model: 'mystery' }) },
  });
  assert.deepEqual([run.written, run.fromCache, run.failed, run.calls], [1, 1, 1, 2]);
  assert.equal(run.costUsd, 10);
  assert.equal(run.costIncomplete, true);
  assert.deepEqual(run.models, ['gpt-4.1', 'mystery']);
});

test('the narrative endpoint returns billed usage, including on a rejected answer', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-usage-'));
  let output = JSON.stringify({ summary: 'S', cards: [{ headline: 'H', meaning: 'M', evidence: 'E', action: 'A' }] });
  const usage = { input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 900, output_tokens_details: { reasoning_tokens: 600 } };
  const ai = { responses: { create: async () => ({ status: 'completed', model: 'gpt-5-2025-08-07', output_text: output, usage }) } };
  const app = express(); app.use(express.json()); intelligenceRoutes(app, root, [], undefined, { ai });
  const server = app.listen(0); const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = () => fetch(url + '/api/reports/narrative', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Write.' }) });
  try {
    const ok = await (await post()).json();
    assert.deepEqual({ ...ok.usage, durationMs: 0 }, { model: 'gpt-5-2025-08-07', inputTokens: 1200, cachedInputTokens: 200, outputTokens: 900, reasoningTokens: 600, durationMs: 0 });
    output = JSON.stringify({ summary: '', cards: [] });
    const rejected = await post();
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).usage.outputTokens, 900, 'a rejected answer was still billed');
  } finally { server.close(); await rm(root, { recursive: true, force: true }); }
});

test('chapters carry usage, rejected calls count, and cache hits bill nothing', async () => {
  const originalFetch = globalThis.fetch, originalStorage = (globalThis as any).localStorage;
  const cache = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => cache.get(k) ?? null, setItem: (k: string, v: string) => cache.set(k, v) };
  const used = { model: 'gpt-4.1', inputTokens: 1000, cachedInputTokens: 0, outputTokens: 500, reasoningTokens: 0, durationMs: 2000 };
  const card = { headline: 'H', meaning: 'M', evidence: 'E', action: 'A', plainLanguage: 'P', impact: 'I', watch: 'W', focus: 'kpis', category: 'meaning', confidence: 'high' };
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    // The first answer is malformed and rejected client-side; it was still billed.
    return new Response(JSON.stringify({ answer: JSON.stringify({ summary: calls === 1 ? '' : 'Verdict.', cards: [card] }), usage: used }));
  };
  const model: any = { scope: { studio: 'S', month: '2026-09' }, builtAt: '2026-10-01T00:00:00Z', figuresHash: 'x', narratives: {},
    customization: { title: '', subtitle: '', preparedFor: '', preparedBy: '', audience: '', tone: '', detail: 'Concise', instructions: '', chapterIds: ['recommendations'], theme: 'light' },
    chapters: { 'executive-summary': { id: 'executive-summary', n: 5, total: { revenue: 100 }, prior: { revenue: 80 }, priorYear: {}, history: [], groups: [] } } };
  try {
    const failed = await generateNarratives(model);
    assert.ok(failed.recommendations.error);
    assert.equal(failed.recommendations.usage!.calls, 1);
    assert.equal(failed.recommendations.usage!.costUsd, (1000 * 2 + 500 * 8) / 1e6);
    const written = await generateNarratives(model);
    assert.equal(written.recommendations.generated, true);
    assert.equal(written.recommendations.usage!.fromCache, undefined);
    const reused = await generateNarratives(model);
    assert.equal(calls, 2, 'the third run is served from cache');
    assert.equal(reused.recommendations.usage!.fromCache, true);
    assert.equal(summariseUsage(reused).costUsd, 0);
  } finally { globalThis.fetch = originalFetch; (globalThis as any).localStorage = originalStorage; }
});
