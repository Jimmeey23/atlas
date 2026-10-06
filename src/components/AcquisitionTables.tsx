import { InstructorName } from "./InstructorAvatar";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, ChevronDown, ChevronRight, CircleHelp, GraduationCap, Handshake, Route, TrendingUp, Users } from "lucide-react";
import { query, quote, type Row, health } from "../data/duckdb";
import { where, today } from "../data/analytics";
import { acquisitionAggregate, instructorAcquisitionAggregate, acquisitionFactsSQL, acquisitionMeasures, acquisitionMonths, acquisitionPeriodLabel, acquisitionDimensions, acquisitionYoYMonths, acquisitionPivotSQL, type AcquisitionDimension, priorMonth } from "../data/acquisition";
import { useStore } from "../state/store";
import { historicalFilters, historicalTransient } from "../data/periods";
import { fmt } from "../semantics/formats";
import { AcquisitionTableShell } from "./AcquisitionTableShell";
import { AcquisitionClientTypes } from "./AcquisitionClientTypes";
import { AcquisitionDrillDown } from "./AcquisitionDrillDown";
import { AcquisitionReferenceTables } from "./AcquisitionReferenceTables";
import type { AcquisitionDrillRequest } from "../data/acquisition-reference";
type Drill = (request: AcquisitionDrillRequest) => void;

