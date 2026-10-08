// Cohort outcomes are grouped by first visit. Legacy _30 IDs remain stable for saved table preferences; their displayed definitions now use calendar-month purchases.
export const acquisitionMeasures = [
  ['cohort_rows', 'Clients / trials', 'integer'],
  ['unique_members', 'Unique members', 'integer'],
  ['newcomers', 'New clients', 'integer'],
  ['converted_members', 'Converted members', 'integer'],
  ['retained_members', 'Retained members', 'integer'],
  ['converted_30', 'Same-month converted', 'integer'],
  ['retained_30', 'Same-month converted & retained', 'integer'],
  ['mature_30', 'Calendar-month cohort members', 'integer'],
  ['conversion_rate', 'Conversion rate', 'percent'],
  ['retention_rate', 'Retention rate', 'percent'],
  ['conversion_30_rate', 'Same-month conversion rate', 'percent'],
  ['retention_30_rate', 'Same-month retained rate', 'percent'],
  ['avg_ltv', 'Average LTV', 'currency'],
  ['total_ltv', 'Total LTV', 'currency'],
  ['avg_spend', 'Average spend / purchase', 'currency'],
  ['first_purchase', 'Average first purchase', 'currency'],
  ['post_trial_ltv', 'Average post-trial LTV', 'currency'],
  ['conversion_span', 'Conversion span', 'days'],
  ['median_span', 'Median conversion span', 'days'],
  ['second_visit_rate', 'Second-visit rate', 'percent'],
  ['visits_post', 'Average post-trial visits', 'decimal'],
  ['purchases_post', 'Average post-trial purchases', 'decimal'],
  ['source_visits', 'Recorded visit count', 'integer'],
  ['converted_same_month', 'First-month converted', 'integer'],
  ['retained_same_month', 'First-month retained', 'integer'],
  ['conversion_same_month_rate', 'First-month conversion rate', 'percent'],
  ['retention_same_month_rate', 'First-month retained rate', 'percent'],
  ['post_trial_spend', 'Total spend post trial', 'currency'],
  ['post_trial_purchases_total', 'Purchases post trial', 'integer'],
  ['total_purchases', 'Total purchases', 'integer'],
  ['total_visits', 'Visits', 'integer'],
  ['revenue_per_visit', 'Revenue / visit', 'currency'],
  ['late_cancels', 'Late cancellations', 'integer'],
] as const;

/**
 * Pass `bookings` once the Bookings sheet is loaded: each row then carries the member's
 * late-cancelled bookings from that sheet (matched on member ID); otherwise it is NULL.
 */
