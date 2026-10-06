import type { Row } from "../../data/duckdb";
import { definition } from "../../report/definitions";
import { reportFmt as fmt, reportDelta as delta } from "../../report/definitions";
import { currentSnapshotMetrics, metricNotes } from "../../semantics/evidence";
import type { ChapterNarrative, GroupTable } from "../../report/model";

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
  id,
}: {
  number: string;
  eyebrow: string;
  title: string;
  deck: string;
  id: string;
}) {
  return (
    <header className="r-section-head">
      <div className="r-section-number" aria-hidden="true">
        {number}
      </div>
      <div>
        <span className="r-eyebrow">{eyebrow}</span>
        <h2 id={id}>{title}</h2>
        <p>{deck}</p>
      </div>
    </header>
  );
}

export function MetricCards({
  ids,
  total,
  prior,
  priorYear,
}: {
  ids: string[];
  total: Row;
  prior: Row;
  priorYear: Row;
}) {
  const shown = ids.filter((id) => definition(id) && total[id] != null);
  if (!shown.length) return null;
  return (
    <div className="r-cards">
      {shown.map((id) => (
        <article className="r-card" key={id}>
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
