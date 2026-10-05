import { query, quote, health, type Row } from "./duckdb";
import { metricSQL, type QueryContext } from "../semantics/metrics";
import { blueprints } from "./blueprints";
import { useStore, type Filters } from "../state/store";
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const context = (): QueryContext => ({
  rate: useStore.getState().rate,
  today: today(),
});
const allowed = [
  "location",
  "trainer",
  "format",
  "source",
  "category",
  "day",
  "time",
  "member",
  "month",
  "status",
  "product",
  "associate",
];
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
      `${source === "lapsed" ? "end_date" : "date"}>=${quote(filters.from)}`,
    );
  if (filters.to)
    terms.push(
      `${source === "lapsed" ? "end_date" : "date"}<=${quote(filters.to)}`,
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
    if (filters[field].length)
      terms.push(`"${field}" IN (${filters[field].map(quote).join(",")})`);
  if (filters.sessionType && filters.sessionType !== "all")
    terms.push(`session_type=${quote(filters.sessionType)}`);
  if (filters.capacityBand && filters.capacityBand !== "all")
    terms.push(
      filters.capacityBand === "small"
        ? "capacity<=10"
        : filters.capacityBand === "medium"
          ? "capacity>10 AND capacity<=20"
          : "capacity>20",
    );
  if (filters.memberType !== "all")
    terms.push(`is_new=${filters.memberType === "new" ? "TRUE" : "FALSE"}`);
  if (!filters.imports && ["bookings", "new", "sales"].includes(source))
    terms.push("NOT imported");
  if (source === "sales")
    terms.push(
      "NOT COALESCE(voided,FALSE) AND (status='succeeded' OR status IS NULL)",
    );
  for (const t of transient)
    if (allowed.includes(t.field)) terms.push(`"${t.field}"=${quote(t.value)}`);
  return terms.length ? " WHERE " + terms.join(" AND ") : "";
}
export function comparison(f: Filters, mode: string): Filters {
  if (mode === "none" || !f.from || !f.to) return { ...f };
  const start = new Date(f.from + "T00:00:00Z"),
    end = new Date(f.to + "T00:00:00Z");
  if (mode === "year") {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    end.setUTCFullYear(end.getUTCFullYear() - 1);
  } else {
    const length = end.getTime() - start.getTime() + 86400000;
    start.setTime(start.getTime() - length);
    end.setTime(end.getTime() - length);
  }
  return {
    ...f,
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}
export interface Analysis {
  total: Row;
  previous: Row;
  trend: Row[];
  groups: Row[];
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
  return `(SELECT *, SUM(checked_in) OVER(PARTITION BY location,format,day,time)/NULLIF(SUM(capacity) OVER(PARTITION BY location,format,day,time),0) AS slot_fill FROM sessions${where(f, "sessions", transient)})`;
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
      tab !== 0 ||
      !["new_clients", "conversion_rate", "active_base"].includes(x),
  );
  const w = where(filters, b.source);
  const prev = comparison(filters, compare);
  const aggregate = metricSQL(ids, context());
  const parts = groups.filter((g) => allowed.includes(g));
  const groupExpressions = parts.map((g) => `COALESCE("${g}",'Unspecified')`);
  const facts = (f: Filters) =>
    b.source === "sessions"
      ? sessionFacts(f)
      : `"${b.source}"${where(f, b.source)}`;
  const sample = b.source === "payroll" ? "SUM(sessions)" : "COUNT(*)";
  const end = new Date(today() + "T00:00:00Z");
  end.setUTCDate(0);
  const wide = { ...filters, from: "", to: end.toISOString().slice(0, 10) };
  const [total, previous, groupRows, trend, heat, raw] = await Promise.all([
    query(
      `SELECT ${aggregate},${sample} AS n,COUNT(*) AS records_n FROM ${facts(filters)}`,
    ),
    query(`SELECT ${aggregate}, ${sample} AS n FROM ${facts(prev)}`),
    query(
      `SELECT ${groupExpressions.map((g, i) => `${g} AS g${i}`).join(",")}, ${aggregate}, ${sample} AS n, GROUPING_ID(${groupExpressions.join(",")}) AS level FROM ${facts(filters)} GROUP BY ROLLUP(${groupExpressions.join(",")}) HAVING GROUPING_ID(${groupExpressions.join(",")}) < ${2 ** parts.length - 1} ORDER BY level DESC,g0 LIMIT 50000`,
    ),
    query(
      `SELECT ${b.source === "lapsed" ? "SUBSTR(end_date,1,7)" : "month"} AS month, ${aggregate},${sample} AS n FROM ${facts(wide)} ${b.source === "sessions" || !where(wide, b.source) ? "WHERE" : "AND"} month IS NOT NULL GROUP BY ${b.source === "lapsed" ? "SUBSTR(end_date,1,7)" : "month"} ORDER BY month DESC LIMIT 14`,
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
        `SELECT ${metricSQL(growthIds, context())} FROM new${where(filters, "new")}`,
      ),
      query(
        `SELECT ${metricSQL(growthIds, context())} FROM new${where(prev, "new")}`,
      ),
      query(
        `SELECT month,${metricSQL(growthIds, context())} FROM new${where(wide, "new")} GROUP BY month`,
      ),
      query(
        `SELECT ${metricSQL(["active_base"], context())} FROM new${where({ ...filters, from: "", to: "" }, "new")}`,
      ),
    ]);
    Object.assign(total[0], g[0], active[0]);
    Object.assign(previous[0], p[0], { active_base: null });
    trend.forEach((t) =>
      Object.assign(t, monthly.find((g) => g.month === t.month) || {}),
    );
  }
  return {
    total: total[0],
    previous: previous[0],
    trend,
    groups: groupRows,
    heat,
    raw,
    count: Number(total[0].records_n),
    elapsed: performance.now() - start,
  };
}
export async function options() {
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
    const result = await query(
      `SELECT "${field}" AS value,COUNT(*) AS n FROM (SELECT "${field}" FROM sessions UNION ALL SELECT "${field}" FROM new UNION ALL SELECT "${field}" FROM sales UNION ALL SELECT "${field}" FROM leads) WHERE "${field}" IS NOT NULL GROUP BY "${field}" ORDER BY n DESC LIMIT 100`,
    );
    all[field] = Object.fromEntries(
      result.map((r) => [String(r.value), Number(r.n)]),
    );
  }
  return all;
}
export const availableRows = () =>
  Object.values(health).reduce((s, h) => s + h.recordsCount, 0);
