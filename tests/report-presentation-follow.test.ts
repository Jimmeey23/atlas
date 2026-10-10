import test from 'node:test';
import assert from 'node:assert/strict';
import { completeMetricGrid, matchSpeech } from '../src/report/presentation-follow';
test('metrics always form one or two full rows across drawer and responsive widths', () => {
  for (const width of [240, 375, 600, 850, 1200]) for (let available = 1; available <= 20; available++) {
    const { columns, count } = completeMetricGrid(available, width);
    assert.ok(count <= available && count <= 8);
    assert.equal(count % columns, 0);
    assert.ok([1, 2].includes(count / columns));
  }
  assert.deepEqual(completeMetricGrid(5, 900), { columns: 4, count: 4 });
  assert.deepEqual(completeMetricGrid(7, 900), { columns: 3, count: 6 });
  assert.deepEqual(completeMetricGrid(8, 900), { columns: 4, count: 8 });
});
test('voice follows a distinctive section and refuses ambiguous or short speech', () => {
  const candidates = [
    { key: 'sales:insights', text: 'Membership collections grew with higher renewal revenue and transaction value' },
    { key: 'sessions:evidence', text: 'Saturday Barre attendance declined in morning slots under capacity' },
  ];
  assert.equal(matchSpeech('Saturday Barre attendance declined in morning slots', candidates, 'sales:insights'), 'sessions:evidence');
  assert.equal(matchSpeech('attendance', candidates, 'sales:insights'), null);
  assert.equal(matchSpeech('let us move on to the next page', candidates, 'sales:insights'), null);
  assert.equal(matchSpeech('membership collections renewal revenue', [...candidates, {key:'sales:summary',text:candidates[0].text}], 'sales:summary'), null);
});

import { DuckDBInstance } from '@duckdb/node-api';
import { recordGroupConstraint } from '../src/report/source-records';
import type { GroupTable } from '../src/report/model';
test('item drilldowns preserve exact combination labels, null groups and quoted values', async () => {
  const db = await DuckDBInstance.create(':memory:'); const connection = await db.connect();
  try {
    const facts = `(VALUES ('Saturday','Barre · Strength'),('Sunday','Barre'),(NULL,'Barre'),('Saturday','Member''s Barre')) AS items(day,format)`;
    const table = { field: 'day', fields: ['day', 'format'] } as GroupTable;
    const read = async (t: GroupTable, g: string) => (await connection.runAndReadAll(`SELECT * FROM ${facts}${recordGroupConstraint(t,g)}`)).getRowObjectsJS();
    assert.equal((await read(table, 'Saturday · Barre · Strength')).length, 1);
    assert.equal((await read(table, "Saturday · Member's Barre")).length, 1);
    assert.equal((await read({field:'day'} as GroupTable, 'Unspecified')).length, 1);
    assert.equal((await read(table, 'missing')).length, 0);
    assert.throws(() => recordGroupConstraint({field:'format); DROP TABLE sales;--'} as GroupTable, 'Barre'));
    assert.equal(recordGroupConstraint(undefined, undefined), '');
  } finally { connection.closeSync(); db.closeSync(); }
});
