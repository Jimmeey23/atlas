import { query, fieldPresence, health, quote, type Row } from "../data/duckdb";
import { metricSQL } from "../semantics/metrics";
import { currentSnapshotMetrics } from "../semantics/evidence";
import { context, metricFacts, today, where } from "../data/analytics";
import { emptyFilters, type Filters } from "../state/store";
import { chapters, type ChapterSpec, type GroupSpec } from "./chapters";
import type { ChapterData, GroupTable, ReportModel, ReportScope } from "./model";
import { renewalFactsSQL, renewalMeasuresSQL } from '../data/renewals';
import { definition, reportFmt } from './definitions';
import { diagnosticFacts } from "./diagnostics";
import { analyseGroup } from "./findings";
import { evaluateRules } from "../insights/engine";
import { groupQuery, rankedRows } from './group-query';
import { HISTORY_MONTHS, figuresHash, monthBounds, shiftMonth } from "./period";
export { HISTORY_MONTHS, figuresHash, monthBounds, monthLabel, shiftMonth } from "./period";

/** The report scopes itself: one studio, one month, every other filter cleared. */
export function scopeFilters(scope: ReportScope, month = scope.month): Filters {
  return { ...emptyFilters, ...monthBounds(month), location: [scope.studio] };
}

/** A metric the registry does not define is dropped rather than queried into an error. */
const usableMetrics = (ids: string[]) => ids.filter((id) => definition(id));
const tracked = new Set(['location','trainer','format','source','category','day','time','member','month','status','product','associate']);
const carries = (source: string, field: string) => !tracked.has(field) || !fieldPresence[source] || fieldPresence[source].has(field);
const factsFor = (spec: ChapterSpec, filters: Filters) => spec.renewal
  ? `(${renewalFactsSQL(where(filters, 'lapsed', []), today())})`
  : metricFacts(filters, spec.source, []);
const measuresFor = (spec: ChapterSpec, ids: string[], filters: Filters) => spec.renewal ? renewalMeasuresSQL(ids) : metricSQL(ids, context(filters, []));
/** Memberships are dated by expiry, so their month comes from end_date. */
const monthColumn = (source: string) =>
  source === "lapsed" ? "SUBSTR(end_date,1,7)" : "month";

async function totalsFor(spec: ChapterSpec, filters: Filters, ids: string[]) {
  if (!ids.length) return [{} as Row];
  const facts = factsFor(spec, filters);
  const coverage = spec.source === "sales" ? ",COUNT(*) FILTER (WHERE sale_id IS NULL) AS missing_sale_ids,COUNT(*) FILTER (WHERE member_id IS NULL) AS missing_member_ids" : "";
  return query(`SELECT ${measuresFor(spec, ids, filters)},COUNT(*) AS n${coverage} FROM ${facts}`);
}

