import { metricSQL, type QueryContext } from '../semantics/metrics';
import { renewalMeasuresSQL } from '../data/renewals';
import { sqlTypes } from '../data/normalise';
import type { GroupSpec } from './chapters';
import type { Row } from '../data/duckdb';
export function groupQuery(facts: string, group: GroupSpec, columns: string[], ctx: QueryContext, renewal = false) {
  const fields = group.fields ?? [group.field];
  if (fields.some(field => !sqlTypes[field])) throw new Error('Unknown report grouping field');
  const g = fields.map(field => `COALESCE("${field}",'Unspecified')`).join(", ' · ', ");
  const expression = fields.length > 1 ? `CONCAT(${g})` : g;
  return `WITH f AS (SELECT *,${expression} AS __g FROM ${facts}) SELECT __g AS g,GROUPING(__g) AS is_total,${renewal ? renewalMeasuresSQL(columns) : metricSQL(columns, ctx)},COUNT(*) AS n FROM f GROUP BY GROUPING SETS ((__g),())`;
}
export function rankedRows(rows: Row[], group: GroupSpec) {
  const metric = group.rankBy ?? group.columns[0];
  const eligible = rows.filter(row => Number(row.is_total) !== 1 && Number(row.n) >= 3
    && (!group.minMetric || Number(row[group.minMetric]) >= (group.minValue ?? 3))
    && row[metric] != null && Number.isFinite(Number(row[metric])));
  eligible.sort((a,b) => Number(b[metric])-Number(a[metric]) || String(a.g).localeCompare(String(b.g)));
  const limit = group.limit ?? 10;
  if (!group.tails || eligible.length <= limit) return { rows: eligible.slice(0,limit), omitted: Math.max(0,eligible.length-limit), eligible };
  const half = Math.floor(limit/2);
  return { rows: [...eligible.slice(0,half).map(r => ({...r,rank_lane:'Top'})), ...eligible.slice(-half).reverse().map(r => ({...r,rank_lane:'Bottom'}))], omitted: eligible.length-half*2, eligible };
}
