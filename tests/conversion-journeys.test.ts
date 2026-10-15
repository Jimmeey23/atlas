import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { sqlTypes } from '../src/data/normalise';
import { conversionJourneySQL } from '../src/data/conversion-journeys';

test('same-month 30-day events, mature return denominator and ordered distinct-sale journeys', async () => {
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try {
    for (const table of ['new','sales','checkins']) await c.run(`CREATE TABLE ${table} (${Object.entries(sqlTypes).map(([k,t]) => `"${k}" ${t}`).join(',')})`);
    await c.run(`INSERT INTO new (member_id,date,is_new,source_row,format,conversion,first_purchase_date) VALUES
      ('a','2026-08-01',true,1,'Intro','Converted','2026-08-05'),
      ('a','2026-08-02',true,2,'Intro','Converted','2026-08-05'),
      ('b','2026-08-30',true,3,'Intro','Converted','2026-09-01'),
      ('c','2026-10-14',true,4,'Intro','Not Converted',NULL),
      ('d','2026-08-02',true,5,'Intro','Converted',NULL)`);
    await c.run(`INSERT INTO checkins (member_id,date,attended) VALUES ('a','2026-08-05',true),('b','2026-09-01',true),('c','2026-10-15',true)`);
    await c.run(`INSERT INTO sales (member_id,date,sale_id,product,status,voided,imported,source_row) VALUES
      ('a','2026-08-05','1','Intro Pack','succeeded',false,false,1),
      ('a','2026-08-05','1','Intro Pack','succeeded',false,false,2),
      ('a','2026-08-15','2','Monthly','succeeded',false,false,3),
      ('a','2026-08-20','3','Voided','succeeded',true,false,4)`);
    const result = await c.runAndReadAll(conversionJourneySQL('', '2026-10-15', false));
    const rows = result.getRowObjectsJS();
    const sum = (key: string) => rows.reduce((n,r) => n+Number(r[key]),0);
    assert.equal(sum('clients'),4); assert.equal(sum('converted'),1);
    assert.equal(sum('conversion_eligible'),3); assert.equal(sum('retention_eligible'),3);
    assert.equal(sum('retained_eligible'),1);
    const journey = rows.find(r => String(r.journey).includes('Intro Pack'))!;
    assert.equal(journey.journey,'First visit: Intro → Intro Pack → Monthly');
    assert.equal(Number(journey.avg_purchases),2);
  } finally { c.closeSync(); db.closeSync(); }
});