async function groupTable(spec: ChapterSpec, group: GroupSpec, filters: Filters): Promise<GroupTable | null> {
  if ((group.fields ?? [group.field]).some(field => !carries(spec.source, field))) return null;
  const columns = usableMetrics(group.columns).filter(id => !currentSnapshotMetrics.has(id));
  if (!columns.length) return null;
  const read = (f: Filters) => query(groupQuery(factsFor(spec, f), group, columns, context(f, []), spec.renewal));
  const [current, priorRows, priorYearRows] = await Promise.all([
    read(filters), read({ ...filters, ...monthBounds(shiftMonth(filters.from.slice(0,7),-1)) }),
    read({ ...filters, ...monthBounds(shiftMonth(filters.from.slice(0,7),-12)) }),
  ]);
  const { rows, omitted, eligible } = rankedRows(current, group);
  if (!rows.length) return null;
  const total = current.find(r => Number(r.is_total) === 1) ?? null;
  const map = (rs: Row[]) => Object.fromEntries(rs.filter(r => Number(r.is_total)!==1).map(r => [String(r.g), r]));
  const prior = map(priorRows), priorYear = map(priorYearRows);
  const lead = group.rankBy ?? columns[0];
  const diagnostics: string[] = [];
  if (eligible.length) diagnostics.push(`Highest ${definition(lead)?.label}: ${eligible[0].g} (${reportFmt(lead,eligible[0][lead])}); lowest eligible: ${eligible.at(-1)!.g} (${reportFmt(lead,eligible.at(-1)![lead])}). This is a ranking, not evidence of causation.`);
  if (columns.includes('gross_revenue') && total?.gross_revenue != null && Number(total.gross_revenue)>0) {
    const all = current.filter(r => Number(r.is_total)!==1);
    const largest = [...all].sort((a,b)=>Number(b.gross_revenue)-Number(a.gross_revenue)).slice(0,3);
    const share = largest.reduce((sum,r)=>sum+Number(r.gross_revenue??0),0)/Number(total.gross_revenue);
    diagnostics.push(`The top ${largest.length} groups contribute ${(share*100).toFixed(1)}% of gross collections. Grouped transaction counts can overlap and must not be added.`);
    const keys = new Set([...all.map(r=>String(r.g)),...Object.keys(prior)]);
    const now = map(all);
    const drivers = [...keys].map(g=>({g,change:Number(now[g]?.gross_revenue??0)-Number(prior[g]?.gross_revenue??0)})).sort((a,b)=>b.change-a.change);
    if (priorRows.some(r=>Number(r.n)>0)) diagnostics.push(`Largest category/product movement against prior month: ${drivers[0]?.g} ${reportFmt('gross_revenue',drivers[0]?.change)}; lowest movement ${drivers.at(-1)?.g} ${reportFmt('gross_revenue',drivers.at(-1)?.change)}. Missing groups are treated as zero contribution only for this additive sales bridge, not for rates.`);
  }
  const analysis = analyseGroup(group, columns, current.filter(r => Number(r.is_total)!==1), prior, eligible, total);
  return { id: group.id ?? group.field, field: group.field, fields: group.fields, title: group.title, deck: group.deck,
    columns, rows, total, prior, priorYear, compare: group.compare, omitted, diagnostics, analysis,
    minimum: group.minMetric ? `Minimum ${group.minValue ?? 3} ${definition(group.minMetric)?.label.toLowerCase()}` : 'Minimum 3 source records' };
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
  const facts = factsFor(spec, filters);
  const month = monthColumn(spec.source);
  const scoped = where(filters, spec.source, []);
  const conjunction =
    spec.renewal || ["sessions", "sales", "checkins"].includes(spec.source) || !scoped ? "WHERE" : "AND";
  const rows = await query(
    `SELECT ${month} AS month,${measuresFor(spec, historical, filters)},COUNT(*) AS n` +
      ` FROM ${facts} ${conjunction} ${month} IS NOT NULL AND ${month}>=${quote(start)}` +
      ` GROUP BY ${month} ORDER BY month`,
  );
  const byMonth = new Map(rows.map(row => [String(row.month), row]));
  return Array.from({ length: HISTORY_MONTHS }, (_, index) => {
    const month = shiftMonth(start, index);
    return byMonth.get(month) ?? { month, n: 0 };
  });
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
    notes: spec.groups.filter((_, index) => !groups[index]).map(g => `${g.title}: no eligible ranked rows or a grouping field is unavailable. This does not establish zero activity.`),
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
    data[spec.id].diagnostics = diagnosticFacts(data[spec.id]);
    done++;
  }
  // Rule-engine signals for the same studio-month. A failing rule costs that signal, never the report.
  const signals = await evaluateRules(scopeFilters(scope)).catch(() => []);
  onProgress?.(done, queryable.length, "Figures complete");
  return {
    schemaVersion: 5,
    sources: Object.values(health).filter(s => queryable.some(spec => spec.source === s.key)).map(s => ({ key: s.key, title: s.title, fetchedAt: s.fetchedAt, stale: !!s.stale, status: s.status })),
    rate: context(scopeFilters(scope), []).rate,
    scope,
    builtAt: new Date().toISOString(),
    chapters: data,
    narratives: {},
    signals: [...signals].sort((a, b) => ({critical:0,attention:1,opportunity:2,context:3}[a.severity] - {critical:0,attention:1,opportunity:2,context:3}[b.severity]) || b.impactINR - a.impactINR).slice(0, 12).map(({ rule, severity, entity, title, template, impactINR, n }) => ({ rule, severity, entity, title, text: template, impactINR: Number(impactINR) || 0, n: Number(n) || 0 })),
    figuresHash: figuresHash(data),
  };
}
