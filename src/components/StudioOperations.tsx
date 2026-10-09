import { TABLE_ROW_HEIGHT } from "./ui/layout";
import { DropdownField } from "./ui/DropdownField";
import {
  referenceGroupings,
  referencePresets,
  referenceColumnLabels,
  referencePredicate,
  referenceMetricsSQL,
  referenceGroupLabel,
  referenceGroupPredicate,
  sessionDetailFields,
  detailColumns,
  isDetailColumn,
} from "../data/class-intelligence-reference";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type ColumnSizingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Download,
  Search,
  Columns3,
  ChevronRight,
  ChevronDown,
  Trophy,
  TrendingDown,
  ArrowUpRight,
  SlidersHorizontal,
  ListFilter,
  Bookmark,
  GitCompareArrows,
  Focus,
  RotateCcw,
  Award,
  Eye,
  List,
  Table2,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { query, type Row } from "../data/duckdb";
import { context, metricFacts, comparison } from "../data/analytics";
import { metricSQL, metrics } from "../semantics/metrics";
import { fmt, delta } from "../semantics/formats";
import { useStore } from "../state/store";
import {
  operationMetrics,
  operationViews,
  operationDimensions,
  resolveOperationGroups,
  identity,
  rankOperations,
  comparableInstructors,
  scheduleChanges,
  scheduleWindow,
  type OperationView,
  hostedPredicate,
  operationsSQL,
  operationsMonthlySQL,
} from "../data/studio-operations";
import { exportCSV } from "./exports";
import { Register } from "./Register";
import type { TreeRow } from "./NestedTable";
import "./StudioOperations.css";
import "./StudioOperationsApp.css";

