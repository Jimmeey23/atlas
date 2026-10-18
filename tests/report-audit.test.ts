import test from 'node:test';
import assert from 'node:assert/strict';
import { directionIssues } from '../src/report/audit';
import { uniqueNarrative, coveredDigest } from '../src/report/dedupe';
import { ownedMetricIds, homeChapter, reportedElsewhere } from '../src/report/ownership';
import { chapters } from '../src/report/chapters';
import type { ChapterNarrative, InsightCard, ReportModel } from '../src/report/model';

const model = { scope: { studio: 'Kenkere House', month: '2026-09' }, builtAt: '', figuresHash: 'x', narratives: {}, chapters: {
  sessions: { id: 'sessions', n: 40, total: { no_show_rate: 0.12, fill_rate: 0.7 }, prior: { no_show_rate: 0.08, fill_rate: 0.6 }, priorYear: { no_show_rate: 0.07, fill_rate: 0.5 }, groups: [], history: [] },
} } as unknown as ReportModel;
const card = (over: Partial<InsightCard>): InsightCard => ({ headline: 'h', meaning: 'm', evidence: 'e', action: 'a', focus: 'kpis', metrics: ['no_show_rate', 'fill_rate'], ...over });

test('direction audit rejects a move every comparison contradicts', () => {
  assert.equal(directionIssues(card({ headline: 'No-show rate fell sharply in September.' }), model, 'sessions').length, 1);
  assert.equal(directionIssues(card({ meaning: 'Fill rate improved on both comparisons.' }), model, 'sessions').length, 0);
});
test('direction audit rejects an adverse rise called an improvement, and ignores mixed wording', () => {
  assert.equal(directionIssues(card({ meaning: 'No-show rate improved this month.' }), model, 'sessions').length, 1);
  assert.equal(directionIssues(card({ meaning: 'No-show rate rose while fill rate held.' }), model, 'sessions').length, 0);
});

const narrative = (headlines: string[], extra: Partial<ChapterNarrative> = {}): ChapterNarrative => ({ summary: 's', generated: true,
  cards: headlines.map((headline, i) => ({ headline, meaning: 'm', evidence: headline, action: '', focus: i === 0 ? 'kpis' : 'cross' })), ...extra });
test('a chapter drops claims an earlier chapter already made but keeps its verdict', () => {
  const sales = chapters.find(c => c.id === 'revenue-performance')!, leads = chapters.find(c => c.id === 'leads')!;
  const done = { 'revenue-performance': narrative(['Gross collections rose 12.0% to ₹41.2L', 'Discounting eased to 8.0%']) };
  const out = uniqueNarrative(leads, narrative(['Lead conversion held at 9.0%', 'Gross collections rose 12.0% to ₹41.2L', 'Untouched leads doubled']), done);
  assert.deepEqual(out.cards.map(c => c.headline), ['Lead conversion held at 9.0%', 'Untouched leads doubled']);
  assert.ok(coveredDigest(done, 'leads').includes('Gross collections'));
  void sales;
});
test('shared-population siblings do not repeat the home chapter measures', () => {
  const sessions = chapters.find(c => c.id === 'sessions')!, instructors = chapters.find(c => c.id === 'instructors')!, formats = chapters.find(c => c.id === 'formats')!;
  assert.equal(homeChapter(instructors).id, 'sessions'); assert.equal(homeChapter(formats).id, 'sessions');
  const home = new Set(ownedMetricIds(sessions));
  for (const sibling of [instructors, formats]) assert.ok(ownedMetricIds(sibling).every(id => !home.has(id)), sibling.id);
  assert.ok(reportedElsewhere(instructors, 'fill_rate'));
  assert.ok(!reportedElsewhere(sessions, 'fill_rate'));
  const recurring = chapters.find(c => c.id === 'recurring')!;
  assert.ok(!ownedMetricIds(recurring).includes('draw_premium_pp'), 'recurring facts have no independent slot baseline');
  assert.ok(ownedMetricIds(recurring).includes('fill_rate'), 'a different population keeps its own measures');
});
test('every measure is owned by one chapter per population', () => {
  const seen = new Map<string, string>();
  for (const spec of chapters) for (const id of ownedMetricIds(spec)) {
    const key = `${spec.source}|${spec.website ? 'w' : ''}${spec.renewal ? 'r' : ''}|${id}`;
    assert.ok(!seen.has(key) || seen.get(key) === spec.id, `${id} owned by ${seen.get(key)} and ${spec.id}`);
    seen.set(key, spec.id);
  }
});

