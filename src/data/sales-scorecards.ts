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
export const salesScorecardAggregate = `SUM(revenue)/NULLIF(COUNT(DISTINCT member_id),0) AS arpu,SUM(revenue)/NULLIF(COUNT(DISTINCT sale_id),0) AS aov,COUNT(DISTINCT sale_id) FILTER(WHERE member_id IS NOT NULL)::DOUBLE/NULLIF(COUNT(DISTINCT member_id),0) AS purchase_frequency,COUNT(DISTINCT product) AS product_breadth,COUNT(*) AS payment_lines, COUNT(DISTINCT purchase_key) AS purchase_count, COUNT(DISTINCT sale_id) AS transactions,COUNT(DISTINCT member_id) AS buyers,SUM(revenue) AS gross_revenue,SUM(revenue-vat) AS net_revenue,SUM(discount) AS discount_value,SUM(discount)/NULLIF(SUM(revenue)+SUM(discount),0) AS discount_rate,COUNT(*) FILTER(WHERE discount>0) AS discounted_lines,COUNT(discount) AS discount_known,COUNT(DISTINCT sale_id) FILTER(WHERE discount>0)::DOUBLE/NULLIF(COUNT(DISTINCT sale_id),0) AS discount_penetration`;

/** Row dimensions each scorecard shows by default; viewers may swap or add any groupable Sales column. */
export const salesScorecardDefaults = {
  people: ['associate'], people_month: ['associate', 'month'], discounts: ['discount_code'], upgrades: ['previous_product', 'product'],
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

/** Product rankings use distinct sales, with alphabetical tie-breaking. */
export function salesScorecardQuery(facts: string, condition: string, dims: string[]) {
  const dimensions = salesScorecardDims(dims);
  const selected = dimensions.length ? salesScorecardSelect(dimensions)+',' : '';
  const equality = dimensions.flatMap(d=>d==='member' ? ['p.member_id IS NOT DISTINCT FROM g.member_id', "COALESCE(p.member,'Unidentified member')=g.member"] : [d==='discount_code' ? "COALESCE(p.discount_code,'No code')=g.discount_code" : verbatim.has(d) ? `p."${d}" IS NOT DISTINCT FROM g."${d}"` : `${groupValueSQL(d).replaceAll('"'+d+'"','p."'+d+'"')} IS NOT DISTINCT FROM g."${d}"`]).join(' AND ');
  const product = (direction: string) => `(SELECT p.product FROM eligible p ${equality ? 'WHERE '+equality : ''} GROUP BY p.product HAVING COUNT(DISTINCT p.sale_id)>0 ORDER BY COUNT(DISTINCT p.sale_id) ${direction},p.product LIMIT 1)`;
  const partition=dimensions.filter(d=>d!=='month').flatMap(d=>d==='member'?['member_id','member']:[d]).map(d=>'"'+d+'"').join(',');
  const window=`OVER (${partition?'PARTITION BY '+partition+' ':''}ORDER BY month)`;
  const growth=dimensions.includes('month') ? `,CASE WHEN TRY_CAST(month||'-01' AS DATE)=TRY_CAST(LAG(month) ${window}||'-01' AS DATE)+INTERVAL 1 MONTH THEN gross_revenue/NULLIF(LAG(gross_revenue) ${window},0)-1 END AS mom_growth` : '';
  return `WITH facts AS (${facts}), eligible AS (SELECT * FROM facts WHERE ${condition}), g AS (SELECT ${selected}${salesScorecardAggregate} FROM eligible ${dimensions.length ? 'GROUP BY ALL' : ''}) SELECT g.*,${product('DESC')} AS top_product,${product('ASC')} AS bottom_product${growth} FROM g ORDER BY gross_revenue DESC NULLS LAST`;
}
