import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Download, Search, Table2 } from "lucide-react";
import { exportCSV } from "../../exports";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import type { GroupTable, ReportModel } from "../../../report/model";
import { distinctTables } from "./Performers";
import { useRecordDrilldown } from "./RecordDrilldown";

const label = (id: string) => definition(id)?.label ?? id;
const tone = (id: string, value: unknown, prior: unknown) => value == null || prior == null || Number(value) === Number(prior) ? "" : (Number(value) > Number(prior)) === (definition(id)?.higherIsBetter ?? true) ? "up" : "down";

/** One breakdown as the working table: every stored row, sortable, with its comparisons and totals. */
function KeyTable({ table, chapter, open: initial }: { table: GroupTable; chapter: string; open: boolean }) {
  const drill = useRecordDrilldown();
  const [open, setOpen] = useState(initial);
  const [search, setSearch] = useState("");
  const compare = table.compare && table.columns.includes(table.compare) ? table.compare : table.columns[0];
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: compare, desc: definition(compare)?.higherIsBetter ?? true });
  const source = table.eligible?.length ? table.eligible : table.rows;
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = needle ? source.filter(r => String(r.g).toLowerCase().includes(needle)) : source;
    const value = (r: typeof list[number]) => sort.key === "g" ? String(r.g) : sort.key === "mom" ? (table.prior?.[String(r.g)]?.[compare] == null ? null : Number(r[compare]) - Number(table.prior[String(r.g)][compare])) : r[sort.key] == null ? null : Number(r[sort.key]);
    return [...list].sort((a, b) => {
      const x = value(a), y = value(b);
      if (x == null) return 1; if (y == null) return -1;
      const n = typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y);
      return sort.desc ? -n : n;
    });
  }, [source, search, sort, table, compare]);
  const head = (key: string, text: string) => <th key={key} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined}>
    <button type="button" onClick={() => setSort(s => ({ key, desc: s.key === key ? !s.desc : true }))}>{text}{sort.key === key && (sort.desc ? <ArrowDown size={11}/> : <ArrowUp size={11}/>)}</button></th>;
  const total = table.total;
  return <section className="dk-table" data-open={open}>
    <header>
      <button type="button" className="dk-table-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Table2 size={15}/><span><b>{table.title}</b><small>{source.length} rows · ranked on {label(compare).toLowerCase()} · {table.minimum}</small></span><ChevronDown size={16} className="dk-chevron"/>
      </button>
      {open && <div className="dk-table-tools">
        <label className="deck-search"><Search size={13}/><input type="search" aria-label={`Search ${table.title}`} placeholder="Find a row…" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <button type="button" className="button" onClick={() => exportCSV(`${chapter}-${table.id ?? table.field}`, rows.map(r => ({ Group: r.g, ...Object.fromEntries(table.columns.map(c => [label(c), fmt(c, r[c])])), Records: r.n })))}><Download size={12}/>CSV</button>
      </div>}
    </header>
    {open && <div className="dk-table-scroll" tabIndex={0}><table>
      <thead><tr>{head("g", "Group")}{table.columns.map(c => head(c, label(c)))}{head("mom", `${label(compare)} MoM`)}<th>YoY</th>{head("n", "Records")}</tr></thead>
      <tbody>{rows.map(r => {
        const g = String(r.g), prior = table.prior?.[g]?.[compare], ly = table.priorYear?.[g]?.[compare];
        return <tr key={g}>
          <th scope="row">{drill ? <button type="button" className="dk-row-drill" title="Open source records" onClick={() => drill({ chapterId: chapter, table, group: g, metric: compare })}>{g}</button> : g}</th>
          {table.columns.map(c => <td key={c} data-lead={c === compare || undefined}>{fmt(c, r[c])}</td>)}
          <td data-tone={tone(compare, r[compare], prior)}>{prior == null ? "—" : delta(compare, r[compare], prior)}</td>
          <td data-tone={tone(compare, r[compare], ly)}>{ly == null ? "—" : delta(compare, r[compare], ly)}</td>
          <td className="dk-muted-cell">{Number(r.n ?? 0).toLocaleString("en-IN")}</td>
        </tr>;
      })}</tbody>
      {total && <tfoot><tr><th scope="row">All groups</th>{table.columns.map(c => <td key={c}>{fmt(c, total[c])}</td>)}<td/><td/><td>{Number(total.n ?? 0).toLocaleString("en-IN")}</td></tr></tfoot>}
    </table></div>}
    {open && !!table.diagnostics?.length && <p className="dk-table-note">{table.diagnostics[0]}</p>}
  </section>;
}

export function KeyTables({ model, chapter }: { model: ReportModel; chapter: string }) {
  const tables = distinctTables(model.chapters[chapter]?.groups ?? []);
  if (!tables.length) return <p className="empty-state">No tables were stored for this chapter.</p>;
  return <div className="dk-tables">{tables.map((t, i) => <KeyTable key={t.id ?? t.field} table={t} chapter={chapter} open={i < 2} />)}</div>;
}
