export const currentSnapshotMetrics = new Set(["active_base", "active_memberships", "dormant_actives", "revenue_at_risk_30d"]);
export const metricNotes: Record<string, { definition: string; caveat?: string; numerator?: string; denominator?: string }> = {
  revenue: { definition: "Revenue attributed to studio sessions in the selected date range.", caveat: "Recognised session revenue differs from cash collected on the Revenue & sales tab." },
  discount_value: { definition: "Sale-item unit discount multiplied by quantity, summed across payment lines.", caveat: "Sale-level discount totals repeat on multi-item sales and are not summed as item discounts." },
  discount_rate: { definition: "Item-level discounts divided by collected revenue plus those discounts.", caveat: "Uses unit discount × quantity, not the sale-level discount repeated on each row." },
  gross_revenue: { definition: "Payments collected on successful, non-voided sale lines, by payment date.", caveat: "Cash collections and session-attributed revenue have different timing and populations." },
  net_revenue: { definition: "Successful payment value less the VAT recorded on those same payment lines.", caveat: "Uses collected payment and payment VAT; the source catalogue price is not collected net revenue." },
  fill_rate: { definition: "Attendees divided by available seats across the same sessions.", numerator: "Attendees", denominator: "Available seats" },
  avg_class_size_incl: { definition: "Total attendees divided by sessions, including empty sessions.", numerator: "Attendees", denominator: "Sessions" },
  conversion_rate: { definition: "Newcomers marked Converted divided by all newcomers in the first-visit cohort.", numerator: "Converted newcomers", denominator: "Newcomers", caveat: "Outcome is the source's latest status, not conversions occurring during this period." },
  retention_rate: { definition: "Newcomers marked Retained divided by all newcomers in the first-visit cohort.", numerator: "Retained newcomers", denominator: "Newcomers" },
  second_visit_rate: { definition: "Newcomers with at least one post-trial visit divided by newcomers.", numerator: "Returned newcomers", denominator: "Newcomers" },
  checkin_revenue: { definition: "Attributed revenue from checked-in rows only.", caveat: "Unattended and late-cancelled rows are excluded, matching session attendance revenue." },
  revenue_per_checkin: { definition: "Attributed revenue on attended rows divided by attended check-ins.", numerator: "Attended revenue", denominator: "Check-ins" },
  teaching_hours: { definition: "Recorded duration counted once per attended session, converted to hours.", caveat: "Corrupted or missing duration stays unavailable; attendee rows never multiply teaching time." },
  revenue_per_hour: { definition: "Attended revenue with valid session duration divided by distinct-session teaching hours.", caveat: "Revenue and hours use the same duration-covered population." },
  payroll_revenue: { definition: "Monthly instructor-attributed revenue reported by Payroll.", caveat: "Payroll is monthly and source amounts are rounded; it may differ slightly from Sessions." },
  deferred_revenue: { definition: "Remaining membership money, counted once per membership in the selected sale cohort.", caveat: "A current balance from the source snapshot; not a historical balance at the selected period end." },
  lost_revenue: { definition: "Unoccupied seats valued at the current average revenue per attendee.", caveat: "A scenario estimate; it assumes every available seat earns the observed yield. It is not measured lost sales or a forecast." },
  draw_premium_pp: { definition: "Attendance fill rate minus the capacity-weighted fill rate of comparable location, format, weekday and time slots.", caveat: "The slot baseline includes all instructors even when an instructor filter is selected. The overall portfolio premium is expected to be zero." },
  pipeline_value: { definition: "Open leads multiplied by the observed win rate and average paid first purchase of converted newcomers in the same global scope.", caveat: "An estimate, not contracted sales. Newcomer data loads with Enquiries so results do not depend on tab visit order." },
  active_base: { definition: "Distinct members whose latest lifecycle status is Active, across all first-visit dates.", caveat: "Current snapshot measure; period comparisons and historical trend are unavailable." },
  dormant_actives: { definition: "Currently active access with more than 21 days since the last visit, across all expiry dates.", caveat: "Current snapshot measure. Date filters and historical comparisons are excluded." },
  revenue_at_risk_30d: { definition: "Purchase value of memberships expiring from today through the next 30 days, across all purchase dates.", caveat: "Uses upcoming expiry dates relative to today; date filters and historical comparisons are excluded." },
  active_memberships: { definition: "Active memberships with access already started and not expired, across all expiry dates.", caveat: "Current source status and access dates. Date filters are excluded; not a historical active-member count." },
};
const formulas: Record<string, [string, string]> = {
  fill_rate: ["SUM(checked_in)", "SUM(capacity)"],
  avg_class_size_incl: ["SUM(checked_in)", "SUM(sessions)"],
  conversion_rate: ["COUNT(*) FILTER (WHERE is_new AND conversion='Converted')", "COUNT(*) FILTER (WHERE is_new)"],
  retention_rate: ["COUNT(*) FILTER (WHERE is_new AND retention='Retained')", "COUNT(*) FILTER (WHERE is_new)"],
  second_visit_rate: ["COUNT(*) FILTER (WHERE is_new AND visits_post>0)", "COUNT(*) FILTER (WHERE is_new)"],
  revenue_per_checkin: ["SUM(revenue) FILTER (WHERE attended)", "COUNT(*) FILTER (WHERE attended)"],
};
export function evidenceSQL(id: string) {
  const pair = formulas[id];
  return pair ? `, ${pair[0]} AS "${id}__numerator", ${pair[1]} AS "${id}__denominator"` : "";
}