export function acquisitionFactsSQL(scope: string, today: string, bookings = false) {
  const late = bookings
    ? `(SELECT COUNT(*) FROM bookings b WHERE b.member_id=new.member_id AND b.late_cancelled>0)`
    : `CAST(NULL AS BIGINT)`;
  return `WITH flags AS (SELECT *, ${late} AS late_cancels, COALESCE(entry_type,'Unspecified') AS entry,
    (regexp_matches(lower(trim(COALESCE(entry_type,''))), '(^|[^a-z])new([^a-z]|$)') AND NOT regexp_matches(lower(trim(COALESCE(entry_type,''))), '^not([^a-z]|$)')) AS ref_new,
    (len(list_filter(regexp_split_to_array(COALESCE(purchase_journey,''), '[,;|/]+|\\s-\\s'), token -> trim(token)<>''))=0
      OR len(list_filter(regexp_split_to_array(COALESCE(purchase_journey,''), '[,;|/]+|\\s-\\s'), token -> trim(token)<>'' AND NOT regexp_matches(lower(regexp_replace(trim(token),'\\s+',' ','g')), '^money credits($| )')))>0) AS ref_membership_eligible,
    trim(COALESCE(retention,''))='Retained' AS ref_retained,
    regexp_matches(lower(COALESCE(format,'')), 'host|p57|birthday|rugby|lrs') AS ref_hosted,
    TRY_CAST(date AS DATE) <= DATE '${today}' - INTERVAL 30 DAY AS mature
    FROM new${scope}), outcomes AS (SELECT *, trim(COALESCE(conversion,''))='Converted' AS ref_converted FROM flags)
    SELECT *, ref_converted AND TRY_CAST(first_purchase_date AS DATE)>=TRY_CAST(date AS DATE) AND substr(first_purchase_date,1,7)=substr(date,1,7) AS converted_in_30,
      ref_converted AND ref_retained AND TRY_CAST(first_purchase_date AS DATE)>=TRY_CAST(date AS DATE) AND substr(first_purchase_date,1,7)=substr(date,1,7) AS returned_in_30,
      ref_converted AND TRY_CAST(first_purchase_date AS DATE)>=TRY_CAST(date AS DATE) AND substr(first_purchase_date,1,7)=substr(date,1,7) AS converted_same_month,
      ref_converted AND ref_retained AND TRY_CAST(first_purchase_date AS DATE)>=TRY_CAST(date AS DATE) AND substr(first_purchase_date,1,7)=substr(date,1,7) AS returned_same_month
    FROM outcomes`;
}
// Reference cohort tables count source rows; instructor tables explicitly use unique identities.
export const acquisitionAggregate = `COUNT(*) AS cohort_rows,
  COUNT(DISTINCT member_id) AS unique_members,
  COUNT(*) FILTER (WHERE ref_new) AS newcomers,
  CASE WHEN COUNT(conversion)>0 THEN COUNT(*) FILTER (WHERE ref_converted) END AS converted_members,
  CASE WHEN COUNT(retention)>0 THEN COUNT(*) FILTER (WHERE ref_retained) END AS retained_members,
  CASE WHEN COUNT(first_purchase_date)>0 THEN COUNT(DISTINCT member_id) FILTER (WHERE converted_in_30) END AS converted_30,
  CASE WHEN COUNT(first_purchase_date)>0 AND COUNT(retention)>0 THEN COUNT(DISTINCT member_id) FILTER (WHERE returned_in_30) END AS retained_30,
  COUNT(DISTINCT member_id) AS mature_30,
  CASE WHEN COUNT(conversion)>0 THEN COUNT(*) FILTER (WHERE ref_converted)::DOUBLE/NULLIF(COUNT(*) FILTER (WHERE ref_new),0) END AS conversion_rate,
  CASE WHEN COUNT(retention)>0 THEN COUNT(*) FILTER (WHERE ref_retained)::DOUBLE/NULLIF(COUNT(*) FILTER (WHERE ref_new),0) END AS retention_rate,
  CASE WHEN COUNT(first_purchase_date)>0 THEN COUNT(DISTINCT member_id) FILTER (WHERE converted_in_30)::DOUBLE/NULLIF(COUNT(DISTINCT member_id),0) END AS conversion_30_rate,
  CASE WHEN COUNT(first_purchase_date)>0 AND COUNT(retention)>0 THEN COUNT(DISTINCT member_id) FILTER (WHERE returned_in_30)::DOUBLE/NULLIF(COUNT(DISTINCT member_id),0) END AS retention_30_rate,
  AVG(ltv) AS avg_ltv, SUM(ltv) AS total_ltv, AVG(avg_purchase_value) AS avg_spend,
  AVG(first_purchase) FILTER (WHERE ref_converted AND first_purchase>0) AS first_purchase,
  AVG(post_trial_ltv) AS post_trial_ltv,
  AVG(conversion_days) FILTER (WHERE conversion_days>0) AS conversion_span,
  MEDIAN(conversion_days) FILTER (WHERE conversion_days>0) AS median_span,
  -- Same trial cohort and same counting unit as the conversion and retention
  -- rates, so the three read against one another.
  CASE WHEN COUNT(visits_post)>0 THEN COUNT(*) FILTER (WHERE ref_new AND visits_post>0)::DOUBLE/NULLIF(COUNT(*) FILTER (WHERE ref_new),0) END AS second_visit_rate,
  AVG(visits_post) FILTER (WHERE visits_post>0) AS visits_post, AVG(post_trial_purchases) AS purchases_post,
  SUM(class_no) AS source_visits,
  CASE WHEN COUNT(first_purchase_date)>0 THEN COUNT(*) FILTER (WHERE converted_same_month) END AS converted_same_month,
  CASE WHEN COUNT(first_purchase_date)>0 AND COUNT(retention)>0 THEN COUNT(*) FILTER (WHERE returned_same_month) END AS retained_same_month,
  CASE WHEN COUNT(first_purchase_date)>0 THEN COUNT(*) FILTER (WHERE converted_same_month)::DOUBLE/NULLIF(COUNT(*) FILTER (WHERE ref_new),0) END AS conversion_same_month_rate,
  CASE WHEN COUNT(first_purchase_date)>0 AND COUNT(retention)>0 THEN COUNT(*) FILTER (WHERE returned_same_month)::DOUBLE/NULLIF(COUNT(*) FILTER (WHERE ref_new),0) END AS retention_same_month_rate,
  SUM(post_trial_ltv) AS post_trial_spend, SUM(post_trial_purchases) AS post_trial_purchases_total,
  SUM(purchases) AS total_purchases, SUM(visits) AS total_visits,
  SUM(ltv)/NULLIF(SUM(visits) FILTER (WHERE ltv IS NOT NULL),0) AS revenue_per_visit,
  SUM(late_cancels) AS late_cancels`;

