import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DropdownField } from "./ui/DropdownField";
import { AdvancedFilterEditor, fieldLabel } from "./AdvancedFilterEditor";
import {
  AnalyticalTable,
  type AnalyticalRow,
  type AnalyticalColumn,
  type TableLayout,
} from "./AnalyticalTable";
import { AnalyticalChart } from "./AnalyticalChart";
import {
  analysisQueries,
  defaultAnalysisConfig,
  analysisDimensions,
  outcomeSQL,
  type AnalysisConfig,
} from "../data/advanced-analysis";
import {
  emptyGroup,
  compileFilters,
  filterFields,
  completeRange,
  alignedGrainSQL,
  displayCalculation,
  deltaValues,
  nextBucket,
  shiftDays,
  type Grain,
  type Calculation,
  type Aggregate,
} from "../data/advanced-controls";
import { sqlTypes } from "../data/normalise";
import { blueprints } from "../data/blueprints";
import { sheets } from "../data/sheets.config";
import { catalogue } from "../semantics/catalogue";
import { metrics } from "../semantics/metrics";
import { currentSnapshotMetrics } from "../semantics/evidence";
import { ensureSource, usable } from "../data/loader";
import { query, health, type Row } from "../data/duckdb";
import { today, comparison } from "../data/analytics";
import { periods, relativePeriod, comparisonOptions } from "../data/periods";
import { useStore, type Filters } from "../state/store";
import { readLocal } from "../data/control-storage";
import { buildCSV, type ExportReceipt } from "../data/export-format";
import { download } from "./exports";
import type { TreeRow } from "./NestedTable";
interface SavedAnalysis {
  id: string;
  name: string;
  config: AnalysisConfig;
  filters: Filters;
  transient: { field: string; value: string }[];
  compare: string;
  layout?: TableLayout;
  completeOnly: boolean;
  customFrom: string;
  customTo: string;
}
interface AnalysisResult {
  config: AnalysisConfig;
  filters: Filters;
  transient: { field: string; value: string }[];
  compare: string;
  queries: ReturnType<typeof analysisQueries>;
  rows: AnalyticalRow[];
  groups: AnalyticalRow[];
  total: Row;
  previous: Row;
  prior: Row[];
  receipt: ExportReceipt;
}
const tableSources = catalogue();
const keyOf = (r: Row) => JSON.stringify([r.period ?? null, r.segment]);
export function AnalysisWorkbench({
  version,
  onDrill,
}: {
  version: number;
  onDrill: (row: TreeRow) => void;
}) {
  const store = useStore();
  const initialSource = blueprints[store.tab]?.source || "sessions";
  const metricFor = (source: string) =>
    tableSources
      .get(source)
      ?.find(
        (m) => !currentSnapshotMetrics.has(m.id) && m.id !== "draw_premium_pp",
      )?.id || "attendance";
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<AnalysisConfig>(() =>
    defaultAnalysisConfig(initialSource, metricFor(initialSource)),
  );
  const [rollingDays, setRollingDays] = useState(30);
  const [from, setFrom] = useState(store.filters.from);
  const [to, setTo] = useState(store.filters.to);
  const [completeOnly, setCompleteOnly] = useState(false);
  const [compare, setCompare] = useState(store.compare);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [localDates, setLocalDates] = useState(false);
  const [localRules, setLocalRules] = useState(emptyGroup);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selected, setSelected] = useState<AnalyticalRow[]>([]);
  const [selectedTotal, setSelectedTotal] = useState<Row | null>(null);
  const [chartSelected, setChartSelected] = useState<AnalyticalRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("both");
  const [deltaMode, setDeltaMode] = useState("relative");
  const [linkCopied, setLinkCopied] = useState(false);
  const [saved, setSaved] = useState<SavedAnalysis[]>(() =>
    readLocal("atlas-analyses", []),
  );
  const [name, setName] = useState("");
  const [layout, setLayout] = useState<TableLayout | undefined>(() =>
    readLocal(`atlas-analysis-table-${store.tab}`, undefined),
  );
  const [layoutRevision, setLayoutRevision] = useState(0);
  const saveTableLayout = useCallback(
    (next: TableLayout) => {
      setLayout(next);
      localStorage.setItem(
        `atlas-analysis-table-${store.tab}`,
        JSON.stringify(next),
      );
    },
    [store.tab],
  );
  const [recent, setRecent] = useState<SavedAnalysis[]>(() =>
    readLocal("atlas-recent-analyses", []),
  );
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);
  const visibleRows = useRef<AnalyticalRow[]>([]);
  const updateVisible = useCallback((rows: AnalyticalRow[]) => {
    visibleRows.current = rows;
  }, []);
  const sequence = useRef(0);
  const selectedSequence = useRef(0);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const handler = () => {
      setOpen(true);
      root.current?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    };
    window.addEventListener("atlas-open-analysis", handler);
    return () => window.removeEventListener("atlas-open-analysis", handler);
  }, []);
  useEffect(() => {
    if (!localDates) {
      setFrom(store.filters.from);
      setTo(store.filters.to);
    }
  }, [store.filters.from, store.filters.to, localDates]);
  const choices =
    tableSources
      .get(config.source)
      ?.filter(
        (m) => !currentSnapshotMetrics.has(m.id) && m.id !== "draw_premium_pp",
      ) || [];
  const prepareFilters = () => {
    let dates = {
      from: localDates ? from : store.filters.from,
      to: localDates ? to : store.filters.to,
    };
    if (dates.from && dates.to && dates.from > dates.to)
      throw new Error("Start date must precede end date.");
    if (completeOnly)
      dates = completeRange(dates.from, dates.to, config.grain, today());
    compileFilters(localRules, sqlTypes);
    const rules = [store.filters.advanced, localRules].filter(
      (g) => g?.rules.length,
    );
    return {
      ...store.filters,
      ...dates,
      advanced: rules.length
        ? {
            id: "combined",
            join: "and" as const,
            rules: rules as ReturnType<typeof emptyGroup>[],
          }
        : undefined,
    };
  };
  const run = async (override?: {
    config?: AnalysisConfig;
    filters?: Filters;
    compare?: string;
    transient?: { field: string; value: string }[];
  }) => {
    const token = ++sequence.current;
    setBusy(true);
    setError("");
    setSelected([]);
    setSelectedTotal(null);
    setChartSelected([]);
    selectedSequence.current++;
    try {
      const c = override?.config || config;
      const f = override?.filters || prepareFilters();
      const cross = override?.transient || store.transient;
      const mode =
        override?.compare ??
        (compare === "custom" ? `custom:${customFrom}:${customTo}` : compare);
      if (
        mode.startsWith("custom:") &&
        (!/^custom:\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/.test(mode) ||
          mode.split(":")[1] > mode.split(":")[2])
      )
        throw new Error("Choose a valid custom comparison range.");
      if (!tableSources.has(c.source))
        throw new Error("Choose an available analysis source.");
      if (
        ["per_session", "per_member"].includes(c.calculation) &&
        !(
          c.aggregate === "count" ||
          c.aggregate === "sum" ||
          c.aggregate === "distinct" ||
          (c.aggregate === "metric" && metrics[c.metric]?.aggregation === "sum")
        )
      )
        throw new Error(
          "Normalization requires a count or additive amount, rather than a rate or median.",
        );
      if (
        !["metric", "count", "distinct", "sum", "median", "average"].includes(
          c.aggregate,
        )
      )
        throw new Error("Choose a valid aggregate.");
      if (
        !["value", "share", "cumulative", "per_session", "per_member"].includes(
          c.calculation,
        )
      )
        throw new Error("Choose a valid display calculation.");
      if (c.aggregate !== "metric" && !Object.hasOwn(sqlTypes, c.field))
        throw new Error("Choose a valid field.");
      const metricSources =
        c.aggregate === "metric"
          ? (metrics[c.metric]?.sources || [])
              .map(
                (reference) =>
                  sheets.find(
                    (sheet) =>
                      sheet.title.toLowerCase() ===
                      reference
                        .split(".")[0]
                        .split(" →")[0]
                        .trim()
                        .toLowerCase(),
                  )?.key,
              )
              .filter((key): key is string => !!key)
          : [];
      const required = [
        ...new Set([
          c.source,
          ...metricSources,
          ...(c.outcome !== "recorded" && c.source === "new"
            ? [c.metric === "conversion_rate" ? "sales" : "checkins"]
            : []),
        ]),
      ];
      await Promise.all(required.map((source) => ensureSource(source)));
      for (const source of required)
        if (!usable(source))
          throw new Error(
            `The ${source} source is unavailable. Inspect Data health or retry the source.`,
          );
      if (c.aggregate !== "metric" && c.aggregate !== "count") {
        const [presence] = await query(
          `SELECT COUNT("${c.field}") AS populated FROM "${c.source}"`,
        );
        if (!Number(presence.populated))
          throw new Error(
            `${fieldLabel(c.field)} is not populated in the ${c.source} source.`,
          );
      }
      if (
        c.calculation === "per_session" &&
        !["sessions", "checkins", "bookings"].includes(c.source)
      )
        throw new Error(
          "Per-session normalization needs a source with session identifiers.",
        );
      if (
        c.calculation === "per_member" &&
        ["sessions", "payroll", "meta"].includes(c.source)
      )
        throw new Error(
          "Per-member normalization needs a source with member identifiers.",
        );
      if (
        c.calculation === "share" &&
        !(
          c.aggregate === "count" ||
          c.aggregate === "sum" ||
          (c.aggregate === "metric" && metrics[c.metric]?.aggregation === "sum")
        )
      )
        throw new Error(
          "Share of total requires an additive measure. Choose a count or sum.",
        );
      const queries = analysisQueries(c, f, cross);
      const priorFilters = comparison(f, mode);
      const dateExpression =
        c.source === "payroll"
          ? "concat(month,'-01')"
          : c.source === "lapsed"
            ? '"end_date"'
            : '"date"';
      const alignedPeriod =
        mode === "none"
          ? undefined
          : alignedGrainSQL(dateExpression, c.grain, f, priorFilters, mode);
      const priorQueries = analysisQueries(
        c,
        priorFilters,
        cross,
        alignedPeriod,
      );
      const [raw, total, groups, prior, previous] = await Promise.all([
        query(queries.grouped),
        query(queries.total),
        query(queries.groupTotals),
        mode === "none"
          ? Promise.resolve([] as Row[])
          : query(priorQueries.grouped),
        mode === "none"
          ? Promise.resolve([] as Row[])
          : query(priorQueries.total),
      ]);
      if (token !== sequence.current) return;
      const priorMap = new Map(prior.map((r) => [keyOf(r), r]));
      const convert = (r: Row, group = false): AnalyticalRow => {
        const totalValue = total[0]?.value;
        const value = displayCalculation(
          r.value,
          c.calculation,
          totalValue,
          r.denominator,
        );
        const previousRow = priorMap.get(keyOf(r));
        const p = previousRow
          ? displayCalculation(
              previousRow.value,
              c.calculation,
              previous[0]?.value,
              previousRow.denominator,
            )
          : null;
        const delta = deltaValues(
          value,
          p,
          c.calculation === "share" ||
            (c.aggregate === "metric" &&
              metrics[c.metric]?.format === "percent"),
        );
        return {
          id: group ? `group:${r.segment}` : keyOf(r),
          segment: String(r.segment ?? "Unspecified"),
          period: group ? null : r.period == null ? null : String(r.period),
          value,
          prior: p,
          delta: delta.absolute,
          relative: delta.relative,
          points: delta.points,
          denominator: r.denominator == null ? null : Number(r.denominator),
          records: Number(r.records) || 0,
        };
      };
      const receipt: ExportReceipt = {
        scope: "All filtered analytical rows",
        generatedAt: new Date().toISOString(),
        filters: f,
        crossFilters: cross,
        comparison: mode,
        sources: required.map((source) => ({
          name: source,
          fetchedAt: health[source]?.fetchedAt ?? null,
          hash: health[source]?.hash,
        })),
        definitions: {
          value: queries.definition,
          calculation: c.calculation,
          denominator: c.calculation.startsWith("per_")
            ? c.calculation
            : c.outcome !== "recorded"
              ? "Eligible mature newcomer records"
              : c.aggregate === "metric" &&
                  metrics[c.metric]?.aggregation === "weighted"
                ? "The shared metric’s protected denominator; see its definition"
                : "Source records",
          comparisonAlignment:
            "Comparison observations shifted onto the current time axis before grouping; absent buckets remain unavailable",
        },
        rowCount: raw.length,
      };
      const next = {
        config: c,
        filters: f,
        transient: cross,
        compare: mode,
        queries,
        rows: raw.map((r) => convert(r)),
        groups: groups.map((r) => convert(r, true)),
        total: total[0],
        previous: previous[0] || {},
        prior,
        receipt,
      };
      setResult(next);
      const entry: SavedAnalysis = {
        id: crypto.randomUUID(),
        name: `${c.aggregate === "metric" ? metrics[c.metric].label : `${c.aggregate} ${c.field}`} · ${f.from || "start"} to ${f.to || "latest"}`,
        config: c,
        filters: f,
        transient: cross,
        compare: mode,
        completeOnly,
        customFrom,
        customTo,
      };
      const updated = [
        entry,
        ...readLocal<SavedAnalysis[]>("atlas-recent-analyses", []),
      ].slice(0, 12);
      setRecent(updated);
      localStorage.setItem("atlas-recent-analyses", JSON.stringify(updated));
    } catch (e) {
      if (token === sequence.current) setError((e as Error).message);
    } finally {
      if (token === sequence.current) setBusy(false);
    }
  };
  useEffect(() => {
    try {
      const encoded = new URLSearchParams(location.search).get("analysis");
      if (!encoded) return;
      const linked = JSON.parse(encoded);
      if (!linked.config || !tableSources.has(linked.config.source)) return;
      setOpen(true);
      setConfig({ ...defaultAnalysisConfig(), ...linked.config });
      setLocalDates(true);
      setFrom(linked.filters.from);
      setTo(linked.filters.to);
      setCompare(
        linked.compare?.startsWith("custom:")
          ? "custom"
          : linked.compare || "none",
      );
      if (linked.compare?.startsWith("custom:")) {
        setCustomFrom(linked.compare.split(":")[1]);
        setCustomTo(linked.compare.split(":")[2]);
      }
      void run({
        config: linked.config,
        filters: linked.filters,
        compare: linked.compare,
        transient: linked.transient || [],
      });
    } catch {
      setError(
        "This analysis link could not be read. Use the controls to create a new analysis.",
      );
    }
  }, []);
  const reset = () => {
    sequence.current++;
    setConfig(defaultAnalysisConfig(initialSource, metricFor(initialSource)));
    setLocalDates(false);
    setLocalRules(emptyGroup());
    setCompleteOnly(false);
    setCompare(store.compare);
    setCustomFrom("");
    setCustomTo("");
    setResult(null);
    setSelected([]);
    setSelectedTotal(null);
    setChartSelected([]);
    setBreadcrumb([]);
    setError("");
    setBusy(false);
  };
  const restore = (entry: SavedAnalysis) => {
    setConfig(entry.config);
    setLocalDates(true);
    setFrom(entry.filters.from);
    setTo(entry.filters.to);
    setLocalRules(entry.filters.advanced || emptyGroup());
    setCompleteOnly(entry.completeOnly);
    setCompare(entry.compare.startsWith("custom:") ? "custom" : entry.compare);
    setCustomFrom(entry.customFrom || entry.compare.split(":")[1] || "");
    setCustomTo(entry.customTo || entry.compare.split(":")[2] || "");
    setLayout(entry.layout);
    setLayoutRevision((n) => n + 1);
    void run({
      config: entry.config,
      filters: entry.filters,
      compare: entry.compare,
      transient: entry.transient,
    });
  };
  const activeConfig = result?.config || config;
  const format = useCallback(
    (v: unknown) => {
      if (v == null || !Number.isFinite(Number(v))) return "n/a";
      const c = result?.config || config;
      const percent =
        c.calculation === "share" ||
        (c.aggregate === "metric" &&
          metrics[c.metric]?.format === "percent" &&
          !c.calculation.startsWith("per_"));
      return percent
        ? `${(Number(v) * 100).toFixed(1)}%`
        : new Intl.NumberFormat("en-IN", {
            maximumFractionDigits:
              c.aggregate === "count" || c.aggregate === "distinct" ? 0 : 1,
            style:
              c.aggregate === "metric" &&
              metrics[c.metric]?.format === "currency"
                ? "currency"
                : "decimal",
            currency: "INR",
          }).format(Number(v));
    },
    [activeConfig],
  );
  const label = result
    ? result.config.aggregate === "metric"
      ? metrics[result.config.metric].label
      : `${fieldLabel(result.config.aggregate)} ${result.config.aggregate === "count" ? "records" : fieldLabel(result.config.field)}`
    : "Measure";
  const percent =
    result &&
    (result.config.calculation === "share" ||
      (result.config.aggregate === "metric" &&
        metrics[result.config.metric]?.format === "percent"));
  const columns = useMemo<AnalyticalColumn[]>(
    () => [
      {
        id: "segment",
        label: fieldLabel(result?.config.dimension || config.dimension),
        format: (v) => String(v ?? "Unspecified"),
      },
      {
        id: "period",
        label: "Period",
        format: (v) => (v == null ? "Undated" : String(v)),
      },
      { id: "value", label, format },
      {
        id: "denominator",
        label: "Denominator",
        format: (v) => (v == null ? "n/a" : Number(v).toLocaleString("en-IN")),
      },
      {
        id: "records",
        label: "Source records",
        format: (v) => Number(v).toLocaleString("en-IN"),
      },
      { id: "trend", label: "Trend", format: (v) => String(v ?? "") },
      ...(result?.compare !== "none" && result
        ? [
            { id: "prior", label: "Comparison", format },
            {
              id:
                deltaMode === "points"
                  ? "points"
                  : deltaMode === "relative"
                    ? "relative"
                    : "delta",
              label:
                deltaMode === "points"
                  ? "Change (pp)"
                  : deltaMode === "relative"
                    ? "Change (%)"
                    : "Change",
              format: (v: unknown) =>
                v == null
                  ? "n/a"
                  : deltaMode === "relative"
                    ? `${Number(v) >= 0 ? "+" : ""}${(Number(v) * 100).toFixed(1)}%`
                    : deltaMode === "points"
                      ? `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(1)} pp`
                      : format(v),
            },
          ]
        : []),
    ],
    [result, label, format, config.dimension, deltaMode],
  );
  const selectRows = useCallback(
    (rows: AnalyticalRow[]) => {
      setSelected(rows);
      setSelectedTotal(null);
      const token = ++selectedSequence.current;
      if (!result || !rows.length) return;
      query(
        result.queries.selected(
          rows.map((r) => ({ period: r.period, segment: r.segment })),
        ),
      )
        .then((r) => {
          if (token === selectedSequence.current) setSelectedTotal(r[0]);
        })
        .catch((e) => {
          if (token === selectedSequence.current)
            setError((e as Error).message);
        });
    },
    [result],
  );
  const selectChart = useCallback(
    (rows: AnalyticalRow[]) => setChartSelected(rows),
    [],
  );
  const inspect = (row: AnalyticalRow) => {
    if (!result) return;
    const c = result.config;
    let predicate = `COALESCE(CAST("${c.dimension}" AS VARCHAR),'Unspecified')='${row.segment.replaceAll("'", "''")}'`;
    if (
      c.source === "new" &&
      c.outcome !== "recorded" &&
      ["conversion_rate", "retention_rate"].includes(c.metric)
    )
      predicate += ` AND (${outcomeSQL(c).eligible})`;
    const periodEnd = row.period
      ? shiftDays(nextBucket(row.period, c.grain), -1)
      : "";
    const filters = {
      ...result.filters,
      ...(row.period
        ? {
            from:
              c.calculation === "cumulative"
                ? result.filters.from
                : result.filters.from && result.filters.from > row.period
                  ? result.filters.from
                  : row.period,
            to:
              result.filters.to && result.filters.to < periodEnd
                ? result.filters.to
                : periodEnd,
          }
        : {}),
    };
    setBreadcrumb([label, row.segment, row.period || "Undated"]);
    onDrill({
      id: row.id,
      label: `${label} · ${row.segment} · ${row.period || "Undated"}`,
      source: c.source,
      filters,
      transient: result.transient,
      path: [],
      values: {},
      children: [],
      predicate,
      metrics:
        c.aggregate === "metric" && c.outcome === "recorded"
          ? [c.metric]
          : ["records"],
    });
  };
  const inspectSelection = (rows: AnalyticalRow[]) => {
    if (!result || !rows.length) return;
    const c = result.config;
    let predicate = result.queries.recordPredicate(
      rows.map((r) => ({ period: r.period, segment: r.segment })),
    );
    if (
      c.source === "new" &&
      c.outcome !== "recorded" &&
      ["conversion_rate", "retention_rate"].includes(c.metric)
    )
      predicate += ` AND (${outcomeSQL(c).eligible})`;
    setBreadcrumb([label, `${rows.length} selected groups / periods`]);
    onDrill({
      id: "analysis-selection",
      label: `${label} · selected source records`,
      source: c.source,
      filters: result.filters,
      transient: result.transient,
      path: [],
      values: {},
      children: [],
      predicate,
      metrics:
        c.aggregate === "metric" && c.outcome === "recorded"
          ? [c.metric]
          : ["records"],
    });
  };
  const applyChart = () => {
    if (!result || !chartSelected.length) return;
    const periodValues = chartSelected
      .map((r) => r.period)
      .filter((p): p is string => !!p)
      .sort();
    const segments = [...new Set(chartSelected.map((r) => r.segment))];
    const group = {
      id: crypto.randomUUID(),
      join: "and" as const,
      rules: [
        {
          id: crypto.randomUUID(),
          field: result.config.dimension,
          operator: "in" as const,
          value: segments.join("|"),
        },
      ],
    };
    setLocalDates(true);
    setFrom(periodValues[0] || result.filters.from);
    setTo(
      periodValues.length
        ? shiftDays(nextBucket(periodValues.at(-1)!, result.config.grain), -1)
        : result.filters.to,
    );
    setLocalRules(group);
    void run({
      config: result.config,
      filters: {
        ...result.filters,
        from: periodValues[0] || result.filters.from,
        to: periodValues.length
          ? shiftDays(nextBucket(periodValues.at(-1)!, result.config.grain), -1)
          : result.filters.to,
        advanced: {
          id: "chart-combined",
          join: "and",
          rules: [
            ...(result.filters.advanced ? [result.filters.advanced] : []),
            group,
          ],
        },
      },
      compare: result.compare,
    });
  };
  const exportData = async (scope: string) => {
    if (!result) return;
    setExportBusy(true);
    setError("");
    try {
      if (scope === "analysis") {
        download(
          "atlas-full-analysis.json",
          new Blob(
            [
              JSON.stringify(
                {
                  metadata: result.receipt,
                  config: result.config,
                  total: result.total,
                  comparisonTotal: result.previous,
                  rows: result.rows,
                  groupTotals: result.groups,
                  comparisonRows: result.prior,
                },
                null,
                2,
              ),
            ],
            { type: "application/json" },
          ),
        );
      } else {
        const records =
          scope === "records"
            ? await query(result.queries.raw)
            : scope === "visible"
              ? visibleRows.current
              : result.rows;
        const receipt = {
          ...result.receipt,
          scope:
            scope === "records"
              ? "All filtered source records"
              : scope === "visible"
                ? "Visible analytical page"
                : "All filtered analytical rows",
          rowCount: records.length,
        };
        download(
          `atlas-${scope}.csv`,
          new Blob(
            [
              "\ufeff" +
                buildCSV(
                  records as unknown as Record<string, unknown>[],
                  receipt,
                ),
            ],
            { type: "text/csv;charset=utf-8" },
          ),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExportBusy(false);
    }
  };
  const copyLink = async () => {
    if (!result) return;
    try {
      if (
        filterFields(result.filters.advanced).some((field) =>
          ["member", "member_id", "email", "phone"].includes(field),
        ) ||
        result.transient.some((t) =>
          ["member", "member_id", "email", "phone"].includes(t.field),
        )
      )
        throw new Error(
          "Member-specific analyses stay in saved views or exports; share links support non-identifying scopes.",
        );
      const link = new URL(location.href);
      link.searchParams.set("tab", String(store.tab));
      link.searchParams.set("f", JSON.stringify(result.filters));
      link.searchParams.set("compare", result.compare);
      if (result.transient.length)
        link.searchParams.set("x", JSON.stringify(result.transient));
      else link.searchParams.delete("x");
      link.searchParams.set(
        "analysis",
        JSON.stringify({
          config: result.config,
          filters: result.filters,
          compare: result.compare,
          transient: result.transient,
        }),
      );
      await navigator.clipboard.writeText(link.href);
      setError("");
      setLinkCopied(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const saveView = () => {
    if (!name.trim() || !result) return;
    const entry: SavedAnalysis = {
      id: crypto.randomUUID(),
      name: name.trim(),
      config: result.config,
      filters: result.filters,
      transient: result.transient,
      compare: result.compare,
      completeOnly,
      customFrom,
      customTo,
      layout,
    };
    const next = [...saved, entry];
    setSaved(next);
    localStorage.setItem("atlas-analyses", JSON.stringify(next));
    setName("");
  };
  return (
    <section
      ref={root}
      className="analysis-workbench"
      aria-label="Advanced analysis controls"
    >
      <div className="analysis-workbench-heading">
        <button
          className="analysis-open-button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span>{open ? "▾" : "▸"}</span> Advanced analysis
        </button>
        <span className="muted">
          Dates · calculations · tables · charts · exports
        </span>
      </div>
      {open && (
        <>
          <div className="advanced-actions analysis-saved-grid">
            <DropdownField
              aria-label="Open saved analysis"
              value=""
              onChange={(e) => {
                const entry = saved.find((x) => x.id === e.target.value);
                if (entry) restore(entry);
              }}
            >
              <option value="">Saved analyses…</option>
              {saved.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </DropdownField>
            <DropdownField
              aria-label="Recently viewed analyses"
              value=""
              onChange={(e) => {
                const entry = recent.find((x) => x.id === e.target.value);
                if (entry) restore(entry);
              }}
            >
              <option value="">Recently viewed…</option>
              {recent.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </DropdownField>
            <button onClick={reset}>Reset this section</button>
          </div>
          <div className="analysis-control-grid">
            <label>
              Source
              <DropdownField
                value={config.source}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...defaultAnalysisConfig(
                      e.target.value,
                      metricFor(e.target.value),
                    ),
                    grain: c.grain,
                    dimension: c.dimension,
                  }))
                }
              >
                {[...tableSources.keys()].map((source) => (
                  <option key={source} value={source}>
                    {fieldLabel(source)}
                  </option>
                ))}
              </DropdownField>
            </label>
            <label>
              Calculation
              <DropdownField
                value={config.aggregate}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    aggregate: e.target.value as Aggregate,
                  }))
                }
              >
                <option value="metric">
                  Defined metric · weighted where applicable
                </option>
                <option value="count">Count records</option>
                <option value="distinct">Distinct count</option>
                <option value="sum">Sum field</option>
                <option value="median">Median field</option>
                <option value="average">Average field</option>
              </DropdownField>
            </label>
            {config.aggregate === "metric" ? (
              <label>
                Metric
                <DropdownField
                  value={config.metric}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, metric: e.target.value }))
                  }
                >
                  {choices.map((m) => (
                    <option key={m.id} value={m.id}>
                      {metrics[m.id].label}
                    </option>
                  ))}
                </DropdownField>
              </label>
            ) : (
              config.aggregate !== "count" && (
                <label>
                  Field
                  <DropdownField
                    value={config.field}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, field: e.target.value }))
                    }
                  >
                    {Object.keys(sqlTypes)
                      .filter(
                        (f) =>
                          config.aggregate === "distinct" ||
                          sqlTypes[f] === "DOUBLE",
                      )
                      .sort()
                      .map((f) => (
                        <option key={f} value={f}>
                          {fieldLabel(f)}
                        </option>
                      ))}
                  </DropdownField>
                </label>
              )
            )}
            <label>
              Break down by
              <DropdownField
                value={config.dimension}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, dimension: e.target.value }))
                }
              >
                {analysisDimensions.map((f) => (
                  <option key={f} value={f}>
                    {fieldLabel(f)}
                  </option>
                ))}
              </DropdownField>
            </label>
            <label>
              Time grain
              <DropdownField
                value={config.grain}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, grain: e.target.value as Grain }))
                }
              >
                {["day", "week", "month", "quarter"].map((g) => (
                  <option key={g} value={g}>
                    {fieldLabel(g)}
                  </option>
                ))}
              </DropdownField>
            </label>
            <label>
              Display measure
              <DropdownField
                value={config.calculation}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    calculation: e.target.value as Calculation,
                  }))
                }
              >
                <option value="value">Actual value / rate</option>
                <option value="share">Share of full scoped total</option>
                <option value="cumulative">
                  Cumulative · recompute from source
                </option>
                <option value="per_session">Per distinct session</option>
                <option value="per_member">Per distinct member</option>
              </DropdownField>
            </label>
          </div>
          <fieldset className="analysis-dates">
            <legend>Period & comparison</legend>
            <div className="advanced-actions analysis-period-grid">
              <label className="analysis-toggle analysis-date-mode">
                <input
                  type="checkbox"
                  checked={localDates}
                  onChange={(e) => setLocalDates(e.target.checked)}
                />
                Section-specific dates
              </label>
              <label>
                From
                <input
                  aria-label="Analysis start date"
                  type="date"
                  disabled={!localDates}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  aria-label="Analysis end date"
                  type="date"
                  disabled={!localDates}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <label>
                Date preset
                <DropdownField
                  aria-label="Analysis date preset"
                  value=""
                  onChange={(e) => {
                    setLocalDates(true);
                    const range = relativePeriod(e.target.value);
                    setFrom(range.from);
                    setTo(range.to);
                  }}
                >
                  <option value="">Date presets…</option>
                  {periods.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </DropdownField>
              </label>
              <div className="analysis-rolling-field">
                <label>
                  Rolling days
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={rollingDays}
                    onChange={(e) =>
                      setRollingDays(
                        Math.max(
                          1,
                          Math.min(3650, Math.round(Number(e.target.value))),
                        ),
                      )
                    }
                  />
                </label>
                <button
                  onClick={() => {
                    setLocalDates(true);
                    setFrom(shiftDays(today(), 1 - rollingDays));
                    setTo(today());
                  }}
                >
                  Apply range
                </button>
              </div>
              <label className="analysis-toggle analysis-complete-mode">
                <input
                  type="checkbox"
                  checked={completeOnly}
                  onChange={(e) => setCompleteOnly(e.target.checked)}
                />
                Complete periods only
              </label>
            </div>
            <div className="advanced-actions analysis-comparison-grid">
              <label>
                Compare with
                <DropdownField
                  value={compare}
                  onChange={(e) => setCompare(e.target.value)}
                >
                  {comparisonOptions.map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  ))}
                </DropdownField>
              </label>
              {compare === "custom" && (
                <>
                  <label>
                    Comparison from
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    Comparison to
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                    />
                  </label>
                </>
              )}
              <label>
                Change display
                <DropdownField
                  value={deltaMode}
                  onChange={(e) => setDeltaMode(e.target.value)}
                >
                  <option value="absolute">Absolute change</option>
                  <option value="relative">Percentage change</option>
                  <option value="points" disabled={!percent}>
                    Percentage-point change
                  </option>
                </DropdownField>
              </label>
              <button
                onClick={() => {
                  try {
                    const f = prepareFilters();
                    store.set({
                      filters: f,
                      compare:
                        compare === "custom"
                          ? `custom:${customFrom}:${customTo}`
                          : compare,
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Apply scope to whole tab
              </button>
            </div>
          </fieldset>
          {config.source === "new" &&
            config.aggregate === "metric" &&
            ["conversion_rate", "retention_rate"].includes(config.metric) && (
              <div className="advanced-actions analysis-outcome-grid">
                <label>
                  Outcome window
                  <DropdownField
                    value={config.outcome}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        outcome: e.target.value as AnalysisConfig["outcome"],
                      }))
                    }
                  >
                    <option value="recorded">Recorded lifecycle outcome</option>
                    <option value="calendar">
                      Entry calendar month · mature cohorts
                    </option>
                    <option value="rolling">
                      Elapsed days · mature cohorts
                    </option>
                  </DropdownField>
                </label>
                {config.outcome === "rolling" && (
                  <label>
                    Window days
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={config.windowDays}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          windowDays: Math.max(
                            1,
                            Math.min(365, Number(e.target.value)),
                          ),
                        }))
                      }
                    />
                  </label>
                )}
              </div>
            )}
          <details className="analysis-local-filters">
            <summary>
              Section-specific conditions
              {localRules.rules.length ? ` · ${localRules.rules.length}` : ""}
            </summary>
            <p className="muted">
              Intersected with global filters. Resetting this section leaves the
              rest of the tab unchanged.
            </p>
            <AdvancedFilterEditor value={localRules} onChange={setLocalRules} />
          </details>
          <div className="advanced-actions analysis-run-grid">
            <div className="analysis-run-buttons">
              {config.aggregate === "metric" && (
                <>
                  <button
                    onClick={() => {
                      const candidate = choices.find(
                        (m) => metrics[m.id].format === "integer",
                      );
                      if (candidate) {
                        const c = { ...config, metric: candidate.id };
                        setConfig(c);
                        void run({ config: c });
                      }
                    }}
                  >
                    Count metric
                  </button>
                  <button
                    onClick={() => {
                      const candidate = choices.find(
                        (m) => metrics[m.id].format === "percent",
                      );
                      if (candidate) {
                        const c = { ...config, metric: candidate.id };
                        setConfig(c);
                        void run({ config: c });
                      }
                    }}
                  >
                    Rate metric
                  </button>
                </>
              )}
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void run()}
              >
                {busy ? "Calculating…" : "Run analysis"}
              </button>
            </div>
            <label>
              Show
              <DropdownField
                value={view}
                onChange={(e) => setView(e.target.value)}
              >
                <option value="both">Chart & table</option>
                <option value="table">Table</option>
                <option value="chart">Chart</option>
              </DropdownField>
            </label>
          </div>
          <div className="advanced-actions analysis-save-grid">
            <label>
              Analysis name
              <input
                aria-label="Saved analysis name"
                value={name}
                placeholder="Name this analysis…"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button disabled={!result || !name.trim()} onClick={saveView}>
              Save analysis
            </button>
            <button disabled={!result} onClick={() => void copyLink()}>
              {linkCopied ? "Link copied" : "Copy analysis link"}
            </button>
            {result && (
              <DropdownField
                aria-label="Export scope"
                value=""
                disabled={exportBusy}
                onChange={(e) => void exportData(e.target.value)}
              >
                <option value="">
                  {exportBusy ? "Preparing export…" : "Export…"}
                </option>
                <option value="visible">Visible table page · CSV</option>
                <option value="filtered">
                  All filtered analytical rows · CSV
                </option>
                <option value="records">
                  All filtered source records · CSV
                </option>
                <option value="analysis">
                  Full analysis + evidence · JSON
                </option>
              </DropdownField>
            )}
          </div>
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
          {result && (
            <>
              <details className="analysis-evidence">
                <summary>Calculation & source evidence</summary>
                <p>{JSON.stringify(result.receipt)}</p>
                <pre>{result.queries.grouped}</pre>
              </details>
              <div className="analysis-scope-receipt">
                <strong>Section scope</strong>{" "}
                {result.filters.from || "All dates"} —{" "}
                {result.filters.to || "latest"} ·{" "}
                {fieldLabel(result.config.source)} · {result.config.grain} ·{" "}
                {result.rows.length.toLocaleString("en-IN")} analytical rows ·{" "}
                {Number(result.total.records || 0).toLocaleString("en-IN")}{" "}
                source records
                {version >= 0 && (
                  <span>
                    {" "}
                    · Source refreshed{" "}
                    {result.receipt.sources?.find(
                      (source) => source.name === result.config.source,
                    )?.fetchedAt
                      ? new Date(
                          result.receipt.sources!.find(
                            (source) => source.name === result.config.source,
                          )!.fetchedAt!,
                        ).toLocaleString("en-IN")
                      : "unknown"}
                  </span>
                )}
                {result.receipt.sources?.some(
                  (source) =>
                    source.hash && source.hash !== health[source.name]?.hash,
                ) && (
                  <p>
                    Source data changed since this calculation. Run analysis to
                    refresh these results.
                  </p>
                )}
                <p>{result.queries.definition}</p>
                <p>
                  Total:{" "}
                  <strong>
                    {format(
                      displayCalculation(
                        result.total.value,
                        result.config.calculation,
                        result.total.value,
                        result.total.denominator,
                      ),
                    )}
                  </strong>{" "}
                  · Denominator: {result.total.denominator ?? "n/a"}
                  {result.compare !== "none"
                    ? ` · Compared with ${comparison(result.filters, result.compare).from} — ${comparison(result.filters, result.compare).to}`
                    : ""}
                </p>
                {config.source !== result.config.source ||
                JSON.stringify(config) !== JSON.stringify(result.config) ? (
                  <p>Controls changed. Run analysis to update these results.</p>
                ) : null}
              </div>
              {!!breadcrumb.length && (
                <nav
                  className="analysis-breadcrumbs"
                  aria-label="Analysis drill-down"
                >
                  <button onClick={() => setBreadcrumb([])}>Analysis</button>
                  {breadcrumb.map((part, i) => (
                    <span key={i}> › {part}</span>
                  ))}
                </nav>
              )}
              {view !== "table" && (
                <AnalyticalChart
                  rows={result.rows}
                  label={label}
                  format={format}
                  comparison={result.compare !== "none"}
                  onSelect={selectChart}
                />
              )}{" "}
              {!!chartSelected.length && (
                <div className="advanced-actions">
                  <button onClick={applyChart}>
                    Filter this section to {chartSelected.length} selected chart
                    points
                  </button>
                  <button onClick={() => selectRows(chartSelected)}>
                    Aggregate selected points
                  </button>
                  <button onClick={() => inspectSelection(chartSelected)}>
                    Inspect selected records
                  </button>
                </div>
              )}
              {!!selected.length && (
                <p className="analysis-selection" role="status">
                  {selected.length} selected rows ·{" "}
                  {selectedTotal ? (
                    <>
                      Recomputed measure:{" "}
                      <strong>
                        {format(
                          displayCalculation(
                            selectedTotal.value,
                            result.config.calculation,
                            result.total.value,
                            selectedTotal.denominator,
                          ),
                        )}
                      </strong>{" "}
                      · Denominator: {selectedTotal.denominator ?? "n/a"} ·
                      Source records: {selectedTotal.records}
                    </>
                  ) : (
                    "Recalculating the combined source population…"
                  )}
                  <button onClick={() => inspectSelection(selected)}>
                    Inspect selected records
                  </button>
                </p>
              )}
              {view !== "chart" && (
                <AnalyticalTable
                  key={JSON.stringify([
                    layoutRevision,
                    result.config,
                    result.filters,
                    result.transient,
                    result.compare,
                  ])}
                  rows={result.rows}
                  groupTotals={result.groups}
                  columns={columns}
                  onSelect={selectRows}
                  onInspect={inspect}
                  initialLayout={layout}
                  onLayoutChange={saveTableLayout}
                  visibleRowsRef={updateVisible}
                />
              )}
            </>
          )}
          {!!saved.length && (
            <details>
              <summary>Manage saved analyses</summary>
              {saved.map((entry) => (
                <div className="advanced-actions" key={entry.id}>
                  <span>{entry.name}</span>
                  <button onClick={() => restore(entry)}>Open</button>
                  <button
                    onClick={() => {
                      const next = saved.filter((v) => v.id !== entry.id);
                      setSaved(next);
                      localStorage.setItem(
                        "atlas-analyses",
                        JSON.stringify(next),
                      );
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
