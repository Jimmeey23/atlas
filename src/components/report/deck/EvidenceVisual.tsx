import { useRecordDrilldown } from './RecordDrilldown';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Box, ChartColumn, Table2 } from 'lucide-react';
import type { ChapterData, GroupTable } from '../../../report/model';
import type { EvidenceMatrix } from '../../../report/visual-evidence';
import { groupMatrix, historyMatrix } from '../../../report/visual-evidence';
import { definition, reportFmt as fmt } from '../../../report/definitions';
import { ComparisonChart } from './EvidenceVisualChart';
const ThreeScene = lazy(() => import('./ThreeEvidenceScene'));
const COLORS = ['#99a8c3', '#22a69b', '#7565e9'];

function ExactValues({ matrix, selected, onSelect, exporting = false }: { matrix: EvidenceMatrix; selected: { group: number; period: number } | null; onSelect: (value: { group: number; period: number }) => void; exporting?: boolean }) {
  return <div className="rp-exact-scroll" tabIndex={0} role="region" aria-label="Exact values for this evidence"><table className="rp-exact"><thead><tr><th scope="col">Group / period</th>{matrix.periods.map((p, i) => <th key={i} scope="col">{p.label}</th>)}</tr></thead><tbody>{matrix.categories.map((category, g) => <tr key={g} data-selected={selected?.group === g}><th scope="row"><span className="rp-row-no">{g + 1}</span>{category}</th>{matrix.periods.map((period, p) => <td key={p}>{exporting ? fmt(matrix.metric, period.values[g]) : <button type="button" aria-pressed={selected?.group === g && selected?.period === p} aria-label={`${category} · ${period.label}: ${fmt(matrix.metric, period.values[g])}`} onClick={() => onSelect({ group: g, period: p })}>{fmt(matrix.metric, period.values[g])}</button>}</td>)}</tr>)}</tbody></table></div>;
}

/** The same reviewed matrix drives 3D, 2D and the accessible/exported table. */
export function EvidenceVisual({ data, table, metrics, month, highlights, title, exporting = false, initialView = '2d', showCharts = true }: { data?: ChapterData; table?: GroupTable; metrics: string[]; month: string; highlights?: string[]; title?: string; exporting?: boolean; initialView?: '3d' | '2d' | 'table'; showCharts?: boolean }) {
  const drill = useRecordDrilldown();
  const usable = [...new Set(table ? metrics.filter(id => table.columns.includes(id)).concat(table.compare ? [table.compare] : [], table.columns) : metrics)].filter(id => !!definition(id));
  const [metric, setMetric] = useState(usable[0] ?? '');
  const active = usable.includes(metric) ? metric : usable[0];
  const [view, setView] = useState(initialView);
  const [selected, setSelected] = useState<{ group: number; period: number } | null>(null);
  const matrix = useMemo(() => table ? groupMatrix(table, active, month, highlights) : data ? historyMatrix(data, active) : null, [table, data, active, month, highlights]);
  if (!matrix || !active || !matrix.periods.some(p => p.values.some(v => v != null))) return <p className="rp-evidence-unavailable">No measured evidence is available for this comparison.</p>;
  const group = highlights?.length ? matrix.categories.indexOf(highlights[0]) : -1;
  const focused = selected ?? (group >= 0 ? { group, period: matrix.periods.length - 1 } : null);
  const mode = exporting || !showCharts ? 'table' : view;
  const select = (value: { group: number; period: number }) => {
    setSelected(value);
    if (!exporting && drill) drill({ chapterId: data?.id, metric: active, month: table ? matrix.periods[value.period]?.month ?? month : matrix.months?.[value.group] ?? month, table, group: table ? matrix.categories[value.group] : undefined });
  };
  return <section className="rp-visual" aria-label={title || table?.title || `${definition(active)?.label} evidence`} data-evidence-metric={active}>
    <header className="rp-visual-head"><div><span className="deck-eyebrow">Corresponding evidence</span><h4>{title || table?.title || definition(active)?.label}</h4><p>{definition(active)?.label} · {definition(active)?.format === 'currency' ? 'INR' : definition(active)?.format === 'percent' ? 'Percentage' : 'Recorded units'}</p></div>
      {!exporting && showCharts && <div className="rp-chart-views" role="group" aria-label="Evidence visualization"><button type="button" aria-pressed={mode === '3d'} onClick={() => setView('3d')}><Box size={14}/>3D</button><button type="button" aria-pressed={mode === '2d'} onClick={() => setView('2d')}><ChartColumn size={14}/>2D</button><button type="button" aria-pressed={mode === 'table'} onClick={() => setView('table')}><Table2 size={14}/>Table</button></div>}</header>
    {!exporting && usable.length > 1 && <label className="rp-measure">Measure<select aria-label="Evidence measure" value={active} onChange={e => { setMetric(e.target.value); setSelected(null); }}>{usable.map(id => <option key={id} value={id}>{definition(id)?.label}</option>)}</select></label>}
    {mode !== 'table' && <div className="rp-period-legend">{matrix.periods.map((period, i) => <span key={i}><i style={{ backgroundColor: COLORS[(i + 3 - matrix.periods.length) % 3] }}/>{period.label}</span>)}</div>}
    {mode === '3d' && <Suspense fallback={<p className="rp-chart-loading" role="status">Loading interactive 3D evidence…</p>}><ThreeScene matrix={matrix} selected={focused} onSelect={select}/></Suspense>}
    {mode === '3d' && <ol className="rp-category-key" aria-label="3D category labels">{matrix.categories.map((category, i) => <li key={i}><span>{i + 1}</span>{category}</li>)}</ol>}
    {mode === '2d' && <ComparisonChart matrix={matrix} selected={focused} onSelect={select}/>}
    {exporting && showCharts && <ComparisonChart matrix={matrix} selected={null} onSelect={() => {}}/>}
    {mode === 'table' ? <ExactValues matrix={matrix} selected={focused} onSelect={select} exporting={exporting}/> : <details className="rp-exact-details"><summary>Exact values · {matrix.shown} groups / periods</summary><ExactValues matrix={matrix} selected={focused} onSelect={select}/></details>}
    <p className="rp-visual-note">{matrix.basis}{mode === '3d' && ' Height shows the measured value; depth and colour identify comparison periods. Category numbers match the exact-value table. Zero values remain zero.'}</p>
  </section>;
}
