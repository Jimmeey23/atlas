import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencies } from '../src/data/workspace-dependencies';

test('overview main analytics wait for exactly the sources their totals use', () => {
  assert.deepEqual(dependencies(0), ['sessions', 'new', 'sales', 'lapsed']);
  for (const optional of ['leads', 'bookings', 'checkins', 'meta', 'payroll']) {
    assert.ok(!dependencies(0).includes(optional), `${optional} is loaded by its own overview section`);
  }
});

test('other source-dependent workspaces retain their required sources', () => {
  for (const source of ['sessions', 'bookings', 'checkins']) assert.ok(dependencies(1).includes(source));
  for (const source of ['sales', 'new', 'lapsed', 'leads', 'payroll', 'recurring', 'bookings']) assert.ok(dependencies(15).includes(source));
});
