import test from 'node:test';
import assert from 'node:assert/strict';
import { actionReviewWindow } from '../src/report/editorial';

test('proposed review windows use the evidence freeze and do not invent timing for old reports', () => {
  const freeze = '2026-10-16T22:30:00Z';
  assert.equal(actionReviewWindow('Proposed 2026-11-15', freeze), 'First 30 days');
  assert.equal(actionReviewWindow('Proposed 2026-12-15', freeze), 'Days 31–60');
  assert.equal(actionReviewWindow('Proposed 2027-01-14', freeze), 'Days 61–90');
  assert.equal(actionReviewWindow('2027-02-01', freeze), 'Beyond 90 days');
  assert.equal(actionReviewWindow('Next 30 days', freeze), 'Review timing to agree');
  assert.equal(actionReviewWindow('2026-02-31', freeze), 'Review timing to agree');
  assert.equal(actionReviewWindow(undefined, freeze), 'Review timing to agree');
  assert.equal(actionReviewWindow('2026-10-15', freeze), 'Review date precedes evidence freeze');
  assert.equal(actionReviewWindow('2026-11-15', ''), 'Review timing to agree');
});
