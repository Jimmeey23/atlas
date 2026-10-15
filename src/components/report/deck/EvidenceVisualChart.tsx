import type { EChartsOption } from 'echarts';
import type { EvidenceMatrix } from '../../../report/visual-evidence';
import { definition, reportFmt as fmt } from '../../../report/definitions';
import { useChart, axisStyle, chartPalette, tooltipStyle } from './useChart';

export function ComparisonChart({ matrix, selected, onSelect }: { matrix: EvidenceMatrix; selected: { group: number; period: number } | null; onSelect: (value: { group: number; period: number }) => void }) {
  const { ref } = useChart((): EChartsOption => {
    const color = chartPalette();
    const colors = ['#99a8c3', '#22a69b', '#7565e9'];
    const horizontal = matrix.periods.length > 1;
    const category = { type: 'category' as const, data: matrix.categories, ...axisStyle(), axisLabel: { color: color.text3, fontSize: 11, width: horizontal ? 120 : 70, overflow: 'break' as const, interval: horizontal ? 0 : Math.max(0, Math.ceil(matrix.categories.length / 6) - 1), formatter: (label: string) => horizontal ? label : label.replace(/^([A-Za-z]{3})[a-z]+ (\d{4})$/, '$1\n$2') } };
    const value = { type: 'value' as const, ...axisStyle(), name: '', nameTextStyle: { color: color.text3, fontSize: 10 }, axisLabel: { color: color.text3, fontSize: 10, formatter: (value: number) => fmt(matrix.metric, value) }, scale: false };
    return { animation: false, tooltip: { ...tooltipStyle(), trigger: 'item', formatter: params => { const p = Array.isArray(params) ? params[0] : params; const index = p.seriesIndex ?? 0; const text = `${matrix.categories[p.dataIndex]} · ${matrix.periods[index]?.label}: ${fmt(matrix.metric, matrix.periods[index]?.values[p.dataIndex])}`; return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); } }, grid: { left: horizontal ? 132 : 62, right: 24, top: 38, bottom: horizontal ? 30 : 64 }, xAxis: horizontal ? value : category, yAxis: horizontal ? category : value,
      series: matrix.periods.map((p, i) => ({ name: p.label, type: 'bar', barMaxWidth: 18, data: p.values.map((value, g) => ({ value, itemStyle: { color: colors[(i + 3 - matrix.periods.length) % 3], opacity: selected && selected.group !== g ? .4 : 1 } })), emphasis: { focus: 'series' } })) };
  }, [matrix, selected], p => onSelect({ group: p.dataIndex, period: (p as { seriesIndex?: number }).seriesIndex ?? 0 }));
  return <div ref={ref} className="rp-flat-chart" role="img" aria-label={`${definition(matrix.metric)?.label} compared across ${matrix.categories.length} groups or months`}/>;
}
