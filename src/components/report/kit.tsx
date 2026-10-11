import {ChartNoAxesCombined,CalendarDays,CalendarRange,Lightbulb,GitCompareArrows} from "lucide-react";
import {AdaptiveGrid} from "./AdaptiveGrid";
import { DropdownField } from "../ui/DropdownField";
import { useRecordDrilldown } from "./deck/RecordDrilldown";
import { CompleteMetricGrid } from "./deck/CompleteMetricGrid";
import { useState } from "react";
import { exportCSV } from "../exports";
import { InstructorName } from "../InstructorAvatar";
import type { Row } from "../../data/duckdb";
import { definition } from "../../report/definitions";
import { reportFmt as fmt, reportDelta as delta } from "../../report/definitions";
import { currentSnapshotMetrics, metricNotes } from "../../semantics/evidence";
import type { ChapterData, ChapterNarrative, GroupTable } from "../../report/model";
import { chapters } from "../../report/chapters";
import type { Finding } from "../../report/findings";

const label = (id: string) => definition(id)?.label ?? id;

/** Up, down or flat, read against the metric's own direction of good. */
function tone(id: string, value: unknown, previous: unknown) {
  if (value == null || previous == null) return "r-flat";
  const change = Number(value) - Number(previous);
  if (!change) return "r-flat";
  return (change > 0) === (definition(id)?.higherIsBetter ?? true) ? "r-up" : "r-down";
}

export function SectionHeader({
  number,
  eyebrow,
  title,
  deck,
  id, topic, total,
}: {
  number: string;
  eyebrow: string;
  title: string;
  deck: string;
  id: string;
  topic?: string;
  total?: number;
}) {
  return (<>
    <header className="r-section-head" data-number={number}>
      <div className="r-section-topline"><span className="r-eyebrow">{number} · {topic || eyebrow}</span><span className="r-section-counter">{number === "A" ? "Supporting detail" : `Section ${number} / ${String(total ?? 14).padStart(2,'0')}`}</span></div>
      <div className="r-section-title"><h2 id={id}>{title}</h2><p>{deck}</p></div>
    </header>
  </>);
}

export function MetricCards({
  ids,
  total,
  prior,
  priorYear, history, definitions = false, data,
}: {
  ids: string[];
  total: Row;
  prior: Row;
  priorYear: Row;
  history?: Row[]; definitions?: boolean; data?: ChapterData;
}) {
  const shown = ids.filter((id) => definition(id) && total[id] != null).slice(0, 8);
  if (!shown.length) return null;
  return (
    <CompleteMetricGrid className="r-cards" items={shown} render={id => (
        <article className={`r-card ${tone(id,total[id],prior[id])}`} key={id}>
          <div className="r-card-label">{label(id)}{currentSnapshotMetrics.has(id) && <small className="r-comparison">Current snapshot at report build</small>}</div>
          <div className="r-card-value">{fmt(id, total[id])}</div>
          <div className="r-card-deltas">
            <span className={tone(id, total[id], prior[id])}>
              MoM <b>{delta(id, total[id], prior[id])}</b>
            </span>
            <span className={tone(id, total[id], priorYear[id])}>
              YoY <b>{delta(id, total[id], priorYear[id])}</b>
            </span>
          </div>
          {history && <Sparkline id={id} history={history} />}
          {data && <details className="r-metric-drilldown"><summary>Explore {label(id)} data</summary>
            <div className="r-table-wrap"><table className="r-table"><tbody><tr><th>Previous month</th><td>{fmt(id,prior[id])}</td></tr><tr><th>Same month last year</th><td>{fmt(id,priorYear[id])}</td></tr></tbody></table></div>
            {!!data.history.length && <MonthlyHistory data={data} ids={[id]} title={label(id)} initialPeriods={14}/>}
            {data.groups.filter(g => g.columns.includes(id)).map((g,i) => <GroupTableView key={`${g.id || g.field}-${i}`} table={{...g,columns:[id],compare:id}}/>)}
            <p className="r-note">{data.n.toLocaleString('en-IN')} contributing records. Stored aggregate data; unavailable values remain a dash.</p>
          </details>}
          {definitions && metricNotes[id]?.definition && (
            <p className="r-card-def" title={metricNotes[id].definition}>{definition(id)?.description}</p>
          )}
        </article>
      )}/>
  );
}

