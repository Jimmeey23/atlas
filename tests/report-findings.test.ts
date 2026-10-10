import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseGroup, findingsFor, findingsPayload, ledger, seasonalScenario } from '../src/report/findings.ts';
import { chapters } from '../src/report/chapters.ts';
import { fallbackNarrative, generateNarratives } from '../src/report/narrative.ts';
import type { ChapterData, ReportModel } from '../src/report/model.ts';

const chapter = (id: string, overrides: Partial<ChapterData> = {}): ChapterData =>
  ({ id, n: 50, total: {}, prior: {}, priorYear: {}, history: [], groups: [], ...overrides });
const model = (chapterData: Record<string, ChapterData>, extra: Partial<ReportModel> = {}): ReportModel =>
  ({ scope: { studio: 'Kwality House', month: '2026-09' }, builtAt: '2026-10-01T00:00:00Z', chapters: chapterData, narratives: {}, figuresHash: 'x', ...extra });
const months = (values: number[], id: string) => values.map((v, i) => {
  const d = new Date(Date.UTC(2026, 8 - (values.length - 1) + i, 1));
  return { month: d.toISOString().slice(0, 7), [id]: v };
});

test('group analysis reads movers across every group, not only the rows shown', () => {
  const group = { field: 'category', title: 'Sales by category', deck: '', columns: ['gross_revenue', 'transactions'] };
  const current = [{ g: 'Memberships', gross_revenue: 500 }, { g: 'Packs', gross_revenue: 120 }, { g: 'Retail', gross_revenue: 30 }, { g: 'Gift', gross_revenue: 20 }];
  const prior = { Memberships: { g: 'Memberships', gross_revenue: 300 }, Packs: { g: 'Packs', gross_revenue: 200 }, Events: { g: 'Events', gross_revenue: 50 } };
  const a = analyseGroup(group, group.columns, current, prior, current, { gross_revenue: 670 });
  assert.equal(a.metric, 'gross_revenue');
  assert.equal(a.totalChange, 670 - 550);
  assert.deepEqual(a.gainers!.map(m => m.g), ['Memberships', 'Retail', 'Gift']);
  // A group that vanished is a decline to zero, not a missing value.
  assert.deepEqual(a.decliners!.map(m => [m.g, m.change]), [['Packs', -80], ['Events', -50]]);
  assert.equal(a.concentration!.top1.g, 'Memberships');
  assert.ok(Math.abs(a.concentration!.top1.share - 500 / 670) < 1e-9);
});

test('rate bridge separates within-group change from mix shift and reconciles', () => {
  const group = { field: 'source', title: 'By source', deck: '', columns: ['new_clients', 'conversion_rate'], compare: 'conversion_rate' };
  // Same rates both months; volume shifts towards the weaker source. All movement is mix.
  const prior = { Web: { g: 'Web', new_clients: 50, conversion_rate: 0.6 }, Walk: { g: 'Walk', new_clients: 50, conversion_rate: 0.2 } };
  const current = [{ g: 'Web', new_clients: 20, conversion_rate: 0.6 }, { g: 'Walk', new_clients: 80, conversion_rate: 0.2 }];
  const b = analyseGroup(group, group.columns, current, prior, current, null).bridge!;
  assert.ok(Math.abs(b.prior - 0.4) < 1e-9 && Math.abs(b.current - 0.28) < 1e-9);
  assert.ok(Math.abs(b.rateEffect) < 1e-9, 'unchanged rates contribute nothing');
  assert.ok(Math.abs(b.rateEffect + b.mixEffect - (b.current - b.prior)) < 1e-9, 'components must reconcile to the total');
});

