import { groupValueSQL } from '../data/group-fields';
import type { GroupTable } from './model';
/** Match the complete saved grouping label; never split labels containing the separator. */
export function recordGroupConstraint(table: GroupTable | undefined, group: string | undefined) {
  if (!table || group == null) return '';
  const fields = table.fields ?? [table.field];
  if (!fields.length) throw new Error('The breakdown has no grouping fields');
  const values = fields.map(field => groupValueSQL(field));
  const expression = values.length > 1 ? `CONCAT(${values.join(", ' · ', ")})` : values[0];
  return ` WHERE ${expression}='${group.replaceAll("'", "''")}'`;
}

import registry from '../semantics/registry.json';
import { sqlTypes } from '../data/normalise';

const expressions: Record<string, { expression: string; format: string; label: string }> = Object.fromEntries((registry as { id: string; expression: string; format: string; label: string }[]).map(m => [m.id, m]));
/** The rows an aggregate reads: FILTER clauses become WHERE, SUM(col) keeps contributing rows, COUNT(DISTINCT col) non-null ones. */
function population(aggregate: string): string | null {
  const a = aggregate.trim().replace(/^\((.*)\)$/s, '$1').trim();
  if (a.includes('{')) return null;
  const filtered = /^COUNT\(\*\)\s*FILTER\s*\(WHERE\s+(.+)\)$/is.exec(a);
  if (filtered) return filtered[1];
  const sum = /^SUM\((\w+)\)$/i.exec(a);
  if (sum && sqlTypes[sum[1]]) return `COALESCE(TRY_CAST("${sum[1]}" AS DOUBLE),0)<>0`;
  const distinct = /^COUNT\(DISTINCT\s+(\w+)\)$/i.exec(a);
  if (distinct && sqlTypes[distinct[1]]) return `"${distinct[1]}" IS NOT NULL`;
  return null;
}
export interface MetricFocus { where: string | null; flag: string | null; columns: string[]; label: string; rate: boolean }
/**
 * What a clicked figure means at row level. A count or sum shows only the rows
 * that make it up; a rate shows its denominator's rows with a flag for those in
 * the numerator. Derived from the governed metric expression, never hand-mapped.
 */
export function metricRecordFocus(id?: string): MetricFocus | null {
  const m = id ? expressions[id] : undefined;
  if (!m) return null;
  const ratio = /^\s*\(?(.+?)\)?\s*\/\s*NULLIF\(\s*\(?(.+?)\)?\s*,\s*0\s*\)\s*$/s.exec(m.expression);
  const columns = [...new Set(m.expression.match(/\b[a-z_][a-z0-9_]*\b/g) ?? [])].filter(c => sqlTypes[c] && !/^(sessions)$/.test(c) || c === 'sessions' && /SUM\(sessions\)/.test(m.expression));
  if (ratio) return { where: population(ratio[2]), flag: population(ratio[1]), columns, label: m.label, rate: true };
  return { where: population(m.expression), flag: null, columns, label: m.label, rate: false };
}
