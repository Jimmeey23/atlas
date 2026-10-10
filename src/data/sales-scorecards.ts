import { groupable, groupValueSQL } from './group-fields';

/** Purchase history is evaluated before filtering payment dates, so upgrades retain their baseline. */
export function salesScorecardFactsSQL(scope: string, includeImports: boolean) {
  return `WITH eligible AS (SELECT *, COALESCE(membership_id,'sale:' || sale_id,'row:' || source_row::VARCHAR) AS purchase_key FROM sales WHERE NOT COALESCE(voided,FALSE) AND (status='succeeded' OR status IS NULL)${includeImports ? '' : ' AND NOT imported'}),
  plans AS (SELECT *,
    CASE WHEN category='Memberships' AND regexp_matches(lower(product),'unlimited|u/l|membership') THEN 'duration' WHEN category='Class Packages' THEN 'classes' END AS plan_kind,
    CASE WHEN category='Memberships' THEN CASE WHEN regexp_matches(lower(product),'annual|year|12 month') THEN 12 WHEN regexp_matches(lower(product),'2 week') THEN 0.5 ELSE TRY_CAST(regexp_extract(lower(product),'([0-9]+) month',1) AS DOUBLE) END
      WHEN category='Class Packages' THEN COALESCE(TRY_CAST(regexp_extract(lower(product),'([0-9]+) (single )?class',1) AS DOUBLE),session_limit) END AS plan_size
    FROM eligible),
  purchases AS (SELECT purchase_key,member_id,product,plan_kind,MAX(plan_size) AS plan_size,MIN(date) AS purchase_date FROM plans WHERE member_id IS NOT NULL AND revenue>0 AND plan_kind IS NOT NULL GROUP BY purchase_key,member_id,product,plan_kind),
  history AS (SELECT *, LAG(plan_size) OVER(PARTITION BY member_id,plan_kind ORDER BY purchase_date,purchase_key) AS previous_size,LAG(product) OVER(PARTITION BY member_id,plan_kind ORDER BY purchase_date,purchase_key) AS previous_product,LAG(purchase_date) OVER(PARTITION BY member_id,plan_kind ORDER BY purchase_date,purchase_key) AS previous_date FROM purchases),
  scoped AS (SELECT * FROM plans${scope})
  SELECT scoped.*, history.previous_product,history.previous_size,
    COALESCE(history.plan_size>history.previous_size AND history.purchase_date>history.previous_date AND scoped.date=history.purchase_date,FALSE) AS is_upgrade,
    regexp_matches(lower(COALESCE(scoped.product,'')),'annual|yearly|12 month|1 year') AS is_annual,
    (lower(COALESCE(scoped.category,''))='privates' OR regexp_matches(lower(COALESCE(scoped.product,'')),'private')) AS is_private
  FROM scoped LEFT JOIN history ON scoped.purchase_key=history.purchase_key AND scoped.member_id=history.member_id AND scoped.product=history.product AND scoped.plan_kind=history.plan_kind`;
}
export const salesScorecardAggregate = `COUNT(*) AS payment_lines, COUNT(DISTINCT purchase_key) AS purchase_count, COUNT(DISTINCT sale_id) AS transactions,COUNT(DISTINCT member_id) AS buyers,SUM(revenue) AS gross_revenue,SUM(revenue-vat) AS net_revenue,SUM(discount) AS discount_value,SUM(discount)/NULLIF(SUM(revenue)+SUM(discount),0) AS discount_rate,COUNT(*) FILTER(WHERE discount>0) AS discounted_lines,COUNT(discount) AS discount_known,COUNT(DISTINCT sale_id) FILTER(WHERE discount>0)::DOUBLE/NULLIF(COUNT(DISTINCT sale_id),0) AS discount_penetration`;

/** Row dimensions each scorecard shows by default; viewers may swap or add any groupable Sales column. */
export const salesScorecardDefaults = {
  discounts: ['discount_code'], upgrades: ['previous_product', 'product'],
  annual: ['member', 'month', 'product'], private: ['member', 'month', 'product'],
} as const satisfies Record<string, readonly string[]>;
// Columns the scorecards have always shown verbatim (NULL stays NULL); `previous_product` is computed by the facts query.
const verbatim = new Set(['previous_product', 'product', 'month']);
/** Valid dimensions only, de-duplicated, in order. */
export const salesScorecardDims = (dims: readonly string[]) =>
  [...new Set(dims)].filter((d) => d === 'discount_code' || d === 'member' || verbatim.has(d) || groupable(d));
/** SELECT list for the chosen dimensions; GROUP BY ALL groups on exactly these columns. */
export function salesScorecardSelect(dims: readonly string[]) {
  return salesScorecardDims(dims).map((d) =>
    d === 'discount_code' ? "COALESCE(discount_code,'No code') AS discount_code"
    : d === 'member' ? "member_id,COALESCE(member,'Unidentified member') AS member"
    : verbatim.has(d) ? d : `${groupValueSQL(d)} AS "${d}"`).join(',');
}
/** Predicate matching one scorecard row on the chosen dimensions (same expressions as the SELECT). */
export function salesScorecardTerms(dims: readonly string[], row: Record<string, unknown>, quote: (v: string) => string) {
  return salesScorecardDims(dims).flatMap((d) =>
    d === 'discount_code' ? [`COALESCE(discount_code,'No code')=${quote(String(row.discount_code))}`]
    : d === 'member' ? [row.member_id == null ? 'member_id IS NULL' : `member_id=${quote(String(row.member_id))}`, `COALESCE(member,'Unidentified member')=${quote(String(row.member))}`]
    : verbatim.has(d) ? [row[d] == null ? `${d} IS NULL` : `${d}=${quote(String(row[d]))}`]
    : [`${groupValueSQL(d)}=${quote(String(row[d]))}`]);
}
