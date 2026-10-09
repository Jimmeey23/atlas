import type { Calculation } from "./advanced-controls";
/** Aggregate prefixes and selections from facts, never from already aggregated cells. */
export function compileAnalyticalSQL({
  facts,
  period,
  dimension,
  measure,
  denominator = "COUNT(*)",
  calculation = "value",
  extra = "",
}: {
  facts: string;
  period: string;
  dimension: string;
  measure: string;
  denominator?: string;
  calculation?: Calculation;
  extra?: string;
}) {
  if (!/^[a-z_]+$/.test(dimension)) throw new Error("Invalid grouping field.");
  const base = `WITH facts AS (SELECT *,${period} AS _bucket,COALESCE(CAST("${dimension}" AS VARCHAR),'Unspecified') AS _segment FROM ${facts})`;
  const selection = `${measure} AS value,${denominator} AS denominator,COUNT(*) AS records${extra}`;
  const aggregate = (filter = "") =>
    `${base} SELECT ${selection} FROM facts f${filter}`;
  const grouped =
    calculation === "cumulative"
      ? `${base}, endpoints AS (SELECT DISTINCT _bucket AS endpoint,_segment AS segmentkey FROM facts WHERE _bucket IS NOT NULL) SELECT endpoint AS period,segmentkey AS segment,${selection} FROM facts f JOIN endpoints ON f._bucket<=endpoint AND f._segment=segmentkey GROUP BY endpoint,segmentkey ORDER BY endpoint,segmentkey`
      : `${base} SELECT _bucket AS period,_segment AS segment,${selection} FROM facts f GROUP BY _bucket,_segment ORDER BY _bucket,_segment`;
  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
  return {
    grouped,
    total: aggregate(),
    groupTotals: `${base} SELECT _segment AS segment,${selection} FROM facts f GROUP BY _segment`,
    recordPredicate: (pairs: { period: string | null; segment: string }[]) =>
      `(${pairs.map((pair) => `(COALESCE(CAST("${dimension}" AS VARCHAR),'Unspecified')=${literal(pair.segment)} AND ${pair.period == null ? `(${period}) IS NULL` : `(${period})${calculation === "cumulative" ? "<=" : "="}${literal(pair.period)}`})`).join(" OR ") || "FALSE"})`,
    selected: (pairs: { period: string | null; segment: string }[]) =>
      aggregate(
        ` WHERE (${pairs.map((pair) => `(_segment=${literal(pair.segment)} AND ${pair.period == null ? "_bucket IS NULL" : `_bucket${calculation === "cumulative" ? "<=" : "="}${literal(pair.period)}`})`).join(" OR ") || "FALSE"})`,
      ),
  };
}
