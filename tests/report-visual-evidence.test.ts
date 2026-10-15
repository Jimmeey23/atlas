import test from 'node:test';
import assert from 'node:assert/strict';
import { groupMatrix, historyMatrix, matrixDomain } from '../src/report/visual-evidence';
import type { ChapterData, GroupTable } from '../src/report/model';
const table: GroupTable = { id: 'format', field: 'format', title: 'Formats', minimum: 'Three records', columns: ['attendance'], compare: 'attendance', rows: [{ g: 'Barre', attendance: 100 }, { g: 'Cycle', attendance: 0 }, { g: 'Strength', attendance: null }], prior: { Barre: { attendance: 80 }, Cycle: { attendance: 0 }, Strength: { attendance: 20 } }, priorYear: { Barre: { attendance: 90 } }, omitted: 2 };
test('3D, flat and table views share the same measured comparison matrix', () => {
  const before = JSON.stringify(table);
  const matrix = groupMatrix(table, 'attendance', '2026-09');
  assert.deepEqual(matrix.categories, ['Barre', 'Cycle', 'Strength']);
  assert.deepEqual(matrix.periods.map(p => p.label), ['September 2025', 'August 2026', 'September 2026']);
  assert.deepEqual(matrix.periods.map(p => p.values), [[90, null, null], [80, 0, 20], [100, 0, null]]);
  assert.equal(matrixDomain(matrix).min, 0); assert.equal(matrixDomain(matrix).max, 100);
  assert.match(matrix.basis, /2 further eligible groups omitted/);
  assert.equal(JSON.stringify(table), before, 'rendering never mutates frozen evidence');
});
test('negative values include zero on a common scale; highlights remain present when limiting groups', () => {
  const matrix = groupMatrix({ ...table, rows: [{ g: 'A', attendance: -12 }, { g: 'B', attendance: 30 }, { g: 'C', attendance: 5 }], prior: {}, priorYear: {} }, 'attendance', '2026-09', ['C'], 2);
  assert.deepEqual(matrix.categories, ['C', 'A']);
  assert.deepEqual(matrixDomain(matrix), { min: -12, max: 5, count: 2 });
  assert.equal(matrix.available, 3); assert.equal(matrix.shown, 2);
});
test('history comparison preserves missing months and explicit zeros', () => {
  const data: ChapterData = { id: 'sessions', n: 10, total: {}, prior: {}, priorYear: {}, groups: [], history: [{ month: '2026-07', attendance: 12 }, { month: '2026-08', attendance: null }, { month: '2026-09', attendance: 0 }] };
  const matrix = historyMatrix(data, 'attendance');
  assert.deepEqual(matrix.periods[0].values, [12, null, 0]);
  assert.deepEqual(matrix.categories, ['July 2026', 'August 2026', 'September 2026']);
});
