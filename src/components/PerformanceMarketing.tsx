import { useMemo, useState } from "react";
import { Globe2, UsersRound, Megaphone, ListFilter } from "lucide-react";
import { where, context, today } from "../data/analytics";
import { comparisonDates } from "../data/periods";
import { websiteScope, websitePredicate, websiteKPIs, websiteColumns, marketingContributor } from "../data/performance-marketing";
import { metricSQL, contributorPredicate } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { useStore, type Filters } from "../state/store";
import { Register } from "./Register";
import { MetricCard } from "./MetricCard";
import { WebsiteLeadPeriods } from "./WebsiteLeadPeriods";
import { MarketingTable, MarketingStatus, marketingDrill, useMarketingRows } from "./MarketingAnalytics";
import { MarketingRecords } from "./MarketingRecords";
import { MetaMarketing } from "./MetaMarketing";
import { MarketingChannelComparison } from "./MarketingChannelComparison";
import type { TreeRow } from "./NestedTable";
import "./PerformanceMarketing.css";

export function PerformanceMarketing({ version, onDrill }: { version: string | number; onDrill: (entry: TreeRow) => void }) {
  const [metaFilters,setMetaFilters] = useState<Record<string,string>>({account_id:"",campaign_id:"",publisher_platform:"",objective:""});
  const filters = useStore(s=>s.filters);
  const compare = useStore(s=>s.compare);
  const storeTransient = useStore(s=>s.transient);
  const transient = useMemo(()=>storeTransient.filter(t=>t.field!=="source"),[storeTransient]);
  const base = useMemo<Filters>(()=>({...filters,source:["Website"]}),[filters]);
  const scope = (f: Filters=base) => websiteScope(where({...f,source:[]},"leads",transient));
  const currentScope = scope();
  const ctx = context(base,transient);
  const prior = compare!=="none" && filters.from && filters.to ? comparisonDates(filters.from,filters.to,compare) : null;
  const totals = useMarketingRows(`SELECT 'current' AS bucket,${metricSQL(websiteKPIs,ctx)},COUNT(*) AS n FROM leads${currentScope}${prior ? ` UNION ALL SELECT 'prior' AS bucket,${metricSQL(websiteKPIs,context({...base,...prior},transient))},COUNT(*) AS n FROM leads${scope({...base,...prior})}` : ""}`,version);
  const current = totals.rows.find(r=>r.bucket==="current");
  const previous = totals.rows.find(r=>r.bucket==="prior");
  const now = new Date(today()+"T00:00:00Z");
  const historyScope = scope({...base,from:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-13,1)).toISOString().slice(0,10),to:today()});
  const trend = useMarketingRows(`SELECT month,${metricSQL(websiteKPIs,ctx)} FROM leads${historyScope} GROUP BY month ORDER BY month`,version);
  const steps = [
    { label:"Website leads",id:"leads" }, {label:"Followed-up leads",id:"website_contacted"},
    {label:"Completed trials",id:"website_trials"}, {label:"Converted leads",id:"website_members"}, {label:"Retained leads",id:"website_retained"},
  ];
  const funnel = useMarketingRows(`SELECT ${metricSQL(steps.map(s=>s.id),ctx)} FROM leads${currentScope}`,version);
  const outcomes = funnel.rows[0];
  function inspectMetric(id: string, label: string) {
    const contributor = marketingContributor(id)||contributorPredicate(id,ctx);
    const entry = marketingDrill("leads",currentScope,label,[id],contributor,"");
    entry.queryContext = ctx;
    onDrill(entry);
  }
  return <div className="pm-page">
    <nav className="pm-section-nav" aria-label="Performance marketing sections"><a href="#marketing-website"><Globe2 size={15}/>Website journeys</a><a href="#marketing-channels"><UsersRound size={15}/>Channel comparison</a><a href="#marketing-meta"><Megaphone size={15}/>Meta campaigns</a><a href="#marketing-details"><ListFilter size={15}/>Lead details</a></nav>
    <div className="pm-scope"><strong>CRM source = Website</strong><span>Lead creation date {filters.from||"all time"}{filters.to?` → ${filters.to}`:""}</span>{prior&&<span>Compared with {prior.from} → {prior.to}</span>}<span>Studio, signature experience and other CRM filters apply.</span></div>
    <Register id="marketing-website" index="01" title="Website lead performance" subtitle="Recorded outcomes for the Website lead creation-date cohort">
      <MarketingStatus loading={totals.loading} error={totals.error} empty={!Number(current?.n)}/>
      {!totals.loading && current && <div className="metric-strip eight pm-metric-grid" style={{ "--metric-cols": 5 } as React.CSSProperties}>{websiteKPIs.map(id=><MetricCard key={id} id={id} value={Number(current.n)>0?current[id]:null} previous={previous?.[id]} trend={trend.rows} n={Number(current.n)} compare={!!prior} onDrill={()=>inspectMetric(id,`Website · ${id.replaceAll('website_','').replaceAll('_',' ')}`)}/>)}</div>}
      <p className="pm-note">Trials use Trial Status “Trial Completed”; conversions use Conversion Status “Converted”; retention uses Retention Status “Retained”. These are the latest recorded outcomes, scoped by lead creation date. Card sparklines show the latest 14 months; cards use the selected period.</p>
    </Register>
    <Register index="03" title="Website lead journey" subtitle="Select an outcome to inspect the member records behind it">
      <MarketingStatus loading={funnel.loading} error={funnel.error} empty={!Number(outcomes?.leads)}/>
      {!funnel.loading&&Number(outcomes?.leads)>0&&<div className="pm-funnel">{steps.map(step=><button className="pm-funnel-step" key={step.id} onClick={()=>inspectMetric(step.id,`Website · ${step.label}`)}><span>{step.label}</span><span className="pm-funnel-bar"><i style={{width:`${Number(outcomes[step.id])/Number(outcomes.leads)*100}%`}}/></span><small>{fmt(step.id,outcomes[step.id])} · {(Number(outcomes[step.id])/Number(outcomes.leads)*100).toFixed(1)}% of leads</small></button>)}</div>}
      <p className="pm-note">Follow-ups and outcomes are independently recorded. Trial-to-member rates count conversions among completed trials.</p>
    </Register>
    <MarketingChannelComparison version={version} metaFilters={metaFilters} onDrill={onDrill}/>
    <MetaMarketing version={version} onDrill={onDrill} selected={metaFilters} setSelected={setMetaFilters}/>
    <Register index="08" title="Website monthly trend" subtitle="Latest 14 months by creation date · independent of the page period"><MarketingTable title="Website monthly trend" source="leads" scope={historyScope} initialGroups={["month"]} ids={websiteColumns} version={version} onDrill={onDrill} showChart chronological/></Register>
    <Register index="09" title="Website lead stages" subtitle="Current stages with recorded trial, conversion and retention outcomes"><MarketingTable title="Website lead stages" source="leads" scope={currentScope} initialGroups={["stage"]} ids={websiteColumns} version={version} onDrill={onDrill}/></Register>
    <Register index="10" title="Website campaign, studio and team breakdown" subtitle="Group by UTM campaign, studio, associate or any recorded outcome"><MarketingTable title="Website campaign breakdown" source="leads" scope={currentScope} initialGroups={["utm_campaign","location"]} ids={websiteColumns} version={version} onDrill={onDrill} showChart/><p className="pm-note">UTM campaign tags come from the Leads sheet. No campaign-level linkage to Meta is assumed without a shared campaign identifier. Untagged or expired attribution remains visible.</p></Register>
    <div className="pm-two">
      <Register index="11" title="Website follow-up cadence" subtitle="Recorded outcomes by logged follow-up count"><MarketingTable title="Website follow-up cadence" source="leads" scope={currentScope} initialGroups={["cadence"]} ids={websiteColumns} version={version} onDrill={onDrill}/></Register>
      <Register index="12" title="Website speed to first response" subtitle="Time from creation to the first logged follow-up"><MarketingTable title="Website response speed" source="leads" scope={currentScope} initialGroups={["speed"]} ids={websiteColumns} version={version} onDrill={onDrill}/></Register>
    </div>
    <Register id="marketing-details" index="13" title="Website lead details" subtitle="Search all matching community member records, group them or inspect original sheet rows"><MarketingRecords source="leads" scope={currentScope} version={version} onDrill={onDrill}/></Register>
    <WebsiteLeadPeriods version={version} onDrill={onDrill}/>
  </div>;
}
