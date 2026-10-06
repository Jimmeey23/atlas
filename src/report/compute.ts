import { query, fieldPresence, quote, type Row } from "../data/duckdb";
import { metricSQL, metrics } from "../semantics/metrics";
import { currentSnapshotMetrics } from "../semantics/evidence";
import { context, metricFacts, where } from "../data/analytics";
import { emptyFilters, type Filters } from "../state/store";
import { chapters, type ChapterSpec, type GroupSpec } from "./chapters";
import type { ChapterData, GroupTable, ReportModel, ReportScope } from "./model";
import { HISTORY_MONTHS, figuresHash, monthBounds, shiftMonth } from "./period";
export { HISTORY_MONTHS, figuresHash, monthBounds, monthLabel, shiftMonth } from "./period";

/** A group row below this many contributing records is dropped from ranked tables. */
const MIN_GROUP_RECORDS = 3;

/** The report scopes itself: one studio, one month, every other filter cleared. */
export function scopeFilters(scope: ReportScope, month = scope.month): Filters {
  return { ...emptyFilters, ...monthBounds(month), location: [scope.studio] };
}

/** A metric the registry does not define is dropped rather than queried into an error. */
const usableMetrics = (ids: string[]) => ids.filter((id) => metrics[id]);
const carries = (source: string, field: string) =>
  !fieldPresence[source] || fieldPresence[source].has(field);
/** Memberships are dated by expiry, so their month comes from end_date. */
const monthColumn = (source: string) =>
  source === "lapsed" ? "SUBSTR(end_date,1,7)" : "month";

async function totalsFor(spec: ChapterSpec, filters: Filters, ids: string[]) {
  if (!ids.length) return [{} as Row];
  const facts = metricFacts(filters, spec.source, []);
  return query(`SELECT ${metricSQL(ids, context(filters, []))},COUNT(*) AS n FROM ${facts}`);
}

async function groupTable(
  spec: ChapterSpec,
  group: GroupSpec,
  filters: Filters,
): Promise<GroupTable | null> {
  if (!carries(spec.source, group.field)) return null;
  // A snapshot metric describes today across all dates; inside a month-scoped
  // breakdown it would print a figure that belongs to no row in the table.
  const columns = usableMetrics(group.columns).filter((id) => !currentSnapshotMetrics.has(id));
  if (!columns.length) return null;
  const facts = metricFacts(filters, spec.source, []);
  const rows = await query(
    `WITH f AS (SELECT *,COALESCE("${group.field}",'Unspecified') AS "__g" FROM ${facts})` +
      ` SELECT "__g" AS g,GROUPING("__g") AS is_total,${metricSQL(columns, context(filters, []))},COUNT(*) AS n` +
      ` FROM f GROUP BY GROUPING SETS (("__g"),())`,
  );
  const total = rows.find((r) => Number(r.is_total) === 1) ?? null;
  const lead = columns[0];
  const body = rows
    .filter((r) => Number(r.is_total) !== 1 && Number(r.n) >= MIN_GROUP_RECORDS)
    .sort((a, b) => Number(b[lead] ?? 0) - Number(a[lead] ?? 0))
    .slice(0, group.limit ?? 20);
  if (!body.length) return null;
  return { field: group.field, title: group.title, deck: group.deck, columns, rows: body, total };
}

async function historyFor(spec: ChapterSpec, scope: ReportScope, ids: string[]) {
  const historical = ids.filter((id) => !currentSnapshotMetrics.has(id));
  if (!historical.length) return [] as Row[];
  const start = shiftMonth(scope.month, -(HISTORY_MONTHS - 1));
  const filters: Filters = {
    ...scopeFilters(scope),
    from: monthBounds(start).from,
    to: monthBounds(scope.month).to,
  };
  const facts = metricFacts(filters, spec.source, []);
  const month = monthColumn(spec.source);
  const scoped = where(filters, spec.source, []);
  const conjunction =
    ["sessions", "sales", "checkins"].includes(spec.source) || !scoped ? "WHERE" : "AND";
  return query(
    `SELECT ${month} AS month,${metricSQL(historical, context(filters, []))},COUNT(*) AS n` +
      ` FROM ${facts} ${conjunction} ${month} IS NOT NULL AND ${month}>=${quote(start)}` +
      ` GROUP BY ${month} ORDER BY month`,
  );
}

async function computeChapter(spec: ChapterSpec, scope: ReportScope): Promise<ChapterData> {
  const ids = usableMetrics(spec.metrics);
  const current = scopeFilters(scope);
  // Snapshot metrics describe today across every date, so they are read with
  // the period cleared and never compared: asking for their prior value would
  // print a number that was never true.
  const comparable = ids.filter((id) => !currentSnapshotMetrics.has(id));
  const snapshot = ids.filter((id) => currentSnapshotMetrics.has(id));
  const [total, snapshotTotal, prior, priorYear, history, ...groups] = await Promise.all([
    totalsFor(spec, current, comparable),
    totalsFor(spec, { ...current, from: "", to: "" }, snapshot),
    totalsFor(spec, scopeFilters(scope, shiftMonth(scope.month, -1)), comparable),
    totalsFor(spec, scopeFilters(scope, shiftMonth(scope.month, -12)), comparable),
    historyFor(spec, scope, [...new Set([...spec.history, ...ids])]),
    ...spec.groups.map((group) => groupTable(spec, group, current)),
  ]);
  return {
    id: spec.id,
    total: { ...(total[0] ?? {}), ...(snapshotTotal[0] ?? {}) },
    prior: prior[0] ?? {},
    priorYear: priorYear[0] ?? {},
    n: Number(total[0]?.n ?? 0),
    groups: (groups as (GroupTable | null)[]).filter((g): g is GroupTable => !!g),
    history,
  };
}

/**
 * Build every chapter's figures for one studio-month. Narratives are added
 * afterwards by `narrative.ts`, so a report renders in full even when no
 * model answers.
 */
export async function computeReport(
  scope: ReportScope,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<ReportModel> {
  const queryable = chapters.filter((c) => !c.derived);
  const data: Record<string, ChapterData> = {};
  let done = 0;
  for (const spec of queryable) {
    onProgress?.(done, queryable.length, spec.title);
    data[spec.id] = await computeChapter(spec, scope);
    done++;
  }
  onProgress?.(done, queryable.length, "Figures complete");
  return {
    scope,
    builtAt: new Date().toISOString(),
    chapters: data,
    narratives: {},
    figuresHash: figuresHash(data),
  };
}
