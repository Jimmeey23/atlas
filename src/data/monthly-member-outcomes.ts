/** Use recorded access categories first; unrecognized categories fall back to product names. */
export const accessTypeSQL = `CASE
  WHEN lower(trim(category))='memberships' THEN 'Memberships'
  WHEN lower(trim(category))='class packages' THEN 'Class packages'
  WHEN lower(trim(category))='newcomers special' THEN 'Trials / introductory'
  WHEN lower(trim(category))='sessions/single classes' THEN 'Drop-in / single session'
  WHEN lower(trim(category))='complimentary/promotional' THEN 'Complimentary / hosted'
  WHEN lower(trim(category))='privates' THEN 'Private sessions'
  WHEN regexp_matches(lower(COALESCE(product,category,'')), 'unlimited|membership|monthly|annual|quarterly|subscription|month pass') THEN 'Memberships'
  WHEN regexp_matches(lower(COALESCE(product,category,'')), 'pack|[0-9]+[ -]*(class|session)|class[ -]*(bundle|credit)') THEN 'Class packages'
  WHEN regexp_matches(lower(COALESCE(product,category,'')), 'trial|intro|first timer|newcomer') THEN 'Trials / introductory'
  WHEN regexp_matches(lower(COALESCE(product,category,'')), 'drop.?in|single|one class|1 class') THEN 'Drop-in / single session'
  WHEN regexp_matches(lower(COALESCE(product,category,'')), 'complimentary|free|guest|hosted') THEN 'Complimentary / hosted'
  ELSE 'Other / unspecified' END`;

export function monthlyFrequencySQL(scope: string) {
  return `WITH visits AS (
    SELECT *, ${accessTypeSQL} AS access_type,
      COALESCE(NULLIF(trim(session_id),''), concat_ws('|',date,location,format,time,trainer)) AS visit_key
    FROM checkins${scope}${scope ? ' AND ' : ' WHERE '}attended AND NULLIF(trim(member_id),'') IS NOT NULL AND date IS NOT NULL
  ), members AS (
    SELECT substr(date,1,7) AS month, member_id, COUNT(DISTINCT visit_key) AS visits,
      CASE WHEN COUNT(DISTINCT access_type)>1 THEN 'Mixed access' ELSE MIN(access_type) END AS access_type
    FROM visits GROUP BY 1,2
  )
  SELECT month, CASE WHEN GROUPING(access_type)=1 THEN 'All access types' ELSE access_type END AS access_type,
    COUNT(*) AS members,
    COUNT(*) FILTER (WHERE visits=1) AS one_class,
    COUNT(*) FILTER (WHERE visits BETWEEN 2 AND 6) AS two_six,
    COUNT(*) FILTER (WHERE visits BETWEEN 7 AND 14) AS seven_fourteen,
    COUNT(*) FILTER (WHERE visits>=15) AS fifteen_plus,
    SUM(visits) AS visits
  FROM members GROUP BY GROUPING SETS ((month,access_type),(month)) ORDER BY month DESC,GROUPING(access_type) DESC,access_type`;
}

