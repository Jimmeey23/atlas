import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewRows, sourceBasis } from '../src/report/review';
import { validateNarrativeCards } from '../src/report/quality';
import type { ChapterData, InsightCard, ReportModel } from '../src/report/model';
const data: ChapterData = { id: 'sessions', n: 12, total: { attendance: 120, fill_rate: .6, sessions: 0 }, prior: { attendance: 100, fill_rate: .5, sessions: 0 }, priorYear: {}, yearToDate: { n: 20, attendance: 450, fill_rate: .55 }, priorYearToDate: { n: 18, attendance: 400 }, history: [], groups: [] };
const model: ReportModel = { scope: { studio: 'Test', month: '2026-09' }, builtAt: '', chapters: { sessions: data }, narratives: {}, figuresHash: '' };
const card: InsightCard = { headline: 'Visits increased', meaning: 'More recorded demand.', evidence: '120 visits versus 100; +20.0%.', action: 'Review capacity.', lens: 'driver', confidence: 'medium', focus: 'kpis', metrics: ['attendance'] };
test('complete comparison register preserves unavailable values, explicit zero and governed YTD', () => {
  const rows = reviewRows('sessions', data);
  assert.equal(rows.find(r => r.id === 'sessions')!.current, 0);
  const attendance = rows.find(r => r.id === 'attendance')!;
  assert.equal(attendance.year, null);
  assert.equal(attendance.ytd, 450);
  assert.equal(attendance.values[6], '+12.5%');
  assert.equal(rows.find(r => r.id === 'fill_rate')!.values[3], '+10.0pp');
  assert.equal(rows.find(r => r.id === 'fill_rate')!.values[5], '55.0%');
  assert.ok(rows.some(r => r.current === null), 'governed but unavailable metrics are retained');
  assert.ok(reviewRows('sessions', { ...data, n: 0 }).every(r => r.current === null), 'zero records is unavailable performance');
  assert.equal(reviewRows('sessions', { ...data, yearToDate: { attendance: 999 } }).find(r => r.id === 'attendance')!.ytd, null, 'unverified YTD is not displayed');
});
test('source basis distinguishes frozen evidence from live records', () => {
  assert.match(sourceBasis(model, 'sessions'), /Live source/);
  assert.match(sourceBasis({ ...model, sourceRecords: { sessions: { title: '', rows: [], fetchedAt: 1, scope: model.scope } } }, 'sessions'), /Frozen/);
});
test('narrative validation accepts displayed arithmetic and rejects invented evidence and invalid references', () => {
  const validate = (cards: InsightCard[]) => validateNarrativeCards(cards, ['attendance'], [], model, 'sessions', 'September 2026: 120 visits; August 2026: 100 visits.');
  assert.doesNotThrow(() => validate([card]));
  assert.throws(() => validate([{ ...card, evidence: '99999 visits.' }]), /numeric evidence/);
  assert.throws(() => validate([{ ...card, metrics: ['invented_metric'] }]), /unavailable metric/);
  assert.throws(() => validate([{ ...card, focus: 'invented_table' }]), /unavailable evidence/);
  assert.throws(() => validate([{ ...card, highlight: ['Invented member'] }]), /row absent/);
  assert.throws(() => validate([card, { ...card, headline: 'Visits increased!' }]), /repeated/);
  assert.throws(() => validate([{ ...card, driver: 'Visits rose because of the instructor.' }]), /unverified cause/);
  assert.doesNotThrow(() => validate([{ ...card, driver: 'Visits may have risen because of the instructor; verify this hypothesis.' }]));
  assert.equal(model.narratives.sessions, undefined, 'validation never mutates saved narratives');
});

test('JSON evidence keeps adjacent numbers separate and accepts cross-chapter displayed rates', () => {
 const other = { ...data, id: 'leads', total: { fill_rate: .734 }, prior: {}, history: [], groups: [] };
 const supplied = '["observed",123,456]';
 const validate = (evidence: string) => validateNarrativeCards([{ ...card, evidence }], ['attendance','fill_rate'], [], { ...model, chapters: { sessions: data, leads: other } }, 'sessions', supplied);
 assert.doesNotThrow(() => validate('123 and 456; 73.4%.'));
 assert.throws(() => validate('123456 visits.'), /numeric evidence/);
});

test('generation repairs invalid highlights once and keeps unsupported output failed', async () => {
 const { generateNarratives } = await import('../src/report/narrative');
 const original = globalThis.fetch;
 let calls = 0;
 const messages: string[] = [];
 globalThis.fetch = async (_url, init) => {
  if (!init?.body) return new Response(JSON.stringify({ openai: false }));
  const body = JSON.parse(String(init.body)); messages.push(body.message); calls++;
  return new Response(JSON.stringify({ answer: JSON.stringify({ summary: 'Demand increased.', cards: [{ ...card, highlight: calls === 1 ? ['Absent row'] : [] }] }) }));
 };
 const report = { ...model, customization: { chapterIds: ['sessions'] } } as ReportModel;
 try {
  const written = await generateNarratives(report);
  assert.equal(calls, 2);
  assert.equal(written.sessions.generated, true);
  assert.match(messages[1], /CORRECTION REQUIRED:.*row absent/);
  calls = 0;
  globalThis.fetch = async (_url, init) => {
   if (!init?.body) return new Response(JSON.stringify({ openai: false }));
   calls++;
   return new Response(JSON.stringify({ answer: JSON.stringify({ summary: 'Demand increased.', cards: [{ ...card, evidence: '999999 visits.' }] }) }));
  };
  const rejected = await generateNarratives(report);
  assert.equal(calls, 2);
  assert.equal(rejected.sessions.generated, false);
  assert.match(rejected.sessions.error!, /999999/);
 } finally { globalThis.fetch = original; }
});

test('narrative validation accepts correct roundings of supplied raw values and rejects wrong ones', () => {
 const supplied = '{"figures":[["gross_revenue",15812345,502.7,0.5491]]}';
 const validate = (evidence: string) => validateNarrativeCards([{ ...card, evidence }], ['attendance'], [], model, 'sessions', supplied);
 assert.doesNotThrow(() => validate('Collections reached ₹1.58Cr.'));
 assert.doesNotThrow(() => validate('Collections reached ₹158.1 lakh.'));
 assert.doesNotThrow(() => validate('Collections reached ₹1.6Cr.'));
 assert.doesNotThrow(() => validate('Membership share was 54.9%.'));
 assert.doesNotThrow(() => validate('503 buyers.'));
 assert.throws(() => validate('Collections reached ₹1.9Cr.'), /numeric evidence/);
 assert.throws(() => validate('Membership share was 60%.'), /numeric evidence/);
 assert.throws(() => validate('901 buyers.'), /numeric evidence/);
});
