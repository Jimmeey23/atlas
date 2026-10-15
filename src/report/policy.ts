/** Legacy estimates are unsuitable for a leadership report. The intelligence appendix
 * supplies fixed-window/member-base/payroll evidence instead. Dashboard contracts remain separate. */
export const unsupportedReportMetrics = new Set([
  'break_even_class_size','gap_to_break_even','lost_revenue','payroll_cost','contribution_margin','contribution_margin_pct','contribution','payroll_ratio','empty_session_cost',
  'conversion_rate','retention_rate','zero_return_rate','avg_conversion_span','churn_rate',
]);
