import { useMemo, useState } from "react";
import { ChartLine, ChartColumn, ChartArea, CalendarRange } from "lucide-react";
import { DropdownField } from "../../ui/DropdownField";
import { MonthlyTableControls, type MonthlyTableState } from "../../MonthlyTableControls";
import { ChartControls } from "../../ChartControls";
import { exportCSV } from "../../exports";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import { monthLabel, monthShort } from "../../../report/period";
import type { Row } from "../../../data/duckdb";
import { axisStyle, chartPalette, tooltipStyle, useChart } from "./useChart";

import { useRecordDrilldown } from "./RecordDrilldown";
const label = (id: string) => definition(id)?.label ?? id;
const shift = (key: string, months: number) => { const d = new Date(`${key}-01T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1)).toISOString().slice(0, 7); };

/** The dashboard's register chrome, without the live-data actions a frozen report cannot run. */
export function DeckRegister({ index, title, subtitle, actions, children }: { index: string; title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return <section className="register deck-register" data-index={index}>
    <div className="register-head"><div className="register-title"><span className="index">{index}</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div className="register-actions">{actions}</div>}</div>
    {children}
  </section>;
}

/** Interactive monthly trend: pick measures, chart type and last-year overlay; click a month to pin it. */
export function TrendChartPanel({ history, ids, selected, onSelect, title }: { history: Row[]; ids: string[]; selected: string; onSelect: (month: string) => void; title: string }) {
  const drill = useRecordDrilldown();
  const usable = ids.filter(id => history.filter(r => r[id] != null).length > 1);
  const [shown, setShown] = useState<string[]>(usable.slice(0, 1));
  const [type, setType] = useState<"line" | "bar" | "area">("line");
  const [overlay, setOverlay] = useState(false);
  const active = shown.filter(id => usable.includes(id)).length ? shown.filter(id => usable.includes(id)) : usable.slice(0, 1);
  const months = history.map(r => String(r.month));
  const percent = (id: string) => definition(id)?.format === "percent";
  // Two measures on different units get separate axes: rates on the right.
  const axes = [...new Set(active.map(id => percent(id) ? "rate" : "value"))];
  const { ref } = useChart(() => {
    if (!active.length) return null;
    const c = chartPalette(), axis = axisStyle();
    const series = active.flatMap((id, n) => {
      const color = c.series[n % c.series.length];
      const values = history.map(r => r[id] == null ? null : Number(r[id]));
      const yAxisIndex = axes.length > 1 && percent(id) ? 1 : 0;
      // Thin lines, no markers except the pinned month, which gets a ringed dot and its value.
      const pinned = months.indexOf(selected);
      const main = { name: label(id), type: type === "bar" ? "bar" : "line", yAxisIndex, data: values, smooth: .25, showSymbol: false, symbol: "circle", symbolSize: 6, barMaxWidth: 18, itemStyle: { color, borderRadius: type === "bar" ? [3, 3, 0, 0] : 0 },
        lineStyle: { width: 1.75, color }, areaStyle: type === "area" ? { color, opacity: .08 } : undefined,
        markPoint: pinned >= 0 && values[pinned] != null ? { symbol: "circle", symbolSize: 9, itemStyle: { color, borderColor: c.surface, borderWidth: 2 },
          label: { show: true, position: "top", distance: 8, color: c.text1, fontSize: 11, fontWeight: 600, formatter: () => fmt(id, values[pinned]) }, data: [{ coord: [pinned, values[pinned]] }] } : undefined };
      const lastYear = overlay ? [{ name: `${label(id)} · last year`, type: "line", yAxisIndex, smooth: true, symbol: "none", lineStyle: { width: 1.6, type: "dashed", color, opacity: .55 },
        data: months.map(m => { const row = history.find(r => r.month === shift(m, 12)); return row?.[id] == null ? null : Number(row[id]); }) }] : [];
      return [main, ...lastYear];
    });
    const yAxis = axes.map((kind, i) => { const id = active.find(a => (percent(a) ? "rate" : "value") === kind)!; return { type: "value", position: i ? "right" : "left", ...axis, ...(i ? { splitLine: { show: false } } : {}), axisLabel: { ...axis.axisLabel, formatter: (v: number) => fmt(id, v) } }; });
    return {
      color: c.series, grid: { left: 10, right: 10, top: 34, bottom: 46, containLabel: true },
      legend: { top: 0, left: 0, textStyle: { color: c.text2, fontSize: 11.5 }, icon: "circle", itemWidth: 8, itemHeight: 8, itemGap: 16 },
      tooltip: { trigger: "axis", ...tooltipStyle(), formatter: (params: unknown) => {
        const list = params as { dataIndex: number; seriesName: string; value: unknown; marker: string }[];
        return `<b>${monthLabel(months[list[0]?.dataIndex ?? 0] ?? "")}</b><br/>` +
          list.map(p => { const id = active.find(a => p.seriesName.startsWith(label(a))) ?? active[0]; return `${p.marker}${p.seriesName}: <b>${fmt(id, p.value)}</b>`; }).join("<br/>");
      } },
      xAxis: { type: "category", data: months.map(monthShort), ...axis, splitLine: { show: false } },
      yAxis,
      dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 6, borderColor: "transparent", fillerColor: "rgba(127,127,127,.12)", handleSize: "80%", moveHandleSize: 0, textStyle: { color: c.text3, fontSize: 9 } }],
      series,
    } as never;
  }, [active.join(), type, overlay, selected, history.length], params => {
    const month = months[params.dataIndex];
    if (!month) return;
    onSelect(month);
    // The clicked point: its month and its measure (a last-year overlay point opens that earlier month).
    const id = active.find(a => params.seriesName?.startsWith(label(a)));
    const lastYear = params.seriesName?.endsWith("· last year");
    if (id) drill?.({ month: lastYear ? shift(month, 12) : month, metric: id });
  });
  if (!usable.length) return null;
  const rows = history.map(r => ({ Month: String(r.month), ...Object.fromEntries(active.map(id => [label(id), fmt(id, r[id])])) }));
  return <div className="chart-surface deck-chart-surface">
    <ChartControls rows={rows} title={title} />
    <div className="deck-chart-toolbar">
      <div className="deck-measure-chips" role="group" aria-label="Measures on the chart">
        {usable.map(id => <button key={id} type="button" aria-pressed={active.includes(id)} onClick={() => setShown(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id].slice(-3))}>{label(id)}</button>)}
      </div>
      <div className="segmented" aria-label="Chart type">
        {([["line", ChartLine], ["bar", ChartColumn], ["area", ChartArea]] as const).map(([key, Icon]) => <button key={key} className={type === key ? "active" : ""} aria-pressed={type === key} aria-label={`${key} chart`} onClick={() => setType(key)}><Icon size={13}/></button>)}
      </div>
      <label className="monthly-check"><input type="checkbox" checked={overlay} onChange={e => setOverlay(e.target.checked)}/>Last year</label>
    </div>
    <div className="chart deck-trend-chart" ref={ref} role="img" aria-label={`${title}: ${active.map(label).join(", ")}`} />
    <div className="chart-caption"><span>{history.length} months · up to 3 measures · rates on the right axis</span><span>Hover for values · click a point to pin it and open its records</span></div>
  </div>;
}

/** The dashboard's month-by-month table, read from the report's frozen 14-month history. */
export function ReportMoMTable({ history, ids, selected, onSelect, title }: { history: Row[]; ids: string[]; selected: string; onSelect: (month: string) => void; title: string }) {
  const drill = useRecordDrilldown();
  const [controls, setControls] = useState<MonthlyTableState>({ periods: 14, newest: true, dense: true, mode: "absolute" });
  const [search, setSearch] = useState(""), [measure, setMeasure] = useState("all"), [baseline, setBaseline] = useState(false);
  const all = useMemo(() => [...history].sort((a, b) => String(a.month).localeCompare(String(b.month))), [history]);
  const latest = String(all.at(-1)?.month ?? "");
  const months = all.slice(-controls.periods).map(r => String(r.month));
  if (controls.newest) months.reverse();
  const row = (key: string) => all.find(r => r.month === key);
  const prior = (key: string) => shift(key, controls.mode === "year" ? 12 : 1);
  const usable = ids.filter(id => definition(id) && all.some(r => r[id] != null));
  const visible = usable.filter(id => (measure === "all" || id === measure) && label(id).toLowerCase().includes(search.toLowerCase()));
  const first = (id: string) => all.find(r => r[id] != null)?.[id];
  const cell = (id: string, key: string) => {
    const value = row(key)?.[id], prev = row(prior(key))?.[id];
    if (controls.mode === "absolute") return fmt(id, value);
    if (controls.mode === "index") return value == null || !first(id) ? "—" : (Number(value) / Number(first(id)) * 100).toFixed(0);
    return value == null || prev == null ? "—" : delta(id, value, prev);
  };
  return <>
    <MonthlyTableControls comparisons state={controls} onChange={patch => setControls(c => ({ ...c, ...patch }))}
      modes={[["absolute", "Values"], ["change", "MoM Δ"], ["year", "YoY Δ"], ["index", "Index 100"]]}
      onExport={() => exportCSV(`report-${title.toLowerCase().replaceAll(" ", "-")}-${controls.mode}`, visible.map(id => ({ Measure: label(id), ...Object.fromEntries(months.map(m => [m, cell(id, m)])) })))}>
      <label>Measure<DropdownField aria-label="Monthly metric" value={measure} onChange={e => setMeasure(e.target.value)}><option value="all">All measures</option>{usable.map(id => <option key={id} value={id}>{label(id)}</option>)}</DropdownField></label>
      <input type="search" aria-label="Search monthly measures" placeholder="Find a measure…" value={search} onChange={e => setSearch(e.target.value)} />
      <label className="monthly-check"><input type="checkbox" checked={baseline} onChange={e => setBaseline(e.target.checked)} />Show baseline</label>
    </MonthlyTableControls>
    <div className={`table-scroll mom monthly-table${controls.dense ? " compact" : " comfortable"}`} tabIndex={0} aria-label="Monthly comparison table; scroll for more periods">
      <table>
        <thead><tr><th>Performance measure</th>{months.map(m => <th key={m} className={[m === latest && "latest-month", m === selected && "deck-selected-month"].filter(Boolean).join(" ") || undefined}>{monthShort(m)}{m === latest && <small>Report month</small>}</th>)}</tr></thead>
        <tbody>{visible.map(id => <tr key={id}>
          <th scope="row" title={definition(id)?.description}>{label(id)}</th>
          {months.map(m => {
            const value = row(m)?.[id], prev = row(prior(m))?.[id];
            const movement = value == null || prev == null ? null : Number(value) - Number(prev);
            const tone = movement == null || movement === 0 ? "neutral" : (movement > 0) === (definition(id)?.higherIsBetter ?? true) ? "positive" : "negative";
            return <td key={m} className={[m === latest && "latest-month", m === selected && "deck-selected-month"].filter(Boolean).join(" ") || undefined}>
              <button className={`monthly-value ${["change", "year"].includes(controls.mode) ? tone : ""}`} title={`${monthLabel(m)}: ${fmt(id, value)} · baseline ${fmt(id, prev)}. Click to explore item-level records and pin the chart.`} onClick={() => { onSelect(m); drill?.({ month: m, metric: id }); }}>
                {cell(id, m)}{baseline && <small>{controls.mode === "year" ? "Last year" : "Prior month"} {fmt(id, prev)}</small>}
              </button></td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    {!visible.length && <p className="empty-state">No measures match this selection.</p>}
    <p className="ranking-foot"><CalendarRange size={12}/> Frozen at report build. Rates use percentage points; Index 100 uses the first available month. Click a value to explore item-level records and pin the month on the chart.</p>
  </>;
}