import { generateNarratives } from '../src/report/narrative';
import { chapters as allChapters } from '../src/report/chapters';
const sessionsData = { id: 'sessions', n: 40, total: { attendance: 120, sessions: 10, fill_rate: 0.7 }, prior: { attendance: 100, sessions: 8, fill_rate: 0.6 }, priorYear: {}, groups: [], history: [] };
const cardJson = (headline: string, focus: string) => ({ headline, meaning: 'Capacity demand.', evidence: '120 visits versus 100.', action: `Review ${headline}.`, lens: 'driver', focus, confidence: 'medium', metrics: ['attendance'] });
async function run(verdicts: { index: number; verdict: string; reason: string }[] | null) {
  const originalFetch = globalThis.fetch, storage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };
  let verifyCalls = 0;
  globalThis.fetch = async (url, init) => {
    if (!init?.body) return new Response(JSON.stringify({ openai: true, model: 'gpt-4.1', reportNarrativeVersion: '3', reportVerification: true }));
    if (String(url).endsWith('/api/reports/verify')) { verifyCalls++; return verdicts ? new Response(JSON.stringify({ answer: JSON.stringify({ verdicts }) })) : new Response(JSON.stringify({ error: 'down' }), { status: 500 }); }
    return new Response(JSON.stringify({ answer: JSON.stringify({ summary: 'Recorded demand rose.', cards: [cardJson('Visits rose to 120', 'kpis'), cardJson('Capacity demand is 120 visits', 'cross')] }) }));
  };
  try {
    const m = { scope: { studio: 'Kenkere House', month: '2026-09' }, builtAt: '', figuresHash: 'v', narratives: {}, chapters: { sessions: sessionsData },
      customization: { title: '', subtitle: '', preparedFor: '', preparedBy: '', audience: 'Board', tone: 'Professional', detail: 'Comprehensive', instructions: '', chapterIds: ['sessions'], theme: 'light' } } as unknown as ReportModel;
    const out = await generateNarratives(m);
    return { out: out.sessions, verifyCalls };
  } finally { globalThis.fetch = originalFetch; (globalThis as any).localStorage = storage; }
}
test('the independent audit removes a rejected card and records why', async () => {
  const { out, verifyCalls } = await run([{ index: 0, verdict: 'supported', reason: '' }, { index: 1, verdict: 'unsupported', reason: 'Not in figures' }]);
  assert.equal(verifyCalls, 1);
  assert.deepEqual(out.cards.map(c => c.headline), ['Visits rose to 120']);
  assert.equal(out.verification?.removed[0].verdict, 'unsupported');
});
test('a rejected chapter verdict fails the chapter instead of shipping', async () => {
  const { out } = await run([{ index: 0, verdict: 'contradicted', reason: 'Figures disagree' }]);
  assert.equal(out.generated, false); assert.match(out.error ?? '', /independent audit rejected the chapter verdict/);
});
test('an unavailable audit never blocks the report', async () => {
  const { out } = await run(null);
  assert.equal(out.generated, true); assert.equal(out.cards.length, 2); assert.equal(out.verification?.unavailable, true);
});
void allChapters;

test('report summary session counts retain their distinct source identities',()=>{
 const recurring=chapters.find(c=>c.id==='recurring')!;
 assert.ok(ownedMetricIds(recurring).includes('recurring_sessions'));
 assert.ok(!ownedMetricIds(recurring).includes('sessions'));
 assert.ok(recurring.groups.every(g=>!g.columns.includes('sessions')));
 const payroll=chapters.find(c=>c.id==='instructor-outcomes')!;
 assert.ok(payroll.groups.find(g=>g.title==='Instructor economics')!.columns.includes('payroll_sessions'));
});
