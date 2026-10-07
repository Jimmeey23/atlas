/** Member retention triangle: acquisition cohort × months since first visit. */
export const COHORT_MONTHS = 12;
export const COHORT_LIMIT = 18;

/**
 * One row per cohort month and offset. A member counts as retained in an offset
 * month when they attended at least one session in it, anywhere — retention is
 * a property of the member, not of the studio they were acquired at.
 */
export function cohortRetentionSQL(scope: string, asOf: string) {
  return `WITH cohort AS (
      SELECT member_id, SUBSTR(first_visit,1,7) AS cohort_month
      FROM new${scope}${scope ? " AND " : " WHERE "}member_id IS NOT NULL AND first_visit IS NOT NULL AND is_new
      QUALIFY ROW_NUMBER() OVER(PARTITION BY member_id ORDER BY first_visit, source_row)=1
    ),
    recent AS (
      SELECT * FROM cohort
      WHERE cohort_month >= STRFTIME(DATE '${asOf}' - INTERVAL ${COHORT_LIMIT - 1} MONTH, '%Y-%m')
        AND cohort_month <= STRFTIME(DATE '${asOf}', '%Y-%m')
    ),
    sizes AS (SELECT cohort_month, COUNT(*) AS size FROM recent GROUP BY cohort_month),
    visits AS (
      SELECT DISTINCT c.member_id, SUBSTR(c.date,1,7) AS visit_month
      FROM checkins c
      WHERE c.member_id IS NOT NULL AND c.attended AND c.date IS NOT NULL
    ),
    retained AS (
      SELECT r.cohort_month,
        DATE_DIFF('month', STRPTIME(r.cohort_month,'%Y-%m'), STRPTIME(v.visit_month,'%Y-%m')) AS offset_month,
        COUNT(DISTINCT r.member_id) AS retained
      FROM recent r JOIN visits v USING(member_id)
      GROUP BY 1, 2
    )
    SELECT s.cohort_month, s.size, o.offset_month, COALESCE(t.retained,0) AS retained,
      DATE_DIFF('month', STRPTIME(s.cohort_month,'%Y-%m'), DATE_TRUNC('month', DATE '${asOf}')) AS maturity
    FROM sizes s
    CROSS JOIN (SELECT UNNEST(RANGE(0, ${COHORT_MONTHS + 1})) AS offset_month) o
    LEFT JOIN retained t ON t.cohort_month=s.cohort_month AND t.offset_month=o.offset_month
    ORDER BY s.cohort_month DESC, o.offset_month`;
}

/** The members behind one triangle cell, for the drill-down. */
export function cohortDrillPredicate(
  scope: string,
  asOf: string,
  cohortMonth: string,
  offset: number | null,
) {
  const month = "'" + cohortMonth.replaceAll("'", "''") + "'";
  const cohort = `SELECT member_id FROM new${scope}${scope ? " AND " : " WHERE "}member_id IS NOT NULL AND first_visit IS NOT NULL AND is_new AND SUBSTR(first_visit,1,7)=${month}`;
  if (offset == null) return `member_id IN (${cohort})`;
  if (!Number.isInteger(offset) || offset < 0 || offset > COHORT_MONTHS)
    throw new Error("Unknown cohort offset");
  return `member_id IN (${cohort}) AND member_id IN (
    SELECT member_id FROM checkins
    WHERE member_id IS NOT NULL AND attended AND date IS NOT NULL
      AND DATE_DIFF('month', STRPTIME(${month},'%Y-%m'), STRPTIME(SUBSTR(date,1,7),'%Y-%m'))=${offset})`;
}

export interface CohortRow {
  month: string;
  size: number;
  /** Retained member counts by offset; index 0 is the acquisition month. */
  retained: (number | null)[];
}

/** Flat SQL rows into one row per cohort, with immature offsets left null. */
export function cohortTriangle(rows: Record<string, unknown>[]): CohortRow[] {
  const byMonth = new Map<string, CohortRow>();
  for (const r of rows) {
    const month = String(r.cohort_month);
    const offset = Number(r.offset_month);
    const maturity = Number(r.maturity);
    if (offset > COHORT_MONTHS) continue;
    let row = byMonth.get(month);
    if (!row) {
      row = { month, size: Number(r.size), retained: Array(COHORT_MONTHS + 1).fill(null) };
      byMonth.set(month, row);
    }
    // A cohort cannot speak for a month that has not happened yet.
    if (offset <= maturity) row.retained[offset] = Number(r.retained);
  }
  return [...byMonth.values()];
}
