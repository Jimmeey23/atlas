import { DropdownField } from "./ui/DropdownField";
import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { Download, RotateCcw, Table2, ChartNoAxesCombined } from "lucide-react";
import { query, type Row } from "../data/duckdb";
import {
  comparison,
  context,
  metricFacts,
  monthlyHistorySQL,
} from "../data/analytics";
import { metrics, metricSQL, contributorPredicate } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { useStore } from "../state/store";
import { MetricCard } from "./MetricCard";
import { Register } from "./Register";
import { exportCSV } from "./exports";
import type { TreeRow } from "./NestedTable";
import { GroupByPicker, usePersistentGroups } from "./ui/GroupByPicker";
import { useGroupFields } from "../data/group-registry";
import { groupable, groupColumn } from "../data/group-fields";
const kpis = [
  "sessions",
  "attendance",
  "fill_rate",
  "avg_class_size_incl",
  "revenue",
  "revenue_per_session",
  "show_up_rate",
  "empty_session_rate",
  "capacity",
  "late_cancel_rate",
  "rev_pas",
  "lost_revenue",
];
const chartMetrics = [
  "fill_rate",
  "avg_class_size_incl",
  "attendance",
  "revenue_per_session",
];
const slotDefaults = ["location", "format", "day", "time"];
const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function StudioOperationsOverview({
  version,
  onDrill,
}: {
  version: string | number;
  onDrill: (r: TreeRow) => void;
}) {
  const s = useStore();
  const [data, setData] = useState<{
    total: Row;
    previous: Row;
    trend: Row[];
    heat: Row[];
    slots: Row[];
  }>({ total: {}, previous: {}, trend: [], heat: [], slots: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("weekly");
  const [metric, setMetric] = useState("fill_rate");
  const [minimum, setMinimum] = useState(1);
  const [table, setTable] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const [groups, setGroups] = usePersistentGroups("ops-overview-classes", slotDefaults);
  const groupFields = useGroupFields("sessions", groups);
  const slotGroups = useMemo(() => {
    const valid = [...new Set(groups)].filter(groupable);
    return valid.length ? valid : slotDefaults;
  }, [groups]);
  const custom = slotGroups.join() !== slotDefaults.join();
  const drillFields = mode === "weekly" ? ["day", "time"] : slotGroups;
  const slotLabel = (r: Row) => slotGroups.map((f) => r[f] ?? "Unspecified").join(" · ");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData({ total: {}, previous: {}, trend: [], heat: [], slots: [] });
    const facts = metricFacts(s.filters, "sessions", s.transient),
      ctx = context(s.filters, s.transient);
    const prior = comparison(s.filters, s.compare);
    Promise.all([
      query(`SELECT ${metricSQL(kpis, ctx)},COUNT(*) AS n FROM ${facts}`),
      s.compare === "none"
        ? Promise.resolve([])
        : query(
            `SELECT ${metricSQL(kpis, context(prior, s.transient))} FROM ${metricFacts(prior, "sessions", s.transient)}`,
          ),
      query(monthlyHistorySQL(1, kpis, s.filters, s.transient)),
      query(
        `SELECT day,time,${metricSQL([...chartMetrics, "sessions"], ctx)} FROM ${facts} GROUP BY day,time ORDER BY time,day`,
      ),
      query(
        custom
          ? `SELECT ${slotGroups.map((f) => `${groupColumn(f)} AS "${f}"`).join(",")},${metricSQL([...chartMetrics, "sessions"], ctx)} FROM ${facts} GROUP BY ${slotGroups.map(groupColumn).join(",")}`
          : `SELECT location,format,day,time,${metricSQL([...chartMetrics, "sessions"], ctx)} FROM ${facts} GROUP BY location,format,day,time`,
      ),
    ])
      .then(([total, previous, trend, heat, slots]) => {
        if (active)
          setData({
            total: total[0] || {},
            previous: previous[0] || {},
            trend,
            heat,
            slots,
          });
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [version, s.filters, s.transient, s.compare, s.rate, slotGroups.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(
    () =>
      (mode === "weekly" ? data.heat : data.slots).filter(
        (r) => Number(r.sessions) >= minimum && r[metric] != null,
      ),
    [data, mode, minimum, metric],
  );
  function drill(row: Row, fields: string[], id?: string) {
    onDrill({
      id: "ops-overview:" + JSON.stringify(fields.map((f) => row[f])),
      label: fields.length
        ? fields.map((f) => row[f] ?? "Unspecified").join(" · ")
        : metrics[id || metric].label,
      source: "sessions",
      filters: s.filters,
      metrics: id ? [id] : [...chartMetrics, "sessions"],
      predicate: id
        ? contributorPredicate(id, context(s.filters, s.transient))
        : undefined,
      path: fields.map((field) => ({
        field,
        value: String(row[field] ?? "Unspecified"),
      })),
      values: row,
      children: [],
    });
  }
  useEffect(() => {
    if (!ref.current || table || loading || error || !rows.length) return;
    const instance = echarts.init(ref.current);
    chart.current = instance;
    const css = getComputedStyle(document.documentElement);
    const text = css.getPropertyValue("--text-2").trim() || "#64748b",
      line = css.getPropertyValue("--hairline").trim() || "#e2e8f0",
      accent = css.getPropertyValue("--attendance").trim() || "#4f46e5";
    const times = [...new Set(rows.map((r) => String(r.time || "")))]
      .filter(Boolean)
      .sort();
    const values = rows.map((r) => Number(r[metric]));
    const max = Math.max(...values, 1);
    const tooltip = (p: any) => {
      const r = rows[p.data?.[3] ?? p.data?.[4] ?? 0];
      return r
        ? [
            mode === "classes" && custom ? slotLabel(r) : `${r.format || r.day} · ${r.time || ""}`,
            mode === "classes" && custom ? "" : r.location || "",
            `${metrics[metric].label}: ${fmt(metric, r[metric])}`,
            `${fmt("sessions", r.sessions)} sessions`,
          ]
            .filter(Boolean)
            .join("\n")
        : "";
    };
    instance.setOption(
      mode === "weekly"
        ? {
            animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
            grid: { left: 105, right: 35, top: 18, bottom: 90 },
            tooltip: { renderMode: "richText", formatter: tooltip },
            xAxis: {
              type: "category",
              data: times,
              axisLabel: { color: text, rotate: times.length > 12 ? 45 : 0 },
              axisLine: { lineStyle: { color: line } },
            },
            yAxis: {
              type: "category",
              data: days,
              axisLabel: { color: text },
              splitArea: { show: false },
              axisLine: { show: false },
            },
            visualMap: {
              dimension: 2,
              min: 0,
              max,
              orient: "horizontal",
              left: "center",
              bottom: 0,
              calculable: true,
              inRange: { color: ["#eef2ff", "#a5b4fc", "#6366f1", "#3730a3"] },
              text: [fmt(metric, max), fmt(metric, 0)],
              textStyle: { color: text },
            },
            series: [
              {
                type: "heatmap",
                data: rows
                  .map((r, i) => [
                    times.indexOf(String(r.time)),
                    days.indexOf(String(r.day)),
                    Number(r[metric]),
                    i,
                  ])
                  .filter((d) => d[0] >= 0 && d[1] >= 0),
                itemStyle: {
                  borderColor:
                    css.getPropertyValue("--surface-1").trim() || "#fff",
                  borderWidth: 4,
                  borderRadius: 4,
                },
                emphasis: {
                  itemStyle: { shadowBlur: 10, shadowColor: "#6366f144" },
                },
              },
            ],
          }
        : {
            animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
            grid: { left: 80, right: 30, top: 30, bottom: 85 },
            tooltip: { renderMode: "richText", formatter: tooltip },
            xAxis: {
              type: "value",
              name: "Average attendance",
              nameLocation: "middle",
              nameGap: 35,
              axisLabel: { color: text },
              splitLine: { lineStyle: { color: line } },
            },
            yAxis: {
              type: "value",
              name: metrics[metric].label,
              axisLabel: {
                color: text,
                formatter: (v: number) => fmt(metric, v),
              },
              splitLine: { lineStyle: { color: line } },
            },
            dataZoom: [
              { type: "inside" },
              { type: "slider", bottom: 0, height: 20 },
            ],
            series: [
              {
                type: "scatter",
                data: rows
                  .filter((r) => r.avg_class_size_incl != null)
                  .map((r) => [
                    Number(r.avg_class_size_incl),
                    Number(r[metric]),
                    Number(r.sessions),
                    rows.indexOf(r),
                  ]),
                symbolSize: (v: number[]) =>
                  Math.min(42, Math.max(9, Math.sqrt(v[2]) * 5)),
                itemStyle: { color: accent, opacity: 0.7 },
                emphasis: {
                  itemStyle: {
                    opacity: 1,
                    borderColor: "#fff",
                    borderWidth: 2,
                  },
                },
              },
            ],
          },
    );
    instance.on("click", (p: any) => {
      const row = rows[p.data?.[3]];
      if (row) drill(row, drillFields);
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, [rows, metric, mode, table, loading, error, s.filters, s.transient, s.theme, slotGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div
        className="metric-strip eight ops-metric-cards"
        aria-label="Studio operations metrics"
      >
        {kpis.map((id) => (
          <MetricCard
            key={id}
            id={id}
            value={loading ? null : data.total[id]}
            previous={data.previous[id]}
            trend={data.trend}
            n={Number(data.total.n || 0)}
            compare={s.compare !== "none"}
            onDrill={() => drill(data.total, [], id)}
          />
        ))}
      </div>
      <Register
        index="01"
        title="Schedule demand & performance"
        subtitle="Compare weekday and time-slot demand, or inspect individual recurring classes."
      >
        <div className="ops-chart-controls">
          <div className="ops-segmented" aria-label="Chart view">
            {[
              ["weekly", "Weekly demand"],
              ["classes", "Class performance"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label>
            Measure
            <DropdownField value={metric} onChange={(e) => setMetric(e.target.value)}>
              {chartMetrics.map((id) => (
                <option key={id} value={id}>
                  {metrics[id].label}
                </option>
              ))}
            </DropdownField>
          </label>
          {mode === "classes" && <GroupByPicker name="Class performance" value={groups} onChange={setGroups}
            fields={groupFields} min={1} max={4} defaults={slotDefaults} />}
          <label>
            Minimum sessions
            <input
              type="number"
              min={1}
              value={minimum}
              onChange={(e) => setMinimum(Math.max(1, Number(e.target.value)))}
            />
          </label>
          <button
            aria-label={table ? "Show chart" : "Show chart data"}
            aria-pressed={table}
            onClick={() => setTable(!table)}
          >
            {table ? <ChartNoAxesCombined size={15} /> : <Table2 size={15} />}{" "}
            {table ? "Chart" : "Data"}
          </button>
          <button
            onClick={() =>
              chart.current?.dispatchAction({
                type: "dataZoom",
                start: 0,
                end: 100,
              })
            }
          >
            <RotateCcw size={14} /> Reset zoom
          </button>
          <button onClick={() => exportCSV("studio-demand-" + mode, rows)}>
            <Download size={14} /> Export
          </button>
        </div>
        {loading ? (
          <p className="ops-status" role="status">
            Loading studio performance…
          </p>
        ) : error ? (
          <p className="ops-status" role="alert">
            {error}
          </p>
        ) : !rows.length ? (
          <p className="ops-status">
            No sessions match this scope and minimum sample.
          </p>
        ) : table ? (
          <div className="ops-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  {[
                    ...(mode === "classes" && custom
                      ? slotGroups.map((f) => groupFields.find((x) => x.field === f)?.label ?? f)
                      : ["Class / studio", "Day", "Time"]),
                    "Sessions",
                    metrics[metric].label,
                    "",
                  ].map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {mode === "classes" && custom ? slotGroups.map((f) => <td key={f}>{String(r[f] ?? "Unspecified")}</td>) : <>
                    <td>
                      {r.format || "All classes"}
                      {r.location ? " · " + r.location : ""}
                    </td>
                    <td>{String(r.day || "—")}</td>
                    <td>{String(r.time || "—")}</td></>}
                    <td>{fmt("sessions", r.sessions)}</td>
                    <td>{fmt(metric, r[metric])}</td>
                    <td>
                      <button onClick={() => drill(r, drillFields)}>
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            ref={ref}
            className="ops-demand-chart"
            role="img"
            aria-label={`${metrics[metric].label} by ${mode === "weekly" ? "weekday and time slot" : "recurring class"}. Use Data for keyboard-accessible records.`}
          />
        )}
        <p className="ops-chart-note">
          {mode === "weekly"
            ? "Select a weekday / time cell to inspect its sessions."
            : "Select a class to inspect its sessions. Bubble size shows session count; scroll or drag the zoom control to explore."}
        </p>
      </Register>
    </>
  );
}
