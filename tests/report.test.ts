import { definition } from "../src/report/definitions";
import { groupQuery, rankedRows } from "../src/report/group-query";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DuckDBInstance } from '@duckdb/node-api';
import { figuresHash, monthBounds, monthLabel, shiftMonth } from '../src/report/period.ts';
import { chapters, chapterNumber } from '../src/report/chapters.ts';
import { fallbackNarrative } from '../src/report/narrative.ts';
import { metrics, metricSQL } from '../src/semantics/metrics.ts';
import { sqlTypes } from '../src/data/normalise.ts';
import type { ChapterData } from '../src/report/model.ts';

test('month bounds cover the whole month, including February in a leap year', () => {
  assert.deepEqual(monthBounds('2026-07'), { from: '2026-07-01', to: '2026-07-31' });
  assert.deepEqual(monthBounds('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(monthBounds('2024-02'), { from: '2024-02-01', to: '2024-02-29' });
  assert.equal(monthLabel('2026-07'), 'July 2026');
});

test('month shifts cross year boundaries in both directions', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-01', -12), '2025-01');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  // The appendix reads thirteen months inclusive of the report month.
  assert.equal(shiftMonth('2026-07', -12), '2025-07');
});

const chapterData = (overrides: Partial<ChapterData> = {}): Record<string, ChapterData> => ({
  sessions: {
    id: 'sessions', total: { revenue: 100, fill_rate: 0.5 }, prior: { revenue: 80, fill_rate: 0.6 },
    priorYear: {}, n: 10, groups: [], history: [], ...overrides,
  } as ChapterData,
});

test('the narrative cache key moves only when the figures do', () => {
  const base = figuresHash(chapterData());
  assert.equal(base, figuresHash(chapterData()), 'identical figures must reuse the cached narrative');
  assert.notEqual(base, figuresHash(chapterData({ total: { revenue: 101, fill_rate: 0.5 } })));
  // Record counts and build time are not narrative material; they must not invalidate.
  assert.equal(base, figuresHash(chapterData({ n: 9999 })));
});

test('rule-based fallback cards are labelled and read the metric direction', () => {
  const spec = chapters.find(c => c.id === 'executive-summary')!;
  const narrative = fallbackNarrative(spec, chapterData().sessions);
  assert.equal(narrative.generated, false, 'rule-based copy must never claim to be analysis');
  assert.ok(narrative.cards.length > 0);
  const revenue = narrative.cards.find(c => c.headline.startsWith(metrics.revenue.label))!;
  assert.match(revenue.headline, /\+25\.0%/);
  assert.match(revenue.meaning, /intended direction/);
  // fill_rate fell and higher is better, so it must read as moving against intent.
  const fill = narrative.cards.find(c => c.headline.startsWith(metrics.fill_rate.label))!;
  assert.match(fill.meaning, /against the intended direction/);
});

test('derived chapters produce no rule-based cards, since they have no figures of their own', () => {
  for (const spec of chapters.filter(c => c.derived))
    assert.deepEqual(fallbackNarrative(spec, undefined), { summary: '', cards: [], generated: false });
});

test('every chapter names real metrics and prints a two-digit number', () => {
  assert.equal(chapterNumber(0), '01');
  assert.equal(chapterNumber(6), '07');
  const ids = new Set<string>();
  for (const spec of chapters) {
    assert.ok(!ids.has(spec.id), `duplicate chapter id ${spec.id}`);
    ids.add(spec.id);
    for (const id of [...spec.metrics, ...spec.history, ...spec.groups.flatMap(g => g.columns)])
      assert.ok(definition(id), `${spec.id} references unknown metric ${id}`);
    for (const group of spec.groups)
      assert.ok(sqlTypes[group.field], `${spec.id} groups by unknown column ${group.field}`);
  }
});

test('the exported document keeps its markup as markup', () => {
  // The body is written through untouched; escaping `</` there (which is right
  // inside <style> and <script>) turns every closing tag into literal text and
  // the downloaded file renders as a wall of source.
  const source = readFileSync(new URL('../src/report/export.ts', import.meta.url), 'utf8');
  assert.match(source, /\n\s*clone\.outerHTML,/, 'the report body must be embedded unescaped');
  assert.doesNotMatch(source, /safeInStyle\(clone\.outerHTML\)/);
  assert.match(source, /safeInStyle\(reportCSS\)/, 'stylesheet contents must still be escaped');
});

test('an exported report fetches nothing: no remote fonts, images or stylesheets', () => {
  const css = readFileSync(new URL('../src/design/report.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /@import/, 'an @import would make the downloaded file depend on a server');
  assert.doesNotMatch(css, /url\(\s*['"]?(https?:)?\/\//, 'remote assets break a file opened from disk');
});

test('a chapter group query returns both its rows and a rollup total', async () => {
  const spec = chapters.find(c => c.id === 'formats')!;
  const columns = ['sessions', 'attendance', 'fill_rate'];
  const db = await DuckDBInstance.create(':memory:');
  const c = await db.connect();
  try {
    await c.run(`CREATE TABLE sessions (${Object.entries(sqlTypes).map(([k, t]) => `"${k}" ${t}`).join(',')})`);
    await c.run(`INSERT INTO sessions (location,format_group,sessions,checked_in,capacity,date,month) VALUES
      ('Kwality House, Kemps Corner','Barre',1,8,10,'2026-07-01','2026-07'),
      ('Kwality House, Kemps Corner','Barre',1,2,10,'2026-07-02','2026-07'),
      ('Kwality House, Kemps Corner','PowerCycle',1,5,20,'2026-07-03','2026-07')`);
    const sql = `WITH f AS (SELECT *,COALESCE("${spec.groups[0].field}",'Unspecified') AS "__g" FROM sessions)`
      + ` SELECT "__g" AS g,GROUPING("__g") AS is_total,${metricSQL(columns, { rate: 1200, today: '2026-08-01' })},COUNT(*) AS n`
      + ` FROM f GROUP BY GROUPING SETS (("__g"),())`;
    const rows = await (await c.run(sql)).getRowObjects();
    const total = rows.find(r => Number(r.is_total) === 1)!;
    const barre = rows.find(r => r.g === 'Barre')!;
    assert.equal(Number(total.sessions), 3);
    assert.equal(Number(total.attendance), 15);
    // Rates are recomputed on aggregate numerator and denominator, never averaged.
    assert.equal(Number(total.fill_rate), 15 / 40);
    assert.equal(Number(barre.fill_rate), 10 / 20);
  } finally {
    c.closeSync();
  }
});

test('rankings separate top and bottom without admitting undersized samples', () => {
  const group = { field: 'trainer', title: '', deck: '', columns: ['fill_rate'], rankBy: 'fill_rate', tails: true, limit: 4, minMetric: 'sessions', minValue: 5 };
  const rows = Array.from({length: 8}, (_, i) => ({g: `Instructor ${i}`, fill_rate: i / 10, sessions: 5, n: 5}));
  rows.push({g:'Too small', fill_rate:1, sessions:2, n:2});
  const ranked = rankedRows(rows, group);
  assert.deepEqual(ranked.rows.map(r=>r.g), ['Instructor 7','Instructor 6','Instructor 0','Instructor 1']);
  assert.equal(ranked.omitted, 4);
  assert.equal(new Set(ranked.rows.map(r=>r.g)).size, 4);
});

test('all report grouping SQL compiles against the common engine schema', async () => {
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try {
    await c.run(`CREATE TABLE facts (${Object.entries(sqlTypes).map(([k,t])=>`"${k}" ${t}`).join(',')}, renewal_state VARCHAR,slot_fill DOUBLE)`);
    for (const spec of chapters) for (const group of spec.groups) {
      const rows = await (await c.run(groupQuery('facts', group, group.columns, {rate:1200,today:'2026-10-06'}, spec.renewal))).getRowObjects();
      assert.equal(rows.length, 1, `${spec.id}/${group.id ?? group.field} returns empty rollup`);
    }
  } finally { c.closeSync(); }
});

test('renewal report uses the dashboard deduplicated paid expiry cohort and grace states', async () => {
  const {renewalFactsSQL, renewalCohortSQL, renewalMeasuresSQL} = await import('../src/data/renewals');
  const db=await DuckDBInstance.create(':memory:'); const c=await db.connect();
  try {
    await c.run(`CREATE TABLE lapsed (${Object.entries(sqlTypes).map(([k,t])=>`"${k}" ${t}`).join(',')})`);
    await c.run(`INSERT INTO lapsed(member_id,product,revenue,session_limit,start_date,end_date,source_row) VALUES
      ('renewed','10 pack',1000,10,'2026-08-01','2026-09-15',1),
      ('renewed','10 pack',1000,10,'2026-08-01','2026-09-15',2),
      ('renewed','10 pack',1000,10,'2026-09-16','2026-10-15',3),
      ('grace','10 pack',1000,10,'2026-08-01','2026-09-25',4),
      ('lapsed','10 pack',1000,10,'2026-08-01','2026-09-01',5),
      ('free','complimentary',1000,10,'2026-08-01','2026-09-01',6)`);
    const scope=" WHERE SUBSTR(end_date,1,7)='2026-09'";
    const report=(await(await c.run(`SELECT ${renewalMeasuresSQL()} FROM (${renewalFactsSQL(scope,'2026-10-06')})`)).getRowObjects())[0];
    const dashboard=(await(await c.run(renewalCohortSQL(scope,'2026-10-06'))).getRowObjects())[0];
    for(const id of ['due','renewed','lapsed','grace','upcoming','renewal_rate']) assert.equal(report[id],dashboard[id]);
    assert.equal(Number(report.due),3); assert.equal(Number(report.renewed),1); assert.equal(Number(report.lapsed),1); assert.equal(Number(report.grace),1); assert.equal(Number(report.renewal_rate),1/3);
  } finally { c.closeSync(); }
});
