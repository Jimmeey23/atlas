import type { Row } from "../../data/duckdb";
import { metrics } from "../../semantics/metrics";
import { fmt, delta } from "../../semantics/formats";
import { metricNotes } from "../../semantics/evidence";
import type { ChapterNarrative, GroupTable } from "../../report/model";

const label = (id: string) => metrics[id]?.label ?? id;

/** Up, down or flat, read against the metric's own direction of good. */
function tone(id: string, value: unknown, previous: unknown) {
  if (value == null || previous == null) return "r-flat";
  const change = Number(value) - Number(previous);
  if (!change) return "r-flat";
  return (change > 0) === (metrics[id]?.higherIsBetter ?? true) ? "r-up" : "r-down";
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
  const shown = ids.filter((id) => metrics[id] && total[id] != null);
  if (!shown.length) return null;
  return (
    <div className="r-cards">
      {shown.map((id) => (
        <article className="r-card" key={id}>
          <div className="r-card-label">{label(id)}</div>
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
        <p>{table.deck}</p>
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
              <td>{String(row.g ?? "Unspecified")}</td>
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

const SERIES_COLOURS = ["var(--r-primary-3)", "var(--r-accent)", "var(--r-good)", "var(--r-warn)"];

/**
 * Trailing-months line chart, drawn as inline SVG so an exported report keeps
 * its charts with no script and no chart library behind it. Each series is
 * indexed to its own range, so measures on different scales share one frame;
 * the readable values stay in the appendix table beneath.
 */
export function TrendChart({
  history,
  ids,
  title,
  note,
}: {
  history: Row[];
  ids: string[];
  title: string;
  note: string;
}) {
  const series = ids
    .map((id) => ({
      id,
      points: history.map((row) => (row[id] == null ? null : Number(row[id]))),
    }))
    .filter((s) => s.points.filter((v) => v != null && Number.isFinite(v)).length > 1);
  if (series.length < 1 || history.length < 2) return null;
  const width = 1000;
  const height = 260;
  const pad = { left: 16, right: 16, top: 16, bottom: 28 };
  const x = (index: number) =>
    pad.left + (index / (history.length - 1)) * (width - pad.left - pad.right);
  return (
    <figure className="r-figure" style={{ margin: "0 0 22px" }}>
      <h4>{title}</h4>
      <p className="r-note">{note}</p>
      <svg
        className="r-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={title}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((step) => (
          <line
            key={step}
            className="r-grid"
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + step * (height - pad.top - pad.bottom)}
            y2={pad.top + step * (height - pad.top - pad.bottom)}
          />
        ))}
        {series.map((s, index) => {
          const values = s.points.filter((v): v is number => v != null && Number.isFinite(v));
          const min = Math.min(...values);
          const max = Math.max(...values);
          const y = (value: number) =>
            max === min
              ? (pad.top + height - pad.bottom) / 2
              : height - pad.bottom - ((value - min) / (max - min)) * (height - pad.top - pad.bottom);
          // Missing months stay gaps rather than implying continuous evidence.
          const segments: { index: number; value: number }[][] = [];
          s.points.forEach((value, i) => {
            if (value == null || !Number.isFinite(value)) return;
            if (!segments.length || s.points[i - 1] == null) segments.push([]);
            segments.at(-1)!.push({ index: i, value });
          });
          return (
            <g key={s.id}>
              {segments.map((segment) => (
                <polyline
                  key={segment[0].index}
                  points={segment.map((p) => `${x(p.index)},${y(p.value)}`).join(" ")}
                  fill="none"
                  stroke={SERIES_COLOURS[index % SERIES_COLOURS.length]}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          );
        })}
        {history.map((row, index) =>
          index % Math.ceil(history.length / 7) === 0 ? (
            <text
              key={String(row.month)}
              className="r-axis"
              x={x(index)}
              y={height - 8}
              textAnchor="middle"
            >
              {String(row.month ?? "").slice(2)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="r-legend">
        {series.map((s, index) => (
          <span key={s.id}>
            <i style={{ background: SERIES_COLOURS[index % SERIES_COLOURS.length] }} />
            {label(s.id)}
          </span>
        ))}
      </div>
    </figure>
  );
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
          <h3>{passage.headline}</h3>
          {passage.meaning && <p>{passage.meaning}</p>}
          {passage.evidence && <p className="r-citation">{passage.evidence}</p>}
          {passage.action && <p>{passage.action}</p>}
        </div>
      ))}
    </div>
  );
}
