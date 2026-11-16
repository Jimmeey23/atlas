import test from 'node:test';
import assert from 'node:assert/strict';
import { capRows } from '../src/components/ui/PartialBadge.tsx';

test('a capped view knows whether more rows matched', () => {
  assert.deepEqual(capRows([1, 2, 3], 3), { rows: [1, 2, 3], truncated: false });
  assert.deepEqual(capRows([1, 2, 3, 4], 3), { rows: [1, 2, 3], truncated: true });
});