// These controls change presentation only; source-backed cohort definitions are shared.
type Measure = typeof acquisitionMeasures[number];
type Sort = { key: string; desc: boolean };
const tableOptions = [
  { key: "types", label: "By client type", description: "Cohort summary", icon: Users },
  { key: "mom", label: "Month on month", description: "Entry-type cohorts", icon: CalendarDays },
  { key: "yoy", label: "Year on year", description: "Same-month comparisons", icon: TrendingUp },
  { key: "hosted", label: "Hosted classes", description: "Partnership experiences", icon: Handshake },
  { key: "memberships", label: "Memberships", description: "Converted first purchases", icon: Route },
  { key: "purchases", label: "New client purchases", description: "Membership mix", icon: Route },
  { key: "trainers", label: "Instructor performance", description: "First-visit outcomes", icon: GraduationCap },
  { key: "journeys", label: "Purchase journeys", description: "Converted members", icon: Route },
] as const;
function MetricTabs({ value, onChange, includeAll = false }: { value: string; onChange: (key: string) => void; includeAll?: boolean }) {
  return <div className="acq-metric-tabs" aria-label="Choose table metric">
    {includeAll && <button aria-pressed={value === "all"} onClick={() => onChange("all")}>All metrics</button>}
    {acquisitionMeasures.map(m => <button key={m[0]} aria-pressed={value === m[0]} onClick={() => onChange(m[0])}>{m[1]}</button>)}
  </div>;
}
function valueText(measure: Measure, value: unknown) {
  if (value == null) return "—";
  if (measure[2] === "decimal") return Number(value).toFixed(1);
  return fmt(measure[2] === "currency" ? "avg_ltv" : measure[2] === "percent" ? "conversion_rate" : measure[2] === "days" ? "avg_conversion_span" : "new_clients", value);
}
function changeText(measure: Measure, current: unknown, previous: unknown) {
  if (current == null || previous == null) return "—";
  const c = Number(current), p = Number(previous);
  if (measure[2] === "percent") return `${c >= p ? "+" : ""}${((c - p) * 100).toFixed(1)}pp`;
  return p === 0 ? "—" : `${c >= p ? "+" : ""}${((c / p - 1) * 100).toFixed(1)}%`;
}
function deltaClass(measure: Measure, current: unknown, previous: unknown) {
  if (current == null || previous == null || (Number(previous) === 0 && measure[2] !== "percent")) return "acq-missing";
  const difference = Number(current) - Number(previous);
  if (!difference) return "acq-delta flat";
  const better = measure[2] === "days" ? difference < 0 : difference > 0;
  return `acq-delta ${better ? "up" : "down"}`;
}
function sortedRows(rows: Row[], sort: Sort) {
  return [...rows].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key];
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    const diff = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sort.desc ? -diff : diff;
  });
}
function SortHeading({ label, name, sort, onSort, className }: { label: string; name: string; sort: Sort; onSort: (key: string) => void; className?: string }) {
  const active = sort.key === name;
  return <th className={className} scope="col" aria-sort={active ? sort.desc ? "descending" : "ascending" : "none"}>
    <button onClick={() => onSort(name)}>{label}{active ? sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} /> : <ArrowUpDown size={12} />}</button>
  </th>;
}
function OutcomeBadge({ value }: { value: unknown }) {
  if (value == null) return <span className="acq-missing">—</span>;
  return <span className={`acq-badge ${value === "Retained" || value === "Converted" ? "positive" : "neutral"}`}>{String(value)}</span>;
}
function DefinitionNote() {
  return <details className="acq-definition"><summary><CircleHelp size={14} />Metric definitions & coverage</summary>
    <p>Cohort tables count source records; instructor outcomes count distinct identified members. Conversion is the source Conversion Status alone. Rates use new-client denominators. Outcomes reflect the latest source status. Same-month outcomes require an eligible conversion purchase on or after the first visit in that same calendar month and year. Retained also requires the source Retained status. These outcomes do not require 30 elapsed days; missing purchase dates stay unavailable.</p>
    <p>Spend and LTV use source-reported values per cohort record. Total LTV sums cohort records; members can appear in multiple cohorts. Totals recompute from source records rather than averaging group rates. These are not historical cash collections. Rate changes use percentage points.</p>
  </details>;
}
export function ValueSelection({ options, selected, onChange, label }: { options: string[]; selected: string[] | null; onChange: (values: string[] | null) => void; label: string }) {
  const [search, setSearch] = useState("");
  const available = options.filter(value => value.toLowerCase().includes(search.toLowerCase()));
  const picked = selected ?? options;
  return <details className="acq-value-selection"><summary>{label}<span>{selected == null ? "All" : `${picked.length} selected`}</span><ChevronDown size={13} /></summary>
    <div className="acq-value-menu"><input aria-label={`Search ${label}`} placeholder="Find a value…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="acq-value-actions"><button onClick={() => onChange(null)}>Select all</button><button onClick={() => onChange([])}>Clear selection</button></div>
      <div className="acq-value-options">{available.map(value => <label key={value}><input type="checkbox" checked={picked.includes(value)} onChange={e => onChange(e.target.checked ? [...picked, value] : picked.filter(v => v !== value))} /><span>{value}</span></label>)}{!available.length && <span>No matching values</span>}</div>
    </div>
  </details>;
}
function CohortComparison({ mode, version, onDrill }: { mode: "mom" | "yoy"; version: number; onDrill: Drill }) {
  const filters = useStore(s => s.filters), transient = useStore(s => s.transient);
  const [group, setGroup] = useState<AcquisitionDimension>("entry");
  const [childGroup, setChildGroup] = useState<AcquisitionDimension>("membership");
  const [selectedValues, setSelectedValues] = useState<string[] | null>(null);
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<string>("cohort_rows");
  const [display, setDisplay] = useState("values");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>({ key: "parent", desc: false });
  const child = group === childGroup ? acquisitionDimensions.find(d => d.key !== group)!.key : childGroup;
  const groupLabel = acquisitionDimensions.find(d => d.key === group)!.label;
  const childLabel = acquisitionDimensions.find(d => d.key === child)!.label;
  const months = mode === "mom" ? acquisitionMonths(today()).reverse() : acquisitionYoYMonths(today());
  const monthGroups = mode === "yoy" ? [...new Set(months.map(month => month.slice(5)))].map(key => ({ key, label: acquisitionPeriodLabel(months.find(month => month.slice(5) === key)).split(" - ")[0], size: months.filter(month => month.slice(5) === key).length })) : [];
  const measure = acquisitionMeasures.find(m => m[0] === metric)!;
  const historyScope = where(historicalFilters(filters, today()), "new", historicalTransient(transient));
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const scope = historyScope;
    Promise.all([query(acquisitionPivotSQL(scope, today(), group, child)), query(acquisitionPivotSQL(scope, today(), group, child, selectedValues))])
      .then(([all, selected]) => { if (active) { setAllRows(all); setRows(selected); setLoading(false); } })
      .catch(e => { if (active) { setError(String(e)); setLoading(false); } });
    return () => { active = false; };
  }, [historyScope, version, group, child, selectedValues]);
  const values = useMemo(() => [...new Set(allRows.filter(r => !r.is_total && r.is_parent).map(r => String(r.parent)))].sort(), [allRows]);
  const parentRows = useMemo(() => rows.filter(r => r.is_parent && !r.is_total), [rows]);
  const lookup = useMemo(() => new Map(rows.map(r => [JSON.stringify([r.is_total ? null : r.parent, r.is_parent ? null : r.child, r.month]), r])), [rows]);
  const parents = [...new Set(parentRows.map(r => String(r.parent)))].filter(value => value.toLowerCase().includes(search.toLowerCase()));
  const visible = sortedRows(parents.map(parent => ({ parent, ...Object.fromEntries(months.map(month => [month, lookup.get(JSON.stringify([parent, null, month]))?.[metric] ?? null])) })), sort);
  const children = useMemo(() => {
    const map = new Map<string, Set<string>>();
    rows.filter(r => !r.is_parent && !r.is_total && months.includes(String(r.month))).forEach(r => { const parent = String(r.parent); if (!map.has(parent)) map.set(parent, new Set()); map.get(parent)!.add(String(r.child)); });
    return map;
  }, [rows, mode]);
  function onSort(key: string) { setSort(s => ({ key, desc: s.key === key ? !s.desc : key !== "parent" })); }
  function toggle(value: string) { setExpanded(current => current.includes(value) ? current.filter(x => x !== value) : [...current, value]); }
  function drillCell(parent: string | null, childValue: string | null, month: string) {
    const scope = historyScope;
    const parentSQL = acquisitionDimensions.find(d => d.key === group)!.sql;
    const childSQL = acquisitionDimensions.find(d => d.key === child)!.sql;
    const parts = [`month=${quote(month)}`];
    if (parent != null) parts.push(`${parentSQL}=${quote(parent)}`);
    else if (selectedValues != null) parts.push(selectedValues.length ? `${parentSQL} IN (${selectedValues.map(quote).join(",")})` : "FALSE");
    if (childValue != null) parts.push(`${childSQL}=${quote(childValue)}`);
    onDrill({ title: `${parent ?? "Selected values"}${childValue != null ? " · " + childValue : ""} · ${acquisitionPeriodLabel(month)}`, scope, predicate: parts.join(" AND "), metric });
  }
  function cell(parent: string | null, childValue: string | null, month: string) {
    const current = lookup.get(JSON.stringify([parent, childValue, month]))?.[metric];
    const priorKey = priorMonth(month, mode === "mom" ? 1 : 12);
    const previous = lookup.get(JSON.stringify([parent, childValue, priorKey]))?.[metric];
    return <td key={month} data-period={month} title={`${acquisitionPeriodLabel(month)}: ${valueText(measure, current)} · ${acquisitionPeriodLabel(priorKey)}: ${valueText(measure, previous)}`}>
      <button className="acq-cell-button" aria-label={`Inspect ${measure[1]} for ${parent ?? "selected values"}${childValue ? " · " + childValue : ""} · ${acquisitionPeriodLabel(month)}`} onClick={() => drillCell(parent, childValue, month)}><span className={display === "change" ? deltaClass(measure, current, previous) : current == null ? "acq-missing" : "acq-value"}>{display === "values" ? valueText(measure, current) : changeText(measure, current, previous)}</span></button>
    </td>;
  }
  return <AcquisitionTableShell title={mode === "mom" ? "Acquisition cohorts · MoM" : "Acquisition cohorts · YoY"} icon={mode === "mom" ? CalendarDays : TrendingUp} count={visible.length}
    description={mode === "mom" ? "14 completed first-visit months, newest first. Other global filters apply." : "Same months across years together, newest year first in each month group. Other global filters apply."} onSearch={setSearch} searchLabel={`Search ${mode.toUpperCase()} first-column values`}
    actions={<>
      <label className="acq-control">First column<select aria-label={`${mode.toUpperCase()} first column`} value={group} onChange={e => { setGroup(e.target.value as AcquisitionDimension); setSelectedValues(null); setExpanded([]); }}>{acquisitionDimensions.map(d => <option value={d.key} key={d.key}>{d.label}</option>)}</select></label>
      <ValueSelection options={values} selected={selectedValues} onChange={setSelectedValues} label={`${mode.toUpperCase()} first-column values`} />
      <label className="acq-control">Child rows<select aria-label={`${mode.toUpperCase()} child rows`} value={child} onChange={e => setChildGroup(e.target.value as AcquisitionDimension)}>{acquisitionDimensions.filter(d => d.key !== group).map(d => <option value={d.key} key={d.key}>{d.label}</option>)}</select></label>
      <div className="acq-segmented" aria-label="Comparison display">{["values", "change"].map(d => <button key={d} aria-pressed={d === display} onClick={() => setDisplay(d)}>{d === "values" ? "Values" : mode === "mom" ? "MoM Δ" : "YoY Δ"}</button>)}</div>
    </>}
    metricBar={<MetricTabs value={metric} onChange={setMetric} />}
    footer={<><span>{measure[1]} · expand a {groupLabel.toLowerCase()} to see {childLabel.toLowerCase()} details · totals reflect selected first-column values · date filters are ignored</span><DefinitionNote /></>}>
    {error ? <p role="alert">{error}</p> : loading ? <p className="acq-empty" role="status">Loading cohort groups…</p> : <div className="acq-table-scroll" tabIndex={0} aria-label={`${mode.toUpperCase()} cohort table. Scroll horizontally for earlier periods.`}>
      <table className="acq-table acq-pivot"><thead>
        {mode === "yoy" && <tr className="acq-month-group"><th className="acq-sticky">{groupLabel}</th>{monthGroups.map(g => <th scope="colgroup" key={g.key} colSpan={g.size}>{g.label}</th>)}</tr>}
        <tr><SortHeading label={groupLabel} name="parent" sort={sort} onSort={onSort} className="acq-sticky" />{months.map(month => <SortHeading key={month} label={acquisitionPeriodLabel(month)} name={month} sort={sort} onSort={onSort} />)}</tr>
      </thead><tbody>{visible.map(r => {
        const parent = String(r.parent), open = expanded.includes(parent);
        return <Fragment key={parent}>
          <tr className="acq-entry-row"><th scope="row" className="acq-sticky"><button className="acq-expand" aria-expanded={open} onClick={() => toggle(parent)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span title={parent}>{parent}</span></button></th>{months.map(month => cell(parent, null, month))}</tr>
          {open && [...(children.get(parent) ?? [])].sort().map(value => <tr className="acq-detail-row" key={value}><th scope="row" className="acq-sticky"><span className="acq-detail-label" title={`${childLabel}: ${value}`}>{value}</span></th>{months.map(month => cell(parent, value, month))}</tr>)}
        </Fragment>;
      })}</tbody>
      {<tfoot><tr><th scope="row" className="acq-sticky">Selected values · total</th>{months.map(month => cell(null, null, month))}</tr></tfoot>}
      </table>{!visible.length && <p className="acq-empty">No first-column values match this scope and selection.</p>}
    </div>}
  </AcquisitionTableShell>;
}
function MetricsTable({ rows, dimensions, kind, scope, onDrill }: { rows: Row[]; dimensions: [string, string][]; kind: "hosted" | "trainers"; scope: string; onDrill: Drill }) {
  const [search, setSearch] = useState("");
  const [metric, setMetric] = useState("all");
  const [selectedValues, setSelectedValues] = useState<string[] | null>(null);
  const [sort, setSort] = useState<Sort>({ key: kind === "hosted" ? "month" : "cohort_rows", desc: true });
  const [page, setPage] = useState(0);
  const measures = acquisitionMeasures.filter(m => metric === "all" || m[0] === metric);
  function drill(row: Row, metric?: string) {
    const predicates = kind === "hosted" ? ["ref_hosted"] : [];
    if (!row.is_total) dimensions.forEach(([key]) => predicates.push(row[key] == null ? `${key} IS NULL` : `${key}=${quote(String(row[key]))}`));
    onDrill({title: `${kind === "hosted" ? "Hosted classes" : "Instructor"} · ${row.is_total ? "Full scope" : dimensions.map(([key]) => key === "month" ? acquisitionPeriodLabel(row[key]) : row[key] ?? "Unspecified").join(" · ")}`,scope,predicate:predicates.join(" AND "),metric,uniqueOutcomes:kind === "trainers"});
  }
  const matching = useMemo(() => sortedRows(rows.filter(r => !r.is_total && (selectedValues == null || selectedValues.includes(String(r[dimensions[0][0]] ?? "Unspecified"))) && dimensions.some(([key]) => String(r[key] ?? "").toLowerCase().includes(search.toLowerCase()))), sort), [rows, dimensions, search, sort, selectedValues]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matching.length / 25) - 1));
  const total = rows.find(r => r.is_total);
  function onSort(key: string) { setSort(s => ({ key, desc: s.key === key ? !s.desc : true })); setPage(0); }
  return <AcquisitionTableShell title={kind === "hosted" ? "Signature Partnership Experiences · hosted-class metrics" : "Instructor acquisition metrics"} icon={kind === "hosted" ? Handshake : GraduationCap} count={matching.length}
    description={kind === "hosted" ? "Hosted first visits by experience and month, matching the reference. Selected global filters apply." : "First-visit instructor outcomes with unique member counts and recorded visits. Selected global filters apply."}
    onSearch={v => { setSearch(v); setPage(0); }}
    actions={<ValueSelection options={[...new Set(rows.filter(r => !r.is_total).map(r => String(r[dimensions[0][0]] ?? "Unspecified")))].sort()} selected={selectedValues} onChange={values => { setSelectedValues(values); setPage(0); }} label={`${kind === "hosted" ? "Hosted" : "Instructor"} first-column values`} />}
    metricBar={<MetricTabs value={metric} onChange={setMetric} includeAll />}
    footer={<><Pagination count={matching.length} page={currentPage} setPage={setPage} /><span>{kind === "hosted" ? "First-visit acquisition cohorts; total event attendance and event revenue are not included." : "Instructor attribution follows the member’s first visit."} Footer totals cover the full filtered scope, independent of search.</span><DefinitionNote /></>}>
    <div className="acq-table-scroll" tabIndex={0} aria-label="Metrics table. Scroll horizontally for additional metrics."><table className="acq-table">
      <thead><tr>{dimensions.map(([key, label], i) => <SortHeading key={key} label={label} name={key} sort={sort} onSort={onSort} className={i === 0 ? "acq-sticky acq-dimension" : "acq-dimension"} />)}{measures.map(m => <SortHeading key={m[0]} label={m[1]} name={m[0]} sort={sort} onSort={onSort} />)}</tr></thead>
      <tbody>{matching.slice(currentPage * 25, currentPage * 25 + 25).map((r, i) => <tr key={JSON.stringify(dimensions.map(([key]) => r[key]))}>{dimensions.map(([key], j) => <td key={key} className={`${j === 0 ? "acq-sticky " : ""}acq-dimension`}>
        {j === 0 && kind === "trainers" && <span className="acq-rank">{currentPage * 25 + i + 1}</span>}{key === "month" ? acquisitionPeriodLabel(r[key]) : key === "entry" ? <span className="acq-badge neutral">{r[key] ?? "Unspecified"}</span> : key === "trainer" ? <InstructorName name={String(r[key] ?? "Unspecified")}/> : r[key] ?? "Unspecified"}
      </td>)}{measures.map(m => <td key={m[0]}><button className="acq-cell-button" onClick={() => drill(r, m[0])}><span className={r[m[0]] == null ? "acq-missing" : m[2] === "percent" ? "acq-rate" : "acq-value"}>{valueText(m, r[m[0]])}</span></button></td>)}</tr>)}</tbody>
      {total && <tfoot><tr><th scope="row" className="acq-sticky">Full scope · total</th>{dimensions.slice(1).map(([key]) => <td key={key}>—</td>)}{measures.map(m => <td key={m[0]}><button className="acq-cell-button" onClick={() => drill(total, m[0])}>{valueText(m, total[m[0]])}</button></td>)}</tr></tfoot>}
    </table>{!matching.length && <p className="acq-empty">No cohort records match this scope and search.</p>}</div>
  </AcquisitionTableShell>;
}
function Pagination({ count, page, setPage }: { count: number; page: number; setPage: (page: number) => void }) {
  return <div className="acq-pagination"><span>{count ? page * 25 + 1 : 0}–{Math.min((page + 1) * 25, count)} of {count.toLocaleString("en-IN")} rows · page {page + 1} of {Math.max(1, Math.ceil(count / 25))}</span>
    <div><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button disabled={(page + 1) * 25 >= count} onClick={() => setPage(page + 1)}>Next</button></div>
  </div>;
}
function PurchaseLines({ memberId, firstVisit, imports, version }: { memberId: string; firstVisit: string; imports: boolean; version: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("Loading recorded purchases…");
  useEffect(() => {
    let active = true;
    setRows([]); setStatus("Loading recorded purchases…");
    if (!health.sales?.fetchedAt || health.sales.status === "error") { setStatus("Sales source unavailable. Refresh the source to load dated purchases."); return; }
    query(`SELECT date,product,category,sale_id,revenue,associate,location FROM sales WHERE member_id=${quote(memberId)} AND date>=${quote(firstVisit)} AND NOT COALESCE(voided,FALSE) AND (status='succeeded' OR status IS NULL) ${imports ? "" : "AND NOT imported"} ORDER BY date,sale_id,source_row`)
      .then(r => { if (active) { setRows(r); setStatus(r.length ? "" : "No linked purchases found after the first visit in the available sales coverage."); } })
      .catch(e => { if (active) setStatus(String(e)); });
    return () => { active = false; };
  }, [memberId, firstVisit, imports, version]);
  return <div className="acq-purchase-detail">{status ? <p role="status">{status}</p> : <>
    <div className="acq-purchase-heading"><Route size={17} /><strong>Recorded purchase journey</strong><span>{rows.length} sale item lines</span><span>{fmt("avg_ltv", rows.reduce((sum, r) => sum + Number(r.revenue || 0), 0))} recorded spend</span></div>
    <p>Purchases from first visit onward, across locations and dates. Multiple lines can belong to one sale; source coverage may be incomplete.</p>
    <div className="acq-table-scroll"><table className="acq-table"><thead><tr>{["Date", "Purchase", "Category", "Sale ID", "Spend", "Associate", "Studio"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{acquisitionPeriodLabel(r.date)}</td><td>{r.product}</td><td>{r.category}</td><td>{r.sale_id ?? "Unavailable"}</td><td>{fmt("avg_ltv", r.revenue)}</td><td>{r.associate}</td><td>{r.location}</td></tr>)}</tbody></table></div>
  </>}</div>;
}
const journeyTextFields = new Set(["entry", "date", "first_purchase_date", "location", "trainer", "product", "purchase_journey", "retention"]);
const journeyColumns: [string, string][] = [["member", "Community member"], ["member_id", "Member ID"], ["entry", "Entry type"], ["date", "First visit"], ["location", "Studio"], ["trainer", "Instructor"], ["first_purchase_date", "First purchase date"], ["product", "First purchase"], ["first_purchase", "First purchase value"], ["purchase_journey", "Post-trial purchase journey"], ["post_trial_purchases", "Post-trial purchases"], ["ltv", "LTV"], ["avg_purchase_value", "Average spend"], ["conversion_days", "Conversion span"], ["retention", "Retention"]];
function Journeys({ rows, version, scope, onDrill }: { rows: Row[]; version: number; scope: string; onDrill: Drill }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ key: "date", desc: true });
  const [columnView, setColumnView] = useState("overview");
  const [selectedMembers, setSelectedMembers] = useState<string[] | null>(null);
  const visibleColumns = journeyColumns.filter(([key]) => columnView === "all" || (columnView === "overview" ? ["member", "entry", "date", "product", "first_purchase", "ltv", "retention"].includes(key) : columnView === "value" ? ["member", "first_purchase_date", "product", "first_purchase", "ltv", "avg_purchase_value", "post_trial_purchases"].includes(key) : ["member", "member_id", "entry", "location", "trainer", "purchase_journey", "conversion_days", "retention"].includes(key)));
  const imports = useStore(s => s.filters.imports);
  const matching = useMemo(() => sortedRows(rows.filter(r => (selectedMembers == null || selectedMembers.includes(String(r.member ?? "Unnamed member"))) && [r.member, r.member_id, r.entry, r.trainer, r.product].some(v => String(v ?? "").toLowerCase().includes(search.toLowerCase()))), sort), [rows, search, sort, selectedMembers]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matching.length / 25) - 1));
  function onSort(key: string) { setSort(s => ({ key, desc: s.key === key ? !s.desc : true })); setPage(0); }
  function renderValue(r: Row, key: string) {
    if (key === "date" || key === "first_purchase_date") return acquisitionPeriodLabel(r[key]);
    if (["ltv", "first_purchase", "avg_purchase_value"].includes(key)) return fmt("avg_ltv", r[key]);
    if (key === "conversion_days") return fmt("avg_conversion_span", r[key]);
    if (key === "post_trial_purchases") return fmt("new_clients", r[key]);
    if (key === "trainer") return <InstructorName name={String(r[key] ?? "Unspecified")}/>;
    if (key === "entry") return <span className="acq-badge neutral">{r[key]}</span>;
    if (key === "retention") return <OutcomeBadge value={r[key]} />;
    if (key === "purchase_journey" && r[key]) return <span className="acq-journey-path">{String(r[key])}</span>;
    return r[key] ?? "—";
  }
  return <AcquisitionTableShell title="Converted members · purchase journeys" icon={Route} count={matching.length} description="Converted first-visit cohorts in the selected date and studio scope. Expand a member for dated sales." onSearch={v => { setSearch(v); setPage(0); }} searchLabel="Search converted members"
    actions={<ValueSelection options={[...new Set(rows.map(r => String(r.member ?? "Unnamed member")))].sort()} selected={selectedMembers} onChange={values => { setSelectedMembers(values); setPage(0); }} label="Member first-column values" />}
    metricBar={<div className="acq-metric-tabs" aria-label="Purchase journey metrics">{[["overview", "Purchase overview"], ["value", "LTV & spend"], ["journey", "Journey & conversion"], ["all", "All details"]].map(([key, label]) => <button key={key} aria-pressed={columnView === key} onClick={() => setColumnView(key)}>{label}</button>)}</div>}
    footer={<><Pagination count={matching.length} page={currentPage} setPage={setPage} /><span>Source-reported purchase paths and values · dated sales are linked by member ID</span></>}>
    <div className="acq-table-scroll" tabIndex={0} aria-label="Converted member journeys. Scroll horizontally for purchase metrics."><table className="acq-table acq-journeys">
      <thead><tr>{visibleColumns.map(([key, label], i) => <SortHeading key={key} label={label} name={key} sort={sort} onSort={onSort} className={i === 0 ? "acq-sticky" : journeyTextFields.has(key) ? "acq-dimension" : undefined} />)}</tr></thead>
      <tbody>{matching.slice(currentPage * 25, currentPage * 25 + 25).map(r => {
        const key = String(r.row_id), open = expanded === key;
        return <Fragment key={key}><tr className={open ? "acq-selected-row" : ""}>
          <th scope="row" className="acq-sticky"><button className="acq-expand" disabled={!r.member_id || !r.date} aria-expanded={open} aria-label={`View purchases for ${r.member ?? "unnamed member"}`} onClick={() => setExpanded(open ? null : key)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span>{r.member ?? "Unnamed member"}</span></button></th>
          {visibleColumns.slice(1).map(([field]) => <td className={`${journeyTextFields.has(field) ? "acq-dimension" : ""} ${field === "purchase_journey" ? "acq-journey-cell" : ""}`} key={field}>{<button className="acq-cell-button" onClick={() => onDrill({title: `Member journey · ${r.member ?? r.member_id} · ${journeyColumns.find(([key]) => key === field)?.[1] ?? field}`,scope,predicate: `source_row=${Number(r.source_row)}`})}>{renderValue(r, field)}</button>}</td>)}
        </tr>{open && <tr className="acq-expanded-purchase"><td colSpan={visibleColumns.length}><button className="acq-cell-button" onClick={() => onDrill({title: `Member journey · ${r.member ?? r.member_id}`,scope,predicate: `source_row=${Number(r.source_row)}`})}>Inspect member details, conversion & purchase analytics</button><PurchaseLines memberId={String(r.member_id)} firstVisit={String(r.date)} imports={imports} version={version} /></td></tr>}</Fragment>;
      })}</tbody>
      <tfoot><tr><th className="acq-sticky">Selected journeys · {matching.length} records</th>{visibleColumns.slice(1).map(([field])=>{const values=matching.map(row=>row[field]).filter(value=>value!=null).map(Number);const additive=['first_purchase','ltv','post_trial_purchases'].includes(field);const average=['avg_purchase_value','conversion_days'].includes(field);const value=values.length?(additive?values.reduce((sum,value)=>sum+value,0):average?values.reduce((sum,value)=>sum+value,0)/values.length:null):null;return <td key={field}>{value==null?'—':renderValue({[field]:value},field)}</td>;})}</tr></tfoot>
    </table>{!matching.length && <p className="acq-empty">No converted members match this scope and search.</p>}</div>
  </AcquisitionTableShell>;
}

