import type { Row } from "../../data/duckdb";
import { definition } from "../../report/definitions";
import { reportFmt as fmt, reportDelta as delta } from "../../report/definitions";
import { currentSnapshotMetrics, metricNotes } from "../../semantics/evidence";
import type { ChapterData, ChapterNarrative, GroupTable } from "../../report/model";

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
  id, topic, total, highlights,
}: {
  number: string;
  eyebrow: string;
  title: string;
  deck: string;
  id: string;
  topic?: string;
  total?: number;
  highlights?: {label: string; value: string}[];
}) {
  return (
    <header className="r-section-head" data-number={number}>
      <div className="r-section-topline"><span className="r-eyebrow">{number} · {topic || eyebrow}</span><span className="r-section-counter">Section {number} / {String(total ?? 14).padStart(2,'0')}</span></div>
      <div className="r-section-title"><h2 id={id}>{title}</h2><p>{deck}</p></div>
      {!!highlights?.length && <div className="r-highlight-band">{highlights.map(item => <span key={item.label}><strong>{item.value}</strong> {item.label}</span>)}</div>}
    </header>
  );
}

export function MetricCards({
  ids,
  total,
  prior,
  priorYear, history,
}: {
  ids: string[];
  total: Row;
  prior: Row;
  priorYear: Row;
  history?: Row[];
}) {
  const shown = ids.filter((id) => definition(id) && total[id] != null);
  if (!shown.length) return null;
  return (
    <div className="r-cards">
      {shown.map((id) => (
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
          {metricNotes[id]?.definition && (
            <p className="r-card-def">{metricNotes[id].definition}</p>
          )}
        </article>
      ))}
    </div>
  );
}

export function GroupTableView({ table }: { table: GroupTable }) {
  const lead = table.columns[0];
  const peak = Math.max(
    ...table.rows.map((row) => Math.abs(Number(row[lead] ?? 0))),
    0,
  );
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
              <td>{row.rank_lane && <small className="r-rank">{String(row.rank_lane)}</small>}{String(row.g ?? "Unspecified")}</td>
              {table.columns.map((id, column) => (
                <td
                  className={`r-num${column === 0 ? " r-bar-cell" : ""}`}
                  key={id}
                  style={
                    column === 0 && peak
                      ? ({ "--share": Math.abs(Number(row[id] ?? 0)) / peak } as React.CSSProperties)
                      : undefined
                  }
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
        {values.map((v,i) => v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="var(--r-primary-3)"><title>{String(history[i].month)}: {fmt(id,v)}</title></circle>)}
        {history.map((row,i) => i % 3 === 0 || i === history.length-1 ? <text className="r-axis" key={i} x={x(i)} y="158" textAnchor="middle">{String(row.month).slice(2)}</text> : null)}
      </svg></div>;
    })}
  </figure>;
}

export function InsightPane({
  title,
  narrative,
}: {
  title: string;
  narrative: ChapterNarrative | undefined;
}) {
  if (!narrative || (!narrative.summary && !narrative.cards.length)) return null;
  return (
    <div className="r-editorial" aria-label={title}>
      {narrative.summary && <p className="r-summary">{narrative.summary}</p>}
      {!narrative.generated && <p className="r-analysis-note">Data commentary · AI analysis unavailable{narrative.error ? `: ${narrative.error}` : ""}</p>}
      {narrative.cards.map((passage, index) => (
        <div className="r-passage" key={index}>
          <header className="r-passage-lead">{passage.category && <span className="r-analysis-label">{{red_flag:"Red flag",worked:"What worked",didnt_work:"What didn’t work",meaning:"What this means",next_step:"What to do next",plain_language:"Simply put"}[passage.category]}</span>}
          <h3>{passage.headline}</h3></header>
          {passage.meaning && <p>{passage.meaning}</p>}
          {passage.evidence && <p className="r-citation">{passage.evidence}</p>}
          {passage.plainLanguage && <p className="r-plain"><strong>Simply put:</strong> {passage.plainLanguage}</p>}
          {passage.action && <p className="r-action"><strong>Next step:</strong> {passage.action}</p>}
          {passage.confidence && <small className="r-confidence">Interpretation confidence: {passage.confidence}</small>}
        </div>
      ))}
    </div>
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

export function MonthlyHistory({data,ids,title}:{data:ChapterData;ids:string[];title:string}) {
  return <details className="r-mom-panel"><summary><div><span className="r-eyebrow">Monthly comparison</span><h3>{title} — month on month</h3><p>Fourteen months · {ids.length} measures · expand to inspect the figures</p></div><span className="r-mom-open">Show history <span aria-hidden="true">⌄</span></span></summary><div className="r-table-wrap"><table className="r-table"><thead><tr><th>Month</th>{ids.map(id=><th key={id}>{label(id)}</th>)}</tr></thead><tbody>{data.history.map((row,i)=><tr key={String(row.month)}><td>{String(row.month)}</td>{ids.map(id=><td key={id}>{fmt(id,row[id])}<small className="r-comparison">MoM {delta(id,row[id],data.history[i-1]?.[id])}</small></td>)}</tr>)}</tbody></table></div></details>;
}

export function RankingBoard({table,criterion}:{table:GroupTable;criterion:string}) {
  const sorted=[...table.rows].filter(row=>row[criterion]!=null).sort((a,b)=>Number(b[criterion])-Number(a[criterion]));
  const top=sorted.filter(row=>row.rank_lane==='Top'); const bottom=sorted.filter(row=>row.rank_lane==='Bottom').sort((a,b)=>Number(a[criterion])-Number(b[criterion]));
  const split=Math.ceil(sorted.length/2);
  const sides=[{label:'Top performers',rows:top.length?top:sorted.slice(0,split),kind:'top'},{label:'Bottom performers',rows:bottom.length?bottom:sorted.slice(split).reverse(),kind:'bottom'}];
  const peak=Math.max(...sorted.map(row=>Math.abs(Number(row[criterion]))),.01);
  return <div className="r-rank-board"><div className="r-table-head"><span className="r-eyebrow">Criterion ranking · {label(criterion)}</span><h4>{table.title}</h4><p>{table.minimum}. {table.omitted ? `${table.omitted} eligible entries between these extremes are omitted.` : 'Eligible entries are shown once, ordered from both ends.'} Comparisons describe the same group.</p></div><div className="r-rank-grid">{sides.map(side=><section className={`r-rank-side r-rank-${side.kind}`} key={side.kind}><header><b>{side.label}</b><span>{label(criterion)}</span></header>{side.rows.map((row,i)=><div className="r-rank-item" key={String(row.g)}><span className="r-rank-index">{String(i+1).padStart(2,'0')}</span><div className="r-rank-content"><strong>{String(row.g)}</strong><div className="r-rank-stats">{table.columns.filter(id=>id!==criterion).map(id=><span key={id}>{label(id)} <b>{fmt(id,row[id])}</b></span>)}</div><div className="r-rank-track"><span style={{width:`${Math.abs(Number(row[criterion]))/peak*100}%`}}/></div></div><div className="r-rank-value"><b>{fmt(criterion,row[criterion])}</b><small>MoM {delta(criterion,row[criterion],table.prior?.[String(row.g)]?.[criterion])}<br/>YoY {delta(criterion,row[criterion],table.priorYear?.[String(row.g)]?.[criterion])}</small></div></div>)}</section>)}</div></div>;
}
