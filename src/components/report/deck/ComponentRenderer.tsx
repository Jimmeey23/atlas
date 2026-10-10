import { CompleteMetricGrid } from "./CompleteMetricGrid";
import { ArrowDownRight, ArrowUpRight, Minus, TriangleAlert, Lightbulb, Target, CheckCircle2, Info, TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import type { ReportComponentSpec } from "../../../report/model";
import { axisStyle, chartPalette, tooltipStyle, useChart } from "./useChart";

const BULLET = { up: TrendingUp, down: TrendingDown, alert: TriangleAlert, idea: Lightbulb, target: Target, check: CheckCircle2, info: Info } as const;
const number = (v: unknown, unit = "") => v == null ? "—" : `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 })}${unit}`;

function SpecChart({ chart }: { chart: NonNullable<ReportComponentSpec["chart"]> }) {
  const { ref } = useChart(() => {
    const c = chartPalette(), axis = axisStyle();
    const unit = chart.unit && chart.unit.length <= 3 ? chart.unit : "";
    if (chart.type === "pie") return {
      color: c.series, tooltip: { trigger: "item", ...tooltipStyle(), valueFormatter: (v: unknown) => number(v, unit) },
      legend: { bottom: 0, textStyle: { color: c.text2, fontSize: 11 } },
      series: [{ type: "pie", radius: ["42%", "70%"], itemStyle: { borderRadius: 6, borderColor: c.surface, borderWidth: 2 }, label: { color: c.text2, fontSize: 11 },
        data: chart.categories.map((name, i) => ({ name, value: chart.series[0]?.values[i] ?? 0 })) }],
    } as never;
    const horizontal = chart.type === "hbar";
    const category = { type: "category" as const, data: chart.categories, ...axis, splitLine: { show: false } };
    const value = { type: "value" as const, ...axis, axisLabel: { ...axis.axisLabel, formatter: (v: number) => number(v, unit) } };
    return {
      color: c.series, grid: { left: 10, right: 16, top: chart.series.length > 1 ? 30 : 12, bottom: 8, containLabel: true },
      legend: chart.series.length > 1 ? { top: 0, textStyle: { color: c.text2, fontSize: 11 } } : undefined,
      tooltip: { trigger: "axis", ...tooltipStyle(), valueFormatter: (v: unknown) => number(v, unit) },
      xAxis: horizontal ? value : category, yAxis: horizontal ? { ...category, inverse: true } : value,
      series: chart.series.map(s => ({ name: s.name, type: chart.type === "area" || chart.type === "line" ? "line" : "bar", data: s.values, smooth: true, barMaxWidth: 22,
        areaStyle: chart.type === "area" ? { opacity: .15 } : undefined, itemStyle: { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] } })),
    } as never;
  }, [JSON.stringify(chart)]);
  return <div className="chart deck-spec-chart" ref={ref} role="img" aria-label={chart.series.map(s => s.name).join(", ")} />;
}

/** Renders an AI-written component spec with the app's own surfaces. */
export function ComponentRenderer({ spec }: { spec: ReportComponentSpec }) {
  return <section className="deck-spec" data-kind={spec.kind} data-tone={spec.tone}>
    <header className="deck-spec-head"><span className="deck-eyebrow"><Sparkles size={11}/>AI redesigned</span><h3>{spec.title}</h3>{spec.subtitle && <p>{spec.subtitle}</p>}</header>
    {spec.kind === "metrics" && <CompleteMetricGrid items={(spec.items ?? []).map((_, i) => String(i))} render={index => {
      const i = Number(index), item = spec.items![i];
      const Arrow = item.tone === "up" ? ArrowUpRight : item.tone === "down" ? ArrowDownRight : Minus;
      return <article className="metric-card" key={i}><div className="metric-label"><span>{item.label}</span></div>
        <div className="metric-reading"><span className="metric-value number">{item.value}</span></div>
        {item.delta && <div className={`metric-delta ${item.tone === "up" ? "positive" : item.tone === "down" ? "negative" : "muted"}`}><Arrow size={12}/>{item.delta}</div>}
        {item.note && <div className="metric-footer"><span>{item.note}</span></div>}</article>;
    }}/>}
    {spec.kind === "chart" && spec.chart && spec.chart.categories.length > 0 && <div className="chart-surface"><SpecChart chart={spec.chart} /></div>}
    {spec.kind === "table" && <div className="table-scroll deck-spec-table"><table><thead><tr>{spec.columns?.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
      <tbody>{spec.rows?.map((row, i) => <tr key={i}>{row.map((cell, j) => j ? <td key={j}>{cell}</td> : <th scope="row" key={j}>{cell}</th>)}</tr>)}</tbody></table></div>}
    {(spec.kind === "bullets" || spec.kind === "callout") && spec.body && <p className="deck-spec-body">{spec.body}</p>}
    {!!spec.bullets?.length && <ul className="deck-bullets">{spec.bullets.map((b, i) => { const Icon = BULLET[b.icon ?? "info"] ?? Info; return <li key={i} data-icon={b.icon}><Icon size={15}/><span>{b.text}</span></li>; })}</ul>}
    {spec.kind === "comparison" && <div className="deck-compare">{[spec.left, spec.right].map((side, i) => side && <div key={i} data-side={i ? "right" : "left"}><h4>{side.label}</h4><ul className="deck-bullets">{side.points.map((p, j) => <li key={j}>{i ? <TriangleAlert size={14}/> : <CheckCircle2 size={14}/>}<span>{p}</span></li>)}</ul></div>)}</div>}
  </section>;
}