export function GroupTableView({ table }: { table: GroupTable }) {
  const drill = useRecordDrilldown();
  return (
    <div className="r-table-wrap">
      <div className="r-table-head">
        <h4>{table.title}</h4>
        <p>{table.deck} {table.minimum} {table.omitted ? `${table.omitted} other groups omitted from rankings; totals include all groups.` : ""}</p>
      </div>
      <table className="r-table">
        <thead>
          <tr>
            <th scope="col">{table.field.replaceAll("_", " ")}</th>
            {table.columns.map((id) => (
              <th scope="col" key={id}>
                {label(id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={String(row.g) + index}>
              <td>{row.rank_lane && <small className="r-rank">{String(row.rank_lane)}</small>}{drill ? <button className="deck-group-drill" onClick={() => drill({ table, group: String(row.g ?? "Unspecified") })}>{table.field === "trainer" ? <InstructorName name={String(row.g ?? "Unspecified")}/> : String(row.g ?? "Unspecified")}<span>Explore items ↗</span></button> : table.field === "trainer" ? <InstructorName name={String(row.g ?? "Unspecified")}/> : String(row.g ?? "Unspecified")}</td>
              {table.columns.map((id) => (
                <td
                  className="r-num"
                  key={id}
                >
                  {fmt(id, row[id])}
                  {id === table.compare && <small className="r-comparison">MoM {delta(id, row[id], table.prior?.[String(row.g)]?.[id])}<br />YoY {delta(id, row[id], table.priorYear?.[String(row.g)]?.[id])}</small>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {table.total && (
          <tfoot>
            <tr>
              <td>All {table.field.replaceAll("_", " ")}s</td>
              {table.columns.map((id) => (
                <td key={id}>{fmt(id, table.total![id])}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Independent axes preserve units and missing-month gaps. */
export function TrendChart({ history, ids, title, note }: { history: Row[]; ids: string[]; title: string; note: string }) {
  const shown = ids.filter(id => history.filter(row => row[id] != null && Number.isFinite(Number(row[id]))).length > 1).slice(0, 2);
  if (!shown.length) return null;
  return <figure className="r-figure"><h4>{title}</h4><p className="r-note">{note}</p>
    {shown.map(id => {
      const values = history.map(row => row[id] == null ? null : Number(row[id]));
      const peak = Math.max(...values.filter((v): v is number => v != null && Number.isFinite(v)), 0.01);
      const floor = Math.min(...values.filter((v): v is number => v != null && Number.isFinite(v)), 0);
      const x = (i: number) => 75 + i / Math.max(history.length - 1, 1) * 590;
      const y = (v: number) => 136 - (v - floor) / (peak - floor) * 105;
      let path = '';
      values.forEach((v, i) => { if (v != null && Number.isFinite(v)) path += `${i === 0 || values[i-1] == null ? 'M' : 'L'}${x(i)},${y(v)} `; });
      return <div className="r-small-chart" key={id}><b>{label(id)}</b><svg viewBox="0 0 690 165" role="img" aria-label={`${label(id)} monthly trend with actual units`}>
        {[floor, (peak + floor)/2, peak].map((v, i) => <g key={i}><line className="r-grid" x1="75" x2="665" y1={y(v)} y2={y(v)} /><text className="r-axis" x="68" y={y(v)+4} textAnchor="end">{fmt(id, v)}</text></g>)}
        <path d={path} fill="none" stroke="var(--r-primary-3)" strokeWidth="2.5" />
        {values.map((v,i) => v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="var(--r-primary-3)"><title>{`${String(history[i].month)}: ${fmt(id, v)}`}</title></circle>)}
        {history.map((row,i) => i % 3 === 0 || i === history.length-1 ? <text className="r-axis" key={i} x={x(i)} y="158" textAnchor="middle">{String(row.month).slice(2)}</text> : null)}
      </svg></div>;
    })}
  </figure>;
}

export function InsightPane({
  title,
  narrative, variant = "findings", hideHeadline = false, adaptive = true, confidence = true,
}: {
  title: string;
  narrative: ChapterNarrative | undefined;
  variant?: "findings" | "verdict" | "plan";
  hideHeadline?: boolean; adaptive?: boolean; confidence?: boolean;
}) {
  if (!narrative || (!narrative.summary && !narrative.cards.length)) return null;
  const unique = narrative.cards.filter((card,index,cards)=>cards.findIndex(c=>c.headline===card.headline)===index);
  return (
    <AdaptiveGrid className={`r-editorial r-editorial-${variant}`} enabled={adaptive}>
      {narrative.summary && <p className="r-summary">{narrative.summary}</p>}
      {unique.map((passage, index) => (
        <article className="r-passage" data-insight-layout={passage.layout ?? "comparison"} data-dense={passage.layout === "full" || variant === "verdict" || variant === "plan" || (passage.meaning?.length ?? 0)>600 ? "true" : "false"} key={index}>
          <header className="r-passage-lead">{variant === "plan" && <span className="r-plan-number">{String(index + 1).padStart(2, "0")}</span>}{passage.category && <span className="r-analysis-label"><ChartNoAxesCombined size={13}/>{{red_flag:"Red flag",worked:"What worked",didnt_work:"What didn’t work",meaning:"What this means",next_step:"Recommendation",plain_language:"Simply put"}[passage.category]}</span>}
          {!hideHeadline && <h3>{passage.headline}</h3>}</header>
          {passage.meaning && <p>{passage.meaning}</p>}
          {passage.evidence && <p className="r-citation"><strong>Evidence:</strong> {passage.evidence}</p>}
          {confidence && passage.confidence && <small className="r-confidence">Interpretation confidence: {passage.confidence}</small>}

          <div className="r-performance-context">
            {passage.monthContext && <section><h4><CalendarDays size={14}/>Month-on-month</h4><p>{passage.monthContext}</p></section>}
            {passage.yearContext && <section><h4><CalendarRange size={14}/>In the year</h4><p>{passage.yearContext}</p></section>}
          </div>
          {passage.reasoning && <div className="r-reasoning"><h4><GitCompareArrows size={14}/>What the evidence tells us</h4><p>{passage.reasoning}</p></div>}
          {variant === 'plan' && (passage.recommendation || passage.action) && <div className="r-recommendation"><h4><Lightbulb size={14}/>Recommendation & rationale</h4><p>{passage.recommendation || passage.action}</p></div>}

        </article>
      ))}
    </AdaptiveGrid>
  );
}

/** One metric on one scale. Exact trailing values remain in the history table. */
function Sparkline({id,history}:{id:string;history:Row[]}) {
  const values=history.map(row=>row[id]==null ? null : Number(row[id]));
  if(values.filter(v=>v!=null && Number.isFinite(v)).length<2)return null;
  const peak=Math.max(...values.filter((v):v is number=>v!=null&&Number.isFinite(v)),.01);
  const floor=Math.min(...values.filter((v):v is number=>v!=null&&Number.isFinite(v)),0);
  const x=(i:number)=>4+i/Math.max(values.length-1,1)*172;
  const y=(v:number)=>36-(v-floor)/(peak-floor)*30;
  let d=''; values.forEach((v,i)=>{if(v!=null&&Number.isFinite(v))d+=`${i===0||values[i-1]==null?'M':'L'}${x(i)},${y(v)} `;});
  return <svg className="r-sparkline" viewBox="0 0 180 40" role="img" aria-label={`${label(id)} over ${history.length} months; gaps are unavailable. Exact values in monthly history.`}><line x1="4" x2="176" y1="36" y2="36" stroke="var(--r-border)"/><path d={d} fill="none" stroke="var(--r-primary-3)" strokeWidth="2"/></svg>;
}

export function MonthlyHistory({data,ids,title,initialPeriods=12}:{data:ChapterData;ids:string[];title:string;initialPeriods?:number}) {
  const drill = useRecordDrilldown();
  const [periods,setPeriods]=useState(initialPeriods),[mode,setMode]=useState('values'),[metric,setMetric]=useState('all'),[newest,setNewest]=useState(true);
  const history=[...data.history].sort((a,b)=>String(a.month).localeCompare(String(b.month)));
  const visible=history.slice(-periods).map(row=>String(row.month));
  const ordered=newest?[...history].reverse():history;
  const previous=(month:string,offset:number)=>{const d=new Date(month+'-01T00:00:00Z');const key=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-offset,1)).toISOString().slice(0,7);return history.find(row=>row.month===key);};
  return <details className="r-mom-panel" data-report-history><summary><div><span className="r-eyebrow">Monthly comparison</span><h3>{title} — monthly comparison</h3><p>{data.history.length} available monthly observations · {ids.length} measures · source-backed values and comparisons</p></div><span className="r-mom-open">Show history <span aria-hidden="true">⌄</span></span></summary>
  <div className="r-history-controls">
    <label>Display<DropdownField data-history-control="mode" aria-label={`${title} monthly display`} value={mode} onChange={e=>setMode(e.target.value)}><option value="values">Values</option><option value="mom">MoM Δ</option><option value="yoy">YoY Δ</option></DropdownField></label>
    <label>Periods<DropdownField data-history-control="periods" aria-label={`${title} monthly periods`} value={periods} onChange={e=>setPeriods(Number(e.target.value))}>{[3,6,12,14].map(n=><option key={n} value={n}>{n} months</option>)}</DropdownField></label>
    <label>Measure<DropdownField data-history-control="metric" aria-label={`${title} monthly metric`} value={metric} onChange={e=>setMetric(e.target.value)}><option value="all">All measures</option>{ids.map(id=><option key={id} value={id}>{label(id)}</option>)}</DropdownField></label>
    <label>Order<DropdownField data-history-control="order" aria-label={`${title} monthly order`} value={newest?'newest':'oldest'} onChange={e=>setNewest(e.target.value==='newest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></DropdownField></label>
    <button data-history-export className="r-pill" onClick={()=>exportCSV('report-monthly-'+mode,ordered.filter(row=>visible.includes(String(row.month))).map(row=>({Month:row.month,...Object.fromEntries(ids.filter(id=>metric==='all'||id===metric).map(id=>[label(id),mode==='values'?fmt(id,row[id]):delta(id,row[id],previous(String(row.month),mode==='mom'?1:12)?.[id])]))})))}>CSV</button>
  </div>
  <div className="r-table-wrap"><table className="r-table r-history-table"><thead><tr><th>Month</th>{ids.map(id=><th data-history-metric={id} hidden={metric!=='all'&&metric!==id} key={id}>{label(id)}</th>)}</tr></thead><tbody>{ordered.map(row=><tr data-history-month={String(row.month)} hidden={!visible.includes(String(row.month))} key={String(row.month)}><th scope="row">{String(row.month)}</th>{ids.map(id=><td data-history-metric={id} hidden={metric!=='all'&&metric!==id} key={id}><span data-history-value="values" hidden={mode!=='values'}>{fmt(id,row[id])}</span><span data-history-value="mom" hidden={mode!=='mom'}>{delta(id,row[id],previous(String(row.month),1)?.[id])}</span><span data-history-value="yoy" hidden={mode!=='yoy'}>{delta(id,row[id],previous(String(row.month),12)?.[id])}</span>{drill && <button className="deck-month-drill" aria-label={`Explore ${label(id)} items for ${row.month}`} onClick={() => drill({ chapterId: data.id, month: String(row.month), metric: id })}>Explore items ↗</button>}</td>)}</tr>)}</tbody></table></div><p className="r-history-note">Missing values and comparison baselines remain unavailable. Rates change in percentage points.</p></details>;
}

export function RankingBoard({table,criterion}:{table:GroupTable;criterion:string}) {
  const sorted=[...table.rows].filter(row=>row[criterion]!=null).sort((a,b)=>Number(b[criterion])-Number(a[criterion]));
  const top=sorted.filter(row=>row.rank_lane==='Top'); const bottom=sorted.filter(row=>row.rank_lane==='Bottom').sort((a,b)=>Number(a[criterion])-Number(b[criterion]));
  const split=Math.ceil(sorted.length/2);
  const sides=[{label:'Top performers',rows:top.length?top:sorted.slice(0,split),kind:'top'},{label:'Bottom performers',rows:bottom.length?bottom:sorted.slice(split).reverse(),kind:'bottom'}];
  const peak=Math.max(...sorted.map(row=>Math.abs(Number(row[criterion]))),.01);
  return <div className="r-rank-board"><div className="r-table-head"><span className="r-eyebrow">Criterion ranking · {label(criterion)}</span><h4>{table.title}</h4><p>{table.minimum}. {table.omitted ? `${table.omitted} eligible entries between these extremes are omitted.` : 'Eligible entries are shown once, ordered from both ends.'} Comparisons describe the same group.</p></div><div className="r-rank-grid">{sides.map(side=><section className={`r-rank-side r-rank-${side.kind}`} key={side.kind}><header><b>{side.label}</b><span>{label(criterion)}</span></header>{side.rows.map((row,i)=><div className="r-rank-item" key={String(row.g)}><span className="r-rank-index">{String(i+1).padStart(2,'0')}</span><div className="r-rank-content"><strong>{table.field === "trainer" ? <InstructorName name={String(row.g)}/> : String(row.g)}</strong><div className="r-rank-stats">{table.columns.filter(id=>id!==criterion).map(id=><span key={id}>{label(id)} <b>{fmt(id,row[id])}</b></span>)}</div><div className="r-rank-track"><span style={{width:`${Math.abs(Number(row[criterion]))/peak*100}%`}}/></div></div><div className="r-rank-value"><b>{fmt(criterion,row[criterion])}</b><small>MoM {delta(criterion,row[criterion],table.prior?.[String(row.g)]?.[criterion])}<br/>YoY {delta(criterion,row[criterion],table.priorYear?.[String(row.g)]?.[criterion])}</small></div></div>)}</section>)}</div></div>;
}

const rupees = (value: number) => fmt("gross_revenue", Math.round(value));
const TONE_LABEL = { risk: "Risk", opportunity: "Opportunity", context: "Context" } as const;

/** Engine-computed findings: deterministic, checkable, and present even when no model answers. */
export function FindingList({ findings, title = "What the numbers flag" }: { findings: Finding[]; title?: string }) {
  if (!findings.length) return null;
  return <section className="r-flags" aria-label={title}>
    <header><span className="r-eyebrow">{title}</span><small>Computed from this snapshot · ranked by value at stake, then risk</small></header>
    <ol>{findings.map((f, i) => <li key={i} data-tone={f.tone}>
      <span className="r-flag-tone"><ChartNoAxesCombined size={14}/>{TONE_LABEL[f.tone]}</span>
      <p>{f.text}</p>
      {f.inr ? <b className="r-flag-value">≈{rupees(f.inr)}</b> : <span/>}
    </li>)}</ol>
  </section>;
}

/** The action plan's evidence base: every valued finding in the report, largest first. */
export function ValueLedger({ findings }: { findings: Finding[] }) {
  const valued = findings.filter((f) => f.inr).slice(0, 10);
  if (!valued.length) return null;
  const nav = (id: string) => chapters.find((c) => c.id === id)?.nav ?? id;
  return <div className="r-table-wrap r-ledger"><table className="r-table">
    <caption>Value at stake · indicative monthly values from engine findings. Items can overlap, so they are not additive.</caption>
    <thead><tr><th>Area</th><th>Finding</th><th>Type</th><th>≈ Monthly value</th></tr></thead>
    <tbody>{valued.map((f, i) => <tr key={i} data-tone={f.tone}><td>{nav(f.chapter)}</td><td>{f.text}</td><td>{TONE_LABEL[f.tone]}</td><td>{rupees(f.inr!)}</td></tr>)}</tbody>
  </table></div>;
}
