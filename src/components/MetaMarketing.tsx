import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { health } from "../data/duckdb";
import { metaScope } from "../data/marketing-channels";
import { ensureSource, sourceStates } from "../data/loader";
import { metaKPIs, metaColumns } from "../data/performance-marketing";
import { comparisonDates } from "../data/periods";
import { metricSQL } from "../semantics/metrics";
import { useStore } from "../state/store";
import { MetricCard } from "./MetricCard";
import { Register } from "./Register";
import type { TreeRow } from "./NestedTable";
import { MarketingTable, MarketingStatus, marketingDrill, marketingContext, useMarketingRows } from "./MarketingAnalytics";
import { MarketingRecords } from "./MarketingRecords";

export function MetaMarketing({ version, onDrill, selected, setSelected }: { version: string | number; onDrill: (entry: TreeRow) => void; selected: Record<string,string>; setSelected: Dispatch<SetStateAction<Record<string,string>>> }) {
  const filters = useStore(s=>s.filters);
  const compare = useStore(s=>s.compare);
  useEffect(()=>{ void ensureSource("meta"); },[]);
  const available = !!health.meta?.fetchedAt && health.meta.status!=="error";
  const sourceState = sourceStates.meta;
  const activeVersion = `${version}:${health.meta?.fetchedAt || "unavailable"}`;
  const prior = compare!=="none" && filters.from && filters.to ? comparisonDates(filters.from,filters.to,compare) : null;
  const scope = (dates = filters) => metaScope(dates.from,dates.to,selected);
  const currentScope = scope();
  const ctx = marketingContext();
  const sql = `SELECT 'current' AS bucket,${metricSQL(metaKPIs,ctx)},COUNT(*) AS n FROM meta${currentScope}${prior ? ` UNION ALL SELECT 'prior' AS bucket,${metricSQL(metaKPIs,ctx)},COUNT(*) AS n FROM meta${scope({...filters,...prior})}` : ""}`;
  const totals = useMarketingRows(sql,activeVersion,available);
  const trend = useMarketingRows(`SELECT date AS label,${metricSQL(metaKPIs,ctx)} FROM meta${currentScope} GROUP BY date ORDER BY date`,activeVersion,available);
  const choices = useMarketingRows("SELECT DISTINCT account_id,account_name,campaign_id,campaign_name,publisher_platform,objective FROM meta ORDER BY campaign_name",activeVersion,available);
  const options = useMemo(()=>{
    const result: Record<string,{value:string;label:string}[]> = {};
    for (const field of Object.keys(selected)) {
      const unique = new Map<string,string>();
      for(const row of choices.rows) if(row[field]!=null) unique.set(String(row[field]),String(row[field==="account_id"?"account_name":field==="campaign_id"?"campaign_name":field]??row[field]));
      result[field] = [...unique].map(([value,label])=>({value,label}));
    } return result;
  },[choices.rows]);
  const current = totals.rows.find(r=>r.bucket==="current");
  const previous = totals.rows.find(r=>r.bucket==="prior");
  return <div className="pm-meta" aria-label="Meta campaign analytics">
    <Register id="marketing-meta" index="20" title="Meta campaign performance" subtitle="Meta-reported outcomes · reporting dates follow the selected page period">
      <div className="pm-controls">
        {Object.entries({account_id:"Account",campaign_id:"Campaign",publisher_platform:"Platform",objective:"Objective"}).map(([field,label])=><label key={field}>{label} <select aria-label={`Meta ${label.toLowerCase()} filter`} value={selected[field]} onChange={e=>setSelected(v=>({...v,[field]:e.target.value}))}><option value="">All {label.toLowerCase()}s</option>{(options[field]||[]).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>)}
        <button className="button" onClick={()=>setSelected({account_id:"",campaign_id:"",publisher_platform:"",objective:""})}>Reset Meta filters</button>
        <button className="button" disabled={sourceState?.state==="loading"||sourceState?.state==="refreshing"} onClick={()=>void ensureSource("meta",true)}>Refresh Meta</button>
        <a className="button" href="https://docs.google.com/spreadsheets/d/1mfZQlccKdAVHzkP2eo_HpHK6lZe6Y0oQbtaVS9o6aeI/edit?gid=1995330774" target="_blank" rel="noreferrer">Open Meta sheet</a>
      </div>
      <p className="pm-note">Studio, instructor and Website source filters apply to CRM leads. Meta uses the account, campaign, platform and objective filters above; its sheet has no studio identity. Meta leads may overlap Website CRM leads and On-Facebook leads; these totals are kept separate.</p>
      {!available ? <div role={sourceState?.state==="error" ? "alert" : "status"}>{sourceState?.state==="error" ? "Meta source unavailable. Connect Google Sheets on the server, then retry the source." : "Loading the Meta source sheet…"}</div> : <>
        <p className="pm-note">Fetched {new Date(health.meta.fetchedAt!).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST · {health.meta.recordsCount.toLocaleString("en-IN")} source records · {health.meta.mode}{health.meta.mode==="Google Drive connector snapshot" ? " · Connect Google Sheets on the server to enable automatic refresh" : ""}{sourceState?.state==="refreshing" ? " · Updating" : ""}{sourceState?.state==="error" ? " · Refresh unavailable; showing the last successful snapshot" : ""}</p>
        <MarketingStatus loading={totals.loading} error={totals.error} empty={!Number(current?.n)}/>
        {!totals.loading && current && <div className="metric-strip eight pm-metric-grid">{metaKPIs.map(id=><MetricCard key={id} id={id} value={Number(current.n)>0?current[id]:null} previous={previous?.[id]} trend={trend.rows} n={Number(current.n)} compare={!!prior} onDrill={()=>onDrill(marketingDrill("meta",currentScope,`Meta · ${id.replaceAll('meta_','').replaceAll('_',' ')}`,[id]))}/>)}</div>}
      </>}
    </Register>
    {available && <>
      <Register index="21" title="Meta reporting trend" subtitle="Daily campaign activity in the selected reporting period"><MarketingTable title="Meta reporting trend" source="meta" scope={currentScope} initialGroups={["date"]} ids={metaColumns} version={activeVersion} onDrill={onDrill} showChart chronological/></Register>
      <Register index="22" title="Campaign and platform breakdown" subtitle="Expand campaigns into platforms; group further by date, objective, account, ad set or ad"><MarketingTable title="Meta campaigns" source="meta" scope={currentScope} initialGroups={["campaign","publisher_platform"]} ids={metaColumns} version={activeVersion} onDrill={onDrill} showChart/></Register>
      <Register index="23" title="Meta source records" subtitle="Campaign/platform reporting rows from the Meta tab, with exact IDs and recorded funnel outcomes"><MarketingRecords source="meta" scope={currentScope} version={activeVersion} onDrill={onDrill}/><p className="pm-note">CPL, CPC, CPM, cost per purchase and ROAS use summed numerators and denominators. Zero denominators are unavailable. Summed row reach includes repeat audiences across dates and platforms. The populated source currently provides campaign-level data; missing ad-set/ad fields remain unavailable.</p></Register>
    </>}
  </div>;
}
