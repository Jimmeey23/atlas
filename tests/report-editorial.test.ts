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

import { reportAppearance } from '../src/report/appearance';
test('report accent is stable through saving and differs between generations', () => {
  const model = { builtAt: '2026-10-16T00:00:00Z', scope: { studio: 'Kwality House', month: '2026-09' }, figuresHash: 'frozen-figures' };
  assert.deepEqual(reportAppearance(model), reportAppearance({ ...model }));
  const accents = Array.from({ length: 100 }, (_, index) => reportAppearance({ ...model, builtAt: new Date(Date.parse(model.builtAt) + index).toISOString() })['--report-accent' as keyof ReturnType<typeof reportAppearance>]);
  assert.equal(new Set(accents).size, 100);
});

import { readingSpan, readerPreferences } from '../src/report/reader';
test('adaptive rows protect wide evidence, long arguments and long labels', () => {
  assert.equal(readingSpan({ columns: 5, rows: 8, words: 100 }), 'compact');
  assert.equal(readingSpan({ columns: 6, rows: 2 }), 'full');
  assert.equal(readingSpan({ columns: 3, rows: 9 }), 'full');
  assert.equal(readingSpan({ words: 171 }), 'full');
  assert.equal(readingSpan({ longestLabel: 49 }), 'full');
  assert.deepEqual(readerPreferences({ layout: 'injected', textSize: 'giant', spacing: null }), { layout: 'adaptive', textSize: 'standard', spacing: 'compact' });
});
