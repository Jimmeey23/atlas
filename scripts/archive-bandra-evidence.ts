import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {metricRecordFocus} from '../src/report/source-records';
import {createStore} from '../server/store.mjs';
import {createClient} from '@supabase/supabase-js';
import WebSocket from 'ws';
const audit=JSON.parse(await readFile('.floor/audits/bandra-september-2026-app.json','utf8'));
const cloud=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false},realtime:{transport:WebSocket}});
const store=createStore({root:process.cwd(),cloud});
const id='02c6bc73-560a-4c9f-adee-3e9a26297359';
const manifest:Record<string,Record<string,string>>={};
for(const [source,value] of Object.entries(audit.sources) as [string,any][]){
 const fields=Object.keys(value.records[0]).filter(f=>!f.startsWith('__'));
 const flags=value.ids.flatMap((metric:string)=>{const f=metricRecordFocus(metric);return f?[f.where?`COALESCE((${f.where}),false) AS __eligible_${metric}`:'',f.flag?`COALESCE((${f.flag}),false) AS __flag_${metric}`:''].filter(Boolean):[];});
 const select=fields.map(f=>`"${f}"`).concat(flags).join(',');let cursor=0;const months:Record<string,any[]>={};let count=0;
 while(true){const response=await fetch('http://localhost:5173/api/intelligence/query',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sql:`SELECT ${select} FROM ${source} WHERE source_row>${cursor} ORDER BY source_row`,filters:{...audit.scope,from:'2025-08-01'}})});const batch=await response.json();if(!response.ok)throw new Error(batch.error);if(batch.provenance[0].fetchedAt!==value.total.provenance[0].fetchedAt)throw new Error(`${source} changed since audit`);
  for(const row of batch.rows){const month=source==='lapsed'?row.end_date?.slice(0,7):row.month;if(month)(months[month]??=[]).push(row);count++;}if(batch.rows.length<500)break;cursor=Number(batch.rows.at(-1).source_row);
 }
 manifest[source]={};
 for(const [month,rows] of Object.entries(months)){if(month==='2026-09')continue;const key=`.floor/report-evidence/${id}/${source}/${month}.json`;await store.write(key,{rows,fetchedAt:value.total.provenance[0].fetchedAt,title:value.total.provenance[0].title,scope:{studio:'Supreme HQ, Bandra',month}});manifest[source][month]=key;}
 console.log(source,count,'records archived',Object.keys(months).length,'months');
}
const key=`.floor/reports/${id}.json`;const current=await store.read(key);await store.write(key,{...current,recordSnapshots:manifest});
console.log('Historical record manifest saved on report');
