/** Explicit windows keep lifecycle outcomes separate from timed conversion and return events. */
export function compileOutcomeWindow({
  kind,
  mode,
  days,
  asOf,
}: {
  kind: "conversion" | "retention";
  mode: "calendar" | "rolling";
  days: number;
  asOf: string;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf))
    throw new Error("Invalid observation date.");
  const length = Math.max(1, Math.min(365, Math.round(days)));
  if (!Number.isFinite(length))
    throw new Error("Choose a valid outcome window.");
  const end =
    mode === "calendar"
      ? `last_day(TRY_CAST(date AS DATE))`
      : `TRY_CAST(date AS DATE)+INTERVAL '${length} DAY'`;
  const coverage = `(SELECT CASE WHEN MAX(TRY_CAST(date AS DATE)) IS NOT NULL THEN LEAST(DATE '${asOf}',MAX(TRY_CAST(date AS DATE))) END FROM ${kind === "conversion" ? "sales" : "checkins"})`;
  const eligible = `is_new AND ${end}<=${coverage}${kind === "retention" ? " AND NULLIF(trim(member_id),'') IS NOT NULL" : ""}`;
  const converted = `lower(trim(conversion))='converted' AND TRY_CAST(first_purchase_date AS DATE)>=TRY_CAST(date AS DATE) AND TRY_CAST(first_purchase_date AS DATE)<=${end}`;
  const retained = `EXISTS(SELECT 1 FROM checkins v WHERE v.member_id=f.member_id AND v.attended AND TRY_CAST(v.date AS DATE)>TRY_CAST(f.date AS DATE) AND TRY_CAST(v.date AS DATE)<=${mode === "calendar" ? "last_day(TRY_CAST(f.date AS DATE))" : `TRY_CAST(f.date AS DATE)+INTERVAL '${length} DAY'`})`;
  const numerator = `COUNT(*) FILTER(WHERE ${eligible} AND (${kind === "conversion" ? converted : retained}))`;
  const denominator = `COUNT(*) FILTER(WHERE ${eligible})`;
  const unknown =
    kind === "conversion"
      ? `COUNT(*) FILTER(WHERE ${eligible} AND lower(trim(conversion))='converted' AND TRY_CAST(first_purchase_date AS DATE) IS NULL)>0 OR COUNT(*) FILTER(WHERE ${eligible} AND conversion IS NOT NULL)=0`
      : "FALSE";
  return {
    value: `CASE WHEN ${unknown} THEN NULL ELSE ${numerator}::DOUBLE/NULLIF(${denominator},0) END`,
    denominator,
    numerator,
    eligible,
  };
}
