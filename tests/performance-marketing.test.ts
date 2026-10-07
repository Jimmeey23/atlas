import test from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { normalise, sqlTypes } from '../src/data/normalise.ts';
import { marketingMeasures, marketingMetricSQL, websiteScope } from '../src/data/performance-marketing.ts';
import { marketingGroupSQL, metaColumns } from '../src/data/performance-marketing.ts';
import { metricSQL } from '../src/semantics/metrics.ts';
import { tree } from '../src/data/hierarchy.ts';
import { marketingChannel, metaScope } from '../src/data/marketing-channels.ts';

test('Website cohorts reconcile cards, journey totals and grouped outcomes to sheet statuses', async () => {
  const data = normalise({ key: 'leads', title: 'Leads', id: 'test', status: 'ok', fetchedAt: 1, loadMs: 0,
    columns: ['Source Name', 'Created At', 'Stage Name', 'Trial Status', 'Conversion Status', 'Retention Status'],
    rows: [
      ['Website','2026-09-30','Membership Sold','Trial Completed','Converted','Retained'],
      [' website ','2026-09-01','Client Unresponsive','Trial Completed','Converted','Retained'],
      ['WEBSITE','2026-09-02','Trial Completed','Not Tried','Not Converted','Not Retained'],
      ['Website','2026-09-03','Membership Sold','Not Tried','Not Converted','Not Retained'],
      ['Website','2026-09-04','Initial Contact','Not Tried','Converted','Not Retained'],
      ['Website Form','2026-09-04','Membership Sold','Trial Completed','Converted','Retained'],
      ['Website','2026-08-31','Membership Sold','Trial Completed','Converted','Retained'],
      ['Social','2026-09-30','Membership Sold','Trial Completed','Converted','Retained'],
      [null,'2026-09-30','Membership Sold','Trial Completed','Converted','Retained'],
    ] }, false).rows;
  const db = await DuckDBInstance.create(':memory:'); const c = await db.connect();
  try {
    await c.run(`CREATE TABLE leads (${Object.entries(sqlTypes).map(([k,t])=>`"${k}" ${t}`).join(',')})`);
    const keys = ['source','date','stage','trial_status','conversion','retention','touches'];
    const literal = (v: unknown) => v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`;
    await c.run(`INSERT INTO leads (${keys.join(',')}) VALUES ${data.map(r=>`(${keys.map(k=>literal(r[k])).join(',')})`).join(',')}`);
    const scope = websiteScope(" WHERE date>='2026-09-01' AND date<='2026-09-30'");
    const read = async (sql: string) => (await c.runAndReadAll(sql)).getRowObjectsJS();
    const [cards] = await read(`SELECT ${marketingMetricSQL(['leads','trials_completed','converted_leads','lead_conversion_rate','open_leads'],{today:'2026-10-07',rate:1200})} FROM leads${scope}`);
    const [journey] = await read(`SELECT ${marketingMeasures} FROM leads${scope}`);
    assert.equal(Number(cards.leads),5);
    assert.equal(Number(cards.trials_completed),2);
    assert.equal(Number(cards.converted_leads),3);
    assert.equal(cards.lead_conversion_rate,0.6);
    assert.equal(Number(cards.open_leads),2);
    assert.equal(Number(journey.leads),Number(cards.leads));
    assert.equal(Number(journey.trials),Number(cards.trials_completed));
    assert.equal(Number(journey.members),Number(cards.converted_leads));
    assert.equal(Number(journey.trial_members),2);
    const groups = await read(`SELECT stage,${marketingMeasures} FROM leads${scope} GROUP BY stage`);
    for (const key of ['leads','trials','members','trial_members','retained'])
      assert.equal(groups.reduce((sum,r)=>sum+Number(r[key]),0),Number(journey[key]));
    const [missing] = await read(`SELECT COUNT(*) AS n FROM leads${websiteScope(' WHERE source IS NULL')}`);
    assert.equal(Number(missing.n),0);
  } finally { c.closeSync(); db.closeSync(); }
});

test('CRM channel attribution uses explicit tags, separates conflicting tags and preserves unattributed Website records', () => {
  assert.equal(marketingChannel('Website','Google'),'Google');
  assert.equal(marketingChannel('Website',' ig '),'Meta');
  assert.equal(marketingChannel('Social - Facebook','-'),'Meta');
  assert.equal(marketingChannel('Paid Meta Ads (FB/Instagram)','-'),'Meta');
  assert.equal(marketingChannel('Website','-'),'Website · channel unassigned');
  assert.equal(marketingChannel('Website Form','Expired or Invalid licence'),'Website · channel unassigned');
  assert.equal(marketingChannel('Social','-'),'Social · platform unassigned');
  assert.equal(marketingChannel('Google Ads','fb'),'Conflicting channel tags');
  assert.equal(marketingChannel('Client Referral',null),'Referrals');
  assert.equal(marketingChannel('Hosted Class',null),'Partnerships & events');
  assert.equal(marketingChannel(null,null),'Other / unassigned');
  const rows=normalise({key:'leads',title:'Leads',id:'test',status:'ok',fetchedAt:1,loadMs:0,
    columns:['Source Name','UTM Source'],rows:[['Website','Google'],['Website','fb'],['Website','-'],['Google Ads','fb']]},false).rows;
  assert.deepEqual(rows.map(r=>r.acquisition_channel),['Google','Meta','Website · channel unassigned','Conflicting channel tags']);
});

test('Meta filters preserve exact campaign identity and exclude unsupported CRM dimensions', () => {
  assert.equal(metaScope('2026-09-01','2026-09-30',{campaign_id:'120250091767600493',publisher_platform:'instagram',location:'Kemps Corner',source:'Website'})," WHERE date>='2026-09-01' AND date<='2026-09-30' AND campaign_id='120250091767600493' AND publisher_platform='instagram'");
  assert.equal(metaScope('','',{}),'');
  assert.equal(metaScope('','',{objective:"O'Brien"})," WHERE objective='O''Brien'");
});

test('Meta preserves date serials, exact campaign IDs, missing fields and recorded zero outcomes', () => {
  const row = normalise({key:'meta',title:'Meta',id:'test',status:'ok',fetchedAt:1,loadMs:0,
    columns:['date','account_id','campaign_id','adset_id','spend','leads','purchases'],
    rows:[[46231,'2148150425496432','120250091767600493','',0,0,null]]},false).rows[0];
  assert.equal(row.date,'2026-07-28');
  assert.equal(row.month,'2026-07');
  assert.equal(row.campaign_id,'120250091767600493');
  assert.equal(row.account_id,'2148150425496432');
  assert.equal(row.spend,0); assert.equal(row.meta_leads,0);
  assert.equal(row.meta_purchases,undefined); assert.equal(row.adset_id,undefined);
  assert.equal(row.location,undefined);
});

test('Meta nested groups preserve campaign identity and recalculate weighted costs, ratios and subtotals', async () => {
  const db=await DuckDBInstance.create(':memory:'); const c=await db.connect();
  try {
    await c.run(`CREATE TABLE meta (${Object.entries(sqlTypes).map(([k,t])=>`"${k}" ${t}`).join(',')})`);
    await c.run(`INSERT INTO meta(date,month,campaign_id,campaign_name,publisher_platform,spend,meta_leads,meta_purchases,purchase_value,clicks,impressions,reach) VALUES
      ('2026-09-01','2026-09','id1','Same name','facebook',90,9,1,500,20,1000,800),
      ('2026-09-02','2026-09','id1','Same name','instagram',20,1,1,300,10,100,90),
      ('2026-09-01','2026-09','id2','Same name','instagram',40,0,0,0,0,200,100),
      ('2026-08-01','2026-08','id2','Same name','instagram',9999,500,300,99999,1000,100000,100000)`);
    const ctx={today:'2026-10-07',rate:1200}; const scope=" WHERE date>='2026-09-01' AND date<='2026-09-30'";
    const groups=['campaign','publisher_platform','date'];
    const rows=(await c.runAndReadAll(marketingGroupSQL('meta',scope,groups,metaColumns,ctx))).getRowObjectsJS();
    const roots=tree(rows as any,groups);
    assert.equal(roots.length,2,'identically named campaigns remain separate by ID');
    const [total]=(await c.runAndReadAll(`SELECT ${metricSQL(metaColumns,ctx)} FROM meta${scope}`)).getRowObjectsJS();
    assert.equal(total.meta_spend,150); assert.equal(total.meta_leads,10);
    assert.equal(total.meta_cpl,15); assert.equal(total.meta_ctr,30/1300);
    const first=roots.find(r=>r.label.includes('id1'))!;
    assert.equal(first.values.meta_spend,110); assert.equal(first.values.meta_cpl,11);
    assert.equal(first.values.meta_cpc,110/30); assert.equal(first.values.meta_roas,800/110);
    assert.equal(roots.find(r=>r.label.includes('id2'))?.values.meta_cpl,null);
    assert.equal(roots.find(r=>r.label.includes('id2'))?.values.meta_cpa,null);
    for(const id of ['meta_spend','meta_leads','meta_clicks','meta_impressions','meta_reach','meta_purchases','meta_purchase_value'])
      assert.equal(roots.reduce((sum,r)=>sum+Number(r.values[id]),0),Number(total[id]));
    assert.equal(first.children.reduce((sum,r)=>sum+Number(r.values.meta_spend),0),Number(first.values.meta_spend));
    assert.ok(first.children.every(r=>r.children.length===1));
    assert.throws(()=>marketingGroupSQL('meta',scope,['campaign','campaign'],metaColumns,ctx));
    assert.throws(()=>marketingGroupSQL('meta',scope,['campaign;DROP TABLE meta'],metaColumns,ctx));
    const [empty]=(await c.runAndReadAll(`SELECT ${metricSQL(['meta_spend','meta_leads','meta_cpl'],ctx)} FROM meta WHERE date='1900-01-01'`)).getRowObjectsJS();
    assert.equal(empty.meta_spend,null); assert.equal(empty.meta_leads,null); assert.equal(empty.meta_cpl,null);
  } finally {c.closeSync(); db.closeSync();}
});