type TableKind = typeof tableOptions[number]["key"];
export function AcquisitionTableView({version,kind}: {version:number;kind:TableKind}) {
  const filters=useStore(s=>s.filters),transient=useStore(s=>s.transient);
  const scope=where(filters,"new",transient);
  const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const [request,setRequest]=useState<AcquisitionDrillRequest|null>(null);
  useEffect(()=>{
    if(!["hosted","trainers","journeys"].includes(kind))return;
    let active=true;setLoading(true);setError("");
    const facts=acquisitionFactsSQL(scope,today());
    const sql=kind==="hosted"
      ? `SELECT format,month,GROUPING(format) AS is_total,${acquisitionAggregate} FROM facts WHERE ref_hosted GROUP BY GROUPING SETS ((format,month),()) ORDER BY month DESC,format`
      : kind==="trainers"
      ? `SELECT trainer,GROUPING(trainer) AS is_total,${instructorAcquisitionAggregate} FROM facts GROUP BY GROUPING SETS ((trainer),()) ORDER BY trainer`
      : "SELECT * FROM facts WHERE ref_converted ORDER BY date DESC,member,row_id";
    query(`WITH facts AS (${facts}) ${sql}`).then(data=>{if(active){setRows(data);setLoading(false);}}).catch(error=>{if(active){setError(String(error));setLoading(false);}});
    return()=>{active=false;};
  },[scope,version,kind]);
  return <div className="acquisition-tables" data-acquisition-table={kind}>
    {error?<p role="alert">{error}</p>:loading?<p role="status">Loading source analytics…</p>
      :kind==="types"?<AcquisitionClientTypes version={version} onDrill={setRequest}/>
      :kind==="mom"||kind==="yoy"?<CohortComparison mode={kind} version={version} onDrill={setRequest}/>
      :kind==="memberships"||kind==="purchases"?<AcquisitionReferenceTables kind={kind} version={version} onDrill={setRequest}/>
      :kind==="hosted"?<MetricsTable rows={rows} dimensions={[["month","First-visit month"],["format","Signature experience"]]} kind="hosted" scope={scope} onDrill={setRequest}/>
      :kind==="trainers"?<MetricsTable rows={rows} dimensions={[["trainer","Instructor"]]} kind="trainers" scope={scope} onDrill={setRequest}/>
      :<Journeys rows={rows} version={version} scope={scope} onDrill={setRequest}/>}
    {request&&<AcquisitionDrillDown request={request} version={version} imports={filters.imports} onClose={()=>setRequest(null)}/>}
  </div>;
}
function CollapsedTable({title,children}: {title:string;children:ReactNode}) {
  const [open,setOpen]=useState(false);
  return <details className="secondary acq-individual-table" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>{title}<span className="icon small">{open?"Collapse":"Explore"}<ChevronDown size={12}/></span></summary>
    {open&&<div className="secondary-content">{children}</div>}
  </details>;
}
export function AcquisitionMainTables({version}: {version:number}) {
  return <><AcquisitionTableView kind="types" version={version}/><AcquisitionTableView kind="mom" version={version}/></>;
}
export function AcquisitionDeepDive({version}: {version:number}) {
  return <>{tableOptions.filter(option=>!["types","mom"].includes(option.key)).map(option=><CollapsedTable title={option.label} key={option.key}><AcquisitionTableView kind={option.key} version={version}/></CollapsedTable>)}</>;
}