export function acquisitionMonths(today: string, count = 14) {
  const now = new Date(today + 'T00:00:00Z');
  return Array.from({length: count}, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + i, 1)).toISOString().slice(0,7));
}
export function priorMonth(month: string, offset: number) {
  return new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5,7))-1-offset, 1)).toISOString().slice(0,7);
}

/** Human-facing labels retain ISO keys for cohort joins and comparisons. */
export function acquisitionPeriodLabel(value: unknown) {
  if (value == null || value === '') return '—';
  const key = String(value);
  if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(key)) return key;
  const date = new Date(key.length === 7 ? key + '-01T00:00:00Z' : key + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime())) return key;
  const month = date.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
  return `${key.length === 10 ? date.getUTCDate() + ' ' : ''}${month} - ${date.getUTCFullYear()}`;
}

export const acquisitionDimensions = [
  { key: 'entry', label: 'Entry type', sql: "COALESCE(entry_type,'Unspecified')" },
  { key: 'membership', label: 'Membership used', sql: `COALESCE(NULLIF(array_to_string(from_json(membership_sequence, '["VARCHAR"]'), ', '),''),'Unspecified')` },
  { key: 'experience', label: 'First visit entity name', sql: "COALESCE(format,'Unspecified')" },
  { key: 'location', label: 'Studio', sql: "COALESCE(location,'Unspecified')" },
  { key: 'trainer', label: 'Instructor', sql: "COALESCE(trainer,'Unspecified')" },
  { key: 'product', label: 'First purchase', sql: "COALESCE(product,'Unspecified')" },
] as const;
export type AcquisitionDimension = typeof acquisitionDimensions[number]['key'];

/** Same calendar month is adjacent across years; groups follow latest month order. */
export function acquisitionYoYMonths(now: string) {
  const months = acquisitionMonths(now, 26).reverse();
  const order = [...new Set(months.map(month => month.slice(5)))];
  return order.flatMap(key => months.filter(month => month.slice(5) === key));
}

export function acquisitionPivotSQL(scope: string, now: string, parent: AcquisitionDimension, child: AcquisitionDimension, values: string[] | null = null) {
  const dimensionSQL = (key: AcquisitionDimension) => acquisitionDimensions.find(d => d.key === key)!.sql;
  const selected = values == null ? '' : values.length ? `WHERE parent_value IN (${values.map(value => "'" + value.replaceAll("'", "''") + "'").join(',')})` : 'WHERE FALSE';
  return `WITH facts AS (${acquisitionFactsSQL(scope, now)}),
    labelled AS (SELECT *, ${dimensionSQL(parent)} AS parent_value, ${dimensionSQL(child)} AS child_value FROM facts),
    selected AS (SELECT * FROM labelled ${selected})
    SELECT parent_value AS parent, child_value AS child, month,
      GROUPING(parent_value) AS is_total, GROUPING(child_value) AS is_parent,
      ${acquisitionAggregate}
    FROM selected GROUP BY GROUPING SETS ((parent_value,child_value,month),(parent_value,month),(month))
    ORDER BY parent_value,child_value,month`;
}

export const instructorAcquisitionAggregate = acquisitionAggregate
  .replace('COUNT(*) FILTER (WHERE ref_new) AS newcomers', 'COUNT(DISTINCT member_id) FILTER (WHERE ref_new) AS newcomers')
  .replaceAll('COUNT(*) FILTER (WHERE ref_converted)', 'COUNT(DISTINCT member_id) FILTER (WHERE ref_converted)')
  .replaceAll('COUNT(*) FILTER (WHERE ref_retained)', 'COUNT(DISTINCT member_id) FILTER (WHERE ref_retained)')
  .replaceAll('COUNT(*) FILTER (WHERE ref_new AND visits_post>0)', 'COUNT(DISTINCT member_id) FILTER (WHERE ref_new AND visits_post>0)')
  .replaceAll('NULLIF(COUNT(*) FILTER (WHERE ref_new),0)', 'NULLIF(COUNT(DISTINCT member_id) FILTER (WHERE ref_new),0)');