test('median lift sizes the gain from bringing weak groups up to the median', () => {
  const group = { field: 'time', title: 'Times', deck: '', columns: ['attendance', 'fill_rate'], rankBy: 'fill_rate' };
  const rows = [0.9, 0.7, 0.5, 0.3].map((f, i) => ({ g: `T${i}`, fill_rate: f, attendance: f * 100 }));
  const lift = analyseGroup(group, group.columns, rows, {}, rows, null).medianLift!;
  assert.equal(lift.median, 0.6);
  assert.equal(lift.groupsBelow, 2);
  // Implied capacity is 100 per row: (0.6-0.5)*100 + (0.6-0.3)*100 visits.
  assert.ok(Math.abs(lift.units - 40) < 1e-9);
});

test('history findings flag anomalies, streaks and the gap to the studio\'s own best month', () => {
  const values = [0.70, 0.72, 0.71, 0.73, 0.70, 0.72, 0.71, 0.70, 0.69, 0.66, 0.62, 0.55];
  const exec = chapter('executive-summary', {
    total: { fill_rate: 0.55, attendance: 1100, revenue: 550000 }, prior: { fill_rate: 0.62 },
    history: months(values, 'fill_rate'),
  });
  const found = findingsFor(model({ 'executive-summary': exec }))['executive-summary'];
  const text = found.map(f => f.text).join('\n');
  assert.match(text, /lowest in 12 months/);
  assert.match(text, /fallen for 6 consecutive months/);
  const benchmark = found.find(f => f.kind === 'benchmark')!;
  assert.match(benchmark.text, /best month in the last year/);
  // 18pp × (1100/0.55 capacity) × ₹500 per visit.
  assert.ok(Math.abs(benchmark.inr! - 0.18 * 2000 * 500) < 1);
  assert.equal(found.find(f => f.kind === 'streak')!.tone, 'risk');
});

test('cross-chapter findings name popular instructors who convert poorly, and the reverse', () => {
  const names = ['Asha', 'Bina', 'Chirag', 'Dev', 'Esha'];
  const fills = [0.9, 0.85, 0.5, 0.45, 0.7], convs = [0.1, 0.15, 0.5, 0.45, 0.3];
  const table = (id: string, field: string, rows: object[]) => ({ id, field, title: id, deck: '', columns: [], rows, total: null });
  const m = model({
    instructors: chapter('instructors', { groups: [table('trainer', 'trainer', names.map((g, i) => ({ g, fill_rate: fills[i] })))] }),
    'conversion-funnel': chapter('conversion-funnel', { groups: [table('trainer', 'trainer', names.map((g, i) => ({ g, conversion_rate: convs[i] })))] }),
  });
  const cross = findingsFor(m).instructors.filter(f => f.kind === 'cross');
  assert.match(cross.find(f => f.tone === 'risk')!.text, /Asha.*Bina/);
  assert.match(cross.find(f => f.tone === 'opportunity')!.text, /Chirag.*Dev/);
});

test('targets are reported once and the shortfall is valued', () => {
  const sessionsTotal = { fill_rate: 0.5, attendance: 1000, capacity: 2000 };
  const m = model({
    'executive-summary': chapter('executive-summary', { total: { ...sessionsTotal, revenue: 400000 } }),
    sessions: chapter('sessions', { total: sessionsTotal }),
  }, { customization: { title: '', subtitle: '', preparedFor: '', preparedBy: '', audience: '', tone: '', detail: 'Comprehensive', instructions: '', chapterIds: [], theme: 'light', targets: { fill_rate: 0.6 } } });
  const targets = ledger(findingsFor(m)).filter(f => f.kind === 'target');
  assert.equal(targets.length, 1, 'fill rate appears in several chapters but its target is reported once');
  assert.equal(targets[0].tone, 'risk');
  // 10pp × 2000 capacity × ₹400 per visit.
  assert.ok(Math.abs(targets[0].inr! - 0.1 * 2000 * 400) < 1);
});

