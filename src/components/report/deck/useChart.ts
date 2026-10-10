import { useEffect, useRef } from "react";
import * as echarts from "echarts";

/** App chart colours, read from the live theme so report charts match the dashboard. */
export function chartPalette() {
  const css = getComputedStyle(document.documentElement);
  const v = (k: string) => css.getPropertyValue(`--${k}`).trim();
  return { accent: v("accent"), accent2: v("accent-2") || v("growth"), pos: v("pos"), neg: v("neg"), warn: v("warn"), text1: v("text-1"), text2: v("text-2"), text3: v("text-3"),
    hairline: v("hairline"), surface: v("surface-3"), series: [v("accent"), v("revenue"), v("growth"), v("people"), v("risk"), v("attendance")].filter(Boolean) };
}
export function axisStyle() {
  const c = chartPalette();
  return {
    // Baseline only; gridlines barely there so the data carries the ink.
    axisLine: { lineStyle: { color: c.hairline } }, axisTick: { show: false },
    axisLabel: { color: c.text3, fontFamily: "Instrument Sans", fontSize: 10.5, margin: 10 },
    splitLine: { lineStyle: { color: c.hairline, opacity: .45 } },
  };
}
export function tooltipStyle() {
  const c = chartPalette();
  return { backgroundColor: c.surface, borderColor: c.hairline, textStyle: { color: c.text1, fontSize: 12 }, padding: [8, 12], extraCssText: "border-radius:12px;box-shadow:0 12px 32px -8px rgba(15,23,42,.22)" };
}

/** Mounts one ECharts instance on the returned ref; re-applies the option whenever `deps` change. */
export function useChart(build: () => echarts.EChartsOption | null, deps: unknown[], onClick?: (params: { name: string; dataIndex: number; seriesName?: string }) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const click = useRef(onClick); click.current = onClick;
  useEffect(() => {
    if (!ref.current) return;
    const instance = echarts.init(ref.current, undefined, { renderer: "svg" });
    chart.current = instance;
    instance.on("click", params => click.current?.(params as never));
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(ref.current);
    return () => { observer.disconnect(); instance.dispose(); chart.current = null; };
  }, []);
  useEffect(() => {
    const option = build();
    if (option) chart.current?.setOption({ animationDuration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 480, textStyle: { fontFamily: "Instrument Sans" }, ...option }, true);
  }, deps);
  return { ref, chart };
}
