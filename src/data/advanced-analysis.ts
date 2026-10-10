import { compileOutcomeWindow } from "./outcome-window";
import { metricNotes } from "../semantics/evidence";
import { compileAnalyticalSQL } from "./analytical-query";
import { sqlTypes } from "./normalise";
import { groupable } from "./group-fields";
import { metricFacts, context, where, today } from "./analytics";
import { metrics, metricDenominatorSQL } from "../semantics/metrics";
import { metricTable } from "../semantics/catalogue";
import { currentSnapshotMetrics } from "../semantics/evidence";
import {
  grainSQL,
  type Grain,
  type Aggregate,
  type Calculation,
} from "./advanced-controls";
import type { Filters } from "../state/store";
export const analysisDimensions = [
  "location",
  "trainer",
  "format",
  "format_group",
  "category",
  "product",
  "source",
  "associate",
  "payment_method",
  "day",
  "time",
  "status",
  "entry_type",
  "acquisition_channel",
  "campaign_name",
] as const;
export interface AnalysisConfig {
  source: string;
  metric: string;
  aggregate: Aggregate;
  field: string;
  dimension: string;
  grain: Grain;
  calculation: Calculation;
  outcome: "recorded" | "calendar" | "rolling";
  windowDays: number;
}
export const defaultAnalysisConfig = (
  source = "sessions",
  metric = "attendance",
): AnalysisConfig => ({
  source,
  metric,
  aggregate: "metric",
  field: "revenue",
  dimension: "location",
  grain: "month",
  calculation: "value",
  outcome: "recorded",
  windowDays: 30,
});
export function measureSQL(
  config: AnalysisConfig,
  filters: Filters,
  transient: { field: string; value: string }[],
) {
  if (config.aggregate === "metric") {
    if (!metrics[config.metric] || metricTable(config.metric) !== config.source)
      throw new Error("Choose a metric belonging to this source.");
    if (config.metric === "draw_premium_pp")
      throw new Error(
        "Draw premium requires the instructor workspace’s independent slot baseline.",
      );
    return metrics[config.metric].sql(context(filters, transient));
  }
  if (config.aggregate === "count") return "COUNT(*)";
  if (!Object.hasOwn(sqlTypes, config.field))
    throw new Error("Choose a valid source field.");
  if (config.aggregate === "distinct")
    return `COUNT(DISTINCT "${config.field}")`;
  if (sqlTypes[config.field] !== "DOUBLE")
    throw new Error("Sum, median and average require a numeric source field.");
  return `${{ sum: "SUM", median: "MEDIAN", average: "AVG" }[config.aggregate]}("${config.field}")`;
}
export function outcomeSQL(config: AnalysisConfig) {
  return compileOutcomeWindow({
    kind: config.metric === "conversion_rate" ? "conversion" : "retention",
    mode: config.outcome === "calendar" ? "calendar" : "rolling",
    days: config.windowDays,
    asOf: today(),
  });
}

export function analysisQueries(
  config: AnalysisConfig,
  filters: Filters,
  transient: { field: string; value: string }[] = [],
  periodOverride?: string,
) {
  if (!["day", "week", "month", "quarter"].includes(config.grain))
    throw new Error("Invalid analysis grain.");
  // The curated dimensions lead the picker; any other real, non-sensitive column of the source may also be used.
  if (
    !analysisDimensions.includes(
      config.dimension as (typeof analysisDimensions)[number],
    ) &&
    !groupable(config.dimension)
  )
    throw new Error("Invalid grouping.");
  if (
    config.calculation === "cumulative" &&
    config.aggregate === "metric" &&
    currentSnapshotMetrics.has(config.metric)
  )
    throw new Error(
      "Current snapshot metrics cannot be accumulated over historical periods.",
    );
  if (
    config.aggregate === "metric" &&
    currentSnapshotMetrics.has(config.metric)
  )
    throw new Error(
      "Choose a period metric here. Current snapshot metrics remain available in the Metric index.",
    );
  if (config.source === "payroll" && ["day", "week"].includes(config.grain))
    throw new Error("Payroll is monthly; choose month or quarter grain.");
  const facts = metricFacts(filters, config.source, transient);
  const temporal =
    config.outcome !== "recorded" &&
    config.source === "new" &&
    config.aggregate === "metric" &&
    ["conversion_rate", "retention_rate"].includes(config.metric);
  const outcome = temporal ? outcomeSQL(config) : null;
  const value = outcome?.value || measureSQL(config, filters, transient);
  const numericDenominator =
    config.calculation === "per_session"
      ? `COUNT(DISTINCT session_id)`
      : config.calculation === "per_member"
        ? `COUNT(DISTINCT member_id)`
        : outcome?.denominator ||
          (config.aggregate === "metric"
            ? metricDenominatorSQL(config.metric, context(filters, transient))
            : ["median", "average"].includes(config.aggregate)
              ? `COUNT("${config.field}")`
              : null) ||
          "COUNT(*)";
  const date =
    config.source === "payroll"
      ? `concat(month,'-01')`
      : config.source === "lapsed"
        ? "end_date"
        : "date";
  const period =
    periodOverride ||
    (config.source === "payroll"
      ? `strftime(date_trunc('${config.grain}',TRY_CAST(${date} AS DATE)),'%Y-%m-%d')`
      : grainSQL(date, config.grain));
  const compiled = compileAnalyticalSQL({
    facts,
    period,
    dimension: config.dimension,
    measure: value,
    denominator: numericDenominator,
    calculation: config.calculation,
    extra: outcome ? `,${outcome.numerator} AS outcome_count` : "",
  });
  return {
    ...compiled,
    raw: `SELECT * FROM "${config.source}"${where(filters, config.source, transient)}`,
    definition: temporal
      ? `${config.metric === "conversion_rate" ? "First purchase conversion" : "Return attendance retention"} ${config.outcome === "calendar" ? "within entry calendar month" : `within ${config.windowDays} elapsed days`}; mature newcomer records only; return attendance requires identifiable members.`
      : config.aggregate === "metric"
        ? [
            metricNotes[config.metric]?.definition ||
              `${metrics[config.metric].label}, using the shared metric definition`,
            metricNotes[config.metric]?.caveat,
          ]
            .filter(Boolean)
            .join(" ")
        : `${config.aggregate} of ${config.aggregate === "count" ? "source records" : config.field}`,
  };
}
