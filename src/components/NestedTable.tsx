import { tree } from "../data/hierarchy";
import { InstructorAvatar } from "./InstructorAvatar";
import { usePreferences } from "../state/preferences";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Download,
  Columns3,
  GripVertical,
  Search,
} from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type ExpandedState,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { metrics } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { derived, cellDelta, provenance } from "../semantics/cells";
import { query, quote, type Row } from "../data/duckdb";
import { blueprints } from "../data/blueprints";
import { where, context, metricFacts } from "../data/analytics";
import { metricSQL } from "../semantics/metrics";
import { slotVerdict } from "../semantics/aggregations";
import { exportCSV } from "./exports";
import { useStore } from "../state/store";
export interface TreeRow {
  source?: string;
  filters?: import("../state/store").Filters;
  transient?: { field: string; value: string }[];
  metrics?: string[];
  predicate?: string;
  /** Full analysis population when raw records show a metric numerator only. */
  summaryPredicate?: string;
  queryContext?: import("../semantics/metrics").QueryContext;
  label: string;
  path: { field: string; value: string }[];
  values: Row;
  children: TreeRow[];
  id: string;
}
export { tree } from "../data/hierarchy";
export function NestedTable({
  rows,
  priorRows = [],
  groups,
  columns,
  total,
  onGroups,
  onColumns,
  onDrill,
  source: sourceOverride,
  predicate,
}: {
  rows: Row[];
  source?: string;
  predicate?: string;
  /** The same rollup over the comparison period; empty when not comparing. */
  priorRows?: Row[];
  groups: string[];
  columns: string[];
  total: Row;
  onGroups: (v: string[]) => void;
  onColumns: (v: string[]) => void;
  onDrill: (r: TreeRow, metric?: string) => void;
}) {
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [picker, setPicker] = useState(false);
  const [drag, setDrag] = useState(-1);
  const [selectionTotal, setSelectionTotal] = useState<Row | null>(null);
  const [compressed, setCompressed] = useState(false);
  const parent = useRef<HTMLDivElement>(null);
  const store = useStore();
  const { preferences, page: updatePage } = usePreferences();
  const sizing = preferences.page[store.tab]?.columnSizing || {};
  const data = useMemo(
    () =>
      tree(rows, groups).filter(
        (r) =>
          !search ||
          r.label.toLowerCase().includes(search.toLowerCase()) ||
          JSON.stringify(r.children)
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [rows, groups, search],
  );
  // Prior-period values are matched on the grouping path, so a row keeps its
  // comparison even when the ordering or the row count changes between periods.
  const prior = useMemo(() => {
    const map = new Map<string, Row>();
    for (const node of tree(priorRows, groups)) {
      const walk = (r: TreeRow) => {
        map.set(r.id, r.values);
        r.children.forEach(walk);
      };
      walk(node);
    }
    return map;
  }, [priorRows, groups]);
  useEffect(() => {
    const all: TreeRow[] = [];
    function walk(list: TreeRow[]) {
      for (const r of list) {
        all.push(r);
        walk(r.children);
      }
    }
    walk(data);
    const chosen = all.filter((r) => selected[r.id]);
    if (!chosen.length) {
      setSelectionTotal(null);
      return;
    }
    const terms = chosen
      .map(
        (r) =>
          "(" +
          r.path
            .map((p) =>
              p.value === "Unspecified"
                ? `"${p.field}" IS NULL`
                : `"${p.field}"=${quote(p.value)}`,
            )
            .join(" AND ") +
          ")",
      )
      .join(" OR ");
    const source = sourceOverride || blueprints[store.tab].source;
    const w = where(store.filters, source);
    const facts =
      metricFacts(store.filters, source);
    let active = true;
    query(
      `SELECT ${columns.length ? metricSQL(columns, context())+"," : ""}COUNT(*) AS n FROM ${facts}${["sessions", "sales", "checkins"].includes(source) || !w ? " WHERE " : " AND "}(${terms})${predicate ? " AND (" + predicate + ")" : ""}`,
    ).then((r) => {
      if (active) setSelectionTotal(r[0]);
    });
    return () => {
      active = false;
    };
  }, [selected, columns, data, store.filters, store.transient, store.tab, sourceOverride, predicate]);
  const defs = useMemo<ColumnDef<TreeRow>[]>(
    () => [
      {
        id: "entity",
        header: "Studio / entity",
        accessorFn: (r) => r.label,
        size: 300,
        cell: ({ row }) => (
          <div className="row-label" style={{ paddingLeft: row.depth * 16 }}>
            <input
              aria-label={`Select ${row.original.label}`}
              type="checkbox"
              checked={!!selected[row.original.id]}
              onChange={() =>
                setSelected({
                  ...selected,
                  [row.original.id]: !selected[row.original.id],
                })
              }
            />
            <button
              className="row-chevron"
              aria-label={`${row.getIsExpanded() ? "Collapse" : "Expand"} ${row.original.label}`}
              disabled={!row.subRows.length}
              onClick={(e) => {
                if (e.altKey) setExpanded(row.getIsExpanded() ? {} : true);
                else row.toggleExpanded();
              }}
            >
              {row.subRows.length ? (
                row.getIsExpanded() ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )
              ) : (
                <span style={{ width: 12 }}>•</span>
              )}
            </button>
            {row.original.path.at(-1)?.field === "trainer" && <InstructorAvatar name={row.original.label} />}
            <button className="row-name" onClick={() => onDrill(row.original)}>
              {row.original.label}
            </button>
            <button
              className="row-action"
              aria-label={`Filter to ${row.original.label}`}
              onClick={() =>
                store.cross(row.original.path.at(-1)!.field, row.original.label)
              }
            >
              <ArrowUpRight size={12} />
            </button>
          </div>
        ),
      },
      ...columns.map((id) => ({
        id,
        header: metrics[id].label,
        accessorFn: (r: TreeRow) => r.values[id],
        size: 130,
        cell: ({ row }: { row: { original: TreeRow } }) => {
          const v = row.original.values[id];
          const heat = metrics[id].format === "percent";
          const n = Number(row.original.values.n ?? 0);
          const thin = derived(id) && n > 0 && n < metrics[id].minSample;
          const before = prior.get(row.original.id)?.[id];
          const change = cellDelta(id, v, before);
          return (
            <button
              className={`cell-value${thin ? " cell-thin" : ""}`}
              style={{
                width: "100%",
                textAlign: "right",
                background:
                  heat && v != null
                    ? `color-mix(in srgb,var(--accent) ${Math.min(25, Math.max(0, Number(v) * 25))}%,transparent)`
                    : undefined,
              }}
              title={provenance(id, v, n, thin, before)}
              onClick={() => onDrill(row.original, id)}
            >
              <span className="cell-figure">
                {fmt(id, v, metrics[id].format === "currency")}
                {thin && <span aria-hidden="true" className="cell-thin-mark">*</span>}
              </span>
              {change && (
                <span className={`cell-delta ${change.tone}`}>{change.text}</span>
              )}
            </button>
          );
        },
      })),
    ],
    [columns, selected, onDrill, store, expanded, prior],
  );
  const tableDefs = [...defs];
  if (store.tab === 2)
    tableDefs.push({
      id: "verdict",
      header: "Decision",
      size: 95,
      cell: ({ row }) => (
        <span
          className={`pill ${slotVerdict(row.original.values, store.rate) === "Keep" ? "good" : "warning"}`}
        >
          {slotVerdict(row.original.values, store.rate)}
        </span>
      ),
    });
  const table = useReactTable({
    data,
    columns: tableDefs,
    state: { expanded, sorting, columnSizing: sizing },
    onColumnSizingChange: (next) =>
      updatePage(store.tab, {
        columnSizing: typeof next === "function" ? next(sizing) : next,
      }),
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getSubRows: (r) => r.children,
    getRowId: (r) => r.id,
    sortDescFirst: false,
    columnResizeMode: "onChange",
  });
  const visible = table.getRowModel().rows;
  const virtual = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parent.current,
    estimateSize: () =>
      store.density === "dense"
        ? 26
        : store.density === "comfortable"
          ? 44
          : 34,
    overscan: 12,
  });
  const rendered =
    visible.length > 120
      ? virtual
          .getVirtualItems()
          .map((v) => ({ row: visible[v.index], index: v.index }))
      : visible.map((row, index) => ({ row, index }));
  const top =
    visible.length > 120 ? virtual.getVirtualItems()[0]?.start || 0 : 0;
  const bottom =
    visible.length > 120
      ? virtual.getTotalSize() - (virtual.getVirtualItems().at(-1)?.end || 0)
      : 0;
  return (
    <>
      <div className="nested-toolbar">
        <div className="grouping">
          <span>Group by</span>
          {groups.map((g, i) => (
            <div
              className="group-chip"
              key={i}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const next = [...groups];
                next.splice(i, 0, next.splice(drag, 1)[0]);
                onGroups(next);
                setExpanded({});
              }}
            >
              <GripVertical size={10} />
              <select
                aria-label={`Grouping level ${i + 1}`}
                value={g}
                onChange={(e) => {
                  const next = [...groups];
                  const other = next.indexOf(e.target.value);
                  if (other >= 0) next[other] = g;
                  next[i] = e.target.value;
                  onGroups(next);
                  setExpanded({});
                }}
              >
                {[
                  "location",
                  "format_group",
                  "format",
                  "day",
                  "time",
                  "trainer",
                  "source",
                  "category",
                  "product",
                  "associate",
                  "status",
                  "member",
                  "month",
                  ...(groups.includes("capacity") ? ["capacity"] : []),
                  ...(groups.includes("payment_method") ? ["payment_method"] : []),
                ].map((v) => (
                  <option key={v} value={v}>
                    {v === "trainer"
                      ? "Instructor"
                      : v === "format_group"
                        ? "Format (PowerCycle / Strength Lab / Barre)"
                        : v === "format"
                          ? "Class name"
                          : v[0].toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="table-controls">
          <Search size={12} className="muted" />
          <input
            aria-label="Search register"
            placeholder="Find an entity…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="button" onClick={() => setPicker(!picker)}>
            <Columns3 size={12} />
            Columns
          </button>
          <button
            className="icon-button"
            aria-label="Export current table CSV"
            onClick={() =>
              exportCSV(
                "performance-register",
                visible.map((r) => ({
                  Entity: r.original.path.map((p) => p.value).join(" / "),
                  ...Object.fromEntries(
                    columns.map((id) => [
                      metrics[id].label,
                      r.original.values[id],
                    ]),
                  ),
                })),
              )
            }
          >
            <Download size={14} />
          </button>
        </div>
      </div>
      {picker && (
        <div className="notice" style={{ flexWrap: "wrap" }}>
          {Object.keys(metrics)
            .filter(
              (id) =>
                (columns.includes(id) ||
                [
                  "sessions",
                  "attendance",
                  "fill_rate",
                  "revenue",
                  "rev_pac",
                  "rev_pas",
                  "empty_sessions",
                  "no_show_rate",
                  "discount_rate",
                  "aov",
                  "risk_score",
                  "contribution",
                ].includes(id)) && (!sourceOverride || metrics[id].sources.some((source) => source.split(".")[0].toLowerCase() === sourceOverride.toLowerCase())),
            )
            .map((id) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={columns.includes(id)}
                  onChange={() =>
                    onColumns(
                      columns.includes(id)
                        ? columns.filter((x) => x !== id)
                        : [...columns, id],
                    )
                  }
                />
                {metrics[id].label}
              </label>
            ))}
          <button onClick={() => setPicker(false)}>Done</button>
        </div>
      )}
      <div
        className={`table-scroll ${compressed ? "compressed" : ""}`}
        ref={parent}
        onScroll={(e) => setCompressed(e.currentTarget.scrollTop > 40)}
      >
        <table style={{ width: table.getTotalSize(), minWidth: "100%" }}>
          <thead>
            {table.getHeaderGroups().map((h) => (
              <tr key={h.id}>
                {h.headers.map((header) => (
                  <th key={header.id} style={{ width: header.getSize() }}>
                    <button
                      title={metrics[header.id]?.description}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {header.column.getIsSorted()
                        ? header.column.getIsSorted() === "asc"
                          ? " ↑"
                          : " ↓"
                        : ""}
                    </button>
                    <div
                      className="resize"
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {top > 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  style={{ height: top, padding: 0 }}
                />
              </tr>
            )}
            {rendered.map(({ row, index }) => (
              <tr
                key={row.id}
                className={`level-${row.depth} ${selected[row.id] ? "selected" : ""}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  const next =
                    e.currentTarget[
                      e.key === "ArrowDown"
                        ? "nextElementSibling"
                        : "previousElementSibling"
                    ];
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    (next as HTMLElement)?.focus();
                  }
                  if (e.key === "ArrowRight") {
                    e.preventDefault();
                    row.toggleExpanded(true);
                  }
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    row.toggleExpanded(false);
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onDrill(row.original);
                  }
                  if (e.key === " ") {
                    e.preventDefault();
                    setSelected({ ...selected, [row.id]: !selected[row.id] });
                  }
                }}
                data-row-index={index}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {bottom > 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  style={{ height: bottom, padding: 0 }}
                />
              </tr>
            )}
            {!visible.length && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  style={{ height: 90, textAlign: "center" }}
                >
                  No contributing rows. Widen the date range or clear filters.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="totals">
              <td>
                {selectionTotal ? "Selected scope" : "Total in scope"}{" "}
                <span className="small">
                  {Number((selectionTotal || total).n || 0).toLocaleString(
                    "en-IN",
                  )}{" "}
                  records
                </span>
              </td>
              {columns.map((id) => (
                <td key={id}>
                  {fmt(
                    id,
                    (selectionTotal || total)[id],
                    metrics[id].format === "currency",
                  )}
                </td>
              ))}
              {store.tab === 2 && <td>Decision support</td>}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="table-foot">
        <span>
          {visible.length.toLocaleString("en-IN")} visible groups /{" "}
          {groups.length} drill levels / Weighted totals recomputed from source
        </span>
        <span>
          {Object.values(selected).filter(Boolean).length} selected{" "}
          {selectionTotal && (
            <button onClick={() => setSelected({})}>Clear selection</button>
          )}{" "}
          / Enter to drill / ← → to expand
        </span>
      </div>
    </>
  );
}
