import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { isPromotionalAccess, promotionalAccessSQL } from '../src/semantics/membership-eligibility.ts';
import { renewalFactsSQL } from '../src/data/renewals.ts';

const products = ['Studio Unlimited Monthly', '2 for 1 Membership', 'Two-for-One Pack', '2/1 Offer', 'Intro Week', 'Complimentary Class', 'Studio 12 Class Package', 'Newcomer 2 Pack'];
const expected = [false, true, true, true, true, true, false, true];

test('renewals and retention share one promotional-access rule, in JS and SQL', async () => {
  assert.deepEqual(products.map(isPromotionalAccess), expected);
  assert.match(renewalFactsSQL('', '2026-11-16'), /two\[\\s-\]\*for/, 'renewals exclude 2-for-1 like retention does');
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try {
    const rows = (await c.runAndReadAll(`SELECT ${promotionalAccessSQL()} AS p FROM (VALUES ${products.map((p, i) => `(${i}, '${p}')`).join(',')}) t(i, product) ORDER BY i`)).getRowObjectsJS();
    assert.deepEqual(rows.map((r) => r.p), expected);
  } finally { c.closeSync(); db.closeSync(); }
});
