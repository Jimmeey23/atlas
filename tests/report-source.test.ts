import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { reportRoutes } from '../server/reports.mjs';
import { deckTabs, sectionContext, liveNotes } from '../src/report/deck.ts';
import type { ReportModel } from '../src/report/model';
const model = (): ReportModel => ({ scope: { studio: 'Supreme HQ, Bandra', month: '2026-09' }, builtAt: '2026-10-13T04:00:00Z', figuresHash: 'source', chapters: {}, narratives: {}, importedChapters: [
  { id: 'overview', title: 'Performance Review', filename: 'review.html', html: '', sha256: 'a'.repeat(64), tables: 1, charts: 0, summary: 'September review', metrics: [{ label: 'New clients', value: '143', note: 'September 2026' }], sections: [{ id: 'section-1', title: 'September', html: '<table><tr><td>143</td></tr></table>', tables: 1, charts: 0 }] },
  { id: 'sales-performance', title: 'Sales Performance', filename: 'sales.html', html: '', sha256: 'b'.repeat(64), tables: 1, charts: 0, metrics: [{ label: 'Transactions', value: '195', note: 'September 2026 distinct sales' }], sections: [{ id: 'section-1', title: 'Cash', html: '<p>September cash ₹15,29,410</p>', tables: 1, charts: 0 }] },
] });
test('source report navigation preserves one review followed by sales without adding generated chapters', () => {
  const m = model(); m.narratives['recommendations'] = { summary: 'Old content', generated: false, cards: [] };
  assert.deepEqual(deckTabs(m).map(t => t.label), ['Performance Review', 'Sales Performance']);
});
test('AI and presenter contexts use source month cards and source prose rather than stale calculated totals', () => {
  const m = model(); m.chapters['sales-performance'] = { id: 'sales-performance', total: { transactions: 6540 }, prior: {}, priorYear: {}, n: 6540, groups: [], history: [] };
  const context = sectionContext(m, 'sales-performance', 'summary');
  assert.match(context, /195/); assert.match(context, /2026-09/); assert.doesNotMatch(context, /6540/);
  const notes = liveNotes(m, deckTabs(m), 'sales-performance', 'summary'); assert.match(notes.numbers[0], /195/); assert.doesNotMatch(JSON.stringify(notes), /6540/);
});
test('imported evidence survives saving and unsafe source markup is rejected', async () => {
  const documents = new Map();
  const store = { read: async (k: string) => documents.get(k), write: async (k: string, v: unknown) => documents.set(k,v) };
  const cloud = { from: () => ({ select: () => ({ like: () => ({ order: () => ({ limit: async () => ({data: [...documents.keys()].map(key => ({key})), error:null}) }) }) }) }) };
  const app = express(); app.use(express.json()); reportRoutes(app,store,cloud);
  const server = app.listen(0,'127.0.0.1'); await new Promise<void>(r => server.once('listening',r));
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/reports`;
  try {
    const post = (m: ReportModel) => fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
    const response = await post(model()); assert.equal(response.status,200); const saved=await response.json();
    const restored = await (await fetch(`${url}/${saved.id}`)).json(); assert.deepEqual(restored.importedChapters,model().importedChapters);
    const list = await (await fetch(url)).json(); assert.equal(list[0].chapterCount,2); assert.equal(list[0].imported,true);
    const bad=model(); bad.importedChapters![0].sections![0].html='<svg onload="alert(1)"></svg>'; assert.equal((await post(bad)).status,400);
  } finally { server.closeAllConnections(); await new Promise<void>(r=>server.close(()=>r())); }
});
