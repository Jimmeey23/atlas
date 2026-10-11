import { Fragment, type ReactNode } from "react";
import type { Row } from "../../../data/duckdb";
import { chapters } from "../../../report/chapters";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import { scenariosFor } from "../../../report/brief";
import { parseRef } from "../../../report/document";
import { monthLabel, monthShort, shiftMonth } from "../../../report/period";
import type { ChapterData, GroupTable, ReportModel } from "../../../report/model";
import { InstructorName } from "../../InstructorAvatar";
import { useRecordDrilldown } from "./RecordDrilldown";

const label = (id: string) => definition(id)?.label ?? id;
const num = (v: unknown) => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
export const tone = (id: string, value: unknown, prior: unknown) => num(value) == null || num(prior) == null || Number(value) === Number(prior) ? "flat" : (Number(value) > Number(prior)) === (definition(id)?.higherIsBetter ?? true) ? "up" : "down";
const groupKey = (g: GroupTable) => g.id ?? g.field;

/** Report prose: **bold** carries the claim a paragraph turns on, *italic* a stressed word. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return <>{parts.map((part, i) => part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong>
    : part.startsWith("*") && part.endsWith("*") && part.length > 2 ? <em key={i}>{part.slice(1, -1)}</em> : <Fragment key={i}>{part}</Fragment>)}</>;
}

const rowName = (table: GroupTable, row: Row) => {
  const name = String(row.g ?? "Unspecified");
  return table.field === "trainer" && !table.fields?.length ? <InstructorName name={name} /> : name;
};
const named = (highlight: string[]) => { const set = new Set(highlight.map(h => h.trim().toLowerCase())); return (row: Row) => set.has(String(row.g ?? "").trim().toLowerCase()); };

/** Horizontal bars for one measure of a breakdown, the rows the prose names drawn in the accent. */
function GroupBars({ table, chapterId, highlight }: { table: GroupTable; chapterId: string; highlight: string[] }) {
  const drill = useRecordDrilldown();
  const id = table.compare && table.columns.includes(table.compare) ? table.compare : table.columns[0];
  const isNamed = named(highlight);
  const rows = table.rows.filter(row => num(row[id]) != null).slice(0, 12);
  if (!rows.length) return <p className="cr-fine">No eligible rows for {label(id).toLowerCase()}.</p>;
  const peak = Math.max(...rows.map(row => Math.abs(Number(row[id]))), 1e-9);
  const negative = rows.some(row => Number(row[id]) < 0);
  return <div className="cr-bars" data-negative={negative}>
    {rows.map((row, i) => {
      const value = Number(row[id]);
      const prior = table.prior?.[String(row.g)]?.[id];
      return <button type="button" className="cr-bar" key={String(row.g) + i} data-named={isNamed(row)} onClick={() => drill?.({ chapterId, metric: id, table, group: String(row.g) })} title={`Open the records behind ${String(row.g)}`}>
        <span className="cr-bar-name">{rowName(table, row)}{row.rank_lane ? <small>{String(row.rank_lane)}</small> : null}</span>
        <span className="cr-bar-track"><span style={{ width: `${Math.max(1.5, Math.abs(value) / peak * (negative ? 50 : 100))}%`, ...(negative ? { left: value < 0 ? `${50 - Math.abs(value) / peak * 50}%` : "50%" } : {}) }} data-negative={value < 0} /></span>
        <span className="cr-bar-value">{fmt(id, value)}{prior != null && <small data-tone={tone(id, value, prior)}>{delta(id, value, prior)}</small>}</span>
      </button>;
    })}
    <div className="cr-bars-key">{label(id)}{table.prior ? " · change against the previous month" : ""}{table.total?.[id] != null ? ` · all groups ${fmt(id, table.total[id])}` : ""}</div>
  </div>;
}

/** Every row of a breakdown, with the comparison measure's month and year movement. */
function GroupTableFull({ table, chapterId, highlight, all = false }: { table: GroupTable; chapterId: string; highlight: string[]; all?: boolean }) {
  const drill = useRecordDrilldown();
  const isNamed = named(highlight);
  const c = table.compare;
  const rows = all && (table.eligible?.length ?? 0) > table.rows.length ? table.eligible! : table.rows;
  return <div className="cr-table-wrap"><table className="cr-table">
    <thead><tr><th>{(table.fields ?? [table.field]).map(f => f.replace(/_/g, " ")).join(" · ")}</th>{table.columns.map(id => <th key={id}>{label(id)}</th>)}{c && <><th>{label(c)} MoM</th><th>{label(c)} YoY</th></>}</tr></thead>
    <tbody>{rows.map((row, i) => <tr key={String(row.g) + i} data-named={isNamed(row)} onClick={() => drill?.({ chapterId, metric: c ?? table.columns[0], table, group: String(row.g) })}>
      <td>{rowName(table, row)}</td>
      {table.columns.map(id => <td key={id}>{fmt(id, row[id])}</td>)}
      {c && <><td data-tone={tone(c, row[c], table.prior?.[String(row.g)]?.[c])}>{delta(c, row[c], table.prior?.[String(row.g)]?.[c])}</td>
        <td data-tone={tone(c, row[c], table.priorYear?.[String(row.g)]?.[c])}>{delta(c, row[c], table.priorYear?.[String(row.g)]?.[c])}</td></>}
    </tr>)}</tbody>
    {table.total && <tfoot><tr><td>All groups</td>{table.columns.map(id => <td key={id}>{fmt(id, table.total![id])}</td>)}{c && <><td /><td /></>}</tr></tfoot>}
  </table></div>;
}

