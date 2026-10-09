import { compileFilters } from "./advanced-controls";
import { sqlTypes } from "./normalise";
import { newSheetFields } from "./new-fields";
import { query, quote, health, fieldPresence, type Row } from "./duckdb";
import { metricSQL, type QueryContext } from "../semantics/metrics";
import { currentSnapshotMetrics } from "../semantics/evidence";
import { comparisonDates, historicalFilters, historicalTransient } from "./periods";
import { blueprints } from "./blueprints";
import { useStore, type Filters } from "../state/store";
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const context = (filters = useStore.getState().filters, transient = useStore.getState().transient): QueryContext => ({
  rate: useStore.getState().rate,
  today: today(),
  newWhere: where(filters, "new", transient),
});
const allowed = [
  "location",
  "trainer",
  "format",
  "format_group",
  "source",
  "category",
  "day",
  "time",
  "member",
  "month",
  "status",
  "product",
  "associate",
  "capacity",
  "payment_method",
  ...newSheetFields.map(([, field]) => field),
];
// Filters are global while each tab reads a different table. A field the table
// does not carry is present but all-NULL, so filtering on it would silently
// empty the tab. Only constrain fields the table actually has.
const carries = (source: string, field: string) =>
  !fieldPresence[source] || fieldPresence[source].has(field);
