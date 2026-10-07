import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, readdirSync } from 'node:fs';
import { normalise, sqlTypes } from '/Users/jimmeeygondaa/Numbers-Template/src/data/normalise.ts';
const snap=(k:string)=>{const f=readdirSync('.cache/snapshots').filter(x=>x.startsWith(k+'-')).sort().at(-1)!;return JSON.parse(readFileSync('.cache/snapshots/'+f,'utf8'));};
const src=readFileSync('src/components/PerformanceMarketing.tsx','utf8');
const grab=(re:RegExp)=>src.match(re)![0];
const consts=grab(/const TRIAL[\s\S]*?const dimensions/).replace(/const dimensions$/,'').replace('(column: string, lower = false)','(column, lower = false)').replace(/export /g,'');
const tagFn=grab(/const tag = [^\n]*\n/).replace("(column: string, lower = false)","(column, lower = false)");
const fn=new Function(`${consts.replace(/\n$/,'')}\n return {measures,tag};`)();
const db=await DuckDBInstance.create(':memory:');const c=await db.connect();
for(const k of ['leads','new']){
  const d=snap(k);const {rows}=normalise({key:k,title:k,id:k,columns:d.columns,rows:d.rows,fetchedAt:1} as any,false);
  await c.run(`CREATE TABLE "${k}" (${Object.entries(sqlTypes).map(([a,t])=>`"${a}" ${t}`).join(',')})`);
  const keys=Object.keys(sqlTypes);
  for(let i=0;i<rows.length;i+=2000){
    const chunk=rows.slice(i,i+2000);
    await c.run(`INSERT INTO "${k}" VALUES ${chunk.map(r=>'('+keys.map(a=>{const v=(r as any)[a];return v==null?'NULL':typeof v==='number'||typeof v==='boolean'?String(v):"'"+String(v).replace(/'/g,"''")+"'"}).join(',')+')').join(',')}`);
  }
}
const q=async(s:string)=>(await c.runAndReadAll(s)).getRowObjectsJS();
const W=`WHERE source IN ('Website') AND date>='2026-01-01' AND date<='2026-09-30'`;
console.log(await q(`SELECT ${fn.measures} FROM leads ${W}`));
console.log(await q(`SELECT ${fn.tag('utm_campaign')} AS label,${fn.measures} FROM leads ${W} GROUP BY 1 ORDER BY leads DESC LIMIT 4`));
console.log(await q(`SELECT l.date,l.member,l.stage,l.trial_status,l.conversion,l.ltv,l.visits,n.purchase_journey FROM (SELECT * FROM leads ${W} AND conversion='Converted') l LEFT JOIN (SELECT member_id,MAX(purchase_journey) AS purchase_journey,MAX(first_purchase) AS first_purchase FROM "new" WHERE member_id IS NOT NULL AND trim(member_id) NOT IN ('','-') GROUP BY member_id) n ON l.member_id=n.member_id AND trim(l.member_id) NOT IN ('','-') ORDER BY l.date DESC LIMIT 3`));
console.log(await q(`SELECT CAST(COALESCE(touches,0) AS INTEGER) AS label,count(*) n FROM leads ${W} GROUP BY 1 ORDER BY 1`));
process.exit(0);