test('valued findings rank first and the payload carries their value', () => {
  const ranked = ledger({ a: [
    { chapter: 'a', focus: 'kpis', kind: 'driver', tone: 'context', text: 'Small.', inr: 10 },
    { chapter: 'a', focus: 'kpis', kind: 'anomaly', tone: 'risk', text: 'Unvalued risk.' },
    { chapter: 'a', focus: 'kpis', kind: 'gap', tone: 'opportunity', text: 'Big.', inr: 5000 },
  ] });
  assert.deepEqual(ranked.map(f => f.text), ['Big.', 'Small.', 'Unvalued risk.']);
  assert.match(findingsPayload(ranked), /^Analyst findings[\s\S]*F1 \[opportunity · gap · focus kpis · a · ≈/);
});

test('seasonal scenario applies last year\'s next-month movement', () => {
  const history = [{ month: '2025-09', attendance: 1000 }, { month: '2025-10', attendance: 1200 }, { month: '2026-07', attendance: 900 }, { month: '2026-08', attendance: 950 }, { month: '2026-09', attendance: 1100 }];
  const s = seasonalScenario('attendance', chapter('x', { total: { attendance: 1100 }, history }), '2026-09')!;
  assert.equal(s.seasonal, 1100 * 1.2);
  assert.equal(s.run, (900 + 950 + 1100) / 3);
});

test('fallback copy leads with engine findings when the model is unavailable', () => {
  const spec = chapters.find(c => c.id === 'sessions')!;
  const narrative = fallbackNarrative(spec, chapter('sessions', { total: { revenue: 1 }, prior: { revenue: 2 } }), [
    { chapter: 'sessions', focus: 'kpis', kind: 'gap', tone: 'risk', text: 'Twelve sessions ran empty. Each costs money.', inr: 9000 },
  ]);
  assert.equal(narrative.generated, false);
  assert.equal(narrative.cards[0].headline, 'Twelve sessions ran empty');
  assert.equal(narrative.cards[0].category, 'red_flag');
  assert.equal(narrative.cards[0].impact, '');
  assert.equal(narrative.cards[0].action, '');
  assert.ok(narrative.cards[0].reasoning);
});

test('the chapter prompt is built on findings and no longer asks for one passage per table', async () => {
  const originalFetch = globalThis.fetch, originalStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };
  const messages: string[] = [];
  globalThis.fetch = async (_url, init) => {
    if (!init?.body) return new Response(JSON.stringify({openai:true,model:'gpt-4.1',reportNarrativeVersion:'1'}));
    messages.push(JSON.parse(String(init?.body)).message);
    return new Response(JSON.stringify({ answer: JSON.stringify({ summary: 'Verdict.', cards: [{ headline: 'H', meaning: 'M', evidence: 'E', action: 'A', plainLanguage: 'P', impact: 'I', watch: 'W', focus: 'cross', category: 'meaning', confidence: 'medium' }] }) }));
  };
  try {
    const exec = chapter('executive-summary', { total: { fill_rate: 0.55, attendance: 1100, revenue: 550000 }, history: months([0.7, 0.72, 0.71, 0.73, 0.7, 0.55], 'fill_rate') });
    const out = await generateNarratives({ ...model({ 'executive-summary': exec }), customization: { title: '', subtitle: '', preparedFor: '', preparedBy: '', audience: 'Executive board', tone: 'Professional', detail: 'Comprehensive', instructions: '', chapterIds: ['executive-summary', 'recommendations'], theme: 'light' } });
    assert.match(messages[0], /Analyst findings/);
    assert.match(messages[0], /lowest in 6 months/);
    assert.doesNotMatch(messages[0], /one passage with its matching focus ID for EACH/);
    assert.match(messages[1], /evidence-led recommendations, ordered by priority/);
    assert.match(messages[1], /Every card uses lens next_step/);
    assert.equal(out['executive-summary'].cards[0].focus, 'kpis', 'a missing verdict is promoted from the first card');
  } finally { globalThis.fetch = originalFetch; (globalThis as any).localStorage = originalStorage; }
});

