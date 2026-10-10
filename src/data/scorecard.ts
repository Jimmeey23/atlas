import { metricFacts, where, context } from "./analytics";
import { quote } from "./duckdb";
import { metricSQL } from "../semantics/metrics";
import type { Filters } from "../state/store";
import { groupColumn } from "./group-fields";

/**
 * One row per format or instructor, combining three sheets that the generic register
 * cannot join: Sessions (supply, demand, revenue), New (first-visit outcomes, by the
 * format or instructor of the first visit) and Bookings (late cancellations).
 */
export type ScorecardDimension = "format_group" | "trainer" | (string & {});
type Transient = { field: string; value: string }[];

export const scorecardSessionIds = [
  "sessions",
  "empty_sessions",
  "booked",
  "attendance",
  "avg_class_size_excl",
  "avg_class_size_incl",
  "fill_rate",
  "revenue",
  "revenue_per_session",
];

/** The busiest value of a second dimension inside each row, by attendance. */
const topColumns: [id: string, column: string, label: string][] = [
  ["top_trainer", "trainer", "Top instructor"],
  ["top_format", "format_group", "Top format"],
  ["top_class", "format", "Top class"],
  ["top_slot", "time", "Top time slot"],
  ["top_day", "day", "Top day"],
  ["top_studio", "location", "Top studio"],
];
/** Every other familiar session dimension; the row's own column is never its own "top". */
export const scorecardTops = (dimension: ScorecardDimension) =>
  topColumns.filter(([, column]) => column !== dimension).slice(0, 5);

/** Inputs to the composite score; inverse measures count lower as better. */
export const compositeInputs: [expression: string, inverse: boolean][] = [
  ["fill_rate", false],
  ["avg_class_size_excl", false],
  ["revenue_per_session", false],
  ["conversion_rate", false],
  ["retention_rate", false],
  ["late_cancel_rate", true],
  ["empty_share", true],
];

// Any other groupable column is joined on its text value; groupColumn rejects unsafe identifiers.
const display = (dimension: ScorecardDimension) =>
  dimension === "format_group" ? "COALESCE(format_group,'Barre')" : dimension === "trainer" ? "trainer" : groupColumn(dimension);
/** Instructor names differ in spacing and case between sheets; join on a folded form. */
export const scorecardKey = (dimension: ScorecardDimension) =>
  dimension === "format_group" ? "COALESCE(format_group,'Barre')" : dimension === "trainer" ? "regexp_replace(lower(trim(trainer)),'\\s+',' ','g')" : groupColumn(dimension);

const scoped = (filters: Filters, source: string, transient: Transient, extra: string) => {
  const w = where(filters, source, transient);
  return `${source}${w}${w ? " AND " : " WHERE "}${extra}`;
};

