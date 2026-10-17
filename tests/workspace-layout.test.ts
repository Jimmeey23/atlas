import { test } from 'node:test';
import assert from 'node:assert/strict';
const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
const { readWorkspace, workspaceKey, WORKSPACE_KEY, saveWorkspace, workspaceElements, workspaceTables } = await import('../src/state/workspaceLayout');
test('workspace persistence tolerates missing, corrupt and unsupported snapshots', () => {
  assert.equal(readWorkspace(), null);
  values.set(WORKSPACE_KEY, '{'); assert.equal(readWorkspace(), null);
  values.set(WORKSPACE_KEY, JSON.stringify({ version: 2 })); assert.equal(readWorkspace(), null);
});
test('workspace snapshot retains distinct tab scopes, order and drilldowns', () => {
  const snapshot = { version: 1, scopes: { '4:': { tab: 4 }, '8:website-leads': { tab: 8 } }, orders: { '4:/main': ['sales', 'revenue'] }, drills: { '4:': { label: 'Bandra', field: 'location', value: 'Bandra' } } };
  values.set(WORKSPACE_KEY, JSON.stringify(snapshot));
  assert.deepEqual(readWorkspace(), snapshot);
  assert.notEqual(workspaceKey(8, ''), workspaceKey(8, 'website-leads'));
});

test('save action persists element overrides and table drill state together', () => {
  workspaceElements['4:|#main > h2'] = { text: 'Sales', styles: { color: '#ff0' } };
  workspaceTables['4:/register/expanded'] = { Bandra: true };
  saveWorkspace({ active: '4:', preferences: { fontSize: 15 }, theme: 'gloss', density: 'compact', rate: 1200 });
  const saved = readWorkspace();
  assert.deepEqual(saved?.elements, workspaceElements);
  assert.deepEqual(saved?.tables, workspaceTables);
  assert.deepEqual(saved?.preferences, { fontSize: 15 });
});
