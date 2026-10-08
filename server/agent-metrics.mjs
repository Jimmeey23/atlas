import { metrics, metricSQL } from '../src/semantics/metrics.ts';
import { currentSnapshotMetrics } from '../src/semantics/evidence.ts';
import { toolScope } from './agent-scope.mjs';
export const metricSource = id => metrics[id]?.sources[0]?.split('.')[0].split(' →')[0].toLowerCase().replaceAll(' ', '_');
export function metricCatalog(config) {
  return Object.values(metrics).filter(m => config.some(s => s.key === metricSource(m.id))).map(m => ({id:m.id,label:m.label,source:metricSource(m.id),format:m.format}));
}
const groupsAllowed = new Set(['location','month','trainer','format','format_group','category','product','associate','payment_method','day','time','status','source','class_slot','session_type']);
// A recurring class is one weekly slot: the class name on a given weekday and start time.
export const classSlotSQL = `COALESCE(format,'Unnamed class') || ' · ' || COALESCE(day,'?') || ' ' || COALESCE(time,'?')`;
const slotSources = new Set(['sessions','checkins','bookings']);
export function compileMetricQuery(args, defaults, available, rate = 1200) {
  const {source,metric_ids:ids,group_by:groups=[]} = args;
  if (!available.includes(source) || !Array.isArray(ids) || !ids.length || ids.length>12 || ids.some(id=>metricSource(id)!==source)) throw new Error('Choose 1–12 metrics from the same listed source.');
  if (!Array.isArray(groups) || groups.length>3 || groups.some(g=>!groupsAllowed.has(g))) throw new Error('Unsupported metric grouping.');
  const snapshots = ids.filter(id=>currentSnapshotMetrics.has(id));
  if (snapshots.length && snapshots.length !== ids.length) throw new Error('Query current snapshot metrics separately from period metrics.');
  const filters = {...toolScope(args.scope_json,defaults)};
  if (snapshots.length) {delete filters.from;delete filters.to;}
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let facts = source;
  if(source==='sales') facts=`(SELECT *,ROW_NUMBER() OVER(PARTITION BY COALESCE(membership_id,'row:' || source_row::VARCHAR) ORDER BY date DESC,source_row DESC) AS membership_balance_rank FROM sales)`;
  if(source==='checkins') facts=`(SELECT *,CASE WHEN attended AND duration>0 AND session_id IS NOT NULL THEN ROW_NUMBER() OVER(PARTITION BY session_id,attended,duration>0 ORDER BY source_row) END AS teaching_session_rank FROM checkins)`;
  if(groups.includes('class_slot') && !slotSources.has(source)) throw new Error('class_slot (class name · day · time) exists only for sessions, checkins and bookings.');
  // Hosted / partnership sessions are one-off events, not part of the regular timetable.
  if(args.exclude_hosted && source==='sessions') facts=`(SELECT * FROM sessions WHERE COALESCE(session_type,'Regular')<>'Hosted')`;
  if(source==='sessions') {
    if(ids.includes('draw_premium_pp')) throw new Error('Draw premium needs an independently scoped pooled slot baseline. Use the instructor performance workspace or a baseline query; do not estimate it.');
  }
  const groupSQL=groups.map(g=>g==='month' && source==='lapsed' ? 'SUBSTR(end_date,1,7) AS month' : g==='class_slot' ? `${classSlotSQL} AS class_slot` : `"${g}"`).join(',');
  const sql=`SELECT ${groupSQL ? groupSQL+', ' : ''}${metricSQL(ids,{today,rate})},COUNT(*) AS source_records FROM ${facts}${groups.length ? ' GROUP BY '+groups.map((_,i)=>i+1).join(',')+' ORDER BY '+groups.map((_,i)=>i+1).join(',') : ''}`;
  return {sql,filters,snapshot:!!snapshots.length,definitions:ids.map(id=>({id,label:metrics[id].label,expression:metrics[id].description,format:metrics[id].format}))};
}
