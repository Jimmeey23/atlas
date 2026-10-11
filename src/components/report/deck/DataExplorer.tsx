import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Columns3, Database, Download, Layers, Loader2, Search, TriangleAlert, X } from "lucide-react";
import { DropdownField } from "../../ui/DropdownField";
import { exportCSV } from "../../exports";
import { formatField } from "../../../semantics/formats";
import { groupLabel } from "../../../data/group-fields";
import type { Row } from "../../../data/duckdb";
import type { ReportModel } from "../../../report/model";
import type { ChapterSpec } from "../../../report/chapters";
import type { RecordSelection } from "./RecordDrilldown";
import { metricRecordFocus } from "../../../report/source-records";
import { monthLabel } from "../../../report/period";

const PAGE = 50, GROUP_ROWS = 25;
const HIDDEN = /(^__|^row_id$|^source_row$|^source_snapshot$|^raw_json$|_id$|^unique_id|token|email|phone)/i;

/** The columns each source's dashboard tab leads with, in reading order. Anything else stays one click away. */
const PRESETS: Record<string, string[]> = {
  sales: ["date", "member", "product", "category", "purchase_type", "payment_method", "revenue", "discount", "net", "discount_code", "units", "associate"],
  sessions: ["date", "day", "time", "format", "format_group", "trainer", "capacity", "booked", "checked_in", "late_cancelled", "complimentary_visits", "non_paid", "revenue"],
  recurring: ["day", "time", "format", "trainer", "sessions", "capacity", "booked", "checked_in", "empty", "revenue"],
  new: ["first_visit", "member", "entry_type", "source", "trainer", "format", "conversion", "retention", "first_purchase", "ltv", "visits_post", "conversion_days"],
  leads: ["date", "member", "source", "status", "stage", "associate", "trial_status", "conversion", "response_hours", "touches"],
  lapsed: ["member", "product", "start_date", "end_date", "status", "completed", "remaining", "session_limit", "days_absent", "last_visit", "churned_date"],
  bookings: ["date", "member", "format", "trainer", "product", "attended", "late_cancelled", "cancelled", "no_show"],
  checkins: ["date", "member", "format", "trainer", "product", "revenue"],
  payroll: ["trainer", "month", "sessions", "new_count", "converted", "retained", "revenue"],
  meta: ["date", "campaign_name", "adset_name", "objective", "spend", "impressions", "clicks", "meta_leads", "meta_purchases", "purchase_value"],
};
const SHORT: Record<string, string> = { counts_toward: "Counts toward measure", format_group: "Format", format: "Class", trainer: "Instructor", checked_in: "Checked in", late_cancelled: "Late cancels", complimentary_visits: "Comps", non_paid: "Non-paid" };
const title = (field: string) => SHORT[field] ?? groupLabel(field);
const isNumber = (rows: Row[], key: string) => rows.some(r => typeof r[key] === "number") && rows.every(r => r[key] == null || typeof r[key] === "number");

/**
 * Live source records behind a chapter, laid out like its dashboard tab: the
 * relevant columns first, totals on top, and collapsible groups with their own
 * subtotals. The frozen report figures are not recomputed from it.
 */
