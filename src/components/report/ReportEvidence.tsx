import { InstructorName } from "../InstructorAvatar";
import { useState, type ReactNode } from 'react';
import type { Row } from '../../data/duckdb';
import type { ChapterNarrative, GroupTable } from '../../report/model';
import { definition, reportFmt as fmt, reportDelta as delta } from '../../report/definitions';
import { GroupTableView, InsightPane, TrendChart } from './kit';

const label = (id: string) => definition(id)?.label ?? id;

/** Native markup also works in the standalone HTML through the export's small switch handler. */
export function ReportSwitch({ label: title, views, initial }: {
  label: string; views: { id: string; label: string; content: ReactNode }[]; initial?: string;
}) {
  const [active, setActive] = useState(initial ?? views[0]?.id);
  if (!views.length) return null;
  return <div data-switch-root="" className="r-switch-view">
    <div className="r-switch-toolbar"><span className="r-control-label">{title}</span><div className="r-switches" role="group" aria-label={title}>
      {views.map(view => <button type="button" key={view.id} data-view-control={view.id} aria-pressed={active === view.id} onClick={() => setActive(view.id)}>{view.label}</button>)}
    </div></div>
    {views.map(view => <div key={view.id} data-view-panel={view.id} hidden={active !== view.id}>{view.content}</div>)}
  </div>;
}

function ComparisonBars({ table, metric }: { table: GroupTable; metric: string }) {
  const [comparison, setComparison] = useState('mom');
  const rows = table.rows.filter(row => row[metric] != null && Number.isFinite(Number(row[metric])));
  const displayed = rows.some(row=>row.rank_lane) ? [...rows.filter(row=>row.rank_lane === "Top").slice(0,3), ...rows.filter(row=>row.rank_lane === "Bottom").slice(0,3)] : rows.slice(0,6);
  const diverging = rows.some(row=>Number(row[metric])<0);
  const rate = definition(metric)?.format === "percent";
  const peak = rate ? Math.max(1,...rows.map(row=>Math.abs(Number(row[metric])))) : Math.max(...rows.map(row => Math.abs(Number(row[metric]))), .01);
  return <div className="r-bar-chart">
    <div className="r-bar-axis"><b>{label(metric)}{rate && !diverging && <small> · scale 0–{fmt(metric,peak)}</small>}{diverging && <small> · centred on zero</small>}</b><div className="r-switches" role="group" aria-label="Comparison period">
      {['mom', 'yoy'].map(period => <button type="button" key={period} data-comparison-control={period} aria-pressed={comparison === period} onClick={() => setComparison(period)}>{period === 'mom' ? 'MoM' : 'YoY'}</button>)}
    </div></div>
    {!rows.length && <p className="r-empty">No eligible observations for this metric.</p>}
    {displayed.map((row, i) => <div className="r-bar-row" key={String(row.g) + i}>
      <div className="r-bar-caption"><strong>{table.field === 'trainer' ? <InstructorName name={String(row.g ?? 'Unspecified')}/> : String(row.g ?? 'Unspecified')}{row.rank_lane && <small className="r-rank">{String(row.rank_lane)}</small>}</strong><span>{fmt(metric, row[metric])}</span></div>
      <div className={`r-bar-track${diverging ? " r-diverging" : ""}`}><span className={Number(row[metric])<0 ? "r-negative" : ""} style={{ width: `${Math.abs(Number(row[metric])) / peak * (diverging ? 50 : 100)}%`, ...(diverging ? {left:`${Number(row[metric])<0 ? 50-Math.abs(Number(row[metric]))/peak*50 : 50}%`} : {}) }} /></div>
      <small className="r-bar-comparison" data-current={String(row[metric])} data-metric={metric}>
        <span data-comparison-panel="mom" hidden={comparison !== 'mom'}>MoM {delta(metric, row[metric], table.prior?.[String(row.g)]?.[metric])}</span>
        <span data-comparison-panel="yoy" hidden={comparison !== 'yoy'}>YoY {delta(metric, row[metric], table.priorYear?.[String(row.g)]?.[metric])}</span>
      </small>
    </div>)}
    <p className="r-note">{displayed.length} of {rows.length} eligible groups shown; select Detail for all stored rows{table.omitted ? `; ${table.omitted} omitted from the source ranking` : ''}. {table.minimum}. Bars show actual values; changes compare the same group. {definition(metric)?.format === 'percent' ? 'Rate changes use percentage points.' : ''}</p>
    {table.total?.[metric] != null && <p className="r-rollup">All eligible groups <strong>{fmt(metric, table.total[metric])}</strong></p>}
  </div>;
}

export function EvidenceBlock({ table, narrative, metric, full = false, initialView }: { table: GroupTable; narrative?: ChapterNarrative; metric?: string; full?: boolean; initialView?: 'chart' | 'table' }) {
  const primary = metric ?? table.compare ?? table.columns[0];
  const dense = table.columns.length > 5;
  return <article className={`r-evidence-block${dense || full ? ' r-span-full' : ''}`}>
    <header className="r-block-head"><span className="r-eyebrow">Evidence / {table.fields?.length ? 'Combination' : 'Breakdown'}</span><h3>{table.title}</h3></header>
    <ReportSwitch label="View" initial={initialView ?? (dense ? 'table' : 'chart')} views={[
      {id:'chart',label:'Chart',content:<ReportSwitch label="Measure" initial={primary} views={table.columns.map(id => ({id,label:label(id),content:<ComparisonBars table={table} metric={id}/>}))}/>},
      {id:'table',label:'Detail',content:<GroupTableView table={table}/>},
    ]}/>
    <InsightPane title={`${table.title} interpretation`} narrative={narrative}/>
  </article>;
}

/** Criteria share one slot instead of repeating identical scorecards three times. */
export function CriterionEvidence({ tables, narrative }: { tables: GroupTable[]; narrative?: ChapterNarrative }) {
  return <div className="r-span-full r-criterion-block"><ReportSwitch label="Ranking criterion · source-limited eligible samples" views={tables.map(table => ({
    id:table.id ?? table.field,label:label(table.compare ?? table.columns[0]),
    content:<EvidenceBlock table={table} metric={table.compare} narrative={narrative ? {...narrative,summary:'',cards:narrative.cards.filter(card=>card.focus === (table.id ?? table.field)).slice(0,1)} : undefined}/>,
  }))}/></div>;
}

export function TrendEvidence({ history, ids, title, narrative }: {history:Row[];ids:string[];title:string;narrative?:ChapterNarrative}) {
  const usable = ids.filter(id => history.filter(row=>row[id]!=null).length>1);
  if (!usable.length) return null;
  return <div className="r-trend-module"><ReportSwitch label="Trend measure" views={usable.map(id=>({id,label:label(id),content:<TrendChart history={history} ids={[id]} title={title} note="Fourteen monthly observations · actual units · gaps indicate unavailable data."/>}))}/><InsightPane title="Trend interpretation" narrative={narrative}/></div>;
}
