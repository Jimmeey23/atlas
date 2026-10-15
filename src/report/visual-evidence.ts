import type { ChapterData, GroupTable } from './model';
import { monthLabel, shiftMonth } from './period';

export interface EvidenceMatrix {
  metric: string;
  categories: string[];
  periods: { label: string; values: (number | null)[] }[];
  shown: number;
  available: number;
  basis: string;
}
const measured = (value: unknown): number | null => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

/** One metric and a common scale. Missing cells are never converted to zero. */
export function groupMatrix(table: GroupTable, metric: string, month: string, highlights: string[] = [], limit = 8): EvidenceMatrix {
  const rows = table.rows.filter(row => [row[metric], table.prior?.[String(row.g)]?.[metric], table.priorYear?.[String(row.g)]?.[metric]].some(v => measured(v) != null));
  const selected = [...rows.filter(row => highlights.includes(String(row.g))), ...rows.filter(row => !highlights.includes(String(row.g)))].slice(0, limit);
  const periods = [
    { label: monthLabel(shiftMonth(month, -12)), values: selected.map(row => measured(table.priorYear?.[String(row.g)]?.[metric])) },
    { label: monthLabel(shiftMonth(month, -1)), values: selected.map(row => measured(table.prior?.[String(row.g)]?.[metric])) },
    { label: monthLabel(month), values: selected.map(row => measured(row[metric])) },
  ].filter(period => period.values.some(v => v != null));
  return { metric, categories: selected.map(row => String(row.g ?? 'Unspecified')), periods, shown: selected.length, available: rows.length,
    basis: `${selected.length} of ${rows.length} stored groups shown${table.omitted ? `; ${table.omitted} further eligible groups omitted from the saved ranking` : ''}. ${table.minimum}. Periods without observations are omitted; missing cells remain unavailable.` };
}
export function historyMatrix(data: ChapterData, metric: string, limit = 12): EvidenceMatrix {
  const rows = data.history.slice(-limit);
  return { metric, categories: rows.map(row => monthLabel(String(row.month))), periods: [{ label: 'Monthly observation', values: rows.map(row => measured(row[metric])) }], shown: rows.length, available: data.history.length,
    basis: `${rows.length} observed calendar months from the frozen report. Gaps are unavailable; values are not interpolated.` };
}
export function matrixDomain(matrix: EvidenceMatrix) {
  const values = matrix.periods.flatMap(p => p.values).filter((v): v is number => v != null && Number.isFinite(v));
  return { min: Math.min(0, ...values), max: Math.max(0, ...values), count: values.length };
}
