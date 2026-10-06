import { metricSQL } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { context, where } from "../data/analytics";
import type { Filters } from "../state/store";
import type { Row } from "../data/duckdb";
import { thresholds } from "./thresholds";
export interface Insight {
  rule: string;
  tab: number;
  severity: "critical" | "attention" | "opportunity" | "context";
  entity: string;
  title: string;
  template: string;
  impactINR: number;
  linkFilters: { field: string; value: string }[];
  n: number;
}
export interface Rule {
  id: string;
  tab: number;
  sql: (f: Filters) => string;
  test: (r: Row) => boolean;
  build: (r: Row) => Omit<Insight, "rule" | "tab">;
}
const r = (
  severity: Insight["severity"],
  entity: string,
  title: string,
  template: string,
  impact: number,
  n: number,
  field: string,
): Omit<Insight, "rule" | "tab"> => ({
  severity,
  entity,
  title,
  template,
  impactINR: impact,
  n,
  linkFilters: [{ field, value: entity }],
});
export const rules: Rule[] = [
  {
    id: "data-integrity",
    tab: 11,
    sql: (f) =>
      `SELECT 'Matched session attendance' AS entity,SUM(checked_in) AS primary_count,(SELECT COUNT(*) FROM checkins WHERE attended AND session_id IN (SELECT session_id FROM sessions${where(f, "sessions", [])})) AS checkin_count,${metricSQL(["rev_pac"], context())},COUNT(*) AS n FROM sessions${where(f, "sessions", [])}`,
    test: (x) =>
      Number(x.primary_count) > 0 &&
      Math.abs(Number(x.primary_count) - Number(x.checkin_count)) /
        Number(x.primary_count) >
        thresholds().reconciliation,
    build: (x) => ({
      ...r(
        "critical",
        String(x.entity),
        "Attendance needs reconciliation",
        `Sessions and their matched Checkins differ by ${Math.round((Math.abs(Number(x.primary_count) - Number(x.checkin_count)) / Number(x.primary_count)) * 100)}%. Verify attendance coverage before changing capacity.`,
        Math.abs(Number(x.primary_count) - Number(x.checkin_count)) *
          Number(x.rev_pac || 0),
        Number(x.n),
        "location",
      ),
      linkFilters: [],
    }),
  },

  {
    id: "dead-slot",
    tab: 2,
    sql: (f) =>
      `SELECT CONCAT(day,' ',time) AS entity,location,${metricSQL(["sessions", "fill_rate", "lost_revenue"], context())},COUNT(*) AS n FROM sessions${where(f, "sessions", [])} GROUP BY day,time,location`,
    test: (x) =>
      Number(x.n) >= thresholds().deadSample &&
      x.fill_rate != null &&
      Number(x.fill_rate) < thresholds().deadFill,
    build: (x) => ({
      ...r(
        "attention",
        String(x.entity),
        "Reconsider this slot",
        `${x.entity} at ${x.location} has ${fmt("fill_rate", x.fill_rate)} fill across ${x.n} sessions. ${fmt("lost_revenue", x.lost_revenue)} of capacity is unfilled at current yield. Review moving or removing the session.`,
        Number(x.lost_revenue || 0),
        Number(x.n),
        "time",
      ),
      linkFilters: [
        { field: "location", value: String(x.location) },
        { field: "day", value: String(x.entity).split(" ")[0] },
        { field: "time", value: String(x.entity).split(" ")[1] },
      ],
    }),
  },
  {
    id: "waitlist-pressure",
    tab: 1,
    sql: (f) =>
      `SELECT format AS entity,${metricSQL(["overbooked_sessions", "revenue"], context())},COUNT(*) AS n FROM sessions${where(f, "sessions", [])} GROUP BY format`,
    test: (x) => Number(x.overbooked_sessions) >= 3,
    build: (x) =>
      r(
        "opportunity",
        String(x.entity),
        "Demand exceeds the room",
        `${x.entity} was overbooked ${x.overbooked_sessions} times in ${x.n} sessions. Review an additional session against instructor availability.`,
        Number(x.revenue || 0),
        Number(x.n),
        "format",
      ),
  },
  {
    id: "trainer-dependency",
    tab: 2,
    sql: (f) =>
      `SELECT CONCAT(day,' ',time) AS entity, location,MAX(teacher_dependency) AS dependency,MAX(trainer_depth) AS depth,SUM(revenue) AS value,COUNT(*) AS n FROM recurring${where({ ...f, from: "", to: "" }, "recurring", [])} GROUP BY day,time,location`,
    test: (x) => Number(x.dependency) > thresholds().dependency,
    build: (x) => ({
      ...r(
        "attention",
        String(x.entity),
        "Build a second instructor",
        `${x.entity} at ${x.location} depends on one instructor for ${fmt("fill_rate", x.dependency)} of the top-five attendance. This is a lifetime rollup. Test a substitute before scaling.`,
        Number(x.value || 0),
        Number(x.n),
        "time",
      ),
      linkFilters: [
        { field: "location", value: String(x.location) },
        { field: "time", value: String(x.entity).split(" ")[1] },
      ],
    }),
  },
  {
    id: "second-visit-collapse",
    tab: 5,
    sql: (f) =>
      `SELECT source AS entity,${metricSQL(["new_clients", "second_visit_rate", "avg_first_purchase"], context())},COUNT(*) AS n FROM new${where(f, "new", [])} GROUP BY source`,
    test: (x) =>
      Number(x.new_clients) >= 3 &&
      x.second_visit_rate != null &&
      Number(x.second_visit_rate) < thresholds().secondVisit,
    build: (x) =>
      r(
        "critical",
        String(x.entity),
        "The second visit is missing",
        `Only ${fmt("second_visit_rate", x.second_visit_rate)} of ${x.new_clients} ${x.entity} newcomers returned. Contact non-returners and document their stated barrier. Purchase-equivalent opportunity is an estimate.`,
        Number(x.new_clients) *
          (1 - Number(x.second_visit_rate)) *
          Number(x.avg_first_purchase || 0),
        Number(x.n),
        "source",
      ),
  },
  {
    id: "slow-response",
    tab: 8,
    sql: (f) =>
      `SELECT associate AS entity,MEDIAN(response_hours) AS hours,${metricSQL(["leads", "pipeline_value"], context())},COUNT(*) AS n FROM leads${where(f, "leads", [])} GROUP BY associate`,
    test: (x) =>
      Number(x.n) >= 3 && Number(x.hours) > thresholds().responseHours,
    build: (x) =>
      r(
        "critical",
        String(x.entity),
        "Shorten the first response",
        `${x.entity}'s median first response is ${Number(x.hours).toFixed(1)} hours across ${x.n} enquiries. Allocate a same-day callback block and review response coverage.`,
        Number(x.pipeline_value || 0),
        Number(x.n),
        "associate",
      ),
  },
  {
    id: "untouched-leads",
    tab: 8,
    sql: (f) =>
      `SELECT associate AS entity,${metricSQL(["untouched_leads", "pipeline_value"], context())},COUNT(*) AS n FROM leads${where(f, "leads", [])} GROUP BY associate`,
    test: (x) => Number(x.untouched_leads) > 0,
    build: (x) =>
      r(
        "critical",
        String(x.entity),
        "An enquiry is waiting",
        `${x.entity} has ${x.untouched_leads} open enquiries older than 48 hours without a logged first follow-up. Call the contactable leads today. Pipeline value is modelled, not booked revenue.`,
        Number(x.pipeline_value || 0),
        Number(x.n),
        "associate",
      ),
  },
  {
    id: "dormant-actives",
    tab: 6,
    sql: (f) =>
      `SELECT location AS entity,COUNT(*) AS n,SUM(ltv) AS value FROM new${where({ ...f, from: "", to: "" }, "new", [])} AND_FIX lifecycle='Active' AND days_absent>${thresholds().dormancyDays} GROUP BY location`.replace(
        " AND_FIX ",
        where({ ...f, from: "", to: "" }, "new", []) ? " AND " : " WHERE ",
      ),
    test: (x) => Number(x.n) > 0,
    build: (x) =>
      r(
        "critical",
        String(x.entity),
        "Reconnect with quiet members",
        `${x.n} active members at ${x.entity} have not visited for over ${thresholds().dormancyDays} days. Their combined historical LTV is ${fmt("revenue", x.value)}. Prioritise a personal check-in.`,
        Number(x.value || 0),
        Number(x.n),
        "location",
      ),
  },
  {
    id: "zero-usage",
    tab: 6,
    sql: (f) =>
      `SELECT product AS entity,${metricSQL(["zero_usage_memberships", "revenue"], context())},COUNT(*) AS n FROM lapsed${where(f, "lapsed", [])} GROUP BY product`,
    test: (x) => Number(x.zero_usage_memberships) > 0,
    build: (x) =>
      r(
        "critical",
        String(x.entity),
        "Access hasn’t become a habit",
        `${x.zero_usage_memberships} ${x.entity} memberships have zero completed sessions after seven days. Confirm activation and offer to schedule a first Studio Session.`,
        Number(x.revenue || 0),
        Number(x.n),
        "product",
      ),
  },
  {
    id: "expiry-cliff",
    tab: 6,
    sql: (f) =>
      `SELECT location AS entity,${metricSQL(["revenue_at_risk_30d", "active_memberships"], context())},COUNT(*) AS n FROM lapsed${where({ ...f, from: "", to: "" }, "lapsed", [])} GROUP BY location`,
    test: (x) => Number(x.revenue_at_risk_30d) > 0,
    build: (x) =>
      r(
        "attention",
        String(x.entity),
        "Start the renewal conversation",
        `${fmt("revenue_at_risk_30d", x.revenue_at_risk_30d)} of membership purchase value at ${x.entity} reaches expiry within 30 days. Confirm member intentions before expiry.`,
        Number(x.revenue_at_risk_30d),
        Number(x.n),
        "location",
      ),
  },
  {
    id: "utilisation-risk",
    tab: 6,
    sql: (f) =>
      `SELECT product AS entity,${metricSQL(["utilisation", "revenue"], context())},COUNT(*) AS n FROM lapsed${where(f, "lapsed", [])} GROUP BY product`,
    test: (x) =>
      Number(x.n) >= 3 &&
      x.utilisation != null &&
      Number(x.utilisation) < thresholds().lowUtilisation,
    build: (x) =>
      r(
        "attention",
        String(x.entity),
        "Unused practice is accumulating",
        `${x.entity} has ${fmt("utilisation", x.utilisation)} utilisation across ${x.n} memberships. Review remaining access and invite members to book.`,
        Number(x.revenue || 0),
        Number(x.n),
        "product",
      ),
  },
  {
    id: "no-show-cluster",
    tab: 7,
    sql: (f) =>
      `SELECT format AS entity,${metricSQL(["booking_no_show_rate", "bookings", "revenue_per_booking"], context())},COUNT(*) AS n FROM bookings${where(f, "bookings", [])} GROUP BY format`,
    test: (x) =>
      Number(x.n) >= 5 && Number(x.booking_no_show_rate) > thresholds().noShow,
    build: (x) =>
      r(
        "attention",
        String(x.entity),
        "Protect these seats",
        `${x.entity} has ${fmt("booking_no_show_rate", x.booking_no_show_rate)} no-shows across ${x.n} bookings. Review reminders and cancellation guidance with the Studio Community.`,
        Number(x.bookings) *
          Number(x.booking_no_show_rate) *
          Number(x.revenue_per_booking || 0),
        Number(x.n),
        "format",
      ),
  },
  {
    id: "source-quality",
    tab: 5,
    sql: (f) =>
      `SELECT source AS entity,${metricSQL(["new_clients", "conversion_rate", "avg_ltv"], context())},COUNT(*) AS n FROM new${where(f, "new", [])} GROUP BY source`,
    test: (x) =>
      Number(x.new_clients) >= 20 &&
      x.conversion_rate != null &&
      Number(x.conversion_rate) < 0.2,
    build: (x) =>
      r(
        "attention",
        String(x.entity),
        "Volume isn’t becoming members",
        `${x.entity} brought ${x.new_clients} newcomers with ${fmt("conversion_rate", x.conversion_rate)} conversion and ${fmt("avg_ltv", x.avg_ltv)} mean LTV. Audit the entry offer before allocating more effort. CAC is unavailable without spend.`,
        Number(x.new_clients) * Number(x.avg_ltv || 0),
        Number(x.n),
        "source",
      ),
  },
  {
    id: "empty-session-cost",
    tab: 10,
    sql: (f) =>
      `SELECT trainer AS entity,${metricSQL(["empty_sessions", "empty_session_cost"], context())},COUNT(*) AS n FROM payroll${where(f, "payroll", [])} GROUP BY trainer`,
    test: (x) => Number(x.empty_sessions) >= 5,
    build: (x) =>
      r(
        "attention",
        String(x.entity),
        "Teaching time without attendance",
        `${x.entity} has ${x.empty_sessions} empty sessions at an estimated cost of ${fmt("empty_session_cost", x.empty_session_cost)}. Review weak slots using the editable instructor rate.`,
        Number(x.empty_session_cost),
        Number(x.n),
        "trainer",
      ),
  },
  {
    id: "negative-contribution",
    tab: 10,
    sql: (f) =>
      `SELECT trainer AS entity,${metricSQL(["contribution", "sessions"], context())},COUNT(*) AS n FROM payroll${where(f, "payroll", [])} GROUP BY trainer`,
    test: (x) => Number(x.sessions) >= 5 && Number(x.contribution) < 0,
    build: (x) =>
      r(
        "critical",
        String(x.entity),
        "The rate assumption exceeds yield",
        `${x.entity}'s estimated contribution is ${fmt("contribution", x.contribution)} across ${x.sessions} sessions. Validate the rate card and rebalance the schedule.`,
        Math.abs(Number(x.contribution)),
        Number(x.n),
        "trainer",
      ),
  },
  {
    id: "discount-depth",
    tab: 4,
    sql: (f) =>
      `SELECT product AS entity,${metricSQL(["discount_rate", "discount_value", "transactions"], context())},COUNT(*) AS n FROM sales${where(f, "sales", [])} GROUP BY product`,
    test: (x) => Number(x.transactions) >= 3 && Number(x.discount_rate) > 0.25,
    build: (x) =>
      r(
        "attention",
        String(x.entity),
        "Review price realisation",
        `${x.entity} gives up ${fmt("discount_rate", x.discount_rate)} of pre-discount value (${fmt("discount_value", x.discount_value)}). Review discount codes against member retention.`,
        Number(x.discount_value),
        Number(x.n),
        "product",
      ),
  },
  {
    id: "strong-yield",
    tab: 1,
    sql: (f) =>
      `SELECT format AS entity,${metricSQL(["fill_rate", "revenue", "sessions"], context())},COUNT(*) AS n FROM sessions${where(f, "sessions", [])} GROUP BY format`,
    test: (x) => Number(x.sessions) >= 8 && Number(x.fill_rate) > 0.7,
    build: (x) =>
      r(
        "opportunity",
        String(x.entity),
        "Protect a strong experience",
        `${x.entity} runs at ${fmt("fill_rate", x.fill_rate)} fill over ${x.sessions} sessions, earning ${fmt("revenue", x.revenue)}. Preserve prime-time availability and test capacity carefully.`,
        Number(x.revenue),
        Number(x.n),
        "format",
      ),
  },
];