export function where(
  filters: Filters,
  source: string,
  transient = useStore.getState().transient,
) {
  const terms: string[] = [];
  if (source === "bookings" && useStore.getState().tab === 12)
    terms.push("late_cancelled>0");
  if (filters.from)
    terms.push(
      `${source === "payroll" ? "month" : source === "lapsed" ? "end_date" : "date"}>=${quote(source === "payroll" ? filters.from.slice(0, 7) : filters.from)}`,
    );
  if (filters.to)
    terms.push(
      `${source === "payroll" ? "month" : source === "lapsed" ? "end_date" : "date"}<=${quote(source === "payroll" ? filters.to.slice(0, 7) : filters.to)}`,
    );
  for (const field of [
    "location",
    "trainer",
    "format",
    "source",
    "category",
    "day",
    "time",
  ] as const)
    if (filters[field].length && carries(source, field))
      terms.push(`"${field}" IN (${filters[field].map(quote).join(",")})`);
  if (filters.sessionType && filters.sessionType !== "all")
    terms.push(`session_type=${quote(filters.sessionType)}`);
  if (filters.capacityBand && filters.capacityBand !== "all" && carries(source, "capacity"))
    terms.push(
      filters.capacityBand === "small"
        ? "capacity<=10"
        : filters.capacityBand === "medium"
          ? "capacity>10 AND capacity<=20"
          : "capacity>20",
    );
  if (filters.memberType !== "all" && carries(source, "is_new"))
    terms.push(`is_new=${filters.memberType === "new" ? "TRUE" : "FALSE"}`);
  if (!filters.imports && ["bookings", "new", "sales"].includes(source))
    terms.push("NOT imported");
  if (source === "sales")
    terms.push(
      "NOT COALESCE(voided,FALSE) AND (status='succeeded' OR status IS NULL)",
    );
  for (const t of transient)
    if (allowed.includes(t.field) && carries(source, t.field))
      terms.push(`"${t.field}"=${quote(t.value)}`);
  const advanced = compileFilters(filters.advanced, sqlTypes);
  if (advanced) terms.push(advanced);
  return terms.length ? " WHERE " + terms.join(" AND ") : "";
}
export function comparison(f: Filters, mode: string): Filters {
  return { ...f, ...comparisonDates(f.from, f.to, mode) };
}
export interface Analysis {
  total: Row;
  previous: Row;
  trend: Row[];
  groups: Row[];
  /** The same grouping over the comparison period, for per-cell deltas. */
  previousGroups: Row[];
  heat: Row[];
  raw: Row[];
  count: number;
  elapsed: number;
}
const analysisCache = new Map<string, Promise<Analysis>>();
export function clearAnalyses() {
  analysisCache.clear();
}
export function sessionFacts(
  f: Filters,
  transient = useStore.getState().transient,
) {
  const baseline = where({ ...f, trainer: [] }, "sessions", transient.filter((item) => item.field !== "trainer"));
  return `(SELECT * FROM (SELECT *, SUM(checked_in) OVER(PARTITION BY location,format,day,time)/NULLIF(SUM(capacity) OVER(PARTITION BY location,format,day,time),0) AS slot_fill FROM sessions${baseline})${where(f, "sessions", transient)})`;
}
export function metricFacts(f: Filters, source: string, transient = useStore.getState().transient, overrideWhere?: string) {
  const scoped = overrideWhere ?? where(f, source, transient);
  if (source === "sessions") return sessionFacts(f, transient);
  if (source === "sales") return `(SELECT *, ROW_NUMBER() OVER(PARTITION BY COALESCE(membership_id, 'row:' || source_row::VARCHAR) ORDER BY date DESC, source_row DESC) AS membership_balance_rank FROM sales${scoped})`;
  if (source === "checkins") return `(SELECT *, CASE WHEN attended AND duration>0 AND session_id IS NOT NULL THEN ROW_NUMBER() OVER(PARTITION BY session_id, attended, duration>0 ORDER BY source_row) END AS teaching_session_rank FROM checkins${scoped})`;
  return `"${source}"${scoped}`;
}
export function monthlyHistorySQL(tab: number, ids: string[], filters: Filters, transient = useStore.getState().transient) {
  const source = blueprints[tab].source;
  const history = historicalFilters(filters, today());
  const cross = historicalTransient(transient);
  const historicalIds = ids.filter(id => !currentSnapshotMetrics.has(id));
  const aggregates = [
    ...(historicalIds.length ? [metricSQL(historicalIds, context(history, cross))] : []),
    ...ids.filter(id => currentSnapshotMetrics.has(id)).map(id => `NULL AS "${id}"`),
  ].join(",");
  const month = source === "lapsed" ? "SUBSTR(end_date,1,7)" : "month";
  const facts = metricFacts(history, source, cross);
  const conjunction = ["sessions", "sales", "checkins"].includes(source) || !where(history, source, cross) ? "WHERE" : "AND";
  return `SELECT ${month} AS month,${aggregates},COUNT(*) AS n FROM ${facts} ${conjunction} ${month} IS NOT NULL GROUP BY ${month} ORDER BY month`;
}
export function analyse(
  tab: number,
  groups: string[],
  columns: string[],
): Promise<Analysis> {
  const state = useStore.getState();
  const key = JSON.stringify([
    tab,
    groups,
    columns,
    state.filters,
    state.transient,
    state.compare,
    state.rate,
  ]);
  if (analysisCache.has(key)) return analysisCache.get(key)!;
  const work = performAnalysis(tab, groups, columns);
  if (analysisCache.size > 40)
    analysisCache.delete(analysisCache.keys().next().value!);
  analysisCache.set(key, work);
  work.catch(() => analysisCache.delete(key));
  return work;
}
async function performAnalysis(
  tab: number,
  groups: string[],
  columns: string[],
): Promise<Analysis> {
  const start = performance.now();
  const b = blueprints[tab];
  const { filters, compare } = useStore.getState();
  const ids = [...new Set([...b.kpis, ...b.columns, ...columns])].filter(
    (x) =>
      (tab !== 9 || !["complimentary_visits", "session_complimentary_rate"].includes(x)) && (tab !== 0 ||
      !["new_clients", "conversion_rate", "active_base", "lapsed_members", "gross_revenue", "net_revenue"].includes(x)),
  );
  const w = where(filters, b.source);
  const prev = comparison(filters, compare === "none" ? "prior" : compare);
  const aggregate = metricSQL(ids, context(filters));
  const parts = groups.filter((g) => allowed.includes(g));
  const groupExpressions = parts.map((g) => `COALESCE("${g}",'Unspecified')`);
  const facts = (f: Filters) => metricFacts(f, b.source);
  const sample = b.source === "payroll" ? "SUM(sessions)" : "COUNT(*)";
  const end = new Date(today() + "T00:00:00Z");
  end.setUTCDate(0);
  const wide = { ...filters, from: "", to: end.toISOString().slice(0, 10) };
  const rollup = (f: Filters, ctx = context(f)) =>
    `SELECT ${groupExpressions.map((g, i) => `${g} AS g${i}`).join(",")}, ${metricSQL(ids, ctx)}, ${sample} AS n, GROUPING_ID(${groupExpressions.join(",")}) AS level FROM ${facts(f)} GROUP BY ROLLUP(${groupExpressions.join(",")}) HAVING GROUPING_ID(${groupExpressions.join(",")}) < ${2 ** parts.length - 1} ORDER BY level DESC,g0 LIMIT 50000`;
  const [total, previous, groupRows, previousGroups, trend, heat, raw] = await Promise.all([
    query(
      `SELECT ${aggregate},${sample} AS n,COUNT(*) AS records_n FROM ${facts(filters)}`,
    ),
    query(`SELECT ${metricSQL(ids, context(prev))}, ${sample} AS n FROM ${facts(prev)}`),
    query(rollup(filters, context(filters))),
    // Skipped entirely when nothing is being compared against.
    compare === "none" ? Promise.resolve([] as Row[]) : query(rollup(prev)),
    query(
      `SELECT ${b.source === "lapsed" ? "SUBSTR(end_date,1,7)" : "month"} AS month, ${metricSQL(ids, context(wide))},${sample} AS n FROM ${facts(wide)} ${["sessions", "sales", "checkins"].includes(b.source) || !where(wide, b.source) ? "WHERE" : "AND"} month IS NOT NULL GROUP BY ${b.source === "lapsed" ? "SUBSTR(end_date,1,7)" : "month"} ORDER BY month DESC LIMIT 14`,
    ).then((r) => [...r].reverse()),
    query(
      `SELECT day,time,${aggregate},${sample} AS n FROM ${facts(filters)} GROUP BY day,time`,
    ),
    query(`SELECT * FROM "${b.source}"${w} ORDER BY date DESC LIMIT 250`),
  ]);
  if (tab === 0) {
    const growthIds = ["new_clients", "conversion_rate"];
    const [g, p, monthly, active] = await Promise.all([
      query(
        `SELECT ${metricSQL(growthIds, context())},COUNT(*) AS growth_records FROM new${where(filters, "new")}`,
      ),
      query(
        `SELECT ${metricSQL(growthIds, context())} FROM new${where(prev, "new")}`,
      ),
      query(
        `SELECT month,${metricSQL(growthIds, context())} FROM new${where(wide, "new")} GROUP BY month`,
      ),
      query(
        `SELECT ${metricSQL(["active_base"], context())},COUNT(*) AS active_records FROM new${where({ ...filters, from: "", to: "" }, "new")}`,
      ),
    ]);
    const cashIds = ["gross_revenue", "net_revenue"];
    const [cash, priorCash, monthlyCash] = await Promise.all([
      query(`SELECT ${metricSQL(cashIds, context(filters))},COUNT(*) AS sales_records FROM sales${where(filters, "sales")}`),
      query(`SELECT ${metricSQL(cashIds, context(prev))} FROM sales${where(prev, "sales")}`),
      query(`SELECT month,${metricSQL(cashIds, context(wide))} FROM sales${where(wide, "sales")} GROUP BY month`),
    ]);
    Object.assign(total[0], cash[0]);
    Object.assign(previous[0], priorCash[0]);
    for (const cashMonth of monthlyCash) {
      let row = trend.find(t => t.month === cashMonth.month);
      if (!row) { row = {month:cashMonth.month}; trend.push(row); }
      Object.assign(row,cashMonth);
    }
    trend.sort((a,b) => String(a.month).localeCompare(String(b.month)));
    if (trend.length > 14) trend.splice(0,trend.length - 14);
    // Lapsed is its own sheet: memberships that recorded a churn date, scoped
    // by the expiry window the other lapsed metrics use.
    const [lapsedNow, lapsedPrior, lapsedMonthly] = await Promise.all([
      query(`SELECT ${metricSQL(["lapsed_members"], context(filters))},COUNT(*) AS lapsed_records FROM lapsed${where(filters, "lapsed")}`),
      query(`SELECT ${metricSQL(["lapsed_members"], context(prev))} FROM lapsed${where(prev, "lapsed")}`),
      query(`SELECT SUBSTR(end_date,1,7) AS month,${metricSQL(["lapsed_members"], context(wide))} FROM lapsed${where(wide, "lapsed")} ${where(wide, "lapsed") ? "AND" : "WHERE"} end_date IS NOT NULL GROUP BY SUBSTR(end_date,1,7)`),
    ]);
    Object.assign(total[0], g[0], active[0], lapsedNow[0]);
    Object.assign(previous[0], p[0], lapsedPrior[0], { active_base: null });
    trend.forEach((row) =>
      Object.assign(row, lapsedMonthly.find((m) => m.month === row.month) || {}),
    );
    trend.forEach((t) =>
      Object.assign(t, monthly.find((g) => g.month === t.month) || {}),
    );
  }
  if (tab === 9) {
    const sessionIds = ["complimentary_visits", "session_complimentary_rate"];
    const [now, prior, monthly] = await Promise.all([
      query(`SELECT ${metricSQL(sessionIds, context(filters))},COUNT(*) AS complimentary_source_records FROM sessions${where(filters,"sessions")}`),
      query(`SELECT ${metricSQL(sessionIds, context(prev))} FROM sessions${where(prev,"sessions")}`),
      query(`SELECT month,${metricSQL(sessionIds, context(wide))} FROM sessions${where(wide,"sessions")} GROUP BY month`),
    ]);
    Object.assign(total[0],now[0]);Object.assign(previous[0],prior[0]);
    trend.forEach(row=>Object.assign(row,monthly.find(m=>m.month===row.month)||{}));
  }
  if (tab === 5 && ids.includes("new_late_cancels")) {
    // Late cancellations come from the Bookings sheet: every late-cancelled booking
    // made by the newcomers in scope (matched on member ID), whenever it happened.
    const lateCancels = (f: Filters) => `SELECT COUNT(*) FILTER (WHERE late_cancelled>0) AS new_late_cancels FROM bookings WHERE member_id IN (SELECT member_id FROM new${where(f, "new")}${where(f, "new") ? " AND" : " WHERE"} is_new AND member_id IS NOT NULL)`;
    const [now, prior, monthly] = await Promise.all([
      query(lateCancels(filters)),
      query(lateCancels(prev)),
      query(`SELECT n.month, COUNT(*) FILTER (WHERE b.late_cancelled>0) AS new_late_cancels FROM (SELECT DISTINCT member_id, month FROM new${where(wide, "new")}${where(wide, "new") ? " AND" : " WHERE"} is_new AND member_id IS NOT NULL) n JOIN bookings b USING (member_id) GROUP BY n.month`),
    ]);
    Object.assign(total[0], now[0]);
    Object.assign(previous[0], prior[0]);
    trend.forEach((row) => { row.new_late_cancels = monthly.find((m) => m.month === row.month)?.new_late_cancels ?? null; });
  }
  if (tab === 6) {
    const currentIds = b.kpis.filter((id) => currentSnapshotMetrics.has(id));
    const currentFilters = { ...filters, from: "", to: "" };
    const current = await query(`SELECT ${metricSQL(currentIds, context(currentFilters))},COUNT(*) AS current_records FROM lapsed${where(currentFilters, "lapsed")}`);
    Object.assign(total[0], current[0]);
    currentIds.forEach((id) => { previous[0][id] = null; trend.forEach((row) => delete row[id]); });
    // Access dates let us rebuild running memberships and upcoming expiry value as of
    // each month end. Status history is not recorded, so history uses dates alone; the
    // latest point is the status-aware current value so the line ends on the card.
    const months = trend.map((row) => String(row.month)).filter((m) => /^\d{4}-\d{2}$/.test(m));
    if (months.length) {
      const asOf = `LEAST(LAST_DAY(CAST(m.month || '-01' AS DATE)), DATE '${context().today}')`;
      const history = await query(`SELECT m.month,
        COUNT(*) FILTER (WHERE status NOT IN ('Not Activated','Frozen') AND TRY_CAST(start_date AS DATE)<=${asOf} AND (end_date IS NULL OR TRY_CAST(end_date AS DATE)>=${asOf})) AS active_memberships,
        SUM(amount_paid) FILTER (WHERE status<>'Not Activated' AND TRY_CAST(end_date AS DATE) BETWEEN ${asOf} AND ${asOf}+INTERVAL 30 DAY) AS revenue_at_risk_30d
        FROM (VALUES ${months.map((m) => `(${quote(m)})`).join(",")}) AS m(month) CROSS JOIN (SELECT * FROM lapsed${where(currentFilters, "lapsed")}) l
        GROUP BY m.month`);
      for (const row of trend) {
        const h = history.find((x) => x.month === row.month);
        if (h) for (const id of ["active_memberships", "revenue_at_risk_30d"]) if (currentIds.includes(id)) row[id] = h[id];
      }
      const last = trend.at(-1);
      if (last) for (const id of ["active_memberships", "revenue_at_risk_30d"]) if (currentIds.includes(id)) last[id] = total[0][id];
    }
  }
  return {
    total: total[0],
    previous: previous[0],
    trend,
    groups: groupRows,
    previousGroups,
    heat,
    raw,
    count: Number(total[0].records_n),
    elapsed: performance.now() - start,
  };
}
export async function options(tab = useStore.getState().tab) {
  const all: Record<string, Record<string, number>> = {};
  for (const field of [
    "location",
    "trainer",
    "format",
    "source",
    "category",
    "day",
    "time",
  ]) {
    // Offer every value any table knows about, so a choice made on one tab does
    // not vanish on the next, but rank by how common it is on the current tab.
    const sourceTables = ["sessions", "new", "sales", "leads", "lapsed", "checkins", "bookings", "payroll", "recurring", "teacher_recurring"];
    const current = blueprints[tab].source;
    const result = await query(
      `SELECT "${field}" AS value,SUM(CASE WHEN "__table"=${quote(current)} THEN 1 ELSE 0 END) AS n FROM (${sourceTables.map((table) => `SELECT "${field}",${quote(table)} AS "__table" FROM "${table}"`).join(" UNION ALL ")}) WHERE "${field}" IS NOT NULL GROUP BY "${field}" ORDER BY n DESC,value LIMIT 200`,
    );
    all[field] = Object.fromEntries(
      result.map((r) => [String(r.value), Number(r.n)]),
    );
  }
  return all;
}
export const availableRows = () =>
  Object.values(health).reduce((s, h) => s + h.recordsCount, 0);
