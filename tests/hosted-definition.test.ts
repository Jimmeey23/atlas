import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { isHostedClass, hostedSQL } from '../src/semantics/hosted.ts';
import { referenceHosted } from '../src/data/acquisition-reference.ts';
import { HOSTED_CLASS_PATTERN } from '../src/data/class-intelligence-cleaners.ts';

const names = ['Studio Barre 57', 'Studio Barre 57 x Nike', 'Hosted Class', 'Birthday Barre', 'P57 Rugby', 'Studio PowerCycle', 'Influencer Partnership', 'Box Burn', 'Sweat in 30', 'Mat 57'];
const expected = [false, true, true, true, true, false, true, false, true, false];

test('every hosted rule in the app agrees, in JavaScript and SQL', async () => {
  assert.deepEqual(names.map((n) => isHostedClass(n)), expected);
  assert.deepEqual(names.map((n) => HOSTED_CLASS_PATTERN.test(n)), expected);
  assert.deepEqual(names.map((format) => referenceHosted({ format })), expected);
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try {
    const rows = (await c.runAndReadAll(`SELECT ${hostedSQL('format')} AS h FROM (VALUES ${names.map((n, i) => `(${i}, '${n}')`).join(',')}) t(i, format) ORDER BY i`)).getRowObjectsJS();
    assert.deepEqual(rows.map((r) => r.h), expected);
  } finally { c.closeSync(); db.closeSync(); }
});
