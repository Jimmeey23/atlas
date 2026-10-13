import { writeFile } from 'node:fs/promises';
import { metricRecordFocus } from '../src/report/source-records';
import { sqlTypes } from '../src/data/normalise';
import { metricSQL } from '../src/semantics/metrics';
const sets: Record<string,string[]> = {
 sessions:['sessions','capacity','attendance','fill_rate','booked','show_up_rate','late_cancel_rate','avg_class_size_incl','empty_sessions','revenue','revenue_per_session','paid_attendance','complimentary_visits'],
 sales:['gross_revenue','net_revenue','vat','transactions','units','aov','arpu','buyers','discount_value','discount_rate','membership_rev_share'],
 new:['new_clients','first_visitors','conversion_rate','second_visit_rate','zero_return_rate','new_converted','new_retained','avg_first_purchase'],
 leads:['leads','converted_leads','lead_conversion_rate','trials_completed','open_leads','crm_trials','crm_members','crm_win_rate'],
 lapsed:['memberships_count','lapsed_members','churn_rate','utilisation','remaining_sessions','zero_usage_memberships','membership_revenue'],
 checkins:['checkins','unique_attendees','visits_per_member','checkin_revenue','revenue_per_checkin'],
 bookings:['bookings','booking_attended','booking_late_cancelled','booking_cancelled','booking_no_shows','booking_late_rate','booking_attendance_rate'],
};
const filters={location:['Supreme HQ, Bandra'],from:'2026-09-01',to:'2026-09-30',imports:false};
const base=process.env.AUDIT_API || 'http://localhost:5173';
async function run(sql:string, scope=filters) { const res=await fetch(`${base}/api/intelligence/query`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sql,filters:scope})});const data=await res.json();if(!res.ok)throw new Error(data.error);return {sql,...data}; }
const sources:Record<string,any>={};
for(const [source,ids] of Object.entries(sets)) {
 const measures=metricSQL(ids,{today:'2026-10-13',rate:1200});
 const total=await run(`SELECT ${measures},COUNT(*) AS n FROM ${source}`);
 const month=source==='lapsed'?'SUBSTR(end_date,1,7)':'month';
 const history=await run(`SELECT ${month} AS month,${measures},COUNT(*) AS n FROM ${source} GROUP BY 1 ORDER BY 1`,{...filters,from:'2025-08-01'});
 const groups:Record<string,unknown>={};
 for(const field of (source==='sessions'?['trainer','format','format_group','day','time']:source==='sales'?['category','product','associate','payment_method']:source==='leads'?['source','stage','associate']:source==='new'?['entry_type','source']:source==='lapsed'?['product','status']:source==='checkins'?['day','time','format']:['format','trainer'])) groups[field]=await run(`SELECT "${field}" AS g,${measures},COUNT(*) AS n FROM ${source} GROUP BY 1 ORDER BY n DESC`);
 const fields = ['source_row','date','month','location','member','member_id','trainer','format','format_group','day','time','product','category','associate','status', ...(source==='sessions'?['session_id','sessions','capacity','booked','checked_in','late_cancelled','complimentary_visits','non_paid','revenue','session_type']:source==='sales'?['sale_id','revenue','net','vat','discount','units','payment_method','discount_code']:source==='new'?['first_visit','entry_type','source','is_new','conversion','retention','visits_post','first_purchase','ltv']:source==='leads'?['source','stage','trial_status','conversion','response_hours','touches']:source==='lapsed'?['start_date','end_date','churned_date','completed','remaining','session_limit','days_absent','last_visit','revenue','latest_lapse']:source==='checkins'?['session_id','attended','late_cancelled','revenue','duration']:['session_id','attended','late_cancelled','cancelled','no_show','revenue'])];
 let records:any[]=[];let cursor=0;
 while(true){const batch=await run(`SELECT ${[...new Set(fields)].filter(f=>f in sqlTypes).map(f=>`"${f}"`).concat(ids.flatMap(id=>{const f=metricRecordFocus(id);return f?[f.where?`COALESCE((${f.where}),false) AS __eligible_${id}`:'',f.flag?`COALESCE((${f.flag}),false) AS __flag_${id}`:''].filter(Boolean):[]})).join(',')} FROM ${source} WHERE source_row>${cursor} ORDER BY source_row`);if(batch.provenance[0].fetchedAt!==total.provenance[0].fetchedAt)throw new Error('Source changed during audit');records.push(...batch.rows);if(batch.rows.length<500)break;cursor=Number(batch.rows.at(-1).source_row);}
 sources[source]={ids,total,history,groups,records};
 console.log(source,JSON.stringify(total.rows));
}
await writeFile('.floor/audits/bandra-september-2026-app.json',JSON.stringify({scope:filters,checkedAt:new Date().toISOString(),sources},null,2));
