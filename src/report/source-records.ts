import { groupValueSQL } from '../data/group-fields';
import type { Row } from '../data/duckdb';
import { renewalMeasures } from '../data/renewals';
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
  const a = aggregate.replace(/::(?:DOUBLE|FLOAT|BIGINT|INTEGER)/gi, '').trim().replace(/^\((.*)\)$/s, '$1').trim();
  if (a.includes('{')) return null;
  const filtered = /^COUNT\(\*\)\s*FILTER\s*\(WHERE\s+(.+)\)$/is.exec(a);
  if (filtered) return filtered[1];
  const filteredDistinct = /^COUNT\(DISTINCT\s+(\w+)\)\s*FILTER\s*\(WHERE\s+(.+)\)$/is.exec(a);
  if(filteredDistinct && sqlTypes[filteredDistinct[1]])return `"${filteredDistinct[1]}" IS NOT NULL AND (${filteredDistinct[2]})`;
  const sum = /^SUM\((\w+)\)$/i.exec(a);
  if (sum && sqlTypes[sum[1]]) return `COALESCE(TRY_CAST("${sum[1]}" AS DOUBLE),0)<>0`;
  const expressionSum = /^SUM\((.+)\)$/is.exec(a);
  if (expressionSum && !/\b(?:SUM|COUNT|AVG|MIN|MAX)\s*\(/i.test(expressionSum[1])) return `COALESCE(TRY_CAST((${expressionSum[1]}) AS DOUBLE),0)<>0`;
  const average = /^AVG\((\w+)\)(?:\s*FILTER\s*\(WHERE\s+(.+)\))?$/is.exec(a);
  if (average && sqlTypes[average[1]]) return `"${average[1]}" IS NOT NULL${average[2] ? ` AND (${average[2]})` : ''}`;
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
  const m = id ? expressions[id] ?? renewalMeasures[id] : undefined;
  if (!m) return null;
  const ratio = /^\s*\(?(.+?)\)?\s*\/\s*NULLIF\(\s*\(?(.+?)\)?\s*,\s*0\s*\)\s*$/s.exec(m.expression);
  const columns = [...new Set(m.expression.match(/\b[a-z_][a-z0-9_]*\b/g) ?? [])].filter(c => sqlTypes[c] && !/^(sessions)$/.test(c) || c === 'sessions' && /SUM\(sessions\)/.test(m.expression));
  if (ratio) {
    const denominator = population(ratio[2]), numerator = population(ratio[1]);
    // Preserve numerator contributors even where their denominator value is missing/zero.
    const where = denominator && numerator ? `(${denominator}) OR (${numerator})` : denominator;
    return { where, flag: numerator, columns, label: m.label, rate: true };
  }
  return { where: population(m.expression), flag: null, columns, label: m.label, rate: false };
}

/** Query saved rows with the same metric predicates as live facts. No current sheet is read. */
export function snapshotRecordSQL(rows: Row[], metric?: string, table?: GroupTable, group?: string, populationWhere?: string) {
  if (!rows.length) return null;
  const fields = [...new Set(rows.flatMap(row => Object.keys(row)))].filter(field => /^[_a-zA-Z][_a-zA-Z0-9]{0,100}$/.test(field) && field !== 'raw_json');
  const literal = (value: unknown) => value == null ? 'NULL' : typeof value === 'boolean' ? String(value) : typeof value === 'number' && Number.isFinite(value) ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
  const type = (field: string) => sqlTypes[field] ?? (rows.some(row => typeof row[field] === 'boolean') ? 'BOOLEAN' : rows.some(row => typeof row[field] === 'number') ? 'DOUBLE' : 'VARCHAR');
  const values = rows.map(row => `(${fields.map(field => `CAST(${literal(row[field])} AS ${type(field)})`).join(',')})`).join(',');
  const focus = metricRecordFocus(metric);
  const eligible = metric && fields.includes(`__eligible_${metric}`) ? `COALESCE(TRY_CAST("__eligible_${metric}" AS BOOLEAN),false)` : focus?.where;
  const flag = metric && fields.includes(`__flag_${metric}`) ? `COALESCE(TRY_CAST("__flag_${metric}" AS BOOLEAN),false)` : focus?.flag;
  const conditions = [recordGroupConstraint(table, group).replace(/^ WHERE /, ''), eligible, populationWhere].filter(Boolean);
  return `SELECT *${flag ? `,CASE WHEN (${flag}) THEN 'Yes' ELSE 'No' END AS counts_toward` : ''} FROM (VALUES ${values}) AS frozen(${fields.map(field => `"${field}"`).join(',')})${conditions.length ? ` WHERE ${conditions.map(condition => `(${condition})`).join(' AND ')}` : ''}`;
}