test('cash bridge isolates transaction volume and average collections without implying prices', async () => {
  const { movementBridge } = await import('../src/report/findings.ts');
  const spec = chapters.find(c=>c.id==='revenue-performance')!;
  const cash = chapter(spec.id, { total:{gross_revenue:1200,transactions:8},prior:{gross_revenue:1000,transactions:10} });
  const [bridge] = movementBridge(spec,cash);
  assert.match(bridge.text,/−₹200/);
  assert.match(bridge.text,/\+₹400/);
  assert.match(bridge.text,/changed \+₹200/);
  assert.match(bridge.text,/not proof of pricing/);
  assert.equal(bridge.inr,undefined,'decomposition is not incremental cash at stake');
  assert.deepEqual(movementBridge(spec,{...cash,prior:{gross_revenue:1000}}),[]);
  assert.deepEqual(movementBridge(spec,{...cash,prior:{gross_revenue:1000,transactions:0}}),[]);
});

test('attendance bridge distinguishes fewer sessions from lower attendance per session', async () => {
  const { movementBridge } = await import('../src/report/findings.ts');
  const spec = chapters.find(c=>c.id==='sessions')!;
  const [bridge] = movementBridge(spec,chapter(spec.id,{total:{attendance:800,sessions:80},prior:{attendance:1200,sessions:100}}));
  assert.match(bridge.text,/−240.0 visits from session volume/);
  assert.match(bridge.text,/−160.0 visits from attendance per session/);
  assert.match(bridge.text,/changed −400.0 visits/);
});

test('failed recommendation generation retains calculated proposals and labels their limits', () => {
  const report = model({'revenue-performance':chapter('revenue-performance',{total:{gross_revenue:1200,transactions:8},prior:{gross_revenue:1000,transactions:10}})});
  const fallback = fallbackNarrative(chapters.find(c=>c.id==='recommendations')!,undefined,[],report);
  assert.equal(fallback.generated,false);
  assert.ok(fallback.cards.length);
  assert.match(fallback.summary,/must not be added/);
  assert.equal(fallback.cards[0].action,'');
  assert.ok(fallback.cards[0].recommendation);
  assert.ok(fallback.cards[0].reasoning);
  assert.equal(fallback.cards[0].focus,'kpis');
});

test('decision briefs request lenses and metric ids, and drop cited metrics the chapter cannot show', async () => {
  const originalFetch = globalThis.fetch, originalStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };
  const bodies: any[] = [];
  globalThis.fetch = async (_url, init) => {
    if (!init?.body) return new Response(JSON.stringify({openai:true,model:'gpt-4.1',reportNarrativeVersion:'1'}));
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ answer: JSON.stringify({ summary: 'Verdict.', cards: [{ headline: 'H', meaning: 'M', evidence: 'E', action: 'A', driver: 'D', trend: 'T', impact: '', watch: 'W', recommendation: '', lens: 'risk', focus: 'kpis', metrics: ['gross_revenue', 'not_a_metric', 'fill_rate'], highlight: [], priority: 'high', ownerArea: 'Finance', horizon: 'Monitor', confidence: 'medium' }] }) }));
  };
  try {
    const sales = chapter('revenue-performance', { total: { gross_revenue: 1000, aov: 50 }, prior: { gross_revenue: 900 } });
    const out = await generateNarratives({ ...model({ 'revenue-performance': sales }), customization: { title: '', subtitle: '', preparedFor: '', preparedBy: '', audience: 'Executive board', tone: 'Professional', detail: 'Comprehensive', instructions: '', chapterIds: ['revenue-performance'], theme: 'light', lenses: ['risk', 'win'] } });
    assert.equal(bodies[0].insightVersion, 3);
    assert.ok(bodies[0].metricIds.includes('gross_revenue'));
    assert.ok(!bodies[0].metricIds.includes('fill_rate'), 'only metrics this chapter holds are citable');
    assert.deepEqual(bodies[0].lenses, ['risk', 'win']);
    assert.deepEqual(out['revenue-performance'].cards[0].metrics, ['gross_revenue']);
    assert.equal(out['revenue-performance'].cards[0].lens, 'risk');
  } finally { globalThis.fetch = originalFetch; (globalThis as any).localStorage = originalStorage; }
});
