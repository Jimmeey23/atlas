import test from 'node:test';
import assert from 'node:assert/strict';
import { metricContract, readingGuide } from '../src/report/metric-contract';
import { metrics } from '../src/semantics/metrics';

test('every registered metric has a contract with formula, direction and aggregation', () => {
  for (const id of Object.keys(metrics)) {
    const text = metricContract(id);
    assert.ok(text.includes(metrics[id].label), id);
    assert.match(text, /Direction: a rise is (favourable|ADVERSE)/, id);
    assert.ok(text.includes('Aggregation:'), id);
  }
});
test('contracts state adverse direction, basis and lookalikes', () => {
  assert.ok(metricContract('no_show_rate').includes('ADVERSE'));
  assert.ok(metricContract('fill_rate').includes('Not the same as: booking_fill_rate'));
  assert.ok(metricContract('retention_rate').includes('second_visit_rate'));
  assert.ok(metricContract('active_base').includes('current snapshot'));
});
test('reading guide flags adverse measures without imposing a fixed sample cutoff', () => {
  const guide = readingGuide(['no_show_rate', 'fill_rate', 'conversion_rate'], 2);
  assert.ok(guide.includes('no_show_rate'));
  assert.doesNotMatch(guide, /Lower is better[^\n]*fill_rate/);
  assert.doesNotMatch(guide, /below the minimum sample|low confidence/);
  assert.match(metricContract('fill_rate'), /full eligible filtered dataset/);
});
