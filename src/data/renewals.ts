import { paidMembershipSQL } from "../semantics/membership-eligibility";
/**
 * The table and drills share exactly the same deduplicated expiry cohort.
 * Eligibility matches Lapsed members: paid memberships whose names are not restricted
 * (server/kra-churn.mjs), ongoing-access products only, already expired by the as-of date.
 * Every due membership lands in exactly one state, so due = renewed + lapsed + frozen:
 *  - frozen: the membership's status is Frozen;
 *  - lapsed: no later eligible membership and a recorded Churned Date;
 *  - renewed: a later eligible membership exists, or the sheet records no churn.
 */
export function renewalFactsSQL(scope: string, asOf: string) {
  const ongoing = `member_id IS NOT NULL AND end_date IS NOT NULL AND start_date IS NOT NULL AND ${paidMembershipSQL} AND (session_limit>1 OR regexp_matches(lower(product),'membership|unlimited|u/l|pack')) AND NOT regexp_matches(lower(product),'complimentary|free|intro|newcomer')`;
  return `WITH paid AS (SELECT * FROM lapsed WHERE ${ongoing}),
    cohort AS (SELECT *,CASE WHEN EXISTS(SELECT 1 FROM paid next WHERE next.member_id=lapsed.member_id AND next.start_date>lapsed.start_date AND next.end_date>lapsed.end_date AND next.start_date<='${asOf}') THEN 1 ELSE 0 END AS renewed FROM lapsed${scope}${scope ? " AND " : " WHERE "}${ongoing} AND end_date<'${asOf}' QUALIFY ROW_NUMBER() OVER(PARTITION BY member_id,SUBSTR(end_date,1,7) ORDER BY end_date DESC,source_row DESC)=1)
    SELECT *, SUBSTR(end_date,1,7) AS expiry_month, CASE WHEN lower(COALESCE(status,''))='frozen' THEN 'frozen' WHEN renewed=0 AND churned_date IS NOT NULL THEN 'lapsed' ELSE 'renewed' END AS renewal_state FROM cohort`;
}
export function renewalCohortSQL(scope: string, asOf: string) {
  return `WITH facts AS (${renewalFactsSQL(scope, asOf)}) SELECT expiry_month AS month,${renewalMeasuresSQL()} FROM facts GROUP BY expiry_month ORDER BY month DESC LIMIT 14`;
}
export function renewalDrillPredicate(scope: string, asOf: string, month: string, state: string) {
  const quotedMonth = "'" + month.replaceAll("'", "''") + "'";
  if (!['due', 'renewed', 'lapsed', 'frozen'].includes(state)) throw new Error('Unknown renewal cohort state');
  return `source_row IN (SELECT source_row FROM (${renewalFactsSQL(scope, asOf)}) WHERE expiry_month=${quotedMonth}${state === 'due' ? '' : ` AND renewal_state='${state}'`})`;
}

/** Shared measures over renewalFactsSQL; the report and dashboard use the same cohort. */
export const renewalMeasures: Record<string, { label: string; format: 'integer' | 'percent'; expression: string }> = {
  due: { label: 'Paid memberships due', format: 'integer', expression: 'COUNT(*)' },
  renewed: { label: 'Renewals completed', format: 'integer', expression: "COUNT(*) FILTER (WHERE renewal_state='renewed')" },
  lapsed: { label: 'Confirmed lapses', format: 'integer', expression: "COUNT(*) FILTER (WHERE renewal_state='lapsed')" },
  frozen: { label: 'Frozen memberships', format: 'integer', expression: "COUNT(*) FILTER (WHERE renewal_state='frozen')" },
  renewal_rate: { label: 'Recorded renewal rate', format: 'percent', expression: "COUNT(*) FILTER (WHERE renewal_state='renewed')::DOUBLE/NULLIF(COUNT(*),0)" },
};
export const renewalMeasuresSQL = (ids = Object.keys(renewalMeasures)) => ids.map(id => `${renewalMeasures[id].expression} AS "${id}"`).join(',');
