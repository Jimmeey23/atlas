import test from 'node:test';
import assert from 'node:assert/strict';
import { chapters } from '../src/report/chapters';
import { cardsFromDocument, cleanDocument, documentFor, exhibitCatalog, parseRef } from '../src/report/document';
import type { ChapterData, ReportModel } from '../src/report/model';

const chapter = (id: string, extra: Partial<ChapterData> = {}): ChapterData => ({ id, n: 40, total: {}, prior: {}, priorYear: {}, history: [], groups: [], ...extra });
const months = Array.from({ length: 6 }, (_, i) => ({ month: `2026-0${i + 4}`, gross_revenue: 1000 + i * 50, transactions: 10 + i }));
const sales = chapter('revenue-performance', {
  total: { gross_revenue: 1250, transactions: 15 }, prior: { gross_revenue: 1200, transactions: 14 }, history: months,
  groups: [{ id: 'category', field: 'category', title: 'Sales by category', deck: '', columns: ['gross_revenue'], compare: 'gross_revenue', rows: [{ g: 'Memberships', gross_revenue: 800 }, { g: 'Packages', gross_revenue: 450 }], total: null,
    analysis: { metric: 'gross_revenue', gainers: [{ g: 'Packages', current: 450, prior: 300, change: 150 }], decliners: [{ g: 'Memberships', current: 800, prior: 900, change: -100 }] } }],
});
const model = (narratives: ReportModel['narratives'] = {}): ReportModel => ({ scope: { studio: 'Kenkere House', month: '2026-09' }, builtAt: '2026-10-01T00:00:00Z', figuresHash: 'x', chapters: { 'revenue-performance': sales }, narratives });
const spec = chapters.find(c => c.id === 'revenue-performance')!;

test('the exhibit catalogue offers only what the frozen figures can draw', () => {
  const refs = exhibitCatalog(model(), spec).map(e => e.ref);
  assert.ok(refs.includes('revenue-performance/kpis'));
  assert.ok(refs.includes('revenue-performance/trend/gross_revenue'));
  assert.ok(refs.includes('revenue-performance/group/category'));
  assert.ok(refs.includes('revenue-performance/movers/category'), refs.join());
  assert.ok(!refs.some(r => r.includes('discount_rate')), 'a measure without a monthly series has no trend');
  // Derived chapters draw from every chapter, a selection each.
  const exec = exhibitCatalog(model(), chapters.find(c => c.id === 'executive-summary')!).map(e => e.ref);
  assert.ok(exec.includes('revenue-performance/group/category') && !exec.some(r => r.includes('/movers/')));
  assert.deepEqual(parseRef('revenue-performance/trend/gross_revenue'), { chapter: 'revenue-performance', kind: 'trend', key: 'gross_revenue' });
  assert.equal(parseRef('revenue-performance/nonsense'), null);
});

test('a written document keeps its sections and drops exhibits outside the catalogue', () => {
  const refs = exhibitCatalog(model(), spec).map(e => e.ref);
  const doc = cleanDocument({
    sections: [
      { title: 'Start here', sub: 'The till held.', paragraphs: ['Cash **rose 4%**.', ''], callout: { title: 'One line', body: 'Body' }, exhibits: [{ ref: 'revenue-performance/kpis', view: 'table', caption: 'C', note: 'N', highlight: [] }, { ref: 'invented/group/x', view: 'chart', caption: '', note: '', highlight: [] }], evidence: { title: 'Evidence — x', ref: 'invented/kpis', note: '' } },
      { title: '', sub: 'No title', paragraphs: ['dropped'] },
      { title: 'Empty', sub: 'No prose', paragraphs: [] },
    ],
    recommendations: [{ title: 'Sell programmes, not packs', owner: 'Sales & front desk', horizon: 'Next 30 days', reasoning: 'R', impact: 'I' }, { title: '' }],
    method: ['Read from the frozen figures.'],
  }, refs)!;
  assert.equal(doc.sections.length, 1);
  assert.deepEqual(doc.sections[0].paragraphs, ['Cash **rose 4%**.']);
  assert.deepEqual(doc.sections[0].exhibits.map(e => e.ref), ['revenue-performance/kpis']);
  assert.equal(doc.sections[0].evidence, null);
  assert.equal(doc.recommendations.length, 1);
  const cards = cardsFromDocument(doc, { headline: 'Verdict', meaning: 'M', evidence: 'E', action: '' }, true);
  assert.equal(cards[0].focus, 'kpis');
  assert.equal(cards[1].headline, 'Sell programmes, not packs');
  assert.equal(cards[1].lens, 'next_step');
  assert.equal(cleanDocument({ sections: [] }, refs), undefined);
});

test('reports written as cards are re-read as documents, with unused breakdowns kept', () => {
  const legacy = model({ 'revenue-performance': { summary: 'Lede.', generated: true,
    briefing: { takeaways: ['t'], whatChanged: 'What changed.', whyItMoved: 'Why.', whereItSits: '', whatHeldUp: '', outlook: '', soWhat: 'So what.' },
    cards: [
      { headline: 'Revenue rose 4%', meaning: 'Verdict meaning.', evidence: 'e', action: '', focus: 'kpis' },
      { section: 'Packages carried it', headline: 'Packages added ₹150', meaning: 'M', driver: 'D', evidence: 'E', action: 'Promote packages at the desk.', impact: '₹150 a month', focus: 'other', ownerArea: 'Sales & front desk' },
    ] } });
  const doc = documentFor(legacy, 'revenue-performance')!;
  assert.equal(doc.sections[0].title, 'Start here');
  assert.deepEqual(doc.sections[0].paragraphs, ['Verdict meaning.', 'What changed.', 'Why.']);
  assert.equal(doc.sections[0].callout?.body, 'So what.');
  assert.equal(doc.sections[0].exhibits[0].ref, 'revenue-performance/trend/gross_revenue');
  assert.equal(doc.sections[1].title, 'Packages carried it');
  assert.deepEqual(doc.sections[1].paragraphs, ['M', 'D']);
  assert.equal(doc.sections[2].title, 'Sales by category', 'a breakdown no card used still gets its section');
  assert.equal(doc.sections[2].exhibits[0].ref, 'revenue-performance/group/category');
  assert.deepEqual(doc.recommendations.map(r => r.title), ['Promote packages at the desk.']);
  // A written document wins over the cards.
  const written = { sections: [{ title: 'Start here', sub: 's', paragraphs: ['p'], callout: null, exhibits: [], evidence: null }], recommendations: [], method: [] };
  assert.equal(documentFor(model({ 'revenue-performance': { summary: '', cards: [], generated: true, document: written } }), 'revenue-performance'), written);
  assert.equal(documentFor(model(), 'leads'), null);
});