/** The rows that gained and lost the most against the previous month, centred on zero. */
function Movers({ table }: { table: GroupTable }) {
  const a = table.analysis;
  const metric = a?.metric;
  const items = [...(a?.gainers ?? []), ...(a?.decliners ?? [])].filter((m, i, all) => all.findIndex(x => x.g === m.g) === i).sort((x, y) => y.change - x.change);
  if (!metric || !items.length) return null;
  const peak = Math.max(...items.map(m => Math.abs(m.change)), 1e-9);
  return <div className="cr-bars" data-negative="true">
    {items.map(m => <div className="cr-bar" key={m.g}>
      <span className="cr-bar-name">{m.g}</span>
      <span className="cr-bar-track"><span style={{ width: `${Math.max(1.5, Math.abs(m.change) / peak * 50)}%`, left: m.change < 0 ? `${50 - Math.abs(m.change) / peak * 50}%` : "50%" }} data-negative={m.change < 0} /></span>
      <span className="cr-bar-value">{m.change > 0 ? "+" : ""}{fmt(metric, m.change)}<small>{fmt(metric, m.prior)} → {fmt(metric, m.current)}</small></span>
    </div>)}
    <div className="cr-bars-key">Change in {label(metric).toLowerCase()} against the previous month{a?.totalChange != null ? ` · all groups ${a.totalChange > 0 ? "+" : ""}${fmt(metric, a.totalChange)}` : ""}</div>
  </div>;
}