/** Attribute newcomer outcomes to the instructor of their earliest recorded first visit. */
export function instructorMonthlyOutcomesSQL(scope: string, asOf: string) {
  return `WITH first_cohort AS (
    SELECT * FROM new WHERE is_new AND NULLIF(trim(member_id),'') IS NOT NULL AND TRY_CAST(date AS DATE) IS NOT NULL
    QUALIFY ROW_NUMBER() OVER(PARTITION BY member_id ORDER BY date,source_row)=1
  ), cohort AS (SELECT * FROM first_cohort${scope}),
  coverage AS (SELECT CASE WHEN MAX(TRY_CAST(date AS DATE)) IS NOT NULL THEN LEAST(DATE '${asOf}', MAX(TRY_CAST(date AS DATE))) END AS observed_through FROM checkins),
  flags AS (
    SELECT c.*, regexp_replace(lower(trim(COALESCE(trainer,'Unspecified'))),'\\s+',' ','g') AS trainer_key,
      TRY_CAST(c.date AS DATE)<=observed_through-INTERVAL 30 DAY AS mature,
      lower(trim(conversion))='converted' AS outcome_converted,
      lower(trim(retention))='retained' AS outcome_retained,
      lower(trim(conversion))='converted' AND TRY_CAST(first_purchase_date AS DATE)>=TRY_CAST(c.date AS DATE)
        AND TRY_CAST(first_purchase_date AS DATE)<=TRY_CAST(c.date AS DATE)+INTERVAL 30 DAY AS converted_30,
      EXISTS(SELECT 1 FROM checkins v WHERE v.member_id=c.member_id AND v.attended
        AND TRY_CAST(v.date AS DATE)>TRY_CAST(c.date AS DATE)
        AND TRY_CAST(v.date AS DATE)<=TRY_CAST(c.date AS DATE)+INTERVAL 30 DAY) AS returned_30,
      observed_through
    FROM cohort c CROSS JOIN coverage
  )
  SELECT substr(date,1,7) AS month, MIN(COALESCE(trainer,'Unspecified')) AS trainer,
    COUNT(*) AS newcomers,
    COUNT(*) FILTER (WHERE conversion IS NOT NULL) AS conversion_known,
    COUNT(*) FILTER (WHERE retention IS NOT NULL) AS retention_known,
    CASE WHEN COUNT(conversion)>0 THEN COUNT(*) FILTER (WHERE outcome_converted) END AS converted,
    CASE WHEN COUNT(retention)>0 THEN COUNT(*) FILTER (WHERE outcome_retained) END AS retained,
    CASE WHEN COUNT(conversion)>0 THEN COUNT(*) FILTER (WHERE outcome_converted)::DOUBLE/COUNT(*) END AS conversion_rate,
    CASE WHEN COUNT(retention)>0 THEN COUNT(*) FILTER (WHERE outcome_retained)::DOUBLE/COUNT(*) END AS retention_rate,
    COUNT(*) FILTER (WHERE mature) AS mature_30,
    COUNT(*) FILTER (WHERE mature AND outcome_converted AND TRY_CAST(first_purchase_date AS DATE) IS NULL) AS undated_conversions,
    CASE WHEN COUNT(*) FILTER (WHERE mature AND conversion IS NOT NULL)>0
      THEN COUNT(*) FILTER (WHERE mature AND converted_30) END AS converted_30,
    CASE WHEN COUNT(*) FILTER (WHERE mature AND conversion IS NOT NULL)>0
      THEN COUNT(*) FILTER (WHERE mature AND converted_30)::DOUBLE/NULLIF(COUNT(*) FILTER (WHERE mature),0) END AS conversion_30_rate,
    CASE WHEN COUNT(*) FILTER (WHERE mature)>0 THEN COUNT(*) FILTER (WHERE mature AND returned_30) END AS retained_30,
    COUNT(*) FILTER (WHERE mature AND returned_30)::DOUBLE/NULLIF(COUNT(*) FILTER (WHERE mature),0) AS retention_30_rate,
    CASE WHEN COUNT(visits_post)>0 THEN COUNT(*) FILTER (WHERE visits_post>0)::DOUBLE/COUNT(*) END AS second_visit_rate,
    AVG(conversion_days) FILTER (WHERE conversion_days>=0 AND outcome_converted) AS avg_conversion_days,
    CASE WHEN COUNT(visits_post)>0 THEN COUNT(*) FILTER (WHERE visits_post>0) END AS second_visitors,
    CASE WHEN COUNT(visits_post)>0 THEN COUNT(*) END AS second_visit_base,
    SUM(conversion_days) FILTER (WHERE conversion_days>=0 AND outcome_converted) AS conversion_days_total,
    COUNT(conversion_days) FILTER (WHERE conversion_days>=0 AND outcome_converted) AS conversion_days_n,
    MAX(observed_through)::VARCHAR AS observed_through
  FROM flags GROUP BY substr(date,1,7),trainer_key ORDER BY month DESC,trainer`;
}
