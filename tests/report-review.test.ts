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
