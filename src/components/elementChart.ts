import { pivotRows, type ElementSpec } from "../semantics/element-spec";

export interface ChartTheme {
  palette: string[];
  text: string;
  line: string;
  surface: string;
}
type Format = (key: string, value: unknown) => string;
type Row = Record<string, unknown>;

const label = (key: string) => key.replaceAll("_", " ");
const numeric = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** ECharts option for a saved chart element; pure so it can be tested without a DOM. */
export function elementChartOption(spec: ElementSpec, rows: Row[], theme: ChartTheme, format: Format) {
  const axisLabel = { color: theme.text, fontSize: 10 };
  const splitLine = { lineStyle: { color: theme.line } };
  const tooltipFor = (key: string) => ({ valueFormatter: (v: unknown) => format(key, v) });

  if (spec.type === "pie" || spec.type === "donut") {
    const measure = spec.series[0];
    return {
      color: theme.palette,
      tooltip: { trigger: "item", ...tooltipFor(measure) },
      legend: { bottom: 0, type: "scroll", textStyle: axisLabel },
      series: [
        {
          type: "pie",
          radius: spec.type === "donut" ? ["48%", "72%"] : "70%",
          center: ["50%", "45%"],
          itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: spec.type === "donut" ? 6 : 0 },
          label: { show: spec.type === "pie", color: theme.text, fontSize: 10 },
          data: rows.map((r) => ({ name: String(r[spec.x] ?? "—"), value: numeric(r[measure]) })),
        },
      ],
    };
  }

  if (spec.type === "heatmap") {
    const p = pivotRows(rows, spec.x, spec.group, spec.value);
    const data: [number, number, number][] = [];
    p.rowKeys.forEach((r, y) => p.colKeys.forEach((c, x) => {
      const v = p.cell(r, c);
      if (v != null) data.push([x, y, v]);
    }));
    const values = data.map((d) => d[2]);
    return {
      tooltip: { position: "top", formatter: (i: any) => `${p.rowKeys[i.value[1]]} · ${p.colKeys[i.value[0]]}<br/>${label(spec.value)}: ${format(spec.value, i.value[2])}` },
      grid: { left: 8, right: 12, top: 10, bottom: 70, containLabel: true },
      xAxis: { type: "category", data: p.colKeys, axisLabel, splitArea: { show: true } },
      yAxis: { type: "category", data: p.rowKeys, axisLabel, inverse: true, splitArea: { show: true } },
      visualMap: {
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 1,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        itemHeight: 120,
        textStyle: axisLabel,
        inRange: { color: [theme.surface, theme.palette[0]] },
        formatter: (v: number) => format(spec.value, v),
      },
      series: [{ type: "heatmap", data, label: { show: data.length <= 120, fontSize: 9, formatter: (i: any) => format(spec.value, i.value[2]) } }],
    };
  }

  if (spec.type === "scatter") {
    const measure = spec.series[0];
    return {
      color: theme.palette,
      grid: { left: 8, right: 12, top: 10, bottom: 4, containLabel: true },
      tooltip: { trigger: "item", formatter: (i: any) => `${label(spec.x)}: ${format(spec.x, i.value[0])}<br/>${label(measure)}: ${format(measure, i.value[1])}` },
      xAxis: { type: "value", name: label(spec.x), nameTextStyle: axisLabel, axisLabel: { ...axisLabel, formatter: (v: number) => format(spec.x, v) }, splitLine },
      yAxis: { type: "value", name: label(measure), nameTextStyle: axisLabel, axisLabel: { ...axisLabel, formatter: (v: number) => format(measure, v) }, splitLine },
      series: [{ type: "scatter", symbolSize: 9, data: rows.map((r) => [numeric(r[spec.x]), numeric(r[measure])]) }],
    };
  }

  // Category charts: bar, horizontal_bar, stacked_bar, line, area and combo.
  const horizontal = spec.type === "horizontal_bar";
  const lineLike = spec.type === "line" || spec.type === "area";
  const categories = rows.map((r) => String(r[spec.x] ?? "—"));
  const measures = [...spec.series, ...(spec.type === "combo" ? spec.y2 : [])];
  const valueAxis = (key: string, extra: object = {}) => ({
    type: "value",
    axisLabel: { ...axisLabel, formatter: (v: number) => format(key, v) },
    splitLine,
    ...extra,
  });
  const categoryAxis = {
    type: "category",
    data: categories,
    axisLabel: { ...axisLabel, width: horizontal ? 120 : 80, overflow: "truncate", interval: horizontal ? 0 : "auto" },
    axisLine: { lineStyle: { color: theme.line } },
    axisTick: { show: false },
    ...(horizontal ? { inverse: true } : {}),
  };
  const yAxis =
    spec.type === "combo"
      ? [valueAxis(spec.series[0]), valueAxis(spec.y2[0], { splitLine: { show: false } })]
      : horizontal
        ? categoryAxis
        : valueAxis(spec.series[0]);
  return {
    color: theme.palette,
    grid: { left: 8, right: 12, top: measures.length > 1 ? 30 : 10, bottom: 4, containLabel: true },
    legend: measures.length > 1 ? { top: 0, type: "scroll", textStyle: axisLabel, data: measures.map(label) } : undefined,
    tooltip: { trigger: "axis", axisPointer: { type: lineLike ? "line" : "shadow" } },
    xAxis: horizontal ? valueAxis(spec.series[0]) : categoryAxis,
    yAxis,
    series: measures.map((key, i) => {
      const secondary = spec.type === "combo" && i >= spec.series.length;
      const asLine = lineLike || secondary;
      return {
        name: label(key),
        type: asLine ? "line" : "bar",
        ...(spec.type === "stacked_bar" ? { stack: "total" } : {}),
        ...(spec.type === "combo" ? { yAxisIndex: secondary ? 1 : 0 } : {}),
        ...(spec.type === "area" ? { areaStyle: { opacity: measures.length > 1 ? 0.18 : 0.24 } } : {}),
        // The right-axis lines take the warm half of the palette so they never read as another bar.
        ...(secondary ? { color: theme.palette[(2 + i - spec.series.length) % theme.palette.length] } : {}),
        smooth: asLine,
        symbolSize: 6,
        barMaxWidth: 28,
        tooltip: tooltipFor(key),
        data: rows.map((r) => numeric(r[key])),
      };
    }),
  };
}
