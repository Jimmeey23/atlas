import test from 'node:test';
import assert from 'node:assert/strict';
import * as echarts from '../src/components/echarts.ts';

const axes = { xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: { type: 'value' } };
const options: Record<string, object> = {
  line: { ...axes, series: [{ type: 'line', data: [1, 2], markLine: { data: [{ yAxis: 1 }] } }] },
  bar: { ...axes, series: [{ type: 'bar', data: [1, 2], markPoint: { data: [{ type: 'max' }] } }] },
  pie: { series: [{ type: 'pie', data: [{ name: 'a', value: 1 }] }] },
  scatter: { xAxis: {}, yAxis: {}, series: [{ type: 'scatter', data: [[1, 2]] }] },
  heatmap: { ...axes, yAxis: { type: 'category', data: ['x'] }, visualMap: { min: 0, max: 1 }, series: [{ type: 'heatmap', data: [[0, 0, 1]] }] },
  sankey: { series: [{ type: 'sankey', data: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 1 }] }] },
};

test('every chart type the dashboards draw is registered in the slim ECharts build', () => {
  const problems: string[] = [];
  const original = { error: console.error, warn: console.warn };
  console.error = console.warn = (...args: unknown[]) => { problems.push(args.map(String).join(' ')); };
  try { for (const [type, option] of Object.entries(options)) {
    const chart = echarts.init(null as any, undefined, { renderer: 'svg', ssr: true, width: 200, height: 120 });
    chart.setOption({ tooltip: {}, legend: {}, grid: {}, dataZoom: [{ type: 'inside' }], title: { text: type }, ...option });
    const svg = chart.renderToSVGString();
    assert.match(svg, /<path|<rect|<circle/, `${type} drew nothing`);
    chart.dispose();
  } } finally { Object.assign(console, original); }
  assert.deepEqual(problems, [], 'ECharts reported unregistered series or components');
});
