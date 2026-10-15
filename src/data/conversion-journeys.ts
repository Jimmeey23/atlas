/** Cohort filters apply to first visits; subsequent events retain their full dated coverage. */
export function conversionJourneySQL(scope: string, asOf: string, imports: boolean) {
  return `WITH first_visits AS (
    SELECT * FROM new WHERE is_new AND NULLIF(trim(member_id),'') IS NOT NULL AND TRY_CAST(date AS DATE) IS NOT NULL
    QUALIFY ROW_NUMBER() OVER(PARTITION BY member_id ORDER BY date,source_row)=1
  ), cohort AS (SELECT * FROM first_visits${scope}),
  coverage AS (SELECT LEAST(DATE '${asOf}', MAX(TRY_CAST(date AS DATE))) AS observed_through FROM checkins),
  purchases AS (
    SELECT c.member_id, s.date, COALESCE(NULLIF(trim(s.sale_id),''), 'row:' || s.source_row) AS purchase_id,
      string_agg(DISTINCT COALESCE(NULLIF(trim(s.product),''),'Unspecified product'), ' + ' ORDER BY COALESCE(NULLIF(trim(s.product),''),'Unspecified product')) AS products
    FROM cohort c JOIN sales s ON c.member_id=s.member_id AND TRY_CAST(s.date AS DATE)>=TRY_CAST(c.date AS DATE)
    WHERE TRY_CAST(s.date AS DATE)<=DATE '${asOf}' AND NOT COALESCE(s.voided,FALSE) AND (s.status='succeeded' OR s.status IS NULL) ${imports ? '' : 'AND NOT COALESCE(s.imported,FALSE)'}
    GROUP BY c.member_id,s.date,purchase_id
  ), ranked AS (SELECT *, ROW_NUMBER() OVER(PARTITION BY member_id ORDER BY date,purchase_id) AS step FROM purchases),
  paths AS (SELECT member_id, COUNT(*) AS purchases,
    string_agg(products, ' → ' ORDER BY step) FILTER (WHERE step<=4) AS path FROM ranked GROUP BY member_id),
  outcomes AS (SELECT c.*,
    LEAST(TRY_CAST(c.date AS DATE)+INTERVAL 30 DAY, last_day(TRY_CAST(c.date AS DATE))) AS deadline,
    coverage.observed_through,
    lower(trim(c.conversion))='converted' AND TRY_CAST(c.first_purchase_date AS DATE)<=DATE '${asOf}' AND TRY_CAST(c.first_purchase_date AS DATE) BETWEEN TRY_CAST(c.date AS DATE)
      AND LEAST(TRY_CAST(c.date AS DATE)+INTERVAL 30 DAY,last_day(TRY_CAST(c.date AS DATE))) AS window_converted,
    EXISTS(SELECT 1 FROM checkins v WHERE v.member_id=c.member_id AND v.attended
      AND TRY_CAST(v.date AS DATE)>TRY_CAST(c.date AS DATE)
      AND TRY_CAST(v.date AS DATE)<=LEAST(TRY_CAST(c.date AS DATE)+INTERVAL 30 DAY,last_day(TRY_CAST(c.date AS DATE)))) AS returned,
    COALESCE(p.purchases,0) AS purchase_count,
    'First visit: ' || COALESCE(NULLIF(trim(c.format),''),'Unspecified session') || ' → ' || COALESCE(p.path,'No linked purchase recorded')
      || CASE WHEN p.purchases>4 THEN ' → Further purchases' ELSE '' END AS journey
    FROM cohort c CROSS JOIN coverage LEFT JOIN paths p ON p.member_id=c.member_id)
  SELECT journey, COUNT(*) AS clients, COUNT(*)::DOUBLE/SUM(COUNT(*)) OVER() AS share,
    AVG(purchase_count) AS avg_purchases,
    COUNT(*) FILTER (WHERE window_converted) AS converted,
    COUNT(*) FILTER (WHERE first_purchase_date IS NOT NULL AND conversion IS NOT NULL) AS conversion_known,
    COUNT(*) FILTER (WHERE returned) AS retained,
    COUNT(*) FILTER (WHERE deadline<=observed_through) AS retention_eligible,
    COUNT(*) FILTER (WHERE deadline<=observed_through AND returned) AS retained_eligible,
    COUNT(*) FILTER (WHERE conversion IS NOT NULL AND (TRY_CAST(first_purchase_date AS DATE) IS NOT NULL OR lower(trim(conversion))<>'converted')) AS conversion_eligible
  FROM outcomes GROUP BY journey ORDER BY clients DESC,journey`;
}
