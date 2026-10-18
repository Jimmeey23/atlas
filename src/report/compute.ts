import { unsupportedReportMetrics } from "./policy";
import { operationalIntelligence } from "./intelligence";
import { ensureSource } from "../data/loader";
import { websiteScope } from "../data/performance-marketing";
import { query, fieldPresence, health, quote, type Row } from "../data/duckdb";
import { metricSQL } from "../semantics/metrics";
import { currentSnapshotMetrics } from "../semantics/evidence";
import { context, metricFacts, today, where } from "../data/analytics";
import { emptyFilters, type Filters } from "../state/store";
import { chapters, type ChapterSpec, type GroupSpec } from "./chapters";
import type { ChapterData, GroupTable, ReportModel, ReportScope, SegmentHistory } from "./model";
import { ownedMetricIds } from "./ownership";
import { renewalFactsSQL, renewalMeasuresSQL } from '../data/renewals';
import { definition, reportFmt } from './definitions';
import { diagnosticFacts } from "./diagnostics";
import { analyseGroup } from "./findings";
import { evaluateRules } from "../insights/engine";
import { groupQuery, rankedRows } from './group-query';
import { sqlTypes } from '../data/normalise';
import { HISTORY_MONTHS, figuresHash, hashText, monthBounds, shiftMonth } from "./period";
export { HISTORY_MONTHS, figuresHash, monthBounds, monthLabel, shiftMonth } from "./period";

/** The report scopes itself: one studio, one month, every other filter cleared. */
export function scopeFilters(scope: ReportScope, month = scope.month): Filters {
  return { ...emptyFilters, ...monthBounds(month), location: [scope.studio] };
}

/** A metric the registry does not define is dropped rather than queried into an error. */
const usableMetrics = (ids: string[]) => ids.filter((id) => definition(id) && !unsupportedReportMetrics.has(id));
const tracked = new Set(['location','trainer','format','source','category','day','time','member','month','status','product','associate']);
const carries = (source: string, field: string) => !tracked.has(field) || !fieldPresence[source] || fieldPresence[source].has(field);
export const factsFor = (spec: ChapterSpec, filters: Filters) => spec.renewal
  ? `(${renewalFactsSQL(where(filters, 'lapsed', []), today())})`
  : metricFacts(filters, spec.source, [], spec.website ? websiteScope(where(filters, spec.source, [])) : undefined);
const measuresFor = (spec: ChapterSpec, ids: string[], filters: Filters) => spec.renewal ? renewalMeasuresSQL(ids) : metricSQL(ids, { ...context(filters, []), source: spec.source });
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
  const read = (f: Filters) => query(groupQuery(factsFor(spec, f), group, columns, { ...context(f, []), source: spec.source }, spec.renewal));
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
    // Kept lean: the grouping label, sample size and the table's own measures, capped for the saved report.
    eligible: eligible.slice(0, 60).map(r => Object.fromEntries(['g', 'n', ...columns].map(k => [k, r[k] ?? null]))),
    minimum: group.minValue != null && group.minValue > 0 ? `User-requested minimum ${group.minValue} ${group.minMetric ? definition(group.minMetric)?.label.toLowerCase() : 'source records'}` : 'Full filtered dataset; no minimum sample cutoff' };
}