const presets = referencePresets;
const rankingMetrics = [
  "fill_rate",
  "avg_class_size_incl",
  "revenue_per_session",
  "revenue",
  "attendance",
  "show_up_rate",
  "empty_session_rate",
  "late_cancel_rate",
  "no_show_rate",
  "attendance_cv",
  "rev_pac",
  "sessions",
  "empty_sessions",
  "reference_consistency",
  "reference_composite",
];
function trainerFormats(rows: Row[]) {
  const map = new Map<
    string,
    { key: string; day: string; location: string; names: Set<string> }
  >();
  rows.forEach((row) => {
    const day = String(row.day || "Unknown"),
      location = String(row.location || "Unknown");
    const key = JSON.stringify([day, location]);
    const entry = map.get(key) || {
      key,
      day,
      location,
      names: new Set<string>(),
    };
    entry.names.add(String(row.format || row.class_type || "Unknown"));
    map.set(key, entry);
  });
  return [...map.values()]
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) || a.location.localeCompare(b.location),
    )
    .map((entry) => {
      const formats = [...entry.names].slice(0, 6).join(", ");
      return {
        ...entry,
        formats,
        text: `${entry.day} · ${entry.location}: ${formats}`,
      };
    });
}
const defaultColumns = presets["All Metrics (Default)"];
type SavedView = {
  view: OperationView;
  preset: string;
  columns: string[];
  criterion: string;
  minimum: number;
  excludeHosted: boolean;
  search?: string;
  minFill?: number;
  minAttendance?: number;
  limit?: number;
  density?: boolean;
  sorting?: SortingState;
  columnSizing?: ColumnSizingState;
  customGroups?: string[];
  flatMode?: boolean;
};
export function StudioOperations({
  version,
  onDrill,
}: {
  version: string | number;
  onDrill: (row: TreeRow) => void;
}) {
  const s = useStore();
  const [view, setView] = useState<OperationView>("ClassDayTimeLocation");
  const [preset, setPreset] = useState("All Metrics (Default)");
  const [columns, setColumns] = useState(defaultColumns);
  const [criterion, setCriterion] = useState("fill_rate");
  const [minimum, setMinimum] = useState(3);
  const [limit, setLimit] = useState(5);
  const [excludeHosted, setExcludeHosted] = useState(false);
  const [search, setSearch] = useState("");
  const [minFill, setMinFill] = useState(0);
  const [minAttendance, setMinAttendance] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [prior, setPrior] = useState<Row[]>([]);
  const [monthly, setMonthly] = useState<Row[]>([]);
  const [benchmarks, setBenchmarks] = useState<Row[]>([]);
  const [sessionRows, setSessionRows] = useState<Row[]>([]);
  const [flatMode, setFlatMode] = useState(false);
  const [tableTotal, setTableTotal] = useState<Row>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "fill_rate", desc: true },
  ]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [density, setDensity] = useState(true);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [customGroups, setCustomGroups] = useState<string[]>([
    "location",
    "format",
  ]);
  const [rankSubset, setRankSubset] = useState<"all" | "top" | "bottom">("all");
  const [focusEntity, setFocusEntity] = useState<string | null>(null);
  const [changeKind, setChangeKind] = useState("all");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedView | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("p57-operations-view") || "null");
    } catch {
      return null;
    }
  });
  const groupingFields = useMemo(
    () => resolveOperationGroups(view, customGroups),
    [view, customGroups],
  );
  const isFlat = flatMode || view === "sessions";
  const fields = isFlat ? sessionDetailFields : groupingFields;
  const scopedFilters = useMemo(() => ({ ...s.filters }), [s.filters]);
  const sql = useMemo(() => {
    const facts = (f: typeof s.filters) =>
      `(SELECT * FROM ${metricFacts(f, "sessions", s.transient)}${[excludeHosted ? hostedPredicate : "", !isFlat ? referencePredicate(view) : ""].filter(Boolean).length ? " WHERE " + [excludeHosted ? hostedPredicate : "", !isFlat ? referencePredicate(view) : ""].filter(Boolean).join(" AND ") : ""})`;
    const aggregate = (f: typeof s.filters) =>
      operationsSQL(facts(f), fields, context(f, s.transient));
    return {
      facts: facts(scopedFilters),
      children: operationsSQL(
        facts(scopedFilters),
        sessionDetailFields,
        context(scopedFilters, s.transient),
      ),
      rows: aggregate(scopedFilters),
      prior:
        s.compare === "none"
          ? null
          : aggregate(comparison(scopedFilters, s.compare)),
      monthly: operationsMonthlySQL(
        facts(scheduleWindow(scopedFilters)),
        context(scheduleWindow(scopedFilters), s.transient),
      ),
      benchmark: `SELECT location,format_group,${metricSQL(operationMetrics, context(scopedFilters, s.transient))} FROM ${facts(scopedFilters)} GROUP BY location,format_group`,
    };
  }, [
    scopedFilters,
    s.transient,
    s.compare,
    s.rate,
    view,
    customGroups,
    excludeHosted,
    isFlat,
  ]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setRows([]);
    setPrior([]);
    setMonthly([]);
    setBenchmarks([]);
    setSessionRows([]);
    setTableTotal({});
    setSelection({});
    setExpanded([]);
    setFocusEntity(null);
    setRankSubset("all");
    Promise.all([
      query(sql.rows),
      sql.prior ? query(sql.prior) : Promise.resolve([]),
      query(sql.monthly),
      query(sql.benchmark),
      query(sql.children),
    ])
      .then(([current, previous, history, benchmark, children]) => {
        if (active) {
          setRows(current);
          setPrior(previous);
          setMonthly(history);
          setBenchmarks(benchmark);
          setSessionRows(
            children.map((r) => ({
              ...r,
              entity: "session:" + r.source_row,
              label: String(r.session_name || r.format || "Session"),
              __is_session: 1,
            })),
          );
        }
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [sql, version]);
  const data = useMemo(() => {
    let eligible = rows.filter(
      (r) => Number(r.sessions) >= (isFlat ? 1 : minimum),
    );
    if (view === "faceoff")
      eligible = comparableInstructors(eligible, [
        "location",
        "format",
        "day",
        "time",
      ]);
    return eligible
      .map<Row>((r) => ({
        ...r,
        entity: identity(r, fields),
        label: isFlat
          ? String(r.session_name || r.format || "Session")
          : referenceGroupLabel(r, fields),
        __is_session: isFlat ? 1 : 0,
      }))
      .filter(
        (r) =>
          (!search ||
            String(r.label).toLowerCase().includes(search.toLowerCase())) &&
          (minFill === 0 ||
            (r.fill_rate != null && Number(r.fill_rate) * 100 >= minFill)) &&
          (minAttendance === 0 ||
            (r.avg_class_size_incl != null &&
              Number(r.avg_class_size_incl) >= minAttendance)),
      );
  }, [rows, view, fields, isFlat, minimum, search, minFill, minAttendance]);
  const previous = useMemo(
    () => new Map(prior.map((r) => [identity(r, fields), r])),
    [prior, view, fields],
  );
  const rankings = useMemo(
    () => rankOperations(data, criterion, isFlat ? 1 : minimum, limit),
    [data, criterion, minimum, limit, view, isFlat],
  );
  const tableData = useMemo(() => {
    const scoped = rankSubset === "all" ? data : rankings[rankSubset];
    return focusEntity
      ? scoped.filter((r) => r.entity === focusEntity)
      : scoped;
  }, [data, rankings, rankSubset, focusEntity]);
  const rankMap = useMemo(
    () =>
      new Map(
        rankOperations(
          data,
          criterion,
          isFlat ? 1 : minimum,
          data.length,
        ).eligible.map((r, i) => [String(r.entity), i + 1]),
      ),
    [data, criterion, minimum, isFlat],
  );
  const childMap = useMemo(() => {
    const map = new Map<string, Row[]>();
    sessionRows.forEach((r) => {
      const key = identity(r, fields);
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    });
    return map;
  }, [sessionRows, fields]);
  useEffect(() => {
    let active = true;
    setTableTotal({});
    if (!tableData.length) return;
    const terms =
      tableData.length === rows.length
        ? "TRUE"
        : isFlat
          ? `source_row IN (${tableData
              .map((r) => Number(r.source_row))
              .filter(Number.isFinite)
              .join(",")})`
          : tableData
              .map((r) => "(" + referenceGroupPredicate(r, fields) + ")")
              .join(" OR ");
    query(
      `SELECT ${metricSQL(operationMetrics, context(scopedFilters, s.transient))},${referenceMetricsSQL} FROM ${sql.facts} WHERE ${terms}`,
    )
      .then((rows) => active && setTableTotal(rows[0] || {}))
      .catch((e) => active && setError(String(e)));
    return () => {
      active = false;
    };
  }, [tableData, fields, sql.facts, s.rate, rows.length, isFlat]);
  function labelFor(id: string) {
    return referenceColumnLabels[id] || metrics[id]?.label || id;
  }
  function cellText(id: string, r: Row) {
    if (isDetailColumn(id))
      return String(
        r[id === "formats" ? "formats" : id] ??
          (id === "formats" ? r.format : null) ??
          "—",
      );
    if (id.startsWith("reference_")) {
      if (r[id] == null) return "—";
      if (id === "reference_composite") return Number(r[id]).toFixed(1);
      if (
        [
          "reference_waitlist_rate",
          "reference_weighted_average",
          "reference_consistency",
        ].includes(id)
      )
        return `${(Number(r[id]) * 100).toFixed(1)}%`;
      return fmt(
        [
          "reference_revenue_per_booking",
          "reference_cancellation_value",
        ].includes(id)
          ? "revenue"
          : "sessions",
        r[id],
      );
    }
    return fmt(id, r[id]);
  }
  const benchmarkMap = useMemo(
    () =>
      new Map(
        benchmarks.map((r) => [identity(r, ["location", "format_group"]), r]),
      ),
    [benchmarks],
  );
  const changes = useMemo(
    () =>
      scheduleChanges(monthly)
        .filter(
          (c) =>
            (!scopedFilters.from ||
              c.period >= scopedFilters.from.slice(0, 7)) &&
            (!scopedFilters.to || c.period <= scopedFilters.to.slice(0, 7)),
        )
        .filter(
          (c) =>
            (changeKind === "all" || c.kind === changeKind) &&
            (!search ||
              JSON.stringify([c.before, c.after, c.kind])
                .toLowerCase()
                .includes(search.toLowerCase())) &&
            [c.before, c.after].some(
              (r) =>
                r &&
                Number(r.sessions) >= minimum &&
                (!minFill ||
                  (r.fill_rate != null &&
                    Number(r.fill_rate) * 100 >= minFill)) &&
                (!minAttendance ||
                  (r.avg_class_size_incl != null &&
                    Number(r.avg_class_size_incl) >= minAttendance)),
            ),
        ),
    [
      monthly,
      search,
      minimum,
      minFill,
      minAttendance,
      changeKind,
      scopedFilters,
    ],
  );
  function drill(r: Row) {
    onDrill({
      id: String(r.entity),
      label: String(r.label),
      source: "sessions",
      filters: scopedFilters,
      metrics: operationMetrics,
      predicate:
        [
          excludeHosted ? hostedPredicate : "",
          !isFlat ? referencePredicate(view) : "",
        ]
          .filter(Boolean)
          .join(" AND ") || undefined,
      path: (r.__is_session ? ["source_row"] : fields)
        .filter((f) => r[f] != null)
        .map((f) => ({ field: f, value: String(r[f]) })),
      values: r,
      children: [],
    });
  }
  const tableColumns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "expand",
        header: "",
        size: 40,
        enableSorting: false,
        enableResizing: false,
        cell: ({ row }) =>
          isFlat ? (
            <span>{fmt("avg_class_size_incl", row.original.attendance)}</span>
          ) : (
            <button
              className="ref-expand"
              aria-label={`Expand ${row.original.label}`}
              aria-expanded={expanded.includes(row.id)}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((a) =>
                  a.includes(row.id)
                    ? a.filter((id) => id !== row.id)
                    : [...a, row.id],
                );
              }}
            >
              {expanded.includes(row.id) ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          ),
      },
      {
        id: "rank",
        header: "Rank",
        size: 96,
        enableSorting: false,
        cell: ({ row }) =>
          !isFlat && rankMap.has(row.id) ? (
            <span className="ref-rank">
              <Award size={12} />#{rankMap.get(row.id)}
            </span>
          ) : null,
      },
      {
        id: "label",
        accessorKey: "label",
        header: "Group",
        size: 250,
        cell: ({ row }) => (
          <button
            className="ref-group-label"
            title={String(row.original.label)}
            onClick={() => drill(row.original)}
          >
            {String(row.original.label)}
          </button>
        ),
      },
      ...columns.map((id) => ({
        id,
        accessorKey: id,
        header: labelFor(id),
        size:
          id === "location"
            ? 180
            : id === "trainer" || id === "format"
              ? 150
              : id === "formats"
                ? 220
                : id === "class_type"
                  ? 120
                  : ["day", "time"].includes(id)
                    ? 90
                    : 130,
        cell: ({ row }: { row: { original: Row } }) =>
          id === "formats" && view === "Trainer" && !isFlat ? (
            <div className="ref-trainer-formats">
              {trainerFormats(
                childMap.get(String(row.original.entity)) || [],
              ).map((part) => (
                <div key={part.key} title={part.text}>
                  <b>{part.day}</b>
                  <span>
                    {" "}
                    · {part.location}: {part.formats}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span
              title={
                isDetailColumn(id)
                  ? cellText(id, row.original)
                  : metrics[id]?.description
              }
            >
              {cellText(id, row.original)}
            </span>
          ),
      })),
      {
        id: "actions",
        header: "Actions",
        size: 90,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="ref-row-actions">
            <button
              aria-label={`Inspect ${row.original.label}`}
              title="Inspect sessions"
              onClick={() => drill(row.original)}
            >
              <Eye size={15} />
            </button>
            <button
              aria-label={`Compare ${row.original.label}`}
              title="Add to comparison"
              aria-pressed={!!selection[row.id]}
              onClick={() =>
                setSelection((a) => ({ ...a, [row.id]: !a[row.id] }))
              }
            >
              <GitCompareArrows size={14} />
            </button>
          </div>
        ),
      },
    ],
    [columns, isFlat, expanded, rankMap, selection, fields, childMap, view],
  );
  const table = useReactTable({
    data: tableData,
    columns: tableColumns,
    state: { sorting, rowSelection: selection, columnSizing },
    onColumnSizingChange: setColumnSizing,
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getRowId: (r) => String(r.entity),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: !isFlat,
    enableRowSelection: true,
    columnResizeMode: "onChange",
    initialState: { pagination: { pageSize: 25 } },
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const displayRows = table.getRowModel().rows.flatMap((row) => {
    const parent = { row, child: null as Row | null, key: row.id };
    return !isFlat && expanded.includes(row.id)
      ? [
          parent,
          ...(childMap.get(row.id) || []).map((child) => ({
            row,
            child,
            key: `${row.id}:session:${child.source_row}`,
          })),
        ]
      : [parent];
  });
  const headerOffset = TABLE_ROW_HEIGHT;
  const rowVirtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TABLE_ROW_HEIGHT,
    getItemKey: (index) => displayRows[index].key,
    overscan: 12,
    scrollMargin: headerOffset,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  useEffect(() => {
    rowVirtualizer.measure();
  }, [density, expanded, isFlat]);
  useEffect(() => table.setPageIndex(0), [tableData]);
  useEffect(() => {
    setSorting((current) =>
      current.filter((item) =>
        [
          "label",
          "selection",
          ...columns,
          ...(view === "specialty" ? ["premium"] : []),
        ].includes(item.id),
      ),
    );
  }, [columns, view]);
  const selected = data.filter((r) => selection[String(r.entity)]);
  function exportRows(list: Row[], name: string) {
    exportCSV(
      name,
      list.map((r) =>
        Object.fromEntries([
          ["Session / group", r.label],
          ...fields.map((f) => [f, r[f]]),
          ...columns.map((id) => [labelFor(id), r[id]]),
          ...(s.compare === "none"
            ? []
            : columns.map((id) => [
                `${labelFor(id)} — prior`,
                previous.get(String(r.entity))?.[id] ?? null,
              ])),
        ]),
      ),
    );
  }
  function reset() {
    setView("ClassDayTimeLocation");
    setPreset("All Metrics (Default)");
    setColumns(defaultColumns);
    setCriterion("fill_rate");
    setMinimum(3);
    setMinFill(0);
    setMinAttendance(0);
    setExcludeHosted(false);
    setSearch("");
    setSorting([{ id: "fill_rate", desc: true }]);
    setSelection({});
    setExpanded([]);
    setRankSubset("all");
    setFocusEntity(null);
    setLimit(5);
    setDensity(true);
    setColumnSizing({});
    setFlatMode(false);
  }
  function save() {
    const value = {
      view,
      preset,
      columns,
      criterion,
      minimum,
      excludeHosted,
      search,
      minFill,
      minAttendance,
      limit,
      density,
      sorting,
      columnSizing,
      customGroups,
      flatMode,
    };
    localStorage.setItem("p57-operations-view", JSON.stringify(value));
    setSaved(value);
  }
  return (
    <div className="ops-workspace">
      <Register
        index="O1"
        title="Class intelligence"
        subtitle="Compare unique classes, recurring slots and individual sessions across the active studio and period filters."
      >
        <div className="ref-table-controls">
          <span className="ref-control-caption">Table</span>
          <div className="ref-mode">
            <button
              aria-pressed={!isFlat}
              onClick={() => {
                setFlatMode(false);
                if (view === "sessions") setView("ClassDayTimeLocation");
              }}
            >
              <List size={13} />
              Grouped
            </button>
            <button aria-pressed={isFlat} onClick={() => setFlatMode(true)}>
              <Table2 size={13} />
              Flat
            </button>
          </div>
          {!isFlat && (
            <label>
              Group by
              <DropdownField
                aria-label="Grouping combination"
                value={view}
                onChange={(e) => setView(e.target.value as OperationView)}
              >
                <optgroup label="Class and schedule groupings">
                  {Object.entries(referenceGroupings).map(([key, item]) => (
                    <option key={key} value={key}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Additional analysis">
                  {Object.entries(operationViews)
                    .filter(
                      ([key]) =>
                        !(key in referenceGroupings) && key !== "sessions",
                    )
                    .map(([key, item]) => (
                      <option key={key} value={key}>
                        {item.label}
                      </option>
                    ))}
                </optgroup>
              </DropdownField>
            </label>
          )}
          {view === "custom" && !isFlat && (
            <div className="ops-custom-groups">
              {Object.entries(operationDimensions).map(([field, label]) => (
                <button
                  key={field}
                  aria-pressed={customGroups.includes(field)}
                  onClick={() =>
                    setCustomGroups((a) =>
                      a.includes(field)
                        ? a.length > 1
                          ? a.filter((f) => f !== field)
                          : a
                        : a.length < 5
                          ? [...a, field]
                          : a,
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ops-toolbar">
          <label className="ops-search">
            <Search size={15} />
            <input
              value={search}
              placeholder="Search classes, instructors, slots…"
              aria-label="Search class intelligence"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            Table view
            <DropdownField
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value);
                setColumns(presets[e.target.value]);
              }}
            >
              {Object.keys(presets).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </DropdownField>
          </label>
          <label>
            Ranking criterion
            <DropdownField
              value={criterion}
              onChange={(e) => {
                setCriterion(e.target.value);
                setSorting([
                  {
                    id: e.target.value,
                    desc: metrics[e.target.value]?.higherIsBetter !== false,
                  },
                ]);
                if (!columns.includes(e.target.value))
                  setColumns([...columns, e.target.value]);
              }}
            >
              {rankingMetrics.map((id) => (
                <option key={id} value={id}>
                  {labelFor(id)}
                </option>
              ))}
            </DropdownField>
          </label>
          <details className="ops-advanced">
            <summary>
              <SlidersHorizontal size={14} />
              Advanced filters
            </summary>
            <div className="ops-advanced-body">
              {" "}
              <label>
                Minimum sessions
                <input
                  type="number"
                  min="1"
                  value={minimum}
                  onChange={(e) =>
                    setMinimum(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </label>
              <label>
                Minimum fill %
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={minFill}
                  onChange={(e) =>
                    setMinFill(
                      Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                    )
                  }
                />
              </label>
              <label>
                Minimum average attendance
                <input
                  type="number"
                  min="0"
                  value={minAttendance}
                  onChange={(e) =>
                    setMinAttendance(Math.max(0, Number(e.target.value) || 0))
                  }
                />
              </label>
              <label className="ops-check">
                <input
                  type="checkbox"
                  checked={excludeHosted}
                  onChange={(e) => setExcludeHosted(e.target.checked)}
                />
                Exclude partnership / hosted sessions
              </label>
            </div>
          </details>
          <button onClick={reset}>
            <RotateCcw size={13} />
            Reset
          </button>
          <button onClick={save}>
            <Bookmark size={13} />
            Save view
          </button>
          {saved && (
            <button
              onClick={() => {
                if (!operationViews[saved.view] || !presets[saved.preset])
                  return;
                setView(saved.view);
                setFlatMode(saved.flatMode || false);
                setPreset(saved.preset);
                setColumns(
                  saved.columns.filter(
                    (id) =>
                      id in referenceColumnLabels ||
                      operationMetrics.includes(id),
                  ),
                );
                setCriterion(saved.criterion);
                setMinimum(saved.minimum);
                setExcludeHosted(saved.excludeHosted);
                setSearch(saved.search || "");
                setMinFill(saved.minFill || 0);
                setMinAttendance(saved.minAttendance || 0);
                setLimit(saved.limit || 5);
                setDensity(saved.density ?? true);
                setSorting(
                  saved.sorting || [
                    {
                      id: saved.criterion,
                      desc: metrics[saved.criterion]?.higherIsBetter !== false,
                    },
                  ],
                );
                setColumnSizing(saved.columnSizing || {});
                if (saved.customGroups?.length)
                  setCustomGroups(
                    saved.customGroups.filter((f) => f in operationDimensions),
                  );
                setRankSubset("all");
                setFocusEntity(null);
              }}
            >
              Restore saved view
            </button>
          )}
        </div>
        {loading ? (
          <p className="ops-status" role="status">
            Loading session intelligence…
          </p>
        ) : error ? (
          <p className="ops-status" role="alert">
            Session intelligence unavailable: {error}
          </p>
        ) : (
          <>
            <div className="ops-actions">
              <div className="ops-subset-control">
                {(["all", "top", "bottom"] as const).map((mode) => (
                  <button
                    key={mode}
                    aria-pressed={rankSubset === mode}
                    onClick={() => {
                      setRankSubset(mode);
                      setFocusEntity(null);
                    }}
                  >
                    {mode === "all"
                      ? "All groups"
                      : mode === "top"
                        ? "Top only"
                        : "Bottom only"}
                  </button>
                ))}
              </div>
              {focusEntity && (
                <button onClick={() => setFocusEntity(null)}>
                  Clear focused group ×
                </button>
              )}
              <span>
                {tableData.length.toLocaleString("en-IN")} groups / sessions
              </span>
              <span className="ops-sample-badge">
                ≥ {isFlat ? 1 : minimum} sessions
              </span>
              {minFill > 0 && (
                <span className="ops-sample-badge">Fill ≥ {minFill}%</span>
              )}
              {minAttendance > 0 && (
                <span className="ops-sample-badge">
                  Average attendance ≥ {minAttendance}
                </span>
              )}
              <details>
                <summary>
                  <Columns3 size={14} />
                  Columns
                </summary>
                <div className="ops-column-menu">
                  {[
                    ...new Set([
                      ...Object.values(referencePresets).flat(),
                      ...operationMetrics,
                    ]),
                  ].map((id) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={columns.includes(id)}
                        onChange={(e) =>
                          setColumns(
                            e.target.checked
                              ? [...columns, id]
                              : columns.filter((c) => c !== id),
                          )
                        }
                      />
                      {labelFor(id)}
                      {columns.includes(id) && (
                        <>
                          <button
                            type="button"
                            disabled={columns.indexOf(id) === 0}
                            aria-label={`Move ${labelFor(id)} left`}
                            onClick={(e) => {
                              e.preventDefault();
                              setColumns((a) => {
                                const b = [...a],
                                  i = b.indexOf(id);
                                [b[i - 1], b[i]] = [b[i], b[i - 1]];
                                return b;
                              });
                            }}
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            disabled={
                              columns.indexOf(id) === columns.length - 1
                            }
                            aria-label={`Move ${labelFor(id)} right`}
                            onClick={(e) => {
                              e.preventDefault();
                              setColumns((a) => {
                                const b = [...a],
                                  i = b.indexOf(id);
                                [b[i], b[i + 1]] = [b[i + 1], b[i]];
                                return b;
                              });
                            }}
                          >
                            →
                          </button>
                        </>
                      )}
                    </label>
                  ))}
                </div>
              </details>
              <span className="table-row-standard">32px rows</span>
              <button
                onClick={() =>
                  setExpanded(
                    expanded.length
                      ? []
                      : table.getRowModel().rows.map((r) => r.id),
                  )
                }
              >
                {expanded.length ? "Collapse all" : "Expand all"}
              </button>
              <button
                onClick={() =>
                  exportRows(
                    table.getSortedRowModel().rows.map((r) => r.original),
                    "studio-operations",
                  )
                }
              >
                <Download size={14} />
                Export filtered CSV
              </button>
              {selected.length > 0 && (
                <button
                  onClick={() => exportRows(selected, "selected-classes")}
                >
                  Export {selected.length} selected
                </button>
              )}
            </div>
            <p className="ops-method">
              Expand a group to see each individual session in the same columns.
              Group totals are weighted and never count expanded children twice.
              Waitlist values remain unavailable when absent from the source;
              cancellation value is a scenario estimate.
            </p>
            <div className="ref-table-caption">
              <strong>
                <i />
                Session Intelligence Table
              </strong>
              <span>
                {preset} · {tableData.length.toLocaleString("en-IN")}{" "}
                {isFlat ? "sessions" : "groups"} · {isFlat ? "Flat" : "Grouped"}{" "}
                view
              </span>
            </div>
            <div
              ref={scrollRef}
              className="ops-scroll ref-table-scroll"
              data-compact={density}
            >
              <table
                className="ops-table ref-intelligence-table"
                style={{ width: table.getTotalSize() }}
              >
                <thead>
                  {table.getHeaderGroups().map((group) => (
                    <tr key={group.id}>
                      {group.headers.map((header) => (
                        <th
                          key={header.id}
                          style={{ width: header.getSize() }}
                          aria-sort={
                            header.column.getIsSorted() === "asc"
                              ? "ascending"
                              : header.column.getIsSorted() === "desc"
                                ? "descending"
                                : "none"
                          }
                        >
                          <div>
                            {header.column.getCanSort() ? (
                              <button
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                                {header.column.getIsSorted() === "asc"
                                  ? " ↑"
                                  : header.column.getIsSorted() === "desc"
                                    ? " ↓"
                                    : ""}
                              </button>
                            ) : (
                              flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )
                            )}
                          </div>
                          {header.column.getCanResize() && (
                            <div
                              className="ops-resizer"
                              role="separator"
                              tabIndex={0}
                              aria-orientation="vertical"
                              aria-label={`Resize ${header.id}`}
                              onKeyDown={(e) => {
                                if (
                                  e.key === "ArrowLeft" ||
                                  e.key === "ArrowRight"
                                ) {
                                  e.preventDefault();
                                  setColumnSizing((a) => ({
                                    ...a,
                                    [header.id]: Math.max(
                                      60,
                                      header.getSize() +
                                        (e.key === "ArrowRight" ? 20 : -20),
                                    ),
                                  }));
                                }
                              }}
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {virtualRows[0]?.start > headerOffset && (
                    <tr className="ref-spacer">
                      <td
                        colSpan={tableColumns.length}
                        style={{ height: virtualRows[0].start - headerOffset }}
                      />
                    </tr>
                  )}
                  {virtualRows.map((virtualRow) => {
                    const entry = displayRows[virtualRow.index];
                    const { row, child } = entry;
                    return child ? (
                      <tr
                        className="ref-child-row"
                        key={entry.key}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={`${cell.id}-${child.source_row}`}
                            data-column={cell.column.id}
                            style={{ width: cell.column.getSize() }}
                          >
                            {cell.column.id === "expand" ? (
                              <span className="ref-child-arrow">↳</span>
                            ) : cell.column.id === "rank" ? null : cell.column
                                .id === "label" ? (
                              <button
                                className="ref-child-name"
                                title={String(
                                  child.session_name || child.format,
                                )}
                                onClick={() => drill(child)}
                              >
                                {String(child.session_name || child.format)}
                              </button>
                            ) : cell.column.id === "actions" ? (
                              <button
                                className="ref-child-inspect"
                                aria-label={`Inspect session ${child.session_id || child.source_row}`}
                                onClick={() => drill(child)}
                              >
                                <Eye size={15} />
                              </button>
                            ) : (
                              <span title={cellText(cell.column.id, child)}>
                                {cellText(cell.column.id, child)}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ) : (
                      <tr
                        key={entry.key}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className={isFlat ? "ref-session-row" : "ref-group-row"}
                        data-selected={!!selection[row.id]}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            data-column={cell.column.id}
                            style={{ width: cell.column.getSize() }}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {virtualRows.length > 0 && (
                    <tr className="ref-spacer">
                      <td
                        colSpan={tableColumns.length}
                        style={{
                          height: Math.max(
                            0,
                            rowVirtualizer.getTotalSize() -
                              ((virtualRows[virtualRows.length - 1]?.end ||
                                headerOffset) -
                                headerOffset),
                          ),
                        }}
                      />
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    {table.getVisibleLeafColumns().map((col, i) => (
                      <td key={col.id}>
                        {i === 0
                          ? "TOTALS"
                          : ["rank", "label", "actions"].includes(col.id) ||
                              isDetailColumn(col.id)
                            ? ""
                            : cellText(col.id, tableTotal)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            {!data.length && (
              <p className="ops-status">
                No eligible sessions match this view and its filters.{" "}
                {view === "faceoff"
                  ? "Try a longer period or include more instructors."
                  : "Reduce the minimum sample or clear table filters."}
              </p>
            )}
            {isFlat && (
              <div className="ops-pagination">
                <label>
                  Rows per page
                  <DropdownField
                    value={table.getState().pagination.pageSize}
                    onChange={(e) => table.setPageSize(Number(e.target.value))}
                  >
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </DropdownField>
                </label>
                <span>
                  Page {table.getState().pagination.pageIndex + 1} of{" "}
                  {Math.max(1, table.getPageCount())}
                </span>
                <button
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.previousPage()}
                >
                  Previous
                </button>
                <button
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.nextPage()}
                >
                  Next
                </button>
              </div>
            )}
            {selected.length > 0 && (
              <div className="ops-comparison">
                <h3>Selected performance comparison</h3>
                <button onClick={() => setSelection({})}>
                  Clear selection
                </button>
                <div className="ops-scroll">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        {selected.map((r) => (
                          <th key={String(r.entity)}>{String(r.label)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((id) => (
                        <tr key={id}>
                          <th>{labelFor(id)}</th>
                          {selected.map((r) => (
                            <td key={String(r.entity)}>{cellText(id, r)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="ops-ranking-head">
              <div>
                <h3>Top & bottom performance</h3>
                <p>
                  {labelFor(criterion)} ·{" "}
                  {metrics[criterion]?.higherIsBetter === false
                    ? "lower"
                    : "higher"}{" "}
                  is better · {rankings.eligible.length} eligible groups
                </p>
              </div>
              <label>
                List size
                <DropdownField
                  aria-label="Ranking list size"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                >
                  {[3, 5, 10, 20].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </DropdownField>
              </label>
              <button
                onClick={() =>
                  exportRows(
                    [...rankings.top, ...rankings.bottom],
                    "class-performance-rankings",
                  )
                }
              >
                <Download size={14} />
                Export rankings
              </button>
              <button
                disabled={selected.length < 2}
                onClick={() =>
                  document
                    .querySelector(".ops-comparison")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              >
                <GitCompareArrows size={14} />
                Compare selected ({selected.length})
              </button>
            </div>
            <div className="ops-rankings">
              {(["top", "bottom"] as const).map((side) => (
                <section key={side} data-side={side}>
                  <header>
                    <span className="ops-ranking-icon">
                      {side === "top" ? (
                        <Trophy size={18} />
                      ) : (
                        <TrendingDown size={18} />
                      )}
                    </span>
                    <div>
                      <h4>
                        {side === "top"
                          ? "Top performers"
                          : "Bottom performers"}
                      </h4>
                      <p>
                        {side === "top"
                          ? "Highest-performing eligible groups"
                          : "Lowest-performing distinct groups"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setRankSubset(side);
                        setFocusEntity(null);
                        document.querySelector(".ops-actions")?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                    >
                      View in table <ArrowUpRight size={13} />
                    </button>
                  </header>
                  {rankings[side].map((r, i) => {
                    const value = Number(r[criterion]);
                    const max = Math.max(
                      ...rankings.eligible.map((item) =>
                        Math.abs(Number(item[criterion])),
                      ),
                      1,
                    );
                    const before = previous.get(String(r.entity));
                    return (
                      <article
                        className="ops-ranking-card"
                        key={String(r.entity)}
                        data-selected={!!selection[String(r.entity)]}
                      >
                        <span className="ops-rank">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="ops-ranking-body">
                          <div className="ops-ranking-line">
                            <button
                              className="ops-ranking-name"
                              title={String(r.label)}
                              onClick={() => drill(r)}
                            >
                              {String(
                                r.reference_class ||
                                  (r.format !== "Multiple Values"
                                    ? r.format
                                    : null) ||
                                  (r.trainer !== "Multiple Values"
                                    ? r.trainer
                                    : null) ||
                                  r.format_group ||
                                  r.location ||
                                  r.day ||
                                  r.time ||
                                  r.label,
                              )}
                            </button>
                            <strong>{cellText(criterion, r)}</strong>
                          </div>
                          <p title={String(r.label)}>{String(r.label)}</p>
                          <div className="ops-rank-track" aria-hidden="true">
                            <i
                              style={{
                                width: `${Math.max(0, Math.min(100, (Math.abs(value) / max) * 100))}%`,
                              }}
                            />
                          </div>
                          <div className="ops-ranking-facts">
                            <span>{fmt("sessions", r.sessions)} sessions</span>
                            <span>{fmt("fill_rate", r.fill_rate)} fill</span>
                            <span>
                              {fmt(
                                "revenue_per_session",
                                r.revenue_per_session,
                              )}{" "}
                              / session
                            </span>
                            {s.compare !== "none" && (
                              <span className="ops-rank-change">
                                {delta(
                                  criterion,
                                  r[criterion],
                                  before?.[criterion],
                                )}
                              </span>
                            )}
                          </div>
                          <div className="ops-ranking-actions">
                            <button onClick={() => drill(r)}>
                              <ArrowUpRight size={12} />
                              Inspect
                            </button>
                            <button
                              aria-pressed={!!selection[String(r.entity)]}
                              onClick={() =>
                                setSelection((a) => ({
                                  ...a,
                                  [String(r.entity)]: !a[String(r.entity)],
                                }))
                              }
                            >
                              <GitCompareArrows size={12} />
                              {selection[String(r.entity)]
                                ? "Added to comparison"
                                : "Compare"}
                            </button>
                            <button
                              onClick={() => {
                                setFocusEntity(String(r.entity));
                                setRankSubset("all");
                                document
                                  .querySelector(".ops-actions")
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "start",
                                  });
                              }}
                            >
                              <Focus size={12} />
                              Focus table
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {!rankings[side].length && (
                    <div className="ops-ranking-empty">
                      No distinct eligible groups. Broaden the scope or lower
                      the minimum sample.
                    </div>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </Register>
      <Register
        index="OS"
        title="Schedule changes & performance"
        subtitle="Observed instructor, capacity and recurring-slot changes across adjacent months."
        actions={
          <DropdownField
            aria-label="Schedule change type"
            value={changeKind}
            onChange={(e) => setChangeKind(e.target.value)}
          >
            <option value="all">All changes</option>
            {[...new Set(scheduleChanges(monthly).map((c) => c.kind))].map(
              (kind) => (
                <option key={kind}>{kind}</option>
              ),
            )}
          </DropdownField>
        }
      >
        {loading ? (
          <p className="ops-status" role="status">
            Loading schedule changes…
          </p>
        ) : error ? (
          <p className="ops-status" role="alert">
            Schedule analysis unavailable: {error}
          </p>
        ) : (
          <>
            <p className="ops-method">
              Selected months compared with their preceding month · observed
              changes only. Partial months, instructor filters and missing
              records can affect detection. No change log is available to
              confirm moves or establish causation. Day/time moves require a
              unique match; simultaneous moves remain separate observations.
            </p>
            <div className="ops-actions">
              <button
                onClick={() =>
                  exportCSV(
                    "schedule-changes",
                    changes.map((c) => ({
                      change: c.kind,
                      month: c.period,
                      evidence: c.evidence,
                      before: JSON.stringify(c.before),
                      after: JSON.stringify(c.after),
                    })),
                  )
                }
              >
                <Download size={14} />
                Export changes
              </button>
            </div>
            <div className="ops-scroll">
              <table
                className="ops-table"
                id="ops-schedule-table"
                style={{ minWidth: 2340 }}
              >
                <colgroup>
                  {[140, 100, 280, 420, 160, 180, 150, 130, 220, 560].map(
                    (width, i) => (
                      <col key={i} style={{ width }} />
                    ),
                  )}
                </colgroup>
                <thead>
                  <tr>
                    {[
                      "Change",
                      "Month",
                      "Class / studio",
                      "Before → after",
                      "Sessions before / after",
                      "Average attendance before / after",
                      "Fill before / after",
                      "Fill change",
                      "Revenue / session before / after",
                      "Evidence",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.id}>
                      <td>{c.kind}</td>
                      <td>{c.period}</td>
                      <td>
                        {c.after?.format || c.before?.format} ·{" "}
                        {c.after?.location || c.before?.location}
                      </td>
                      <td>
                        {[c.before, c.after]
                          .map((r) =>
                            r
                              ? `${r.day} ${r.time} · ${r.instructor_roster || "Unspecified"} · capacity ${r.capacity_per_session == null ? "—" : Number(r.capacity_per_session).toFixed(1)}`
                              : "Not observed",
                          )
                          .join(" → ")}
                      </td>
                      {["sessions", "avg_class_size_incl", "fill_rate"].map(
                        (id) => (
                          <td key={id}>
                            {fmt(id, c.before?.[id])} / {fmt(id, c.after?.[id])}
                          </td>
                        ),
                      )}
                      <td>
                        {delta(
                          "fill_rate",
                          c.after?.fill_rate,
                          c.before?.fill_rate,
                        )}
                      </td>
                      <td>
                        {fmt(
                          "revenue_per_session",
                          c.before?.revenue_per_session,
                        )}{" "}
                        /{" "}
                        {fmt(
                          "revenue_per_session",
                          c.after?.revenue_per_session,
                        )}
                      </td>
                      <td title={c.evidence}>{c.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!changes.length && (
              <p className="ops-status">
                No observed schedule changes meet the current filters and sample
                threshold. The preceding month is included automatically when
                source records are available.
              </p>
            )}
          </>
        )}
      </Register>
    </div>
  );
}
