import { confirmedLapseSQL, paidMembershipSQL } from "../semantics/membership-eligibility";
import { groupValueSQL } from "./group-fields";
/**
 * The table, drills and the Lapsed membership card share exactly the same deduplicated expiry cohort.
 * Eligibility matches Lapsed members: paid memberships whose names are not restricted
 * (server/kra-churn.mjs), ongoing-access products only, already expired by the as-of date,
 * and a recorded Status of Renewed, Lapsed or Frozen — Not Activated, Active and New
 * memberships are not due.
 * One membership per unique member per expiry month, chosen before scope filters apply, so a
 * filtered view is always a subset of the unfiltered cohort; a member with any Lapsed
 * membership that month takes the Lapsed outcome.
 * Every due member lands in one state from the recorded Status: due = renewed + lapsed + frozen + pending:
 *  - renewed / frozen: Status is Renewed / Frozen;
 *  - lapsed: Status is Lapsed and the Churned Date is at least 30 days old;
 *  - pending: Status is Lapsed within 30 days of the Churned Date (grace period).
 */
export function renewalFactsSQL(scope: string, asOf: string, table = "lapsed") {
  const ongoing = `member_id IS NOT NULL AND end_date IS NOT NULL AND start_date IS NOT NULL AND ${paidMembershipSQL} AND (session_limit>1 OR regexp_matches(lower(product),'membership|unlimited|u/l|pack')) AND NOT regexp_matches(lower(product),'complimentary|free|intro|newcomer')`;
  const status = "lower(trim(COALESCE(status,'')))";
  return `WITH cohort AS (SELECT * FROM "${table}" WHERE ${ongoing} AND end_date<'${asOf}' AND ${status} IN ('renewed','lapsed','frozen') QUALIFY ROW_NUMBER() OVER(PARTITION BY member_id,SUBSTR(end_date,1,7) ORDER BY ${status}='lapsed' DESC,end_date DESC,source_row DESC)=1),
    facts AS (SELECT *, SUBSTR(end_date,1,7) AS expiry_month, CASE WHEN ${status}='frozen' THEN 'frozen' WHEN ${status}='renewed' THEN 'renewed' WHEN ${confirmedLapseSQL(asOf)} THEN 'lapsed' ELSE 'pending' END AS renewal_state FROM cohort)
    SELECT * FROM facts${scope}`;
}
/**
 * Stamps each source row's renewal state as renewal_outcome (a distinct name, so the facts
 * above never see two renewal_state columns) so registry metrics (the Lapsed membership
 * card, its trend and drill) count the same rows as the Renewals table. Rows outside the
 * cohort stay NULL. Re-run whenever the table loads or is restored, since states move with the as-of date.
 */
export function renewalStateSQL(asOf: string, table = "lapsed") {
  return [
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS renewal_outcome VARCHAR`,
    `UPDATE "${table}" SET renewal_outcome=NULL`,
    `UPDATE "${table}" SET renewal_outcome=f.renewal_state FROM (SELECT source_row, renewal_state FROM (${renewalFactsSQL("", asOf, table)})) f WHERE "${table}".source_row=f.source_row`,
  ];
}
export function renewalCohortSQL(scope: string, asOf: string) {
  return `WITH facts AS (${renewalFactsSQL(scope, asOf)}) SELECT expiry_month AS month,${renewalMeasuresSQL()} FROM facts GROUP BY expiry_month ORDER BY month DESC LIMIT 14`;
}
/** The same 14 expiry months split by any groupable Lapsed column; segments sum to the month row. */
export function renewalSegmentSQL(scope: string, asOf: string, field: string) {
  return `WITH facts AS (${renewalFactsSQL(scope, asOf)}), months AS (SELECT DISTINCT expiry_month FROM facts ORDER BY expiry_month DESC LIMIT 14)
    SELECT expiry_month AS month,${groupValueSQL(field)} AS segment,${renewalMeasuresSQL()} FROM facts WHERE expiry_month IN (SELECT expiry_month FROM months) GROUP BY 1,2 ORDER BY month DESC,segment`;
}
export interface RenewalSegment { field: string; value: string }
export function renewalDrillPredicate(scope: string, asOf: string, month: string, state: string, segment?: RenewalSegment) {
  const quoted = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  if (!['due', 'renewed', 'lapsed', 'frozen', 'pending'].includes(state)) throw new Error('Unknown renewal cohort state');
  const split = segment ? ` AND ${groupValueSQL(segment.field)}=${quoted(segment.value)}` : '';
  return `source_row IN (SELECT source_row FROM (${renewalFactsSQL(scope, asOf)}) WHERE expiry_month=${quoted(month)}${state === 'due' ? '' : ` AND renewal_state='${state}'`}${split})`;
}

/** Shared measures over renewalFactsSQL; the report and dashboard use the same cohort. */
export const renewalMeasures: Record<string, { label: string; format: 'integer' | 'percent'; expression: string }> = {
  due: { label: 'Paid memberships due', format: 'integer', expression: 'COUNT(*)' },
  renewed: { label: 'Status Renewed', format: 'integer', expression: "COUNT(*) FILTER (WHERE renewal_state='renewed')" },
  lapsed: { label: 'Status Lapsed, 30+ days past Churned Date', format: 'integer', expression: "COUNT(*) FILTER (WHERE renewal_state='lapsed')" },
  frozen: { label: 'Status Frozen', format: 'integer', expression: "COUNT(*) FILTER (WHERE renewal_state='frozen')" },
  pending: { label: 'Grace period: Status Lapsed under 30 days past Churned Date', format: 'integer', expression: "COUNT(*) FILTER (WHERE renewal_state='pending')" },
  renewal_rate: { label: 'Confirmed renewals / all due', format: 'percent', expression: "COUNT(*) FILTER (WHERE renewal_state='renewed')::DOUBLE/NULLIF(COUNT(*),0)" },
};
export const renewalMeasuresSQL = (ids = Object.keys(renewalMeasures)) => ids.map(id => `${renewalMeasures[id].expression} AS "${id}"`).join(',');