async function historyFor(spec: ChapterSpec, scope: ReportScope, ids: string[]) {
  const historical = ids.filter((id) => !currentSnapshotMetrics.has(id));
  if (!historical.length) return [] as Row[];
  const start = shiftMonth(scope.month, -(HISTORY_MONTHS - 1));
  const filters: Filters = {
    ...scopeFilters(scope),
    ...(spec.network ? {location:[]} : {}),
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

/** Month-by-month figures per segment, for chapters whose population a sibling chapter reports in total. */
async function segmentHistoryFor(spec: ChapterSpec, scope: ReportScope): Promise<SegmentHistory | undefined> {
  const cfg = spec.segmentHistory;
  if (!cfg || !carries(spec.source, cfg.field) || !sqlTypes[cfg.field]) return undefined;
  const ids = usableMetrics(cfg.metrics).filter(id => !currentSnapshotMetrics.has(id));
  if (!ids.length) return undefined;
  const start = shiftMonth(scope.month, -(HISTORY_MONTHS - 1));
  const filters: Filters = { ...scopeFilters(scope), ...(spec.network ? { location: [] } : {}), from: monthBounds(start).from, to: monthBounds(scope.month).to };
  const facts = factsFor(spec, filters), month = monthColumn(spec.source), scoped = where(filters, spec.source, []);
  const conjunction = spec.renewal || ["sessions", "sales", "checkins"].includes(spec.source) || !scoped ? "WHERE" : "AND";
  const rows = await query(`SELECT ${month} AS month,COALESCE("${cfg.field}",'Unspecified') AS g,${measuresFor(spec, ids, filters)},COUNT(*) AS n FROM ${facts} ${conjunction} ${month} IS NOT NULL AND ${month}>=${quote(start)} GROUP BY 1,2 ORDER BY 1,2`);
  const ranked = rows.filter(r => String(r.month) === scope.month && r.g !== "Unspecified")
    .sort((a, b) => Number(b.sessions ?? b.n) - Number(a.sessions ?? a.n) || String(a.g).localeCompare(String(b.g))).slice(0, cfg.limit).map(r => String(r.g));
  if (!ranked.length) return undefined;
  return { field: cfg.field, title: cfg.title, metrics: ids, segments: ranked, rows: rows.filter(r => ranked.includes(String(r.g))) };
}

/** Extra measures from the app tab's own table are additive: if they cannot be computed the chapter keeps its core figures. */
const optionalRows = (task: Promise<Row[]>) => task.catch(() => [] as Row[]);

async function computeChapter(spec: ChapterSpec, scope: ReportScope): Promise<ChapterData> {
  const ids = usableMetrics(spec.metrics);
  const scoped = (month = scope.month) => ({...scopeFilters(scope,month),...(spec.network ? {location:[]} : {})});
  const current = scoped();
  // Snapshot metrics describe today across every date, so they are read with
  // the period cleared and never compared: asking for their prior value would
  // print a number that was never true.
  const comparable = ids.filter((id) => !currentSnapshotMetrics.has(id));
  const snapshot = ids.filter((id) => currentSnapshotMetrics.has(id));
  // The app tab's complete measure list, minus what a sibling chapter already reports.
  const extra = usableMetrics(ownedMetricIds(spec)).filter(id => !ids.includes(id));
  const extraComparable = extra.filter(id => !currentSnapshotMetrics.has(id));
  const extraSnapshot = extra.filter(id => currentSnapshotMetrics.has(id));
  const [total, snapshotTotal, prior, priorYear, history, ytd, priorYtd, ...groups] = await Promise.all([
    totalsFor(spec, current, comparable),
    totalsFor(spec, { ...current, from: "", to: "" }, snapshot),
    totalsFor(spec, scoped(shiftMonth(scope.month, -1)), comparable),
    totalsFor(spec, scoped(shiftMonth(scope.month, -12)), comparable),
    historyFor(spec, scope, [...new Set([...spec.history, ...ids])]),
    totalsFor(spec,{...current,from:scope.month.slice(0,4)+"-01-01"},comparable),
    totalsFor(spec,{...scoped(shiftMonth(scope.month,-12)),from:String(Number(scope.month.slice(0,4))-1)+"-01-01"},comparable),
    ...spec.groups.map((group) => groupTable(spec, group, current)),
  ]);
  const [xTotal, xSnapshot, xPrior, xPriorYear, xHistory, xYtd, xPriorYtd, segmentHistory] = await Promise.all([
    optionalRows(totalsFor(spec, current, extraComparable)), optionalRows(totalsFor(spec, { ...current, from: "", to: "" }, extraSnapshot)),
    optionalRows(totalsFor(spec, scoped(shiftMonth(scope.month, -1)), extraComparable)), optionalRows(totalsFor(spec, scoped(shiftMonth(scope.month, -12)), extraComparable)),
    optionalRows(historyFor(spec, scope, extraComparable)),
    optionalRows(totalsFor(spec, { ...current, from: scope.month.slice(0, 4) + "-01-01" }, extraComparable)),
    optionalRows(totalsFor(spec, { ...scoped(shiftMonth(scope.month, -12)), from: String(Number(scope.month.slice(0, 4)) - 1) + "-01-01" }, extraComparable)),
    segmentHistoryFor(spec, scope).catch(() => undefined),
  ]);
  const withExtra = (base: Row, more?: Row[]) => ({ ...(more?.[0] ?? {}), ...base });
  const byMonth = new Map(xHistory.map(row => [String(row.month), row]));
  return {
    id: spec.id,
    populationKey: `${scope.studio}|${scope.month}|${spec.source}|${!!spec.network}|${!!spec.renewal}|${!!spec.website}`,
    total: { ...(xTotal[0] ?? {}), ...(xSnapshot[0] ?? {}), ...(total[0] ?? {}), ...(snapshotTotal[0] ?? {}) },
    prior: withExtra(prior[0] ?? {}, xPrior),
    priorYear: withExtra(priorYear[0] ?? {}, xPriorYear),
    yearToDate: withExtra(ytd[0] ?? {}, xYtd), priorYearToDate: withExtra(priorYtd[0] ?? {}, xPriorYtd),
    n: Number(total[0]?.n ?? 0),
    groups: (groups as (GroupTable | null)[]).filter((g): g is GroupTable => !!g),
    notes: spec.groups.filter((_, index) => !groups[index]).map(g => `${g.title}: no eligible ranked rows or a grouping field is unavailable. This does not establish zero activity.`),
    history: history.map(row => ({ ...(byMonth.get(String(row.month)) ?? {}), ...row })),
    ...(segmentHistory ? { segmentHistory } : {}),
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
    try {
      if(spec.optional) await ensureSource(spec.source);
      data[spec.id] = await computeChapter(spec, scope);
    } catch(error) {
      if(!spec.optional) throw error;
      data[spec.id] = {id:spec.id,n:0,total:{},prior:{},priorYear:{},history:[],groups:[],notes:[`Source unavailable: ${String(error instanceof Error ? error.message : error)}. Do not infer zero performance.`]};
    }
    if(spec.network) (data[spec.id].notes ??= []).push('Account-level data across studios; no verified studio attribution.');
    if(scope.month>=today().slice(0,7)) (data[spec.id].notes ??= []).push('This reporting month is open or future-dated. Recorded results may be incomplete; comparisons with closed periods are not like-for-like full months.');
    data[spec.id].diagnostics = diagnosticFacts(data[spec.id]);
    done++;
  }
  // Rule-engine signals for the same studio-month. A failing rule costs that signal, never the report.
  const signals = await evaluateRules(scopeFilters(scope)).catch(() => []);
  const additionalContext: NonNullable<ReportModel['additionalContext']> = [];
  try {
    const response=await fetch('/api/kra/performance?imports=false',{signal:AbortSignal.timeout(8000)});
    if(!response.ok) throw new Error('KRA context unavailable');
    const result=await response.json();
    const month=result.monthly?.find((row:{month:string})=>row.month===scope.month);
    const keys=['month','closed','cutoff','revenue','baselineRevenue','previousRevenue','revenueYoY','revenueMoM','churnRate','baselineChurnRate','churnReduction','leads','scheduled','completed'];
    additionalContext.push({title:'KRA performance',scope:'Network / role scorecard',status:month?'available':'outside selected-month coverage',data:month ? Object.fromEntries(keys.filter(k=>k in month).map(k=>[k,month[k]])) : undefined,limitations:`Source as of ${result.asOf ?? 'unknown'}. Network / role-level figures; do not attribute to ${scope.studio} or sum with studio revenue. Manual milestone evidence and different-period totals are excluded.`});
  } catch {additionalContext.push({title:'KRA performance',scope:'Network / role scorecard',status:'unavailable',limitations:'No verified selected-month KRA snapshot was available; do not infer performance.'});}
  const intelligenceSources: Record<string, Row[]> = {};
  await Promise.all(['new','checkins','sales','lapsed','sessions','payroll','leads'].map(async key => {
    try {
      await ensureSource(key);
      intelligenceSources[key] = await query(`SELECT * EXCLUDE(raw_json) FROM ${metricFacts({ ...scopeFilters(scope), from: "", to: "" }, key, [])}`);
    } catch { /* An absent source is explicitly unavailable in intelligence. */ }
  }));
  try { intelligenceSources.networkSessions = await query(`SELECT * EXCLUDE(raw_json) FROM sessions WHERE location<>${quote(scope.studio)} AND month=${quote(scope.month)}`); } catch { /* unavailable */ }
  const intelligence = operationalIntelligence(intelligenceSources, scope.month, today());
  onProgress?.(done, queryable.length, "Figures complete");
  return {
    schemaVersion: 6,
    intelligence,
    additionalContext,
    sources: Object.values(health).filter(s => queryable.some(spec => spec.source === s.key)).map(s => ({ key: s.key, title: s.title, fetchedAt: s.fetchedAt, stale: !!s.stale, status: s.status })),
    rate: context(scopeFilters(scope), []).rate,
    scope,
    builtAt: new Date().toISOString(),
    chapters: data,
    narratives: {},
    signals: [...signals].sort((a, b) => ({critical:0,attention:1,opportunity:2,context:3}[a.severity] - {critical:0,attention:1,opportunity:2,context:3}[b.severity]) || b.impactINR - a.impactINR).slice(0, 12).map(({ rule, severity, entity, title, template, impactINR, n }) => ({ rule, severity, entity, title, text: template, impactINR: Number(impactINR) || 0, n: Number(n) || 0 })),
    figuresHash: hashText(figuresHash(data) + JSON.stringify(intelligence)),
  };
}
