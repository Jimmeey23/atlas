import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSalesAccent } from '../src/state/workspaceAppearance.ts';

test('legacy saved Sales color no longer masks blue; other preferences survive', () => {
  const saved = { page: {4: {accent:'#ff00aa', groups:['category'], heading:'Sales'}, 3:{accent:'#ffcc00'}}, fontSize:13 };
  const migrated = migrateSalesAccent(saved);
  assert.equal(migrated.page[4].accent, undefined);
  assert.deepEqual(migrated.page[4], {groups:['category'],heading:'Sales'});
  assert.equal(migrated.page[3].accent, '#ffcc00');
  assert.equal(saved.page[4].accent, '#ff00aa', 'do not mutate the input');
  assert.equal(migrated.salesAccentVersion, 3);
});

test('new Sales color choices remain editable after the one-time migration', () => {
  const saved = {salesAccentVersion:3,page:{4:{accent:'#1d4ed8'}}};
  assert.equal(migrateSalesAccent(saved), saved);
  assert.equal(migrateSalesAccent({}).salesAccentVersion,3);
});

test('previous teal appearance is migrated to the new blue default', () => {
  const migrated = migrateSalesAccent({salesAccentVersion:1,page:{4:{accent:'#0f766e'}}});
  assert.equal(migrated.page[4].accent, undefined);
  assert.equal(migrated.salesAccentVersion, 3);
});

test('saved pink appearance is migrated to the new blue default', () => {
  const migrated = migrateSalesAccent({salesAccentVersion:2,page:{4:{accent:'#c21870'}}});
  assert.equal(migrated.page[4].accent, undefined);
  assert.equal(migrated.salesAccentVersion, 3);
});
