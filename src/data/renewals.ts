/** The table and drills share exactly the same deduplicated expiry cohort. */
export function renewalFactsSQL(scope: string, asOf: string) {
  return `WITH paid AS (SELECT * FROM lapsed WHERE member_id IS NOT NULL AND revenue>0 AND end_date IS NOT NULL AND start_date IS NOT NULL AND (session_limit>1 OR regexp_matches(lower(product),'membership|unlimited|u/l|pack')) AND NOT regexp_matches(lower(product),'complimentary|free|intro|newcomer')),
    cohort AS (SELECT *,CASE WHEN EXISTS(SELECT 1 FROM paid next WHERE next.member_id=lapsed.member_id AND next.start_date>lapsed.start_date AND next.start_date<= '${asOf}' AND next.end_date>lapsed.end_date AND TRY_CAST(next.start_date AS DATE)<=TRY_CAST(lapsed.end_date AS DATE)+INTERVAL 30 DAY) THEN 1 ELSE 0 END AS renewed FROM lapsed${scope}${scope ? " AND " : " WHERE "}member_id IS NOT NULL AND revenue>0 AND end_date IS NOT NULL AND start_date IS NOT NULL AND (session_limit>1 OR regexp_matches(lower(product),'membership|unlimited|u/l|pack')) AND NOT regexp_matches(lower(product),'complimentary|free|intro|newcomer') QUALIFY ROW_NUMBER() OVER(PARTITION BY member_id,SUBSTR(end_date,1,7) ORDER BY end_date DESC,source_row DESC)=1)
    SELECT *, SUBSTR(end_date,1,7) AS expiry_month, CASE WHEN renewed=1 THEN 'renewed' WHEN TRY_CAST(end_date AS DATE)<'${asOf}'::DATE-INTERVAL 30 DAY THEN 'lapsed' WHEN end_date<'${asOf}' THEN 'grace' ELSE 'upcoming' END AS renewal_state FROM cohort`;
}
export function renewalCohortSQL(scope: string, asOf: string) {
  return `WITH facts AS (${renewalFactsSQL(scope, asOf)}) SELECT expiry_month AS month,${renewalMeasuresSQL()} FROM facts GROUP BY expiry_month ORDER BY month DESC LIMIT 14`;
}
export function renewalDrillPredicate(scope: string, asOf: string, month: string, state: string) {
  const quotedMonth = "'" + month.replaceAll("'", "''") + "'";
  if (!['due', 'renewed', 'lapsed', 'grace', 'upcoming'].includes(state)) throw new Error('Unknown renewal cohort state');
  return `source_row IN (SELECT source_row FROM (${renewalFactsSQL(scope, asOf)}) WHERE expiry_month=${quotedMonth}${state === 'due' ? '' : ` AND renewal_state='${state}'`})`;
}

/** Shared measures over renewalFactsSQL; the report and dashboard use the same cohort. */
export const renewalMeasures: Record<string, { label: string; format: 'integer' | 'percent'; expression: string }> = {
  due: { label: 'Paid memberships due', format: 'integer', expression: 'COUNT(*)' },
  renewed: { label: 'Renewals completed', format: 'integer', expression: "COUNT(*) FILTER (WHERE renewal_state='renewed')" },
  lapsed: { label: 'Confirmed lapses', format: 'integer', expression: "COUNT(*) FILTER (WHERE renewal_state='lapsed')" },
  grace: { label: 'Within renewal grace', format: 'integer', expression: "COUNT(*) FILTER (WHERE renewal_state='grace')" },
  upcoming: { label: 'Not yet expired', format: 'integer', expression: "COUNT(*) FILTER (WHERE renewal_state='upcoming')" },
  renewal_rate: { label: 'Recorded renewal rate', format: 'percent', expression: "COUNT(*) FILTER (WHERE renewal_state='renewed')::DOUBLE/NULLIF(COUNT(*),0)" },
};
export const renewalMeasuresSQL = (ids = Object.keys(renewalMeasures)) => ids.map(id => `${renewalMeasures[id].expression} AS "${id}"`).join(',');
