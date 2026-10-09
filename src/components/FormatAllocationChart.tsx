import { DropdownField } from "./ui/DropdownField";
import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { query, type Row } from "../data/duckdb";
import { context, metricFacts } from "../data/analytics";
import { metricSQL } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { useStore } from "../state/store";
import { ChartControls } from "./ChartControls";
import { formatAllocation } from "../data/format-allocation";
import "./FormatAllocationChart.css";

export function FormatAllocationChart({
  version,
}: {
  version: string | number;
}) {
  const s = useStore();
  const [records, setRecords] = useState<Row[]>([]);
  const [measure, setMeasure] = useState<"attendance" | "revenue">(
    "attendance",
  );
  const [minimum, setMinimum] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setRecords([]);
    query(
      `SELECT COALESCE(format_group,'Unspecified') AS format_group,${metricSQL(["sessions", "attendance", "revenue"], context(s.filters, s.transient))} FROM ${metricFacts(s.filters, "sessions", s.transient)} GROUP BY 1 ORDER BY 1`,
    )
      .then((rows) => {
        if (active) setRecords(rows);
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version, s.filters, s.transient, s.rate]);
  const rows = useMemo(
    () =>
      formatAllocation(records, measure).filter(
        (r) => Number(r.sessions) >= minimum,
      ),
    [records, measure, minimum],
  );
  const exportRows = useMemo(
    () =>
      rows.map((r) => ({
        Format: r.format_group,
        Sessions: r.sessions,
        Attendance: r.attendance,
        "Session revenue": r.revenue,
        "Timetable share": fmt("fill_rate", r.supply_share),
        [measure === "attendance" ? "Attendance share" : "Revenue share"]: fmt(
          "fill_rate",
          r.demand_share,
        ),
        "Share gap (pp)": r.gap_pp,
      })),
    [rows, measure],
  );
  useEffect(() => {
    if (!ref.current || loading || error || !rows.length) return;
    const chart = echarts.init(ref.current);
    const css = getComputedStyle(document.documentElement);
    const color = (token: string) => css.getPropertyValue("--" + token).trim();
    const demandLabel =
      measure === "attendance" ? "Attendance share" : "Revenue share";
    chart.setOption({
      animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      grid: { left: 110, right: 35, top: 30, bottom: 55, containLabel: true },
      legend: { bottom: 0, textStyle: { color: color("text-2") } },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        renderMode: "richText",
        formatter: (params: { dataIndex: number }[]) => {
          const r = rows[params[0]?.dataIndex];
          if (!r) return "";
          return `${r.format_group}\nTimetable share: ${fmt("fill_rate", r.supply_share)}\n${demandLabel}: ${fmt("fill_rate", r.demand_share)}\nShare gap: ${r.gap_pp == null ? "—" : Number(r.gap_pp).toFixed(1) + "pp"}\n${fmt("sessions", r.sessions)} sessions · ${fmt(measure, r[measure])} ${measure === "attendance" ? "attended seats" : "session revenue"}`;
        },
      },
      xAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { formatter: "{value}%", color: color("text-3") },
        splitLine: { lineStyle: { color: color("hairline") } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: rows.map((r) => r.format_group),
        axisLabel: { color: color("text-2") },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          name: "Timetable share",
          type: "bar",
          barMaxWidth: 24,
          data: rows.map((r) =>
            r.supply_share == null ? null : Number(r.supply_share) * 100,
          ),
          itemStyle: {
            color: color("text-3"),
            opacity: 0.5,
            borderRadius: [0, 4, 4, 0],
          },
        },
        {
          name: demandLabel,
          type: "bar",
          barMaxWidth: 24,
          data: rows.map((r) =>
            r.demand_share == null ? null : Number(r.demand_share) * 100,
          ),
          itemStyle: {
            color: color(measure === "attendance" ? "attendance" : "revenue"),
            borderRadius: [0, 4, 4, 0],
          },
        },
      ],
    });
    chart.on("click", (p: { dataIndex: number }) => {
      const r = rows[p.dataIndex];
      if (r) s.cross("format_group", String(r.format_group));
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [rows, measure, loading, error, s.theme, s.cross]);
  return (
    <div className="chart-surface">
      <div className="format-allocation-controls">
        <label>
          Compare timetable with{" "}
          <DropdownField
            value={measure}
            onChange={(e) =>
              setMeasure(e.target.value as "attendance" | "revenue")
            }
          >
            <option value="attendance">Attendance share</option>
            <option value="revenue">Revenue share</option>
          </DropdownField>
        </label>
        <label>
          Minimum sessions{" "}
          <input
            type="number"
            min={1}
            value={minimum}
            onChange={(e) =>
              setMinimum(Math.max(1, Number(e.target.value) || 1))
            }
          />
        </label>
      </div>
      <ChartControls rows={exportRows} title="Timetable allocation vs demand" />
      {loading ? (
        <p role="status">Comparing timetable allocation…</p>
      ) : error ? (
        <p role="alert">Chart unavailable: {error}</p>
      ) : !rows.length ? (
        <p className="empty-state">
          No formats meet this scope and minimum sample.
        </p>
      ) : (
        <div
          className="chart"
          ref={ref}
          role="img"
          aria-label="Format timetable share compared with attendance or revenue share"
          style={{ height: Math.max(300, rows.length * 85) }}
        />
      )}
      <p className="small">
        Timetable share is each format’s proportion of scheduled sessions.
        Compare it with attended seats or session-attributed revenue in the
        selected period. Shares use all formats in scope, including those below
        the minimum sample. Click a bar to filter; use the data view for exact
        values.
      </p>
    </div>
  );
}
