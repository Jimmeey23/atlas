import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { sqlTypes } from '../src/data/normalise.ts';
import { monthlyFrequencySQL, instructorMonthlyOutcomesSQL } from '../src/data/monthly-member-outcomes.ts';

async function database(work: (connection: any) => Promise<void>) {
  const db = await DuckDBInstance.create(':memory:');
  const c = await db.connect();
  try {
    for (const table of ['new', 'checkins']) await c.run(`CREATE TABLE ${table} (${Object.entries(sqlTypes).map(([key, type]) => `"${key}" ${type}`).join(',')})`);
    await work(c);
  } finally { c.closeSync(); db.closeSync(); }
}

test('monthly bands count unique attended sessions and reconcile exclusive access splits', async () => database(async c => {
  for (const count of [1, 2, 6, 7, 14, 15]) {
    for (let i = 0; i < count; i++) await c.run(`INSERT INTO checkins(member_id,date,session_id,attended,product,location) VALUES ('m${count}','2026-01-05','s${i}',TRUE,'${count === 1 ? 'Monthly Membership' : count === 15 && i === 0 ? 'Unlimited' : '10 Class Pack'}','Bandra')`);
  }
  await c.run(`INSERT INTO checkins(member_id,date,session_id,attended,product,location) VALUES
    ('m1','2026-01-05','s0',TRUE,'Monthly Membership','Bandra'),
    ('m1','2026-01-06','cancel',FALSE,'Monthly Membership','Bandra'),
    (NULL,'2026-01-05','unknown',TRUE,'Unlimited','Bandra'),
    ('other','2026-01-05','s0',TRUE,'Unlimited','Kemps'),
    ('m1','2026-02-01','s0',TRUE,NULL,'Bandra')`);
  const rows = (await c.runAndReadAll(monthlyFrequencySQL(" WHERE location='Bandra'"))).getRowObjectsJS();
  const january = rows.find((r: any) => r.month === '2026-01' && r.access_type === 'All access types')!;
  assert.deepEqual([january.members, january.one_class, january.two_six, january.seven_fourteen, january.fifteen_plus].map(Number), [6, 1, 2, 2, 1]);
  assert.equal(Number(january.visits), 45);
  const split = rows.filter((r: any) => r.month === '2026-01' && r.access_type !== 'All access types');
  assert.equal(split.reduce((sum: number, r: any) => sum + Number(r.members), 0), 6);
  assert.equal(Number(split.find((r: any) => r.access_type === 'Mixed access')!.fifteen_plus), 1);
  assert.equal(Number(rows.find((r: any) => r.month === '2026-02' && r.access_type === 'Other / unspecified')!.members), 1);
}));

test('instructor outcomes use rolling 30 days, earliest attribution, mature denominators and cross-studio returns', async () => database(async c => {
  await c.run(`INSERT INTO new(member_id,date,source_row,trainer,location,is_new,conversion,retention,first_purchase_date,visits_post) VALUES
    ('a','2026-01-25',1,'Alice','Bandra',TRUE,'Converted','Retained','2026-02-10',1),
    ('b','2026-01-25',2,' alice ','Bandra',TRUE,'Converted','Not Retained','2026-02-25',0),
    ('a','2026-02-05',3,'Bob','Kemps',TRUE,'Converted','Retained','2026-02-10',1),
    ('recent','2026-02-20',4,'Alice','Bandra',TRUE,'Converted','Retained','2026-02-21',1),
    ('undated','2026-01-01',5,'Bob','Bandra',TRUE,'Converted',NULL,NULL,NULL),
    ('existing','2026-01-25',6,'Alice','Bandra',FALSE,'Converted','Retained','2026-01-26',1)`);
  await c.run(`INSERT INTO checkins(member_id,date,attended,location,trainer) VALUES
    ('a','2026-01-25',TRUE,'Bandra','Alice'),
    ('a','2026-02-24',TRUE,'Kemps','Bob'),
    ('b','2026-02-10',FALSE,'Bandra','Alice'),
    ('b','2026-02-25',TRUE,'Bandra','Alice'),
    ('recent','2026-02-21',TRUE,'Bandra','Alice'),
    ('coverage','2026-03-01',TRUE,'Bandra','Alice')`);
  const rows = (await c.runAndReadAll(instructorMonthlyOutcomesSQL(" WHERE location='Bandra'", '2026-03-02'))).getRowObjectsJS();
  const january = rows.find((r: any) => r.month === '2026-01' && String(r.trainer).trim().toLowerCase() === 'alice')!;
  assert.equal(Number(january.newcomers), 2);
  assert.equal(Number(january.converted), 2);
  assert.equal(Number(january.retained), 1);
  assert.equal(Number(january.mature_30), 2);
  assert.equal(Number(january.converted_30), 1, 'February purchase qualifies within 30 days; day 31 does not');
  assert.equal(Number(january.retained_30), 1, 'return on day 30 with another instructor qualifies');
  assert.equal(january.conversion_30_rate, 0.5);
  assert.equal(january.retention_30_rate, 0.5);
  const february = rows.find((r: any) => r.month === '2026-02')!;
  assert.equal(Number(february.newcomers), 1, 'duplicate member stays with original instructor');
  assert.equal(Number(february.mature_30), 0);
  assert.equal(february.retention_30_rate, null);
  assert.equal(february.conversion_30_rate, null);
  const bob = rows.find((r: any) => r.trainer === 'Bob')!;
  assert.equal(Number(bob.undated_conversions), 1);
  assert.equal(bob.retained, null);
  assert.equal(january.observed_through, '2026-03-01');
}));

test('recorded categories take priority over product wording', async () => database(async c => {
  await c.run(`INSERT INTO checkins(member_id,date,session_id,attended,category,product) VALUES
    ('intro','2026-01-01','s1',TRUE,'Newcomers Special','2 Week Unlimited Membership'),
    ('private','2026-01-01','s1',TRUE,'Privates','Private Single Class'),
    ('single','2026-01-01','s1',TRUE,'Sessions/Single Classes','Session')`);
  const rows=(await c.runAndReadAll(monthlyFrequencySQL(''))).getRowObjectsJS();
  assert.equal(Number(rows.find((r:any)=>r.access_type==='Trials / introductory')!.members),1);
  assert.equal(Number(rows.find((r:any)=>r.access_type==='Private sessions')!.members),1);
  assert.equal(Number(rows.find((r:any)=>r.access_type==='Drop-in / single session')!.members),1);
  assert.ok(!rows.some((r:any)=>r.access_type==='Memberships'));
}));

test('missing visit coverage leaves 30-day outcomes unavailable', async () => database(async c => {
  await c.run(`INSERT INTO new(member_id,date,source_row,trainer,is_new,conversion) VALUES ('a','2026-01-01',1,'Alice',TRUE,'Converted')`);
  const [row]=(await c.runAndReadAll(instructorMonthlyOutcomesSQL('', '2026-03-01'))).getRowObjectsJS();
  assert.equal(Number(row.mature_30),0);
  assert.equal(row.retention_30_rate,null);
  assert.equal(row.converted_30,null);
  assert.equal(row.observed_through,null);
  assert.equal(row.second_visit_rate,null);
}));
