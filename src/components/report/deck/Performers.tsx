import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Database, Medal, Minus, TrendingDown, TrendingUp, Info, Sparkles } from "lucide-react";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import { performerContext, rankPerformers, type Performer } from "../../../report/brief";
import type { GroupTable, ReportModel } from "../../../report/model";
import { useRecordDrilldown } from "./RecordDrilldown";

const label = (id: string) => definition(id)?.label ?? id;
const good = (id: string, value: number, prior: number | null) => prior == null || value === prior ? "flat" : (value > prior) === (definition(id)?.higherIsBetter ?? true) ? "up" : "down";

/** One breakdown per grouping: instructor tables that only re-rank the same rows collapse into one. */
export function distinctTables(groups: GroupTable[]) {
  const seen = new Set<string>();
  return groups.filter(g => { const key = (g.fields ?? [g.field]).join("+"); if (seen.has(key)) return false; seen.add(key); return true; });
}

function Row({ p, rank, metric, peak, table, lane, chapter }: { p: Performer; rank: number; metric: string; peak: number; table: GroupTable; lane: "top" | "bottom"; chapter: string }) {
  const [open, setOpen] = useState(false);
  const drill = useRecordDrilldown();
  const t = good(metric, p.value, p.prior);
  const Arrow = t === "flat" ? Minus : p.prior != null && p.value > p.prior ? ArrowUpRight : ArrowDownRight;
  return <li className="dk-perf-row" data-open={open}>
    <div className="dk-perf-main">
      <span className="dk-perf-rank">{rank}</span>
      <button type="button" className="dk-perf-name" aria-expanded={open} onClick={() => setOpen(o => !o)} title="Show every measure for this row">
        <b>{p.g}</b>
        <span className="dk-perf-bar" data-lane={lane}><i style={{ width: `${Math.max(3, Math.abs(p.value) / (peak || 1) * 100)}%` }}/></span>
      </button>
      <strong>{fmt(metric, p.value)}</strong>
      <span className="dk-perf-delta" data-tone={t} title="Change against the previous month">{p.prior != null ? <><Arrow size={12}/>{delta(metric, p.value, p.prior)}</> : "new"}</span>
      {p.n > 0 && p.n < 5 && <span className="dk-perf-thin" title={`${p.n} records — read as a signal, not a verdict`}>n={p.n}</span>}
      <span className="dk-perf-actions">
        <button type="button" className="icon-button" aria-label={`Show details for ${p.g}`} onClick={() => setOpen(o => !o)}><ChevronDown size={14}/></button>
        {drill && <button type="button" className="icon-button" aria-label={`Open source records for ${p.g}`} title="Source records" onClick={() => drill({ chapterId: chapter, table, group: p.g, metric })}><Database size={14}/></button>}
      </span>
    </div>
    {open && <dl className="dk-perf-detail">{table.columns.map(c => {
      const value = p.row[c], prior = table.prior?.[p.g]?.[c], ly = table.priorYear?.[p.g]?.[c], all = table.total?.[c];
      return <div key={c}><dt>{label(c)}</dt><dd><strong>{fmt(c, value)}</strong>
        <small>{prior != null ? `${delta(c, value, prior)} MoM` : "no prior month"}{ly != null ? ` · ${delta(c, value, ly)} YoY` : ""}{all != null ? ` · all ${fmt(c, all)}` : ""}</small></dd></div>;
    })}{p.n > 0 && <div><dt>Records</dt><dd><strong>{p.n.toLocaleString("en-IN")}</strong>{p.share != null && <small>{(p.share * 100).toFixed(1)}% of total</small>}</dd></div>}</dl>}
  </li>;
}

/** Who is carrying the month and who is not, on the criterion the room picks. */
export function Performers({ model, chapter }: { model: ReportModel; chapter: string }) {
  const tables = useMemo(() => distinctTables(model.chapters[chapter]?.groups ?? []), [model, chapter]);
  const [which, setWhich] = useState(0);
  const table = tables[Math.min(which, tables.length - 1)];
  const [criterion, setCriterion] = useState<string>("");
  const [count, setCount] = useState(5);
  const metric = table && (table.columns.includes(criterion) ? criterion : table.compare && table.columns.includes(table.compare) ? table.compare : table.columns[0]);
  const ranked = useMemo(() => table && metric ? rankPerformers(table, metric) : [], [table, metric]);
  const ai = model.narratives[chapter]?.performers;
  if (!table || !metric) return <p className="empty-state">No ranked breakdowns were stored for this chapter.</p>;
  const n = Math.min(count, Math.ceil(ranked.length / 2));
  const top = ranked.slice(0, n), bottom = ranked.length > n ? ranked.slice(-n).reverse() : [];
  const peak = Math.max(...ranked.map(p => Math.abs(p.value)), 0);
  const context = performerContext(table, metric, top, bottom, ranked);
  return <section className="dk-performers" aria-label="Leaders and laggards">
    <div className="dk-perf-controls">
      {tables.length > 1 && <div className="dk-perf-tables" role="tablist" aria-label="Breakdown">{tables.map((t, i) => <button key={t.id ?? t.field} role="tab" aria-selected={t === table} onClick={() => { setWhich(i); setCriterion(""); }}>{t.title}</button>)}</div>}
      <div className="dk-perf-filters">
        <div className="dk-criteria" role="group" aria-label="Rank by"><span>Rank by</span>{table.columns.map(c => <button key={c} type="button" aria-pressed={c === metric} onClick={() => setCriterion(c)}>{label(c)}</button>)}</div>
        <div className="segmented" role="group" aria-label="Rows per list">{[3, 5, 10].map(k => <button key={k} className={count === k ? "active" : ""} aria-pressed={count === k} onClick={() => setCount(k)}>Top {k}</button>)}</div>
      </div>
    </div>
    <div className="dk-perf-lanes">
      <div className="dk-lane" data-lane="top">
        <header><TrendingUp size={15}/><h4>Leading on {label(metric).toLowerCase()}</h4></header>
        {ai?.leaders && <p className="dk-lane-note"><Sparkles size={12}/>{ai.leaders}</p>}
        <ol>{top.map((p, i) => <Row key={p.g} p={p} rank={i + 1} metric={metric} peak={peak} table={table} lane="top" chapter={chapter} />)}</ol>
      </div>
      {!!bottom.length && <div className="dk-lane" data-lane="bottom">
        <header><TrendingDown size={15}/><h4>Trailing on {label(metric).toLowerCase()}</h4></header>
        {ai?.laggards && <p className="dk-lane-note"><Sparkles size={12}/>{ai.laggards}</p>}
        <ol>{bottom.map((p, i) => <Row key={p.g} p={p} rank={ranked.length - i} metric={metric} peak={peak} table={table} lane="bottom" chapter={chapter} />)}</ol>
      </div>}
    </div>
    <aside className="dk-perf-context">
      <header><Medal size={14}/><b>Reading the ranking</b></header>
      {ai?.pattern && <p className="dk-perf-pattern">{ai.pattern}</p>}
      <ul>{context.map((line, i) => <li key={i}>{line}</li>)}</ul>
      <small><Info size={12}/>{table.minimum}. {table.omitted ? `${table.omitted} eligible rows outside the stored list. ` : ""}Rankings describe the month; they do not establish cause.</small>
    </aside>
  </section>;
}
