import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { DropdownField } from "./ui/DropdownField";
import type { AnalyticalRow } from "./AnalyticalTable";
export function AnalyticalChart({
  rows,
  label,
  format,
  onSelect,
  comparison = false,
}: {
  rows: AnalyticalRow[];
  label: string;
  format: (v: unknown) => string;
  onSelect: (rows: AnalyticalRow[]) => void;
  comparison?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<AnalyticalRow[]>([]);
  const [type, setType] = useState("line");
  const [overlay, setOverlay] = useState(true);
  const [denominators, setDenominators] = useState(true);
  const [zoom, setZoom] = useState(true);
  const [selection, setSelection] = useState<AnalyticalRow[]>([]);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "svg" });
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim();
    const color = css.getPropertyValue("--text-2").trim();
    selectionRef.current = [];
    setSelection([]);
    const esc = (v: unknown) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c]!,
      );
    const periods = [...new Set(rows.map((r) => r.period || "Undated"))].sort();
    const segments = [...new Set(rows.map((r) => r.segment))];
    const series: echarts.SeriesOption[] = [];
    const point = (r: AnalyticalRow) => ({
      name: `${r.segment} · ${r.period || "Undated"}`,
      value:
        type === "scatter"
          ? [r.denominator, r.value]
          : type === "heatmap"
            ? [
                periods.indexOf(r.period || "Undated"),
                segments.indexOf(r.segment),
                r.value,
              ]
            : r.value,
      rowId: r.id,
    });
    if (type === "heatmap")
      series.push({
        name: label,
        type: "heatmap",
        data: rows.map((r) => ({
          ...point(r),
          value: [
            periods.indexOf(r.period || "Undated"),
            segments.indexOf(r.segment),
            r.value,
          ],
        })),
      });
    else if (type === "scatter")
      series.push({
        name: label,
        type: "scatter",
        data: rows
          .filter((r) => r.value != null && r.denominator != null)
          .map((r) => ({ ...point(r), value: [r.denominator!, r.value!] })),
        symbolSize: 10,
      });
    else
      for (const segment of segments) {
        const own = rows.filter((r) => r.segment === segment);
        const data = periods.map((period) => {
          const r = own.find((r) => (r.period || "Undated") === period);
          return r ? point(r) : { value: null };
        });
        series.push({
          name: segment,
          type: type as "bar" | "line",
          data,
          connectNulls: false,
          showSymbol: true,
          symbolSize: 6,
        });
        if (comparison && overlay)
          series.push({
            name: `${segment} · comparison`,
            type: "line",
            data: periods.map(
              (period) =>
                own.find((r) => (r.period || "Undated") === period)?.prior ??
                null,
            ),
            lineStyle: { type: "dashed" },
            symbol: "none",
          });
      }
    const values = rows
      .filter((r) => r.value != null)
      .map((r) => Number(r.value));
    chart.setOption({
      animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      color: [accent, "#0891b2", "#7c3aed", "#d97706", "#64748b", "#059669"],
      backgroundColor: "transparent",
      textStyle: { color },
      aria: { enabled: true, description: `${label} by period and group` },
      grid: { left: 65, right: 25, top: 45, bottom: zoom ? 85 : 40 },
      legend: { type: "scroll", textStyle: { color }, top: 0 },
      tooltip: {
        trigger: type === "line" || type === "bar" ? "axis" : "item",
        confine: true,
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params];
          return list
            .map((item: any) => {
              const row = rows.find((r) => r.id === item.data?.rowId);
              return row
                ? `${esc(row.segment)} · ${row.period || "Undated"}<br/>${esc(label)}: ${esc(format(row.value))}${denominators ? `<br/>Denominator: ${row.denominator ?? "n/a"} · Source records: ${row.records}` : ""}`
                : `${esc(item.seriesName)}: ${esc(format(item.value))}`;
            })
            .join("<br/>");
        },
      },
      xAxis:
        type === "scatter"
          ? { type: "value", name: "Denominator", axisLabel: { color } }
          : { type: "category", data: periods, axisLabel: { color } },
      yAxis:
        type === "heatmap"
          ? { type: "category", data: segments, axisLabel: { color } }
          : {
              type: "value",
              axisLabel: { color, formatter: (v: number) => format(v) },
              splitLine: {
                lineStyle: { color: css.getPropertyValue("--hairline").trim() },
              },
            },
      dataZoom: zoom
        ? [{ type: "inside" }, { type: "slider", height: 18, bottom: 8 }]
        : [],
      toolbox: {
        right: 5,
        feature: { brush: { type: ["lineX", "rect", "clear"] }, restore: {} },
      },
      brush: {
        xAxisIndex: type === "scatter" ? undefined : 0,
        brushMode: "multiple",
        throttleType: "debounce",
        throttleDelay: 200,
      },
      ...(type === "heatmap"
        ? {
            visualMap: {
              min: Math.min(...values, 0),
              max: Math.max(...values, 1),
              show: false,
              inRange: { color: ["#eff6ff", accent] },
            },
          }
        : {}),
      series,
    });
    const select = (next: AnalyticalRow[]) => {
      selectionRef.current = next;
      setSelection(next);
      onSelect(next);
    };
    chart.on("click", (event: any) => {
      const row = rows.find((r) => r.id === event.data?.rowId);
      if (row) {
        const old = selectionRef.current;
        select(
          old.some((r) => r.id === row.id)
            ? old.filter((r) => r.id !== row.id)
            : [...old, row],
        );
      }
    });
    chart.on("brushSelected", (event: any) => {
      const ids = new Set<string>();
      for (const batch of event.batch || [])
        for (const selected of batch.selected || []) {
          const data = (series[selected.seriesIndex] as any)?.data || [];
          for (const index of selected.dataIndex || [])
            if (data[index]?.rowId) ids.add(data[index].rowId);
        }
      select(rows.filter((r) => ids.has(r.id)));
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [
    rows,
    label,
    format,
    type,
    overlay,
    denominators,
    zoom,
    comparison,
    onSelect,
  ]);
  return (
    <div className="advanced-chart">
      <div className="advanced-actions">
        <label>
          Chart
          <DropdownField value={type} onChange={(e) => setType(e.target.value)}>
            <option value="line">Trend</option>
            <option value="bar">Columns</option>
            <option value="heatmap">Heatmap</option>
            <option value="scatter">Value vs denominator</option>
          </DropdownField>
        </label>
        {comparison && (
          <label>
            <input
              type="checkbox"
              checked={overlay}
              onChange={(e) => setOverlay(e.target.checked)}
            />
            Comparison overlay
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={denominators}
            onChange={(e) => setDenominators(e.target.checked)}
          />
          Denominators
        </label>
        <label>
          <input
            type="checkbox"
            checked={zoom}
            onChange={(e) => setZoom(e.target.checked)}
          />
          Zoom & date brush
        </label>
        <button
          onClick={() => {
            selectionRef.current = [];
            setSelection([]);
            onSelect([]);
            if (ref.current)
              echarts
                .getInstanceByDom(ref.current)
                ?.dispatchAction({ type: "brush", areas: [] });
          }}
        >
          Clear chart selection
        </button>
        <span>
          {selection.length} points selected · click points or drag a brush
        </span>
      </div>
      <div
        ref={ref}
        className="chart"
        style={{ height: 340 }}
        role="img"
        aria-label={`${label} analytical chart`}
      />
    </div>
  );
}
