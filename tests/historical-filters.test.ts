import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalFilters, historicalTransient } from '../src/data/periods.ts';

test('comparison history ignores selected dates while preserving all other filters', () => {
  const scope = { from: '2026-09-01', to: '2026-09-30', location: ['Kenkere House'], trainer: ['Instructor'], source: ['Referral'], category: ['Memberships'], day: ['Monday'], time: ['09:00'], imports: true, memberType: 'new' };
  const history = historicalFilters(scope, '2026-10-06');
  assert.deepEqual(history, historicalFilters({ ...scope, from: '2024-01-01', to: '2024-01-31' }, '2026-10-06'));
  assert.deepEqual(history, { ...scope, from: '2024-08-01', to: '2026-09-30' });
  assert.equal(scope.from, '2026-09-01');
  assert.deepEqual(historicalFilters(scope, '2024-03-01', 14), { ...scope, from: '2023-01-01', to: '2024-02-29' });
});

test('comparison history removes calendar cross-filters but keeps operational filters', () => {
  const filters = [{ field: 'month', value: '2026-09' }, { field: 'location', value: 'Kenkere House' }, { field: 'date', value: '2026-09-01' }, { field: 'day', value: 'Monday' }, { field: 'time', value: '09:00' }];
  assert.deepEqual(historicalTransient(filters), [filters[1], filters[3], filters[4]]);
  assert.equal(filters.length, 5);
});
