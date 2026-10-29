/**
 * Plain-language formulas for measures that are local to a workspace and are not
 * governed registry metrics: renewal cohort counts, journey conversion windows,
 * report-only aggregates and similar.
 *
 * Nothing here may duplicate a registered metric id. The registry is consulted first in
 * `getMetricFormulaInfo`, so a shadowed entry is unreachable dead code that silently
 * ignores every edit. tests/metric-definitions.test.ts enforces that.
 */

export const CUSTOM_METRIC_FORMULAS: Record<string, { label: string; formula: string; calculation?: string; sources?: string[] }> = {
  composite_score: {
    label: "Composite score",
    formula: "ROUND(100 * (RANK(fill_rate) + RANK(avg_class_size) + RANK(revenue_per_session) + RANK(conversion_rate) + RANK(1 - empty_share) + RANK(1 - booking_late_rate)) / 6)",
    calculation: "Evenly weighted percentile rank across fill rate, class size, revenue per class, conversion, session occupancy and low late cancellations.",
    sources: ["Sessions", "New", "Bookings"],
  },
  mom_growth: {
    label: "Collections MoM change",
    formula: "(gross_revenue - LAG(gross_revenue)) / NULLIF(LAG(gross_revenue), 0)",
    calculation: "Percentage change in gross collections compared to the preceding calendar month.",
    sources: ["Sales"],
  },
  top_product: {
    label: "Top product · sales",
    formula: "ARG_MAX(product, gross_revenue)",
    calculation: "Product generating the highest gross collections.",
    sources: ["Sales.Product", "Sales.PaymentValue"],
  },
  bottom_product: {
    label: "Bottom product · sales",
    formula: "ARG_MIN(product, gross_revenue)",
    calculation: "Product generating the lowest gross collections.",
    sources: ["Sales.Product", "Sales.PaymentValue"],
  },
  discount_penetration: {
    label: "Discounted sale share",
    formula: "COUNT(DISTINCT sale_id) FILTER (WHERE discount > 0) / NULLIF(COUNT(DISTINCT sale_id), 0)",
    calculation: "Proportion of sales that included at least one discount.",
    sources: ["Sales.Discount", "Sales.SaleID"],
  },
  discounted_lines: {
    label: "Discounted lines",
    formula: "COUNT(*) FILTER (WHERE discount > 0)",
    calculation: "Count of line items with positive discount amount.",
    sources: ["Sales.Discount"],
  },
  payment_lines: {
    label: "Payment lines",
    formula: "COUNT(*)",
    calculation: "Total recorded payment line items.",
    sources: ["Sales"],
  },
  purchase_count: {
    label: "Purchases",
    formula: "COUNT(*)",
    calculation: "Count of recorded purchase lines.",
    sources: ["Sales"],
  },
  non_empty_sessions: {
    label: "Non-empty classes",
    formula: "COUNT(DISTINCT session_id) FILTER (WHERE checked_in > 0)",
    calculation: "Number of sessions with at least one checked-in attendee.",
    sources: ["Sessions.CheckedIn"],
  },
  new_visitors: {
    label: "New members",
    formula: "COUNT(*) FILTER (WHERE is_new)",
    calculation: "Count of new member records.",
    sources: ["New.IsNew"],
  },
  converted: {
    label: "Converted",
    formula: "COUNT(*) FILTER (WHERE is_new AND conversion = 'Converted')",
    calculation: "Newcomers whose latest recorded outcome is Converted.",
    sources: ["New.Conversion"],
  },
  retained: {
    label: "Retained",
    formula: "COUNT(*) FILTER (WHERE is_new AND retention = 'Retained')",
    calculation: "Newcomers whose latest recorded outcome is Retained.",
    sources: ["New.Retention"],
  },
  late_cancelled: {
    label: "Late cancelled",
    formula: "COUNT(*) FILTER (WHERE late_cancelled > 0)",
    calculation: "Bookings cancelled after the cancellation cut-off window.",
    sources: ["Bookings.LateCancelled"],
  },
  cohort_rows: {
    label: "Clients / trials",
    formula: "COUNT(*)",
    calculation: "Total trial/first-visit cohort records.",
    sources: ["New"],
  },
  unique_members: {
    label: "Unique members",
    formula: "COUNT(DISTINCT member_id)",
    calculation: "Distinct member IDs in the cohort.",
    sources: ["New.MemberID"],
  },
  newcomers: {
    label: "New clients",
    formula: "COUNT(*) FILTER (WHERE is_new)",
    calculation: "Unique clients identified as new.",
    sources: ["New.IsNew"],
  },
  converted_members: {
    label: "Converted records (all visit types)",
    formula: "COUNT(*) FILTER (WHERE conversion = 'Converted')",
    calculation: "Cohort records with Conversion Status = Converted.",
    sources: ["New.Conversion"],
  },
  retained_members: {
    label: "Retained records (all visit types)",
    formula: "COUNT(*) FILTER (WHERE retention = 'Retained')",
    calculation: "Cohort records with Retained Status = Retained.",
    sources: ["New.Retention"],
  },
  converted_30: {
    label: "Same-month converted",
    formula: "COUNT(*) FILTER (WHERE is_new AND converted_same_month)",
    calculation: "Newcomers who purchased a membership in their first calendar month.",
    sources: ["New", "Sales"],
  },
  retained_30: {
    label: "Same-month converted & retained",
    formula: "COUNT(*) FILTER (WHERE is_new AND retained_same_month)",
    calculation: "Newcomers who converted and remained active in their first calendar month.",
    sources: ["New", "Sales"],
  },
  mature_30: {
    label: "Calendar-month cohort members",
    formula: "COUNT(*) FILTER (WHERE month < CURRENT_MONTH)",
    calculation: "Cohort members whose first-visit month has completed.",
    sources: ["New"],
  },
  conversion_30_rate: {
    label: "Same-month conversion rate",
    formula: "COUNT(*) FILTER (WHERE is_new AND converted_same_month) / NULLIF(COUNT(*) FILTER (WHERE is_new), 0)",
    calculation: "Percentage of newcomers converting within the same calendar month.",
    sources: ["New", "Sales"],
  },
  retention_30_rate: {
    label: "Same-month retained rate",
    formula: "COUNT(*) FILTER (WHERE is_new AND retained_same_month) / NULLIF(COUNT(*) FILTER (WHERE is_new), 0)",
    calculation: "Percentage of newcomers retained within the same calendar month.",
    sources: ["New", "Sales"],
  },
  total_ltv: {
    label: "Total LTV",
    formula: "SUM(ltv)",
    calculation: "Total cumulative spend recorded across cohort members.",
    sources: ["New.LTV"],
  },
  avg_spend: {
    label: "Average spend / purchase",
    formula: "SUM(spend) / NULLIF(COUNT(DISTINCT purchase_id), 0)",
    calculation: "Total purchase value divided by number of purchases.",
    sources: ["Sales.PaymentValue"],
  },
  first_purchase: {
    label: "Average first purchase",
    formula: "AVG(first_purchase)",
    calculation: "Average initial membership/pack spend of converted newcomers.",
    sources: ["New.FirstPurchase"],
  },
  post_trial_ltv: {
    label: "Average post-trial LTV",
    formula: "AVG(post_trial_ltv)",
    calculation: "Average spend after the initial trial purchase.",
    sources: ["New.PostTrialLTV"],
  },
  conversion_span: {
    label: "Conversion span",
    formula: "AVG(days_to_convert)",
    calculation: "Average days elapsed between first visit and first membership purchase.",
    sources: ["New.DaysToConvert"],
  },
  median_span: {
    label: "Median conversion span",
    formula: "MEDIAN(days_to_convert)",
    calculation: "Median days elapsed between first visit and first membership purchase.",
    sources: ["New.DaysToConvert"],
  },
  visits_post: {
    label: "Average post-trial visits",
    formula: "AVG(visits_post)",
    calculation: "Average attendance visits taken after trial completion.",
    sources: ["New.VisitsPost"],
  },
  purchases_post: {
    label: "Average post-trial purchases",
    formula: "AVG(purchases_post)",
    calculation: "Average number of repeat purchases made after initial conversion.",
    sources: ["New.PurchasesPost"],
  },
  source_visits: {
    label: "Recorded visit count",
    formula: "COUNT(visit_id)",
    calculation: "Total visits recorded across the cohort.",
    sources: ["New.Visits"],
  },
  converted_same_month: {
    label: "First-month converted",
    formula: "COUNT(*) FILTER (WHERE converted_same_month)",
    calculation: "First-month conversions from first-visit date.",
    sources: ["New", "Sales"],
  },
  retained_same_month: {
    label: "First-month retained",
    formula: "COUNT(*) FILTER (WHERE retained_same_month)",
    calculation: "First-month retentions from first-visit date.",
    sources: ["New", "Sales"],
  },
  due: {
    label: "Total due",
    formula: "COUNT(DISTINCT member_id) FILTER (WHERE status IN ('Renewed', 'Expired', 'Frozen', 'Grace period'))",
    calculation: "Total unique members due for renewal in expiry month across ongoing paid memberships.",
    sources: ["Lapsed.Status", "Lapsed.MemberID"],
  },
  renewed: {
    label: "Renewed",
    formula: "COUNT(DISTINCT member_id) FILTER (WHERE status = 'Renewed')",
    calculation: "Members who renewed their membership upon expiry.",
    sources: ["Lapsed.Status"],
  },
  lapsed: {
    label: "Expired / lapsed",
    formula: "COUNT(DISTINCT member_id) FILTER (WHERE status = 'Expired' AND churn_days >= 30)",
    calculation: "Members whose membership expired and churn date is at least 30 days old.",
    sources: ["Lapsed.Status", "Lapsed.ChurnedDate"],
  },
  frozen: {
    label: "Frozen",
    formula: "COUNT(DISTINCT member_id) FILTER (WHERE status = 'Frozen')",
    calculation: "Members with an active membership freeze or suspension.",
    sources: ["Lapsed.Status"],
  },
  pending: {
    label: "Grace period (<30 days)",
    formula: "COUNT(DISTINCT member_id) FILTER (WHERE status = 'Grace period' OR churn_days < 30)",
    calculation: "Members expired within the past 30 days still in grace period.",
    sources: ["Lapsed.Status", "Lapsed.ChurnedDate"],
  },
  renewal_rate: {
    label: "Renewal rate",
    formula: "COUNT(renewed) / NULLIF(COUNT(total_due), 0)",
    calculation: "Percentage of memberships due that renewed successfully.",
    sources: ["Lapsed.Status"],
  },
};