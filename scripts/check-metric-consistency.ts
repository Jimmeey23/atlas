import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { normalise, sqlTypes } from '../src/data/normalise';
import { metricSQL } from '../src/semantics/metrics';
import { acquisitionFactsSQL, acquisitionAggregate } from '../src/data/acquisition';
import { salesScorecardFactsSQL, salesScorecardAggregate } from '../src/data/sales-scorecards';
import { retentionSnapshotSQL } from '../src/data/metric-consistency';

const from = process.env.METRIC_CHECK_FROM || '2026-09-01', to = process.env.METRIC_CHECK_TO || '2026-09-30';
if (![from,to].every(v=>/^\d{4}-\d{2}-\d{2}$/.test(v))) throw new Error('Use ISO dates');
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const scope = ` WHERE date>='${from}' AND date<='${to}' AND NOT imported`;
const ctx={rate:1200,today,newWhere:scope};
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-metric-consistency-'));
const db=await DuckDBInstance.create(':memory:'); const c=await db.connect();
const snapshots:Record<string,unknown>={}; const checks:Record<string,unknown>[]=[];
const lit=(s:string)=>`'${s.replaceAll("'","''")}'`;
const row=async(sql:string)=>(await c.runAndReadAll(sql)).getRowObjectsJS()[0] as Record<string,unknown>;
const compare=(area:string,id:string,a:unknown,b:unknown)=>{
 const left=a==null?null:Number(a), right=b==null?null:Number(b);
 const pass=left==null||right==null?left===right:Math.abs(left-right)<=Math.max(1,Math.abs(left),Math.abs(right))*1e-10;
 checks.push({area,metric:id,sharedValue:left,viewValue:right,pass});
};
try {
 for(const key of ['new','bookings','sales','lapsed']){
  const data=JSON.parse(await fs.readFile(`.cache/${key}.json`,'utf8'));
  snapshots[key]={fetchedAt:new Date(data.fetchedAt).toISOString(),hash:data.hash,rows:data.rows.length};
  const file=path.join(scratch,key+'.ndjson');await fs.writeFile(file,'');
  for(let offset=0;offset<data.rows.length;offset+=2000){
   const rows=normalise({...data,rows:data.rows.slice(offset,offset+2000)},false).rows.map(r=>{
    if(key==='bookings')return {member_id:r.member_id,late_cancelled:r.late_cancelled};
    if(key==='lapsed')return {status:r.status,start_date:r.start_date,end_date:r.end_date,amount_paid:r.amount_paid};
    return {...r,source_row:Number(r.source_row)+offset,row_id:Number(r.row_id)+offset};
   });
   await fs.appendFile(file,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  }
  await c.run(`CREATE TABLE "${key}" AS SELECT * FROM read_json(${lit(file)},format='newline_delimited',columns={${Object.entries(sqlTypes).map(([k,v])=>`${lit(k)}:${lit(v)}`).join(',')}})`);
 }
 const pairs:Record<string,string>={conversion_rate:'conversion_rate',retention_rate:'retention_rate',second_visit_rate:'second_visit_rate',avg_ltv:'avg_ltv',first_purchase:'avg_first_purchase',conversion_span:'avg_conversion_span',median_span:'median_conversion_span',total_ltv:'new_total_spend',post_trial_spend:'new_post_trial_spend',post_trial_purchases_total:'new_post_trial_purchases',total_purchases:'new_total_purchases',total_visits:'new_visits',revenue_per_visit:'new_revenue_per_visit',late_cancels:'new_late_cancels'};
 const canonical=await row(`SELECT ${metricSQL(Object.values(pairs),ctx)} FROM new${scope}`);
 const acquisition=await row(`WITH f AS (${acquisitionFactsSQL(scope,today,true)}) SELECT ${acquisitionAggregate} FROM f`);
 for(const [alias,id] of Object.entries(pairs))compare('Acquisition tables ↔ shared metrics',id,canonical[id],acquisition[alias]);
 const salesIds=['gross_revenue','net_revenue','transactions','buyers','aov','arpu','purchase_frequency','product_breadth','discount_value','discount_rate'];
 const salesCanonical=await row(`SELECT ${metricSQL(salesIds,ctx)} FROM sales${scope} AND NOT COALESCE(voided,FALSE) AND (status='succeeded' OR status IS NULL)`);
 const scorecard=await row(`WITH f AS (${salesScorecardFactsSQL(scope,false)}) SELECT ${salesScorecardAggregate} FROM f`);
 for(const id of salesIds)compare('Sales scorecards ↔ shared metrics',id,salesCanonical[id],scorecard[id]);
 const current=await row(`SELECT ${metricSQL(['active_memberships','revenue_at_risk_30d'],ctx)} FROM lapsed`);
 const reconstructed=await row(`SELECT ${retentionSnapshotSQL(`DATE '${today}'`,ctx)} FROM lapsed`);
 for(const id of ['active_memberships','revenue_at_risk_30d'])compare('Retention reconstruction at today ↔ current cards',id,current[id],reconstructed[id]);
 const report={checkedAt:new Date().toISOString(),scope:{from,to,location:'All studios',imports:false},snapshots,checks,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,limits:'Source-snapshot calculation comparisons, not a click-through of every tab or a live upstream reconciliation. Session-based tabs use shared registry queries; intentionally distinct cash/session, Website/all-lead, row/distinct-member and frozen-report scopes must not be forced to agree.'};
 await fs.writeFile('public/reference/metric-consistency.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 if(report.failed)process.exitCode=1;
}finally{c.closeSync();db.closeSync();await fs.rm(scratch,{recursive:true,force:true});}
