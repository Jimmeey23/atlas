import { ArrowDownRight, ArrowUpRight, Minus, RotateCcw, Target, ChartColumnBig } from "lucide-react";
import { Sparkline } from "../../MetricCard";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import { monthLabel } from "../../../report/period";
import { currentSnapshotMetrics } from "../../../semantics/evidence";
import type { ChapterData } from "../../../report/model";
import { axisStyle, chartPalette, tooltipStyle, useChart } from "./useChart";

const direction = (id: string, value: unknown, prior: unknown) => {
  if (value == null || prior == null || Number(value) === Number(prior)) return "flat";
  return (Number(value) > Number(prior)) === (definition(id)?.higherIsBetter ?? true) ? "positive" : "negative";
};

/** Fourteen months of one measure, the selected month highlighted, with a 3-month rolling line. */
function MetricHistoryChart({ id, data, active }: { id: string; data: ChapterData; active: boolean }) {
  const history = data.history.slice(-14);
  const { ref } = useChart(() => {
    if (!active) return null;
    const c = chartPalette(), axis = axisStyle();
    const values = history.map(r => r[id] == null ? null : Number(r[id]));
    const rolling = values.map((_, i) => { const w = values.slice(Math.max(0, i - 2), i + 1).filter((v): v is number => v != null); return w.length === 3 ? w.reduce((a, b) => a + b, 0) / 3 : null; });
    return {
      grid: { left: 8, right: 8, top: 18, bottom: 4, containLabel: true },
      tooltip: { trigger: "axis", ...tooltipStyle(), valueFormatter: (v: unknown) => fmt(id, v) },
      xAxis: { type: "category", data: history.map(r => String(r.month).slice(2)), ...axis, splitLine: { show: false } },
      yAxis: { type: "value", ...axis, axisLabel: { ...axis.axisLabel, formatter: (v: number) => fmt(id, v) }, splitNumber: 3 },
      series: [
        { type: "bar", name: definition(id)?.label ?? id, barMaxWidth: 18, data: values.map((v, i) => ({ value: v, itemStyle: { color: c.accent, opacity: i === values.length - 1 ? 1 : .38, borderRadius: [4, 4, 0, 0] } })) },
        { type: "line", name: "3-month average", data: rolling, smooth: true, symbol: "none", lineStyle: { width: 2, color: c.text2, type: "dashed" } },
      ],
    };
  }, [id, active, history.length]);
  return <div className="deck-flip-chart" ref={ref} role="img" aria-label={`${definition(id)?.label} over ${history.length} months`} />;
}

/** The app's metric card; clicking flips it to its 14-month history. */
export function FlipMetricCard({ id, data, target, flipped, onToggle }: { id: string; data: ChapterData; target?: number; flipped: boolean; onToggle: () => void }) {
  const m = definition(id);
  const value = data.total[id], prior = data.prior[id], lastYear = data.priorYear[id];
  const mom = direction(id, value, prior), yoy = direction(id, value, lastYear);
  const values = data.history.slice(-14).map(r => r[id] == null ? null : Number(r[id]));
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  const hit = target == null || value == null ? null : (Number(value) >= target) === (m?.higherIsBetter ?? true);
  const Arrow = mom === "flat" ? Minus : Number(value) >= Number(prior) ? ArrowUpRight : ArrowDownRight;
  const toggle = onToggle;
  return <div className="deck-flip" data-flipped={flipped}>
    <div className="deck-flip-inner">
      <article className="metric-card deck-flip-face deck-flip-front" role="button" tabIndex={0} aria-pressed={flipped} aria-label={`${m?.label}: ${fmt(id, value)}. Show 14-month history`}
        onClick={toggle} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
        <div className="metric-label"><span title={m?.label}>{m?.label ?? id}</span><ChartColumnBig size={14} aria-hidden="true" className="deck-flip-hint"/></div>
        <div className="metric-reading">
          <span className="metric-value number">{fmt(id, value)}</span>
          <Sparkline values={values} color="var(--accent)" />
        </div>
        <div className={`metric-delta ${mom === "flat" ? "muted" : mom}`}><Arrow size={12}/>MoM {delta(id, value, prior)}</div>
        <div className="metric-footer">
          <span className={`deck-yoy ${yoy}`}>YoY {delta(id, value, lastYear)}</span>
          {hit != null ? <span className={`deck-target ${hit ? "positive" : "negative"}`}><Target size={11}/>{hit ? "On target" : "Below"} {fmt(id, target)}</span>
            : <span>{currentSnapshotMetrics.has(id) ? "Snapshot" : m?.aggregation === "sum" ? "Total" : "Weighted"}</span>}
        </div>
      </article>
      <article className="metric-card deck-flip-face deck-flip-back" aria-hidden={!flipped} title="Click to flip back" onClick={toggle}>
        <div className="metric-label"><span>{m?.label ?? id} · 14 months</span>
          <button className="icon-button" aria-label="Flip back" tabIndex={flipped ? 0 : -1} onClick={e => { e.stopPropagation(); toggle(); }}><RotateCcw size={13}/></button></div>
        <MetricHistoryChart id={id} data={data} active={flipped} />
        {finite.length > 1 && <dl className="deck-flip-stats">
          <div><dt>Low</dt><dd>{fmt(id, Math.min(...finite))}</dd></div>
          <div><dt>High</dt><dd>{fmt(id, Math.max(...finite))}</dd></div>
          <div><dt>Avg</dt><dd>{fmt(id, finite.reduce((a, b) => a + b, 0) / finite.length)}</dd></div>
          <div><dt>{monthLabel(String(data.history.at(-1)?.month ?? "")).split(" ")[0] || "Latest"}</dt><dd>{fmt(id, value)}</dd></div>
        </dl>}
      </article>
    </div>
  </div>;
}
