import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPresentFields, sourceCarries } from '../src/semantics/source-scope';

test('global dimensions skip source columns that exist only as null schema placeholders', () => {
  const fields = collectPresentFields([{location:'A',trainer:null,capacity:null,is_new:null}]);
  assert.equal(sourceCarries(fields,'location'),true);
  assert.equal(sourceCarries(fields,'trainer'),false);
  assert.equal(sourceCarries(fields,'capacity'),false);
  assert.equal(sourceCarries(fields,'is_new'),false);
});
test('zero and false are populated values and preserve applicable filters', () => {
  const fields = collectPresentFields([{capacity:0,is_new:false,trainer:null}]);
  collectPresentFields([{trainer:'Instructor'}],fields);
  for (const field of ['capacity','is_new','trainer']) assert.equal(sourceCarries(fields,field),true);
});
test('unknown coverage retains filters while verified empty source carries no dimensions', () => {
  assert.equal(sourceCarries(undefined,'trainer'),true);
  assert.equal(sourceCarries(collectPresentFields([]),'trainer'),false);
});