export function DataExplorer({ model, spec, selection }: { model: ReportModel; spec: ChapterSpec; selection?: RecordSelection }) {
  const [state, setState] = useState<{ loading: boolean; error?: string; rows: Row[]; truncated?: boolean }>({ loading: true, rows: [] });
  const [search, setSearch] = useState(""), [page, setPage] = useState(0), [group, setGroup] = useState(""), [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const [item, setItem] = useState<Row | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [open, setOpen] = useState<Record<string, number>>({});
  // A clicked figure narrows to the rows that make it up; the presenter can widen to every record.
  const [widen, setWiden] = useState(false);
  const focus = useMemo(() => widen ? null : metricRecordFocus(selection?.metric), [selection?.metric, widen]);
  useEffect(() => {
    let live = true;
    setState({ loading: true, rows: [] });
    void (async () => {
      try {
        const [{ ensureSource }, { query }, { recordGroupConstraint }, { scopeFilters, factsFor }] = await Promise.all([import("../../../data/loader"), import("../../../data/duckdb"), import("../../../report/source-records"), import("../../../report/compute")]);
        await ensureSource(spec.source);
        const filters = spec.network ? { ...scopeFilters(model.scope, selection?.month), location: [] } : scopeFilters(model.scope, selection?.month);
        const conditions = [recordGroupConstraint(selection?.table, selection?.group).replace(/^ WHERE /, ""), focus?.where ? `(${focus.where})` : ""].filter(Boolean);
        const counts = focus?.flag ? `,COALESCE((${focus.flag}),false) AS counts_toward` : "";
        const rows = await query(`SELECT *${counts} FROM ${factsFor(spec, filters)}${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""} LIMIT 5001`);
        const truncated = rows.length > 5000;
        if (truncated) rows.pop();
        if (!live) return;
        setState({ loading: false, rows, truncated });
        const keys = Object.keys(rows[0] ?? {}).filter(k => !HIDDEN.test(k) && rows.some(r => r[k] != null && r[k] !== ""));
        const lead = [...(focus?.flag ? ["counts_toward"] : []), ...(focus?.columns ?? [])].filter(k => keys.includes(k) || k === "counts_toward");
        const preset = [...new Set([...lead, ...(PRESETS[spec.source] ?? [])])].filter(k => keys.includes(k) || k === "counts_toward");
        // The tab's columns, topped up with the remaining populated fields so nothing important is missing.
        setColumns(preset.length >= 6 ? preset : [...preset, ...keys.filter(k => !preset.includes(k))].slice(0, 12));
        // Default grouping follows the chapter's first breakdown, unless the dialog is already scoped to a group.
        const first = spec.groups[0]?.field;
        setGroup(!selection && first && keys.includes(first) ? first : "");
      } catch (e) { if (live) setState({ loading: false, rows: [], error: (e as Error).message }); }
    })();
    return () => { live = false; };
  }, [spec.id, model.scope.studio, model.scope.month, selection, focus]);
  const available = useMemo(() => Object.keys(state.rows[0] ?? {}).filter(k => !HIDDEN.test(k) && state.rows.some(r => r[k] != null && r[k] !== "")), [state.rows]);
  const numeric = useMemo(() => columns.filter(c => isNumber(state.rows, c)), [columns, state.rows]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = needle ? state.rows.filter(r => columns.some(c => String(r[c] ?? "").toLowerCase().includes(needle))) : state.rows;
    if (!sort) return rows;
    return [...rows].sort((a, b) => { const x = a[sort.key], y = b[sort.key]; const n = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? "")); return sort.desc ? -n : n; });
  }, [state.rows, search, columns, sort]);
  const sum = (rows: Row[], c: string) => rows.reduce((s, r) => s + (typeof r[c] === "number" ? Number(r[c]) : 0), 0);
  const groups = useMemo(() => {
    if (!group) return [];
    const map = new Map<string, Row[]>();
    for (const r of filtered) { const k = String(r[group] ?? "Unspecified"); (map.get(k) ?? map.set(k, []).get(k)!).push(r); }
    return [...map].map(([name, rows]) => ({ name, rows })).sort((a, b) => sort && numeric.includes(sort.key) ? (sort.desc ? -1 : 1) * (sum(a.rows, sort.key) - sum(b.rows, sort.key)) : b.rows.length - a.rows.length);
  }, [filtered, group, sort, numeric]);
  const pages = Math.max(1, Math.ceil((group ? groups.length : filtered.length) / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = filtered.slice(at * PAGE, (at + 1) * PAGE);
  const shownGroups = groups.slice(at * PAGE, (at + 1) * PAGE);
  useEffect(() => { setPage(0); setOpen({}); }, [search, sort, columns, group]);
  const header = <tr><th className="dk-x-lead">{group ? title(group) : "Item"}</th>{columns.filter(c => c !== group).map(c => <th key={c} data-num={numeric.includes(c) || undefined}><button className="deck-sort" aria-label={`Sort by ${title(c)}`} onClick={() => setSort(s => s?.key === c ? { key: c, desc: !s.desc } : { key: c, desc: true })}>{title(c)}{sort?.key === c ? (sort.desc ? " ↓" : " ↑") : ""}</button></th>)}</tr>;
  const line = (r: Row, i: number) => <tr key={i}><td className="dk-x-lead"><button className="deck-group-drill" aria-label="View full source item" onClick={() => setItem(r)}>View ↗</button></td>
    {columns.filter(c => c !== group).map(c => <td key={c} data-num={numeric.includes(c) || undefined}>{formatField(c, r[c])}</td>)}</tr>;
  return <div className="deck-explorer dk-explorer">
    <div className="dk-x-toolbar">
      <span className="deck-explorer-title"><Database size={14}/>{spec.nav} source · {model.scope.studio}{spec.network ? " (account level)" : ""} · {selection?.month ?? model.scope.month}{selection?.group ? ` · ${selection.group}` : ""}</span>
      <label className="deck-search"><Search size={13}/><input type="search" placeholder="Search these records…" aria-label="Search records" value={search} onChange={e => setSearch(e.target.value)} />{search && <button type="button" className="icon-button" aria-label="Clear search" onClick={() => setSearch("")}><X size={12}/></button>}</label>
      <label className="dk-x-group"><Layers size={13}/>Group by<DropdownField aria-label="Group records by" value={group} onChange={e => setGroup(e.target.value)}><option value="">No grouping</option>{available.filter(k => !isNumber(state.rows, k)).map(k => <option key={k} value={k}>{title(k)}</option>)}</DropdownField></label>
      <details className="deck-columns"><summary className="button"><Columns3 size={12}/>Columns · {columns.length}</summary><div>
        <button type="button" className="button" onClick={() => setColumns(available)}>Show all {available.length}</button>
        {available.map(k => <label key={k}><input type="checkbox" checked={columns.includes(k)} onChange={e => setColumns(c => e.target.checked ? [...c, k] : c.filter(x => x !== k))}/>{title(k)}</label>)}</div></details>
      <button className="button" disabled={!filtered.length} onClick={() => exportCSV(`${spec.id}-${selection?.month ?? model.scope.month}-records`, filtered.map(r => Object.fromEntries(columns.map(c => [title(c), r[c]]))))}><Download size={12}/>CSV</button>
    </div>
    {selection && <div className="dk-x-context" role="status">
      <span>Showing</span>
      {selection.metric && <b>{focus ? (focus.rate ? `the records ${focus.label.toLowerCase()} is calculated over` : `the records that make up ${focus.label.toLowerCase()}`) : "every record"}</b>}
      {selection.group && <span className="dk-chip">{selection.group}</span>}
      <span className="dk-chip">{monthLabel(selection.month ?? model.scope.month)}</span>
      {focus?.flag && <small>Rows marked “yes” count toward the numerator.</small>}
      {selection.metric && metricRecordFocus(selection.metric)?.where != null && <button type="button" className="button" onClick={() => setWiden(w => !w)}>{widen ? `Back to ${metricRecordFocus(selection.metric)!.label.toLowerCase()} records` : "Show every record"}</button>}
    </div>}
    {state.loading && <p className="deck-loading" role="status"><Loader2 size={15} className="rb2-spin"/>Loading live source records…</p>}
    {state.error && <p className="notice" role="alert"><TriangleAlert size={13}/>Source records unavailable: {state.error}</p>}
    {!state.loading && !state.error && (!state.rows.length ? <p className="empty-state dk-x-empty">No source records match {selection?.group ? `“${selection.group}” in ` : ""}{selection?.month ?? model.scope.month}. The report's frozen figures may cover rows the live source no longer holds.</p> : <>
      <dl className="dk-x-summary">
        <div><dt>Records</dt><dd>{filtered.length.toLocaleString("en-IN")}<small>{state.truncated ? " of first 5,000" : filtered.length !== state.rows.length ? ` of ${state.rows.length.toLocaleString("en-IN")}` : ""}</small></dd></div>
        {group && <div><dt>{title(group)} groups</dt><dd>{groups.length.toLocaleString("en-IN")}</dd></div>}
        {numeric.slice(0, 4).map(c => <div key={c}><dt>{title(c)} · total</dt><dd>{formatField(c, sum(filtered, c))}</dd></div>)}
      </dl>
      {selection?.metric && <p className="ranking-foot">Source items for the selected period and group. Eligibility and rate denominators follow the report definition; these rows are not a recomputed metric total.</p>}
      {item && <section className="deck-item-detail" aria-label="Full source item"><header><h3>Source item · all fields</h3><button className="button" onClick={() => setItem(null)}>Close item details</button></header><dl>{available.map(field => <div key={field}><dt>{title(field)}</dt><dd>{formatField(field, item[field])}</dd></div>)}</dl></section>}
      <div className="table-scroll monthly-table compact deck-explorer-table dk-x-table" tabIndex={0}>
        <table><thead>{header}</thead>
          {group ? shownGroups.map(g => { const limit = open[g.name] ?? 0; return <tbody key={g.name} className="dk-x-group-body" data-open={!!limit}>
            <tr className="dk-x-group-row"><th className="dk-x-lead"><button type="button" aria-expanded={!!limit} onClick={() => setOpen(o => ({ ...o, [g.name]: o[g.name] ? 0 : GROUP_ROWS }))}><ChevronDown size={14}/><b>{g.name}</b><small>{g.rows.length.toLocaleString("en-IN")} {g.rows.length === 1 ? "record" : "records"} · {(g.rows.length / filtered.length * 100).toFixed(1)}%</small></button></th>
              {columns.filter(c => c !== group).map(c => <td key={c} data-num={numeric.includes(c) || undefined}>{numeric.includes(c) ? <><b>{formatField(c, sum(g.rows, c))}</b><small>avg {formatField(c, sum(g.rows, c) / g.rows.length)}</small></> : <small>{new Set(g.rows.map(r => r[c])).size} distinct</small>}</td>)}</tr>
            {!!limit && <>{g.rows.slice(0, limit).map(line)}{g.rows.length > limit && <tr className="dk-x-more"><td colSpan={columns.length + 1}><button type="button" className="button" onClick={() => setOpen(o => ({ ...o, [g.name]: limit + GROUP_ROWS }))}>Show {Math.min(GROUP_ROWS, g.rows.length - limit)} more of {g.rows.length - limit}</button></td></tr>}</>}
          </tbody>; }) : <tbody>{shown.map((r, i) => <Fragment key={i}>{line(r, i)}</Fragment>)}</tbody>}
          {numeric.length > 0 && <tfoot><tr><th className="dk-x-lead">Total</th>{columns.filter(c => c !== group).map(c => <td key={c} data-num={numeric.includes(c) || undefined}>{numeric.includes(c) ? formatField(c, sum(filtered, c)) : ""}</td>)}</tr></tfoot>}
        </table>
      </div>
      {pages > 1 && <div className="deck-pager"><button className="icon-button" aria-label="Previous page" disabled={!at} onClick={() => setPage(at - 1)}><ChevronLeft size={15}/></button><span>Page {at + 1} of {pages}</span><button className="icon-button" aria-label="Next page" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}><ChevronRight size={15}/></button></div>}
      <p className="ranking-foot">Current source data; the report's figures were frozen at {new Date(model.builtAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} and may differ if the sheet changed since.</p>
    </>)}
  </div>;
}
