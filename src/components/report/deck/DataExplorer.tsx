import { useEffect, useMemo, useState } from "react";
import { Database, Download, Loader2, Search, ChevronLeft, ChevronRight, Columns3, TriangleAlert } from "lucide-react";
import { DropdownField } from "../../ui/DropdownField";
import { exportCSV } from "../../exports";
import { formatField } from "../../../semantics/formats";
import type { Row } from "../../../data/duckdb";
import type { ReportModel } from "../../../report/model";
import type { ChapterSpec } from "../../../report/chapters";

const PAGE = 50;
const HIDDEN = /^(row_id|source_row|source_snapshot|.*token.*|email|phone)$/i;

/**
 * Live source records behind a chapter, for answering questions in the room.
 * Loads the source on demand; the frozen figures above are not recomputed from it.
 */
export function DataExplorer({ model, spec }: { model: ReportModel; spec: ChapterSpec }) {
  const [state, setState] = useState<{ loading: boolean; error?: string; rows: Row[] }>({ loading: true, rows: [] });
  const [search, setSearch] = useState(""), [page, setPage] = useState(0), [group, setGroup] = useState(""), [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    setState({ loading: true, rows: [] });
    void (async () => {
      try {
        const [{ ensureSource }, { query }, { where }, { scopeFilters }] = await Promise.all([import("../../../data/loader"), import("../../../data/duckdb"), import("../../../data/analytics"), import("../../../report/compute")]);
        await ensureSource(spec.source);
        const filters = spec.network ? { ...scopeFilters(model.scope), location: [] } : scopeFilters(model.scope);
        const rows = await query(`SELECT * FROM ${spec.source}${where(filters, spec.source, [])} LIMIT 5000`);
        if (!live) return;
        setState({ loading: false, rows });
        const keys = Object.keys(rows[0] ?? {}).filter(k => !HIDDEN.test(k) && rows.some(r => r[k] != null && r[k] !== ""));
        setColumns(keys.slice(0, 9));
      } catch (e) { if (live) setState({ loading: false, rows: [], error: (e as Error).message }); }
    })();
    return () => { live = false; };
  }, [spec.id, model.scope.studio, model.scope.month]);
  const available = useMemo(() => Object.keys(state.rows[0] ?? {}).filter(k => !HIDDEN.test(k) && state.rows.some(r => r[k] != null && r[k] !== "")), [state.rows]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = needle ? state.rows.filter(r => columns.some(c => String(r[c] ?? "").toLowerCase().includes(needle))) : state.rows;
    if (!sort) return rows;
    return [...rows].sort((a, b) => { const x = a[sort.key], y = b[sort.key]; const n = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? "")); return sort.desc ? -n : n; });
  }, [state.rows, search, columns, sort]);
  const grouped = useMemo(() => {
    if (!group) return [];
    const counts = new Map<string, number>();
    for (const r of filtered) counts.set(String(r[group] ?? "Unspecified"), (counts.get(String(r[group] ?? "Unspecified")) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [filtered, group]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => setPage(0), [search, sort, columns]);
  const peak = Math.max(1, ...grouped.map(g => g[1]));
  return <div className="deck-explorer">
    <div className="monthly-table-controls deck-explorer-controls">
      <span className="deck-explorer-title"><Database size={14}/>{spec.source} records · {model.scope.studio}{spec.network ? " (account level)" : ""} · {model.scope.month}</span>
      <label className="deck-search"><Search size={13}/><input type="search" placeholder="Search these records…" aria-label="Search records" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label><Columns3 size={12}/>Group<DropdownField aria-label="Group records by" value={group} onChange={e => setGroup(e.target.value)}><option value="">No grouping</option>{available.filter(k => typeof state.rows[0]?.[k] !== "number").map(k => <option key={k} value={k}>{k}</option>)}</DropdownField></label>
      <details className="deck-columns"><summary className="button">Columns · {columns.length}</summary><div>{available.map(k => <label key={k}><input type="checkbox" checked={columns.includes(k)} onChange={e => setColumns(c => e.target.checked ? [...c, k] : c.filter(x => x !== k))}/>{k}</label>)}</div></details>
      <button className="button" disabled={!filtered.length} onClick={() => exportCSV(`${spec.id}-${model.scope.month}-records`, filtered.map(r => Object.fromEntries(columns.map(c => [c, r[c]]))))}><Download size={12}/>CSV</button>
    </div>
    {state.loading && <p className="deck-loading" role="status"><Loader2 size={15} className="rb2-spin"/>Loading live source records…</p>}
    {state.error && <p className="notice" role="alert"><TriangleAlert size={13}/>Source records unavailable: {state.error}</p>}
    {!state.loading && !state.error && <>
      <p className="ranking-foot">{filtered.length.toLocaleString("en-IN")} of {state.rows.length.toLocaleString("en-IN")} records{state.rows.length === 5000 ? " (first 5,000)" : ""} · current source data; the report's figures are frozen at {new Date(model.builtAt).toLocaleDateString("en-IN")} and may differ if the sheet changed.</p>
      {!!grouped.length && <div className="deck-group-bars">{grouped.map(([name, count]) => <button type="button" key={name} onClick={() => setSearch(name)} title={`Filter to ${name}`}><span>{name}</span><i style={{ width: `${count / peak * 100}%` }}/><b>{count}</b></button>)}</div>}
      <div className="table-scroll monthly-table compact deck-explorer-table" tabIndex={0}>
        <table><thead><tr>{columns.map(c => <th key={c}><button className="deck-sort" aria-label={`Sort by ${c}`} onClick={() => setSort(s => s?.key === c ? { key: c, desc: !s.desc } : { key: c, desc: true })}>{c}{sort?.key === c ? (sort.desc ? " ↓" : " ↑") : ""}</button></th>)}</tr></thead>
          <tbody>{shown.map((r, i) => <tr key={i}>{columns.map(c => <td key={c}>{formatField(c, r[c])}</td>)}</tr>)}</tbody></table>
      </div>
      <div className="deck-pager"><button className="icon-button" aria-label="Previous page" disabled={!page} onClick={() => setPage(p => p - 1)}><ChevronLeft size={15}/></button><span>Page {page + 1} of {pages}</span><button className="icon-button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={15}/></button></div>
    </>}
  </div>;
}
