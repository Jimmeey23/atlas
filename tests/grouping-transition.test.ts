import test from 'node:test';
import assert from 'node:assert/strict';
import { tree } from '../src/data/hierarchy';
import { relativePeriod } from '../src/data/periods';
test('removing grouping levels tolerates stale rollup rows during query refresh', () => {
  const rows = [{level:7,g0:'Studio'}, {level:3,g0:'Studio',g1:'Barre'}, {level:1,g0:'Studio',g1:'Barre',g2:'Mon'}, {level:0,g0:'Studio',g1:'Barre',g2:'Mon',g3:'Instructor'}];
  for (const groups of [['location','format','day','trainer'], ['location','format','day'], ['location','format'], ['location'], []]) {
    const result = tree(rows, groups);
    assert.ok(result.every(r => r.label && r.path.length));
  }
  assert.deepEqual(tree([{level:null}], ['location']), [{id:'[{"field":"location","value":"Unspecified"}]', label:'Unspecified',path:[{field:'location',value:'Unspecified'}],values:{level:null},children:[]}]);
});
test('quick periods respect India calendar and cross-year boundaries', () => {
  assert.deepEqual(relativePeriod('Yesterday','2026-01-01'), {from:'2025-12-31',to:'2025-12-31'});
  assert.deepEqual(relativePeriod('Last 7 days','2026-01-01'), {from:'2025-12-26',to:'2026-01-01'});
  assert.deepEqual(relativePeriod('This year','2026-10-13'), {from:'2026-01-01',to:'2026-10-13'});
});
