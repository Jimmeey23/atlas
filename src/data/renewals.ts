/** The table and drills share exactly the same deduplicated expiry cohort. */
export function renewalFactsSQL(scope: string, asOf: string) {
  return `WITH paid AS (SELECT * FROM lapsed WHERE member_id IS NOT NULL AND revenue>0 AND end_date IS NOT NULL AND start_date IS NOT NULL AND (session_limit>1 OR regexp_matches(lower(product),'membership|unlimited|u/l|pack')) AND NOT regexp_matches(lower(product),'complimentary|free|intro|newcomer')),
    cohort AS (SELECT *,CASE WHEN EXISTS(SELECT 1 FROM paid next WHERE next.member_id=lapsed.member_id AND next.start_date>lapsed.start_date AND next.start_date<= '${asOf}' AND next.end_date>lapsed.end_date AND TRY_CAST(next.start_date AS DATE)<=TRY_CAST(lapsed.end_date AS DATE)+INTERVAL 30 DAY) THEN 1 ELSE 0 END AS renewed FROM lapsed${scope}${scope ? " AND " : " WHERE "}member_id IS NOT NULL AND revenue>0 AND end_date IS NOT NULL AND start_date IS NOT NULL AND (session_limit>1 OR regexp_matches(lower(product),'membership|unlimited|u/l|pack')) AND NOT regexp_matches(lower(product),'complimentary|free|intro|newcomer') QUALIFY ROW_NUMBER() OVER(PARTITION BY member_id,SUBSTR(end_date,1,7) ORDER BY end_date DESC,source_row DESC)=1)
    SELECT *, SUBSTR(end_date,1,7) AS expiry_month, CASE WHEN renewed=1 THEN 'renewed' WHEN TRY_CAST(end_date AS DATE)<'${asOf}'::DATE-INTERVAL 30 DAY THEN 'lapsed' WHEN end_date<'${asOf}' THEN 'grace' ELSE 'upcoming' END AS renewal_state FROM cohort`;
}
export function renewalCohortSQL(scope: string, asOf: string) {
  return `WITH facts AS (${renewalFactsSQL(scope, asOf)}) SELECT expiry_month AS month,COUNT(*) AS due,COUNT(*) FILTER(WHERE renewal_state='renewed') AS renewed,COUNT(*) FILTER(WHERE renewal_state='lapsed') AS lapsed,COUNT(*) FILTER(WHERE renewal_state='grace') AS grace,COUNT(*) FILTER(WHERE renewal_state='upcoming') AS upcoming FROM facts GROUP BY expiry_month ORDER BY month DESC LIMIT 14`;
}
export function renewalDrillPredicate(scope: string, asOf: string, month: string, state: string) {
  const quotedMonth = "'" + month.replaceAll("'", "''") + "'";
  if (!['due', 'renewed', 'lapsed', 'grace', 'upcoming'].includes(state)) throw new Error('Unknown renewal cohort state');
  return `source_row IN (SELECT source_row FROM (${renewalFactsSQL(scope, asOf)}) WHERE expiry_month=${quotedMonth}${state === 'due' ? '' : ` AND renewal_state='${state}'`})`;
}