export function scorecardSQL(dimension: ScorecardDimension, filters: Filters, transient: Transient) {
  const key = scorecardKey(dimension);
  const tops = scorecardTops(dimension);
  const rank = (expression: string, inverse: boolean) =>
    `PERCENT_RANK() OVER (ORDER BY COALESCE(${inverse ? `-${expression}` : expression}, ${inverse ? "-1" : "0"}))`;
  return `WITH f AS (SELECT * FROM ${metricFacts(filters, "sessions", transient)} WHERE ${display(dimension)} IS NOT NULL),
  s AS (SELECT ${display(dimension)} AS label, ${key} AS k, ${metricSQL(scorecardSessionIds, context(filters, transient))},
    SUM(sessions)-COALESCE(SUM(empty),0) AS non_empty_sessions, COUNT(*) AS n FROM f GROUP BY 1, 2),
  ${tops.map(([id, column]) => `${id} AS (SELECT k, ARG_MAX(v, a) AS ${id} FROM (SELECT ${key} AS k, ${column} AS v, SUM(checked_in) AS a FROM f WHERE ${column} IS NOT NULL GROUP BY 1, 2) GROUP BY k)`).join(",\n  ")},
  nw AS (SELECT ${key} AS k, COUNT(*) FILTER (WHERE is_new) AS new_visitors,
    COUNT(*) FILTER (WHERE is_new AND conversion='Converted') AS converted,
    COUNT(*) FILTER (WHERE is_new AND retention='Retained') AS retained
    FROM ${scoped(filters, "new", transient, `${display(dimension)} IS NOT NULL`)} GROUP BY 1),
  bk AS (SELECT ${key} AS k, COUNT(*) AS bookings, COUNT(*) FILTER (WHERE late_cancelled>0) AS late_cancelled
    FROM ${scoped(filters, "bookings", transient, `${display(dimension)} IS NOT NULL`)} GROUP BY 1),
  joined AS (SELECT s.*, ${tops.map(([id]) => `${id}.${id}`).join(", ")},
    nw.new_visitors, nw.converted, nw.retained,
    nw.converted::DOUBLE/NULLIF(nw.new_visitors,0) AS conversion_rate,
    nw.retained::DOUBLE/NULLIF(nw.new_visitors,0) AS retention_rate,
    bk.bookings, bk.late_cancelled, bk.late_cancelled::DOUBLE/NULLIF(bk.bookings,0) AS late_cancel_rate,
    s.empty_sessions::DOUBLE/NULLIF(s.sessions,0) AS empty_share
    FROM s ${tops.map(([id]) => `LEFT JOIN ${id} USING (k)`).join(" ")} LEFT JOIN nw USING (k) LEFT JOIN bk USING (k))
  SELECT *, ROUND(100*(${compositeInputs.map(([e, inverse]) => rank(e, inverse)).join(" + ")})/${compositeInputs.length}) AS composite_score
  FROM joined ORDER BY attendance DESC NULLS LAST`;
}

/** Full-scope totals over the same population as the scorecard rows; rates recomputed, not averaged. */
export function scorecardTotalSQL(dimension: ScorecardDimension, filters: Filters, transient: Transient) {
  const key = scorecardKey(dimension);
  const inScope = `${display(dimension)} IS NOT NULL AND ${key} IN (SELECT k FROM keys)`;
  return `WITH f AS (SELECT * FROM ${metricFacts(filters, "sessions", transient)} WHERE ${display(dimension)} IS NOT NULL),
  keys AS (SELECT DISTINCT ${key} AS k FROM f),
  s AS (SELECT ${metricSQL(scorecardSessionIds, context(filters, transient))},
    SUM(sessions)-COALESCE(SUM(empty),0) AS non_empty_sessions, COUNT(*) AS n FROM f),
  nw AS (SELECT COUNT(*) FILTER (WHERE is_new) AS new_visitors,
    COUNT(*) FILTER (WHERE is_new AND conversion='Converted') AS converted,
    COUNT(*) FILTER (WHERE is_new AND retention='Retained') AS retained
    FROM ${scoped(filters, "new", transient, inScope)}),
  bk AS (SELECT COUNT(*) AS bookings, COUNT(*) FILTER (WHERE late_cancelled>0) AS late_cancelled
    FROM ${scoped(filters, "bookings", transient, inScope)})
  SELECT s.*, nw.new_visitors, nw.converted, nw.retained,
    nw.converted::DOUBLE/NULLIF(nw.new_visitors,0) AS conversion_rate,
    nw.retained::DOUBLE/NULLIF(nw.new_visitors,0) AS retention_rate,
    bk.bookings, bk.late_cancelled, bk.late_cancelled::DOUBLE/NULLIF(bk.bookings,0) AS late_cancel_rate
  FROM s CROSS JOIN nw CROSS JOIN bk`;
}

/** Records behind one scorecard cell, matched on the same folded key the join uses. */
export function scorecardPredicate(dimension: ScorecardDimension, key: string, extra?: string) {
  return [`${scorecardKey(dimension)}=${quote(key)}`, extra].filter(Boolean).join(" AND ");
}
