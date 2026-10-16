import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { resolveRecordSelection } from '../src/report/drilldown';
import { snapshotRecordSQL } from '../src/report/source-records';
import { groupMatrix, historyMatrix } from '../src/report/visual-evidence';
import type { ChapterData, GroupTable, ReportModel } from '../src/report/model';
const chapter = (id: string, total: Record<string, number>, groups: GroupTable[] = []): ChapterData => ({ id, total, prior: {}, priorYear: {}, history: [], groups, n: 3 });
const table = { field: 'format', columns: ['attendance', 'fill_rate'], rows: [], title: 'Formats', total: null, deck: '' } as GroupTable;
const model: ReportModel = { builtAt: '', figuresHash: '', scope: { studio: 'Test', month: '2026-09' }, narratives: {}, chapters: { sessions: chapter('sessions', { attendance: 15 }, [table]), 'revenue-performance': chapter('revenue-performance', { gross_revenue: 100 }), recurring: chapter('recurring', { sessions: 12 }), 'instructor-outcomes': chapter('instructor-outcomes', { sessions: 5 }) } };
test('cross-chapter metrics resolve their actual source and preserve valid context-specific populations', () => {
  assert.equal(resolveRecordSelection(model, { metric: 'gross_revenue', chapterId: 'recommendations' }, 'sessions').chapterId, 'revenue-performance');
  assert.equal(resolveRecordSelection(model, { metric: 'gross_revenue' }, 'executive-summary').chapterId, 'revenue-performance');
  assert.equal(resolveRecordSelection(model, { metric: 'sessions', chapterId: 'recurring' }, 'sessions').chapterId, 'recurring');
  assert.equal(resolveRecordSelection(model, { metric: 'sessions', chapterId: 'instructor-outcomes' }, 'sessions').chapterId, 'instructor-outcomes');
  const resolved = resolveRecordSelection(model, { metric: 'attendance', table, group: "Member's Barre", chapterId: 'recommendations' }, 'revenue-performance');
  assert.equal(resolved.chapterId, 'sessions'); assert.equal(resolved.group, "Member's Barre");
  assert.throws(() => resolveRecordSelection(model, { metric: 'gross_revenue', table, group: 'Barre' }, 'sessions'), /group does not belong/);
  assert.throws(() => resolveRecordSelection(model, { metric: 'invented_metric' }, 'sessions'), /governed source/);
  assert.throws(() => resolveRecordSelection(model, { metric: 'attendance', month: '2026-99' }, 'sessions'), /period/);
});
test('frozen source filters run the same count and denominator predicates, preserving group labels and source items', async () => {
  const db = await DuckDBInstance.create(':memory:'); const conn = await db.connect();
  try {
    const rows = [{ source_row: 1, member: 'A', format: "Member's Barre", checked_in: 10, capacity: 20, late_cancelled: 1 }, { source_row: 2, member: 'B', format: 'Cycle · Strength', checked_in: 0, capacity: 10, late_cancelled: 0 }, { source_row: 3, member: 'C', format: null, checked_in: 5, capacity: 10, late_cancelled: 2 }];
    const read = async (metric: string, selectedTable?: GroupTable, group?: string) => (await conn.runAndReadAll(snapshotRecordSQL(rows, metric, selectedTable, group)!)).getRowObjectsJS();
    assert.deepEqual((await read('attendance')).map(row => Number(row.source_row)), [1, 3]);
    const groupRate = await read('fill_rate', table, "Member's Barre"); assert.deepEqual(groupRate.map(row => row.member), ['A'], 'ratio OR predicates cannot escape the selected group');
    const rate = await read('fill_rate'); assert.equal(rate.length, 3); assert.deepEqual(rate.map(row => row.counts_toward), ['Yes', 'No', 'Yes']);
    assert.deepEqual((await read('attendance', table, "Member's Barre")).map(row => row.member), ['A']);
    assert.deepEqual((await read('attendance', table, 'Unspecified')).map(row => row.member), ['C']);
    assert.equal((await read('attendance', table, 'not present')).length, 0);
    const late = await read('booking_late_cancelled'); assert.deepEqual(late.map(row => row.member), ['A', 'C']);
    const marked = [{ member: 'A', __eligible_attendance: 'false' }, { member: 'B', __eligible_attendance: 'true' }];
    assert.deepEqual((await conn.runAndReadAll(snapshotRecordSQL(marked, 'attendance')!)).getRowObjectsJS().map(row => row.member), ['B']);
    assert.equal(snapshotRecordSQL([], 'attendance'), null);
  } finally { conn.closeSync(); db.closeSync(); }
});
test('visual selections retain unambiguous source periods even after unavailable periods are omitted', () => {
  const matrix = groupMatrix({ ...table, rows: [{ g: 'Barre', attendance: 5 }], prior: { Barre: { attendance: 4 } } }, 'attendance', '2026-09');
  assert.deepEqual(matrix.periods.map(period => period.month), ['2026-08', '2026-09']);
  assert.deepEqual(historyMatrix({ ...model.chapters.sessions, history: [{ month: '2026-08', attendance: 4 }, { month: '2026-09', attendance: 5 }] }, 'attendance').months, ['2026-08', '2026-09']);
});
