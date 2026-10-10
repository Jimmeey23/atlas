import { useMemo } from "react";
import { health, quote, type Row } from "../data/duckdb";
import { where, context } from "../data/analytics";
import { metaScope } from "../data/marketing-channels";
import { marketingContributor, marketingDimension, marketingDimensionOptions } from "../data/performance-marketing";
import { useGroupFields } from "../data/group-registry";
import { GroupByPicker, usePersistentGroups } from "./ui/GroupByPicker";
import { metricSQL } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { useStore } from "../state/store";
import { MetricCard } from "./MetricCard";
import { Register } from "./Register";
import { exportCSV } from "./exports";
import type { TreeRow } from "./NestedTable";
import { MarketingChart, MarketingTable, MarketingStatus, marketingDrill, useMarketingRows } from "./MarketingAnalytics";

const columns = ["leads","crm_trials","crm_members","crm_win_rate","crm_retained"];
const channel = "acquisition_channel";
export function MarketingChannelComparison({ version, metaFilters, onDrill }: {version: string | number; metaFilters: Record<string,string>; onDrill: (entry: TreeRow) => void}) {
  const filters=useStore(s=>s.filters);
  const storeTransient=useStore(s=>s.transient);
  const transient=useMemo(()=>storeTransient.filter(t=>t.field!=="source"),[storeTransient]);
  const scope=where({...filters,source:[]},"leads",transient);
  const ctx=context({...filters,source:[]},transient);
  const platformScope=metaScope(filters.from,filters.to,metaFilters);
  const available=!!health.meta?.fetchedAt && health.meta.status!=="error";
  const [saved,setGroups]=usePersistentGroups("marketing:channel-comparison",[channel]);
  const registry=useGroupFields("leads",saved);
  const options=useMemo(()=>marketingDimensionOptions("leads",registry),[registry]);
  // Meta-reported leads only line up with the CRM "Meta" acquisition channel; other groupings compare CRM outcomes alone.
  const by=saved[0]&&marketingDimension("leads",saved[0]) ? saved[0] : channel;
  const byChannel=by===channel;
  const dimension=marketingDimension("leads",by)!;
  const expression=byChannel ? channel : dimension.sql;
  const channels=useMarketingRows(`SELECT ${expression} AS label,${metricSQL(columns,ctx)} FROM leads${scope} GROUP BY ${byChannel ? channel : "1"} ORDER BY leads DESC`,version);
  const totals=useMarketingRows(`SELECT ${metricSQL(["leads","crm_google_leads","crm_meta_leads"],ctx)},COUNT(*) AS n FROM leads${scope}`,version);
  const platform=useMarketingRows(`SELECT ${metricSQL(["meta_leads","meta_instant_leads","meta_spend"],ctx)},COUNT(*) AS n FROM meta${platformScope}`,`${version}:${health.meta?.fetchedAt||"none"}`,available);
  const row=totals.rows[0]; const meta=platform.rows[0];
  const comparisonRows=useMemo(()=>{
    if(!byChannel) return channels.rows;
    const result: Row[]=channels.rows.map(r=>({...r,meta_leads:r.label==="Meta"&&available?meta?.meta_leads??null:null}));
    for(const channel of ["Google","Meta"]) if(!result.some(r=>r.label===channel)) result.push({label:channel,leads:0,crm_trials:0,crm_members:0,crm_win_rate:null,crm_retained:0,meta_leads:channel==="Meta"&&available?meta?.meta_leads??null:null});
    return result;
  },[channels.rows,meta,available,byChannel]);
  function inspect(value: string, id="leads") {
    if(id==="meta_leads") onDrill(marketingDrill("meta",platformScope,"Meta-reported leads",[id],"meta_leads>0",""));
    else {
      const group=`${expression}=${quote(value)}`;
      onDrill(marketingDrill("leads",scope,`${value} · CRM leads`,[id],[group,marketingContributor(id)].filter(Boolean).join(" AND "),group));
    }
  }
  const tableIds=byChannel ? ["leads","meta_leads","crm_trials","crm_members","crm_win_rate","crm_retained"] : columns;
  return <Register id="marketing-channels" index="04" title="CRM acquisition channels vs Meta" subtitle="Same selected dates · all CRM sources, including Google, Meta and unassigned attribution">
    <MarketingStatus loading={channels.loading||totals.loading} error={channels.error||totals.error}/>
    {!totals.loading&&row&&<div className="metric-strip pm-metric-grid pm-comparison-cards">
      {["leads","crm_google_leads","crm_meta_leads"].map(id=><MetricCard id={id} key={id} value={row[id]} n={Number(row.n)} compare={false} onDrill={()=>onDrill(marketingDrill("leads",scope,`CRM channel comparison · ${id}`,[id],marketingContributor(id),""))}/>)}
      {["meta_leads","meta_instant_leads","meta_spend"].map(id=><MetricCard id={id} key={id} value={available?meta?.[id]:null} n={Number(meta?.n||0)} compare={false} onDrill={()=>inspect("Meta",id)}/>)}
    </div>}
    <p className="pm-note">Google and Meta use explicit UTM Source or Source Name tags. Platform tags do not establish paid acquisition. Website-only and unassigned tags remain separate. CRM uses active studio/class filters and creation dates; Meta uses its campaign/account controls and reporting dates. Without shared lead IDs and attribution windows, these counts do not establish a lead-capture gap.</p>
    {!available&&<p className="pm-note">Meta comparison is unavailable until the Meta source loads.</p>}
    {platform.error&&<p role="alert">Meta comparison unavailable: {platform.error}</p>}
    {!channels.loading&&(channels.rows.length>0||Number(meta?.n)>0)&&<>
      <div className="pm-controls"><GroupByPicker name="CRM vs Meta comparison" label="Compare CRM by" value={[by]} onChange={setGroups} fields={options} min={1} max={1} defaults={[channel]}/></div>
      {!byChannel&&<p className="pm-note">Meta-reported leads are matched only to the CRM acquisition channel, so they are omitted while grouping by {dimension.label.toLowerCase()}.</p>}
      <MarketingChart key={by} title={byChannel ? "CRM vs Meta lead counts" : `CRM outcomes by ${dimension.label}`} rows={comparisonRows} ids={byChannel ? ["leads","meta_leads"] : ["leads","crm_trials","crm_members"]} onInspect={(r,id)=>{if(r[id]!=null) inspect(String(r.label),id);}}/>
      <div className="pm-table table-scroll pm-channel-comparison"><table><thead><tr><th>{byChannel ? "Acquisition channel" : dimension.label}</th><th>CRM leads</th>{byChannel&&<th>Meta-reported leads</th>}<th>CRM completed trials</th><th>CRM converted leads</th><th>CRM win rate</th><th>CRM retained</th></tr></thead>
        <tbody>{comparisonRows.map(r=><tr key={String(r.label)}><td><button className="pm-cell" onClick={()=>inspect(String(r.label))}>{r.label}</button></td>{tableIds.map(id=><td key={id}><button className="pm-cell" disabled={r[id]==null} aria-label={`Inspect ${id} for ${r.label}`} onClick={()=>inspect(String(r.label),id)}>{id==="meta_leads"&&r.label!=="Meta" ? "Not in Meta sheet" : fmt(id,r[id])}</button></td>)}</tr>)}</tbody>
      </table></div>
      <div className="pm-controls pm-comparison-actions"><button className="button" onClick={()=>exportCSV("crm-vs-meta-channels",comparisonRows,`CRM creation dates / Meta reporting dates ${filters.from||'all time'} → ${filters.to||'all time'}; Meta filters ${JSON.stringify(metaFilters)}`)}>Export comparison</button></div>
      <details className="pm-comparison-detail secondary"><summary>Group and inspect CRM attribution</summary><MarketingTable title="CRM acquisition channels" source="leads" scope={scope} initialGroups={["acquisition_channel","source"]} ids={columns} version={version} onDrill={onDrill}/></details>
    </>}
  </Register>;
}
