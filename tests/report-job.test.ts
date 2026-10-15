import test from 'node:test';
import assert from 'node:assert/strict';
import { useReportJob, startReport, stopReport } from '../src/report/job';
import { chapters } from '../src/report/chapters';
import type { ReportModel } from '../src/report/model';
const answer = JSON.stringify({ summary: 'Recorded visits grew.', cards: [{ headline: 'Recorded visits grew', meaning: 'Review the evidence.', evidence: '120 visits versus 100.', action: '', metrics: ['attendance'], focus: 'kpis', lens: 'driver', confidence: 'medium' }] });
function fixture(): ReportModel {
  return { schemaVersion: 6, figuresHash: 'job-fixture', builtAt: '2026-10-15T00:00:00Z', scope: { studio: 'Test', month: '2026-09' }, chapters: Object.fromEntries(chapters.map(c => [c.id, { id: c.id, n: 10, total: { attendance: 120 }, prior: { attendance: 100 }, priorYear: {}, history: [], groups: [] }])), narratives: {}, customization: { title: 'Test', subtitle: '', preparedBy: '', preparedFor: '', audience: 'Leadership', tone: 'Professional', detail: 'Comprehensive', instructions: '', chapterIds: ['sessions', 'recommendations'], theme: 'light' } };
}
test('stopping a rewrite retains completed chapters and labels unfinished ones without saving', async () => {
  const originalFetch = globalThis.fetch, storage = (globalThis as any).localStorage;
  let release!: () => void;
  const secondStarted = new Promise<void>(r => { release = r; });
  let calls = 0, saves = 0;
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/status')) return new Response('{}');
    if (String(url) === '/api/reports') { saves++; return new Response('{}'); }
    if (++calls === 1) return new Response(JSON.stringify({ answer }));
    release();
    return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true }));
  };
  try {
    const model = fixture(); useReportJob.getState().set({ model, studio: model.scope.studio, month: model.scope.month, customization: model.customization!, status: 'idle' });
    const running = startReport({ regenerate: true }); await secondStarted;
    assert.equal(useReportJob.getState().mode, 'rewrite');
    stopReport(); await running;
    const state = useReportJob.getState();
    assert.equal(state.status, 'stopped');
    assert.equal(state.model!.narratives.sessions.generated, true);
    assert.match(state.model!.narratives.recommendations.error!, /Stopped/);
    assert.equal(state.model!.id, undefined); assert.equal(saves, 0);
    assert.deepEqual(state.model!.chapters, model.chapters);
  } finally { globalThis.fetch = originalFetch; (globalThis as any).localStorage = storage; }
});
test('partial analysis and a failed save retain the report for retry', async () => {
  const originalFetch = globalThis.fetch, storage = (globalThis as any).localStorage;
  let calls = 0;
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.fetch = async url => String(url).includes('/status') ? new Response('{}') : String(url) === '/api/reports' ? new Response(JSON.stringify({ error: 'Fixture save failure' }), { status: 503 }) : ++calls === 1 ? new Response(JSON.stringify({ answer })) : new Response(JSON.stringify({ error: 'Fixture chapter failure' }), { status: 503 });
  try {
    const model = fixture(); useReportJob.getState().set({ model, studio: model.scope.studio, month: model.scope.month, customization: model.customization!, status: 'idle' });
    await startReport({ regenerate: true }); const state = useReportJob.getState();
    assert.equal(state.status, 'done'); assert.match(state.storageError, /not saved.*Fixture save failure/);
    assert.match(state.narrativeError, /Fixture chapter failure/); assert.equal(state.model!.narratives.sessions.generated, true);
    assert.equal(state.model!.narratives.recommendations.generated, false); assert.deepEqual(state.model!.chapters, model.chapters);
  } finally { globalThis.fetch = originalFetch; (globalThis as any).localStorage = storage; }
});
