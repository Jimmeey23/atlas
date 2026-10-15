import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetricFlipStore } from '../src/state/metric-flip';

test('notification terminates when a card resubscribes during a synchronous React update', () => {
  const store = createMetricFlipStore();
  let calls = 0;
  let unsubscribe = () => {};
  const callback = () => {
    calls++;
    assert.ok(calls < 5, 'notification must not loop over resubscribed listeners');
    unsubscribe();
    unsubscribe = store.subscribe('a', callback);
  };
  unsubscribe = store.subscribe('a', callback);
  store.set('a', true);
  assert.equal(calls, 1);
  store.set('a', false);
  assert.equal(calls, 2);
  unsubscribe();
});

test('only previous and next cards update, redundant writes do nothing, and one stays open', () => {
  const store = createMetricFlipStore();
  const calls = { a: 0, b: 0, c: 0 };
  for (const id of ['a','b','c'] as const) store.subscribe(id, () => calls[id]++);
  store.set('a', true);
  store.set('a', true);
  store.set('b', false);
  assert.deepEqual(calls, {a:1,b:0,c:0});
  store.set('b');
  assert.equal(store.isActive('a'), false);
  assert.equal(store.isActive('b'), true);
  assert.deepEqual(calls, {a:2,b:1,c:0});
  store.set('b');
  assert.equal(store.isActive('b'), false);
});