/** Fourteen months of one measure as a line, the selected month and the same month last year marked. */
function TrendLine({ id, data, month }: { id: string; data: ChapterData; month: string }) {
  const drill = useRecordDrilldown();
  const history = data.history.slice(-14);
  const values = history.map(row => num(row[id]));
  const finite = values.filter((v): v is number => v != null);
  if (finite.length < 2) return <p className="cr-fine">Too few months recorded to draw {label(id).toLowerCase()}.</p>;
  const W = 760, H = 230, L = 64, R = 24, T = 22, B = 30;
  const hi = Math.max(...finite), lo = Math.min(...finite, definition(id)?.format === "percent" ? 0 : Math.min(...finite));
  const floor = lo === hi ? lo * .9 : lo - (hi - lo) * .12, top = hi + (hi - floor) * .12 || 1;
  const x = (i: number) => L + i / Math.max(history.length - 1, 1) * (W - L - R);
  const y = (v: number) => T + (1 - (v - floor) / (top - floor || 1)) * (H - T - B);
  let d = "";
  values.forEach((v, i) => { if (v != null) d += `${i === 0 || values[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)} `; });
  const ly = shiftMonth(month, -12);
  const ticks = [floor + (top - floor) * .1, (floor + top) / 2, top - (top - floor) * .1];
  return <svg className="cr-line" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label(id)} by month`}>
    {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="cr-grid" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="cr-axis">{fmt(id, t)}</text></g>)}
    <path d={d} className="cr-line-path" />
    {values.map((v, i) => {
      if (v == null) return null;
      const m = String(history[i].month);
      const key = m === month ? "now" : m === ly ? "ly" : undefined;
      return <g key={m} className="cr-pt" data-key={key} onClick={() => drill?.({ chapterId: data.id, metric: id, month: m })}>
        <circle className="cr-hit" cx={x(i)} cy={y(v)} r={12} />
        <circle cx={x(i)} cy={y(v)} r={key ? 5 : 3} />
        {key && <text x={x(i)} y={y(v) - 10} textAnchor={i > history.length - 3 ? "end" : "middle"} className="cr-pt-label">{fmt(id, v)}</text>}
        <title>{monthLabel(m)}: {fmt(id, v)}</title>
      </g>;
    })}
    {history.map((row, i) => i % 2 === (history.length - 1) % 2 ? <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="cr-axis">{monthShort(String(row.month))}</text> : null)}
  </svg>;
}

function TrendTable({ id, data }: { id: string; data: ChapterData }) {
  const history = data.history.slice(-14);
  return <div className="cr-table-wrap"><table className="cr-table">
    <thead><tr><th>Month</th><th>{label(id)}</th><th>Against previous month</th></tr></thead>
    <tbody>{history.map((row, i) => <tr key={String(row.month)}><td>{monthLabel(String(row.month))}</td><td>{fmt(id, row[id])}</td>
      <td data-tone={i ? tone(id, row[id], history[i - 1][id]) : "flat"}>{i ? delta(id, row[id], history[i - 1][id]) : "—"}</td></tr>)}</tbody>
  </table></div>;
}

/** The month's headline measures against every comparison period. */
function KpiTable({ data, ids }: { data: ChapterData; ids: string[] }) {
  const drill = useRecordDrilldown();
  return <div className="cr-table-wrap"><table className="cr-table">
    <thead><tr><th>Measure</th><th>This month</th><th>Previous month</th><th>Same month last year</th><th>MoM</th><th>YoY</th><th>Year to date</th><th>YTD last year</th></tr></thead>
    <tbody>{ids.map(id => <tr key={id} onClick={() => drill?.({ chapterId: data.id, metric: id })}>
      <td>{label(id)}</td><td>{fmt(id, data.total[id])}</td><td>{fmt(id, data.prior[id])}</td><td>{fmt(id, data.priorYear[id])}</td>
      <td data-tone={tone(id, data.total[id], data.prior[id])}>{delta(id, data.total[id], data.prior[id])}</td>
      <td data-tone={tone(id, data.total[id], data.priorYear[id])}>{delta(id, data.total[id], data.priorYear[id])}</td>
      <td>{fmt(id, data.yearToDate?.[id])}</td><td>{fmt(id, data.priorYearToDate?.[id])}</td>
    </tr>)}</tbody>
  </table></div>;
}

function ScenarioTable({ model, chapterId }: { model: ReportModel; chapterId: string }) {
  const spec = chapters.find(c => c.id === chapterId), data = model.chapters[chapterId];
  const rows = spec && data ? scenariosFor(spec, data, model.scope.month) : [];
  if (!rows.length) return null;
  return <div className="cr-table-wrap"><table className="cr-table">
    <thead><tr><th>Measure</th><th>{monthLabel(model.scope.month)}</th><th>Flat</th><th>Last movement repeats</th><th>Three-month run rate</th><th>Last year's seasonality</th></tr></thead>
    <tbody>{rows.map(s => <tr key={s.id}><td>{label(s.id)}</td><td>{fmt(s.id, s.current)}</td><td>{fmt(s.id, s.flat)}</td><td>{fmt(s.id, s.repeat)}</td><td>{fmt(s.id, s.run)}</td><td>{fmt(s.id, s.seasonal)}</td></tr>)}</tbody>
  </table></div>;
}

/** Resolves an exhibit ref against the frozen figures. Unknown or empty refs draw nothing. */
export function exhibitBody(model: ReportModel, ref: string, view: "chart" | "table", highlight: string[] = [], all = false): ReactNode {
  const p = parseRef(ref);
  const data = p && model.chapters[p.chapter];
  if (!p || !data) return null;
  const spec = chapters.find(c => c.id === p.chapter);
  if (p.kind === "kpis") {
    const ids = (spec?.metrics ?? []).filter(id => definition(id) && data.total[id] != null);
    return ids.length ? <KpiTable data={data} ids={ids} /> : null;
  }
  if (p.kind === "trend" && p.key) return view === "table" ? <TrendTable id={p.key} data={data} /> : <TrendLine id={p.key} data={data} month={model.scope.month} />;
  if (p.kind === "scenarios") return <ScenarioTable model={model} chapterId={p.chapter} />;
  const table = data.groups.find(g => groupKey(g) === p.key);
  if (!table) return null;
  if (p.kind === "movers") return view === "table" ? <GroupTableFull table={table} chapterId={p.chapter} highlight={highlight} /> : <Movers table={table} />;
  return view === "table" ? <GroupTableFull table={table} chapterId={p.chapter} highlight={highlight} all={all} /> : <GroupBars table={table} chapterId={p.chapter} highlight={highlight} />;
}

/** One exhibit as the written reports print it: a captioned figure with a note on what to see. */
export function Exhibit({ model, target, view, caption, note, highlight }: { model: ReportModel; target: string; view: "chart" | "table"; caption: string; note: string; highlight: string[] }) {
  const body = exhibitBody(model, target, view, highlight);
  if (!body) return null;
  return <figure className="cr-fig" data-view={view} data-ref={target}>
    {caption && <figcaption>{caption}</figcaption>}
    {body}
    {note && <div className="cr-cnote"><Rich text={note} /></div>}
  </figure>;
}

/** The metric ids an exhibit rests on, for the section's drill-down. */
export function exhibitMetrics(model: ReportModel, ref: string): { table?: GroupTable; ids: string[]; chapter?: string } {
  const p = parseRef(ref);
  const data = p && model.chapters[p.chapter];
  if (!p || !data) return { ids: [] };
  if (p.kind === "trend" && p.key) return { ids: [p.key], chapter: p.chapter };
  const table = data.groups.find(g => groupKey(g) === p.key);
  if (table) return { table, ids: [table.compare ?? table.columns[0]], chapter: p.chapter };
  const spec = chapters.find(c => c.id === p.chapter);
  return { ids: (spec?.metrics ?? []).filter(id => data.total[id] != null).slice(0, 3), chapter: p.chapter };
}
