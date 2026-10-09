import { instructorKey, instructorPortraits } from "../data/instructorPortraits";
import { ChartControls } from "./ChartControls";
import { usePreferences } from "../state/preferences";
import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { LinePath, AreaClosed } from "@visx/shape";
import { scaleLinear } from "@visx/scale";
import { Download, Table2, ChartNoAxesCombined } from "lucide-react";
import { query, quote, type Row } from "../data/duckdb";
import { where, context, metricFacts, today, type Analysis } from "../data/analytics";
import { metricSQL } from "../semantics/metrics";
import { fmt, formatField } from "../semantics/formats";
import { useStore } from "../state/store";
import { revenueBridge } from "../semantics/aggregations";
import { bookingOutcomeCase } from "../semantics/booking-outcomes";
import { metrics } from "../semantics/metrics";
import { blueprints } from "../data/blueprints";
import { download, exportCSV } from "./exports";
export function Pulse({ data }: { data: Analysis }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);
  const [days, setDays] = useState<Row[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const start = useRef<number | null>(null);
  const state = useStore();
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    if (!data.count && !Number(data.total.sales_records)) {
      setDays([]);
      return;
    }
    query(
      `SELECT COALESCE(s.date,p.date) AS date,s.attendance,s.revenue,s.fill_rate,s.sessions,p.gross_revenue FROM (SELECT date,${metricSQL(["attendance", "revenue", "fill_rate", "sessions"], context())} FROM sessions${where(state.filters, "sessions")} GROUP BY date) s FULL OUTER JOIN (SELECT date,${metricSQL(["gross_revenue"], context())} FROM sales${where(state.filters, "sales")} GROUP BY date) p ON s.date=p.date ORDER BY date DESC LIMIT 90`,
    )
      .then((r) => {
        if (active) setDays([...r].reverse());
      })
      .catch(() => {
        if (active) setDays([]);
      });
    return () => {
      active = false;
    };
  }, [state.filters, state.transient, data]);
  const x = scaleLinear({
    domain: [0, Math.max(days.length - 1, 1)],
    range: [0, width],
  });
  const y = scaleLinear({
    domain: [0, Math.max(...days.map((d) => Number(d.attendance)), 1) * 1.15],
    range: [143, 10],
  });
  const yr = scaleLinear({
    domain: [0, Math.max(...days.map((d) => Number(d.gross_revenue)), 1) * 1.15],
    range: [143, 10],
  });
  const focused = hover == null ? null : days[hover];
  return (
    <div className="pulse-wrapper">
      <ChartControls rows={days} title="Studio pulse" />
      <div className="pulse-summary">
        <div>
          <div className="pulse-heading">
            <span className="dot positive" />
            Payments collected, in motion
          </div>
          <div className="pulse-total number">
            {fmt("gross_revenue", focused ? focused.gross_revenue : data.total.gross_revenue)}
            <span className="pulse-suffix">
              {focused ? focused.date : "in this period"}
            </span>
          </div>
        </div>
        <div className="pulse-legend">
          <span>
            <i
              className="legend-line"
              style={{ background: "var(--attendance)" }}
            />
            Attendance
          </span>
          <span>
            <i
              className="legend-line"
              style={{ background: "var(--revenue)" }}
            />
            Gross collections
          </span>
          <span className="small">Drag to select a date range</span>
        </div>
      </div>
      <div
        className="pulse"
        ref={ref}
        onMouseMove={(e) => {
          if (days.length)
            setHover(
              Math.max(
                0,
                Math.min(
                  days.length - 1,
                  Math.round(
                    ((e.clientX -
                      e.currentTarget.getBoundingClientRect().left) /
                      width) *
                      (days.length - 1),
                  ),
                ),
              ),
            );
        }}
        onMouseLeave={() => setHover(null)}
        onMouseDown={() => {
          start.current = hover;
        }}
        onMouseUp={() => {
          if (start.current != null && hover != null) {
            const a = Math.min(start.current, hover),
              b = Math.max(start.current, hover);
            state.filter({
              from: String(days[a].date),
              to: String(days[b].date),
            });
          }
          start.current = null;
        }}
      >
        <svg
          role="img"
          aria-label="Daily attendance and gross collections pulse"
          viewBox={`0 0 ${width} 155`}
        >
          <line x1="0" y1="143" x2={width} y2="143" stroke="var(--hairline)" />
          {days.length > 0 && (
            <>
              <AreaClosed
                data={days}
                x={(_, i) => x(i)}
                y={(d) => y(Number(d.attendance))}
                yScale={y}
                fill="var(--attendance)"
                fillOpacity={0.14}
              />
              <LinePath
                data={days}
                x={(_, i) => x(i)}
                y={(d) => y(Number(d.attendance))}
                stroke="var(--attendance)"
                strokeOpacity={0.7}
                strokeWidth={1.3}
              />
              <LinePath
                data={days}
                x={(_, i) => x(i)}
                y={(d) => yr(Number(d.gross_revenue))}
                stroke="var(--revenue)"
                strokeWidth={1.7}
                pathLength={1000}
                strokeDasharray="1000"
                style={{
                  animation: sessionStorage.getItem("floor-pulse-seen")
                    ? undefined
                    : "draw var(--m-ribbon) var(--ease)",
                }}
              />
              {days.map((d, i) => (
                <line
                  key={String(d.date)}
                  x1={x(i)}
                  y1={150}
                  x2={x(i)}
                  y2={150 - Number(d.fill_rate || 0) * 6}
                  stroke="var(--attendance)"
                  opacity={0.5}
                />
              ))}
              {hover != null && (
                <>
                  <line
                    x1={x(hover)}
                    x2={x(hover)}
                    y1="0"
                    y2="155"
                    stroke="var(--text-3)"
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={x(hover)}
                    cy={yr(Number(days[hover]?.revenue || 0))}
                    r="4"
                    fill="var(--revenue)"
                  />
                </>
              )}
            </>
          )}
        </svg>
        {!days.length && (
          <span className="small">No daily observations in this period.</span>
        )}
      </div>
      <div className="chart-labels">
        <span>{days[0]?.date}</span>
        <span>
          {focused
            ? `${fmt("attendance", focused.attendance)} attendees / ${fmt("fill_rate", focused.fill_rate)} fill`
            : "Daily attendance and payments collected"}
        </span>
        <span>{days.at(-1)?.date}</span>
      </div>
    </div>
  );
}
function colors() {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    [
      "attendance",
      "revenue",
      "growth",
      "people",
      "risk",
      "text-1",
      "text-2",
      "text-3",
      "hairline",
      "surface-3",
      "accent",
      "accent-2",
    ].map((k) => [k, css.getPropertyValue("--" + k).trim()]),
  );
}
export function Chart({
  tab,
  data,
  secondary = false,
  salesActivity = false,
}: {
  tab: number;
  data: Analysis;
  secondary?: boolean;
  salesActivity?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.ECharts | null>(null);
  const [table, setTable] = useState(false);
  const [chartRows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const state = useStore();
  const prefs = usePreferences((s) => s.preferences);
  const bp = blueprints[tab];
  const chartTitle = tab === 14 && secondary ? "Format performance relationship" : tab === 4 && !salesActivity ? (secondary ? "Sales relationship" : "Revenue by category") : bp.chartTitle;
  useEffect(() => {
    let active = true;
    if (!data.count) {
      setRows([]);
      return;
    }
    const w = where(state.filters, bp.source);
    async function load() {
      try {
        let r: Row[] = [];
        if (secondary)
          r = data.groups
            .filter((g) => Number(g.level) === 2 ** (bp.groups.length - 1) - 1)
            .slice(0, 80);
        else if (tab === 12) {
          // Patterns need every booking as the denominator, so lift the tab's late-only restriction here.
          const all = w.replace(/ AND late_cancelled>0/, "").replace(/ WHERE late_cancelled>0$/, "");
          r = await query(
            `SELECT day, time, COUNT(*) FILTER (WHERE late_cancelled>0) AS late, COUNT(*) AS bookings,
              COUNT(DISTINCT member_id) FILTER (WHERE late_cancelled>0) AS members,
              COUNT(DISTINCT COALESCE(session_id, date || time || COALESCE(location,''))) FILTER (WHERE late_cancelled>0) AS classes
             FROM bookings${all}${all ? " AND" : " WHERE"} day IS NOT NULL AND time IS NOT NULL GROUP BY day, time`,
          );
        }
        else if (tab === 1 || tab === 7)
          r = await query(
            tab === 1
              ? `SELECT strftime(date_trunc('week',TRY_CAST(date AS DATE)),'%Y-%m-%d') AS month,${metricSQL(["sessions", "fill_rate"], context())},COUNT(*) AS n FROM sessions${w} GROUP BY 1 ORDER BY 1`
              : `SELECT strftime(date_trunc('week',TRY_CAST(date AS DATE)),'%Y-%m-%d') AS month,${metricSQL(["bookings", "effective_attendance"], context())},COUNT(*) FILTER (WHERE booking_outcome='attended') AS booking_attended,COUNT(*) FILTER (WHERE booking_outcome='cancelled') AS booking_cancelled,COUNT(*) FILTER (WHERE booking_outcome='late') AS booking_late_cancelled,COUNT(*) FILTER (WHERE booking_outcome='no_show') AS booking_no_shows,COUNT(*) FILTER (WHERE booking_outcome='pending') AS booking_pending,COUNT(*) AS n FROM (SELECT *,${bookingOutcomeCase} AS booking_outcome FROM bookings${w}) GROUP BY 1 ORDER BY 1`,
          );
        else if (tab === 4 && !secondary && salesActivity) {
          r = await query(
            `SELECT date,${metricSQL(["gross_revenue", "transactions", "aov"], context())},COUNT(*) AS n FROM sales${where(state.filters, "sales")} GROUP BY date ORDER BY date`,
          );
        }
        else if (tab === 4 && !secondary) {
          r = await query(
            `SELECT month,category,${metricSQL(["gross_revenue"], context())},COUNT(*) AS n FROM sales${where(state.filters, "sales")} GROUP BY month,category ORDER BY month`,
          );
          if (!r.length)
            r = await query(
              `SELECT month,'Collections' AS category,${metricSQL(["gross_revenue", "net_revenue"], context())},COUNT(*) AS n FROM sales${where(state.filters, "sales")} GROUP BY month ORDER BY month`,
            );
          if (!r.length)
            r = await query(
              `SELECT month,'Sessions' AS category,${metricSQL(["revenue", "attendance"], context())},COUNT(*) AS n FROM sessions${where(state.filters, "sessions")} GROUP BY month ORDER BY month`,
            );
        }
        else if (tab === 5) {
          // Twelve completed first-visit months, same non-date filters: volume and each outcome rate per cohort.
          const months = where({ ...state.filters, from: "", to: "" }, "new");
          r = await query(
            `SELECT month, COUNT(*) FILTER (WHERE is_new) AS newcomers,
              COUNT(*) FILTER (WHERE is_new AND visits_post>0)::DOUBLE/NULLIF(COUNT(*) FILTER (WHERE is_new),0) AS second_visit_rate,
              COUNT(*) FILTER (WHERE is_new AND conversion='Converted')::DOUBLE/NULLIF(COUNT(*) FILTER (WHERE is_new),0) AS conversion_rate,
              COUNT(*) FILTER (WHERE is_new AND retention='Retained')::DOUBLE/NULLIF(COUNT(*) FILTER (WHERE is_new),0) AS retention_rate
             FROM new${months}${months ? " AND" : " WHERE"} month IS NOT NULL AND month < ${quote(today().slice(0, 7))} GROUP BY month ORDER BY month DESC LIMIT 12`,
          ).then((rows) => [...rows].reverse());
        }
        else if (tab === 8)
          r = await query(
            `SELECT COALESCE(source,'Unknown') AS source,COALESCE(stage,'Unspecified stage') AS stage,CASE WHEN lower(trim(stage))='membership sold' THEN 'Membership sold' WHEN lower(trim(stage))='trial completed' THEN 'Trial completed' ELSE COALESCE(status,'Open') END AS outcome,COUNT(*) AS n FROM leads${w} GROUP BY source,stage,status ORDER BY n DESC LIMIT 35`,
          );
        else if (tab === 9)
          r = await query(
            `SELECT class_no AS visit,COUNT(*) AS n FROM checkins${w} GROUP BY visit HAVING visit BETWEEN 1 AND 15 ORDER BY visit`,
          );
        else if (tab === 6)
          r = await query(
            `SELECT member,AVG(days_absent) AS days, ${metricSQL(["utilisation"], context())},SUM(revenue) AS revenue,COUNT(*) AS n FROM lapsed${w} GROUP BY member HAVING days IS NOT NULL ORDER BY revenue DESC LIMIT 1200`,
          );
        else if (tab === 10)
          r = await query(
            `SELECT trainer,${metricSQL(["contribution", "payroll_cost", "payroll_revenue", "contribution_margin"], context())},COUNT(*) AS n FROM payroll${w} GROUP BY trainer ORDER BY contribution DESC LIMIT 15`,
          );
        else if (tab === 3 || secondary)
          r = data.groups
            .filter((g) => Number(g.level) === 2 ** (bp.groups.length - 1) - 1)
            .slice(0, 80);
        else {
          const ids = [...new Set([...bp.kpis, ...bp.columns])].filter(
            (id) =>
              tab !== 0 ||
              !["new_clients", "conversion_rate", "active_base", "gross_revenue", "net_revenue"].includes(id),
          );
          const facts =
            metricFacts(state.filters, bp.source);
          const month =
            bp.source === "lapsed" ? "SUBSTR(end_date,1,7)" : "month";
          r = await query(
            `SELECT ${month} AS month,${metricSQL(ids, context())},COUNT(*) AS n FROM ${facts} GROUP BY ${month} ORDER BY month`,
          );
        }
        if (active) {
          setRows(r);
          setError("");
        }
      } catch (e) {
        if (active) setError(String(e));
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [tab, data, state.filters, state.transient, state.rate, secondary, salesActivity]);
  useEffect(() => {
    if (!ref.current || table) return;
    const c = colors();
    if (tab === 4) {
      c.revenue = c.accent;
      c.growth = c["accent-2"];
    }
    const chart = echarts.init(ref.current, null, { renderer: "canvas" });
    instance.current = chart;
    const axis = {
      axisLine: { lineStyle: { color: c.hairline } },
      axisTick: { show: false },
      axisLabel: {
        color: c["text-3"],
        fontFamily: "Instrument Sans",
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: c.hairline, type: "dashed" as const } },
    };
    let option: echarts.EChartsOption = {
      animationDuration: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 480,
      color: [c[bp.domain], c.revenue, c.growth, c.risk, c.people],
      textStyle: { fontFamily: "Instrument Sans", color: c["text-2"] },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: unknown) => formatField("value", value),
        backgroundColor: c["surface-3"],
        borderColor: c.hairline,
        textStyle: { color: c["text-1"], fontSize: 12 },
      },
      grid: { left: 48, right: 18, top: 20, bottom: 28 },
      xAxis: {
        type: "category",
        data: chartRows.map((r) => String(r.month)),
        ...axis,
      },
      yAxis: { type: "value", ...axis },
      series: [],
    };
    const primary = tab === 1 ? "sessions" : bp.kpis[0],
      percent = bp.kpis.find((id) =>
        [
          "fill_rate",
          "conversion_rate",
          "churn_rate",
          "cancellation_rate",
          "lead_conversion_rate",
          "contribution_margin",
        ].includes(id),
      );
    if ((tab === 3 || secondary) && chartRows.length) {
      const xMetric =
        tab === 3
          ? "draw_premium_pp"
          : bp.columns.find((id) => metrics[id].format === "percent") ||
            bp.columns[0];
      const yMetric =
        bp.columns.find((id) => metrics[id].format === "currency") ||
        bp.columns[1];
      const points = chartRows.filter(
        (r) => r[xMetric] != null && r[yMetric] != null,
      );
      option = {
        ...option,
        tooltip: {
          trigger: "item",
          formatter: (p: unknown) => {
            const v = p as { data: { name: string; value: number[] } };
            const name = v.data.name.replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]!));
            const photo = bp.groups[0] === "trainer" ? instructorPortraits[instructorKey(v.data.name)] : undefined;
            return `${photo ? `<img src="${photo}" alt="" width="28" height="28" style="object-fit:cover;object-position:50% 20%;border-radius:50%;vertical-align:middle;margin-right:8px"/>` : ""}${name}<br/>${metrics[xMetric].label}: ${fmt(xMetric, v.data.value[0])}<br/>${metrics[yMetric].label}: ${fmt(yMetric, v.data.value[1])}`;
          },
          backgroundColor: c["surface-3"],
          textStyle: { color: c["text-1"] },
        },
        xAxis: {
          type: "value",
          name: metrics[xMetric].label,
          ...axis,
          axisLabel: {
            color: c["text-3"],
            formatter: (v: number) => fmt(xMetric, v),
          },
        },
        yAxis: {
          type: "value",
          name: metrics[yMetric].label,
          ...axis,
          axisLabel: {
            color: c["text-3"],
            formatter: (v: number) => fmt(yMetric, v),
          },
        },
        series: [
          {
            type: "scatter",
            data: points.map((r) => ({
              name: String(r.g0),
              value: [
                Number(r[xMetric]),
                Number(r[yMetric]),
                Number(r.sessions || r.n),
              ],
              field: bp.groups[0],
            })),
            symbolSize: (v: number[]) =>
              Math.min(34, Math.max(7, Math.sqrt(v[2]) * 1.3)),
            itemStyle: { opacity: 0.65 },
            emphasis: { itemStyle: { opacity: 1 } },
            markLine:
              tab === 3
                ? {
                    silent: true,
                    symbol: "none",
                    lineStyle: { color: c["text-3"], type: "dashed" },
                    data: [{ xAxis: 0 }],
                  }
                : undefined,
          },
        ],
      };
    } else if (tab === 0) {
      const bridge = revenueBridge(data.total, data.previous);
      const offsets: number[] = [],
        steps: number[] = [];
      let balance = 0;
      bridge.forEach((p, i) => {
        if (i === 0 || i === bridge.length - 1) {
          offsets.push(0);
          steps.push(p.value);
          balance = p.value;
        } else {
          offsets.push(p.value >= 0 ? balance : balance + p.value);
          steps.push(Math.abs(p.value));
          balance += p.value;
        }
      });
      option = {
        ...option,
        xAxis: { type: "category", data: bridge.map((b) => b.name), ...axis },
        yAxis: {
          type: "value",
          ...axis,
          axisLabel: {
            color: c["text-3"],
            fontSize: 10,
            formatter: (v: number) => fmt("revenue", v),
          },
        },
        series: [
          {
            type: "bar",
            stack: "bridge",
            name: "Offset",
            tooltip: {show:false},
            data: offsets,
            itemStyle: { color: "transparent" },
            emphasis: { itemStyle: { color: "transparent" } },
            silent: true,
          },
          {
            type: "bar",
            stack: "bridge",
            name: "Earned revenue",
            tooltip: {valueFormatter: (v: unknown) => fmt("revenue", v, true)},
            data: steps.map((value, i) => ({
              value,
              itemStyle: {
                color:
                  i === 0 || i === steps.length - 1
                    ? c.attendance
                    : bridge[i].value >= 0
                      ? c.growth
                      : c.revenue,
              },
            })),
            barMaxWidth: 60,
          },
        ],
      };
    } else if (tab === 4 && salesActivity) {
      option = {
        ...option,
        legend: { bottom: 0, textStyle: { color: c["text-3"], fontSize: 10 } },
        grid: { left: 65, right: 55, top: 30, bottom: 55 },
        tooltip: {
          ...option.tooltip,
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params: unknown) => {
            const points = params as {dataIndex:number}[];
            const row = chartRows[points[0]?.dataIndex];
            if (!row) return '';
            // Date labels and values are governed source fields; no category strings enter HTML.
            return `${String(row.date).replace(/[^0-9-]/g,'')}<br/>Gross collections: ${fmt("gross_revenue",row.gross_revenue,true)}<br/>Transactions: ${fmt("transactions",row.transactions)}<br/>Average order value: ${fmt("aov",row.aov,true)}`;
          },
        },
        xAxis: { type: "category", data: chartRows.map(row=>String(row.date)), ...axis,
          axisLabel: {...axis.axisLabel, formatter:(value:string)=>value.slice(5),hideOverlap:true},
        },
        yAxis: [
          {type:"value",name:"Collections (₹)",nameTextStyle:{color:c["text-3"],fontSize:10},...axis,
            axisLabel:{...axis.axisLabel,formatter:(value:number)=>fmt("gross_revenue",value)}},
          {type:"value",name:"Transactions",nameTextStyle:{color:c["text-3"],fontSize:10},...axis,minInterval:1,
            splitLine:{show:false},axisLabel:{...axis.axisLabel,formatter:(value:number)=>fmt("transactions",value)}},
        ],
        series: [
          {name:"Gross collections",type:"bar",data:chartRows.map(row=>row.gross_revenue),barMaxWidth:30,itemStyle:{color:c.revenue,borderRadius:[4,4,0,0]}},
          {name:"Transactions",type:"line",yAxisIndex:1,data:chartRows.map(row=>row.transactions),smooth:false,symbol:"circle",symbolSize:5,lineStyle:{color:c.growth,width:2},itemStyle:{color:c.growth}},
        ],
      };
    } else if (tab === 4) {
      const months = [...new Set(chartRows.map((r) => String(r.month)))].slice(
        -14,
      );
      const categories = [
        ...new Set(chartRows.map((r) => String(r.category || "Uncategorised"))),
      ];
      option = {
        ...option,
        legend: { bottom: 0, textStyle: { color: c["text-3"], fontSize: 10 } },
        grid: { left: 55, right: 18, top: 15, bottom: 50 },
        xAxis: { type: "category", data: months, ...axis },
        yAxis: {
          type: "value",
          ...axis,
          axisLabel: {
            color: c["text-3"],
            fontSize: 10,
            formatter: (v: number) => fmt("revenue", v),
          },
        },
        series: categories.map((category) => ({
          type: "line",
          name: category,
          tooltip: {valueFormatter: (v: unknown) => fmt("gross_revenue", v, true)},
          stack: "revenue",
          smooth: true,
          symbol: "none",
          areaStyle: { opacity: 0.18 },
          lineStyle: { width: 1.5 },
          data: months.map((month) =>
            Number(
              chartRows.find(
                (r) =>
                  r.month === month &&
                  (r.category || "Uncategorised") === category,
              )?.gross_revenue || 0,
            ),
          ),
        })),
      };
    } else if (tab === 5) {
      const months = chartRows.map((r) => {
        const [y, m] = String(r.month).split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
      });
      const rate = (id: string, name: string, color: string, dashed = false) => ({
        name, type: "line" as const, yAxisIndex: 1, smooth: 0.35, symbol: "circle", symbolSize: 7, showSymbol: true,
        lineStyle: { width: 2.4, color, type: (dashed ? "dashed" : "solid") as "dashed" | "solid" }, itemStyle: { color, borderColor: c["surface-3"], borderWidth: 1.5 },
        emphasis: { focus: "series" as const },
        data: chartRows.map((r) => (r[id] == null ? null : Number(r[id]))),
      });
      option = {
        ...option,
        grid: { left: 52, right: 56, top: 44, bottom: 30 },
        legend: { top: 4, left: "center", itemWidth: 14, itemHeight: 8, icon: "roundRect", textStyle: { color: c["text-2"], fontSize: 11 } },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow", shadowStyle: { color: "rgba(127,127,127,.06)" } },
          formatter: (params: unknown) => {
            const items = params as { axisValue: string; seriesName: string; value: number | null; color: string }[];
            return `<b>${items[0]?.axisValue} cohort</b><br/>` + items.map((p) => `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};margin-right:6px"></span>${p.seriesName}: <b>${p.seriesName === "Newcomers" ? fmt("records", p.value) : fmt("conversion_rate", p.value)}</b>`).join("<br/>");
          },
        },
        xAxis: { type: "category", data: months, ...axis, axisTick: { show: false } },
        yAxis: [
          { type: "value", name: "Newcomers", nameTextStyle: { color: c["text-3"], fontSize: 10 }, ...axis, splitLine: { lineStyle: { color: c.hairline, type: "dashed" } } },
          { type: "value", name: "Rate", min: 0, max: (v: { max: number }) => Math.min(1, Math.ceil((v.max + 0.05) * 10) / 10), nameTextStyle: { color: c["text-3"], fontSize: 10 }, ...axis, splitLine: { show: false }, axisLabel: { color: c["text-3"], formatter: (v: number) => `${Math.round(v * 100)}%` } },
        ],
        series: [
          {
            name: "Newcomers", type: "bar", barMaxWidth: 30,
            itemStyle: { borderRadius: [6, 6, 2, 2], color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: c.accent || c.growth }, { offset: 1, color: (c["accent-2"] || c.growth) + "55" }]) },
            emphasis: { itemStyle: { opacity: 1 } },
            data: chartRows.map((r) => Number(r.newcomers ?? 0)),
          },
          rate("second_visit_rate", "Second visit %", c.attendance, true),
          rate("conversion_rate", "Conversion %", c.revenue),
          rate("retention_rate", "Retention %", c.people),
        ],
      };
    } else if (tab === 8) {
      const names = [
        ...new Set(
          chartRows.flatMap((r) => [
            "Source: " + r.source,
            "Stage: " + r.stage,
            "Outcome: " + r.outcome,
          ]),
        ),
      ];
      const links = new Map<
        string,
        { source: string; target: string; value: number }
      >();
      for (const row of chartRows) {
        for (const [source, target] of [
          ["Source: " + row.source, "Stage: " + row.stage],
          ["Stage: " + row.stage, "Outcome: " + row.outcome],
        ]) {
          const key = source + target;
          const prev = links.get(key);
          links.set(key, {
            source,
            target,
            value: (prev?.value || 0) + Number(row.n),
          });
        }
      }
      option = {
        ...option,
        tooltip: { trigger: "item", valueFormatter: (v: unknown) => fmt("records", v) },
        xAxis: [],
        yAxis: [],
        grid: [],
        series: [
          {
            type: "sankey",
            left: 15,
            right: 130,
            top: 12,
            bottom: 15,
            nodeWidth: 8,
            nodeGap: 10,
            emphasis: { focus: "adjacency" },
            label: {
              color: c["text-2"],
              fontSize: 10,
              formatter: (p: { name: string }) =>
                p.name.replace(/^(Source|Stage|Outcome): /, ""),
            },
            lineStyle: { color: "source", opacity: 0.18, curveness: 0.5 },
            data: names.map((name) => ({ name })),
            links: [...links.values()],
          },
        ],
      };
    } else if (tab === 6) {
      option = {
        ...option,
        tooltip: {
          trigger: "item",
          formatter: (p: unknown) => {
            const d = (p as { data: { name: string; value: number[] } }).data;
            return `${d.name}<br/>Utilisation: ${(d.value[0] * 100).toFixed(1)}%<br/>Days absent: ${formatField("days", d.value[1])}`;
          },
        },
        xAxis: {
          type: "value",
          name: "Membership utilisation",
          ...axis,
          axisLabel: {
            color: c["text-3"],
            formatter: (v: number) => Math.round(v * 100) + "%",
          },
        },
        yAxis: { type: "value", name: "Days since visit", ...axis },
        series: [
          {
            type: "scatter",
            symbolSize: 8,
            itemStyle: { opacity: 0.5 },
            data: chartRows.map((r) => ({
              name: String(r.member),
              value: [Number(r.utilisation), Number(r.days)],
            })),
            markLine: {
              symbol: "none",
              lineStyle: { color: c.risk, type: "dashed" },
              data: [{ yAxis: 21 }, { xAxis: 0.25 }],
            },
          },
        ],
      };
    } else if (tab === 10) {
      option = {
        ...option,
        grid: { left: 140, right: 20, top: 15, bottom: 25 },
        xAxis: {
          type: "value",
          ...axis,
          axisLabel: {
            color: c["text-3"],
            formatter: (v: number) => fmt("revenue", v),
          },
        },
        yAxis: {
          type: "category",
          data: chartRows.map((r) => String(r.trainer)),
          ...axis,
          axisLabel: { color: c["text-2"], fontSize: 10,
            formatter: (name:string, index:number) => instructorPortraits[instructorKey(name)] ? `{portrait${index}|} ${name}` : name,
            rich: Object.fromEntries(chartRows.map((r,index)=>[`portrait${index}`,{width:22,height:22,borderRadius:11,backgroundColor:{image:instructorPortraits[instructorKey(String(r.trainer))]}}])),
          },
          inverse: true,
        },
        series: [
          {
            type: "bar",
            name: "Revenue",
            tooltip: {valueFormatter: (v: unknown) => fmt("payroll_revenue", v, true)},
            stack: "economics",
            data: chartRows.map((r) => Number(r.payroll_revenue)),
            itemStyle: { color: c.people },
            barWidth: 9,
          },
          {
            type: "bar",
            name: "Estimated cost",
            tooltip: {valueFormatter: (v: unknown) => fmt("payroll_cost", v, true)},
            stack: "economics",
            data: chartRows.map((r) => -Number(r.payroll_cost)),
            itemStyle: { color: c.revenue },
            barWidth: 9,
          },
        ],
      };
    } else if (tab === 9) {
      option = {
        ...option,
        xAxis: {
          type: "category",
          data: chartRows.map((r) => "Visit " + r.visit),
          ...axis,
        },
        series: [
          {
            type: "bar",
            name: "Recorded visits",
            data: chartRows.map((r) => Number(r.n)),
            barMaxWidth: 35,
            itemStyle: { color: c.attendance, opacity: 0.65 },
          },
        ],
      };
    } else if (tab === 12) {
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      const times = [...new Set(chartRows.map((r) => String(r.time)))].sort();
      const slots = chartRows.filter((r) => days.includes(String(r.day)));
      const cells = slots.map((r, i) => [times.indexOf(String(r.time)), days.indexOf(String(r.day)), Number(r.late), i]);
      const peak = Math.max(1, ...cells.map((c) => Number(c[2])));
      option = {
        ...option,
        legend: undefined,
        grid: { left: 86, right: 24, top: 16, bottom: 78 },
        tooltip: {
          trigger: "item",
          formatter: (p: unknown) => {
            const [, , late, index] = (p as { value: [number, number, number, number] }).value;
            const row = slots[index];
            return `<b>${row.day} · ${row.time}</b><br/>Late cancellations: <b>${fmt("records", late)}</b><br/>Share of bookings: <b>${fmt("booking_late_rate", Number(late) / Math.max(1, Number(row.bookings)))}</b> of ${fmt("records", row.bookings)}<br/>Members: ${fmt("records", row.members)} · Classes affected: ${fmt("records", row.classes)}`;
          },
        },
        xAxis: { type: "category", data: times, splitArea: { show: false }, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: c["text-3"], fontSize: 10, rotate: times.length > 14 ? 45 : 0 } },
        yAxis: { type: "category", data: days.map((d) => d.slice(0, 3)), inverse: true, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: c["text-2"], fontSize: 11, fontWeight: 600 } },
        visualMap: {
          min: 0, max: peak, dimension: 2, calculable: true, orient: "horizontal", left: "center", bottom: 4, itemWidth: 10, itemHeight: 160,
          text: ["More late cancels", "Fewer"], textStyle: { color: c["text-3"], fontSize: 10 },
          inRange: { color: [c["surface-3"] || "#f4f4f6", (c["accent-2"] || c.risk) + "99", c.accent || c.risk] },
        },
        series: [{
          type: "heatmap",
          data: cells,
          label: { show: times.length <= 16, color: c["text-1"], fontSize: 10, formatter: (p: { value?: unknown }) => { const v = (p.value as number[] | undefined)?.[2]; return v ? String(v) : ""; } },
          itemStyle: { borderColor: c["surface-3"] || "#fff", borderWidth: 3, borderRadius: 6 },
          emphasis: { itemStyle: { borderColor: c.accent || c.risk, borderWidth: 2 } },
        }],
      };
    } else if (tab === 7) {
      option = {
        ...option,
        yAxis: [
          { type: "value", ...axis },
          {
            type: "value",
            min: 0,
            max: 1,
            axisLabel: {
              color: c["text-3"],
              formatter: (v: number) => Math.round(v * 100) + "%",
            },
            splitLine: { show: false },
          },
        ],
        legend: { bottom: 0, textStyle: { color: c["text-3"], fontSize: 9 } },
        grid: { left: 48, right: 30, top: 18, bottom: 50 },
        series: [
          ...[
            "booking_attended",
            "booking_cancelled",
            "booking_late_cancelled",
            "booking_no_shows",
            "booking_pending",
          ].map((id, i) => ({
            type: "bar" as const,
            name: metrics[id].label,
            stack: "outcomes",
            data: chartRows.map((r) => r[id]),
            itemStyle: {
              opacity: 0.6,
              color: [c.attendance, c.people, c.risk, c.revenue, c["text-3"]][i],
            },
            barMaxWidth: 30,
          })),
          {
            type: "line",
            name: "Effective attendance",
            tooltip: {valueFormatter: (v: unknown) => fmt("effective_attendance", v)},
            yAxisIndex: 1,
            data: chartRows.map((r) => r.effective_attendance),
            smooth: true,
            symbol: "circle",
            symbolSize: 4,
            lineStyle: { color: c.growth },
            itemStyle: { color: c.growth },
          },
        ],
      };
    } else {
      option = {
        ...option,
        yAxis: [
          {
            type: "value",
            ...axis,
            axisLabel: {
              color: c["text-3"],
              fontSize: 10,
              formatter: (v: number) => fmt(primary, v),
            },
          },
          ...(percent
            ? [
                {
                  type: "value" as const,
                  min: 0,
                  max: 1,
                  axisLabel: {
                    color: c["text-3"],
                    fontSize: 10,
                    formatter: (v: number) => Math.round(v * 100) + "%",
                  },
                  splitLine: { show: false },
                },
              ]
            : []),
        ],
        series: [
          {
            type: tab === 1 ? "bar" : "line",
            name: primary,
            tooltip: {valueFormatter: (v: unknown) => fmt(primary, v, true)},
            data: chartRows.map((r) => r[primary]),
            smooth: true,
            symbol: "circle",
            symbolSize: 4,
            barMaxWidth: 24,
            areaStyle: tab !== 1 ? { opacity: 0.08 } : undefined,
            itemStyle: { opacity: tab === 1 ? 0.35 : 1 },
            lineStyle: { width: 2 },
          },
          ...(percent
            ? [
                {
                  type: "line" as const,
                  name: percent,
                  tooltip: {valueFormatter: (v: unknown) => fmt(percent!, v)},
                  yAxisIndex: 1,
                  data: chartRows.map((r) => r[percent]),
                  smooth: true,
                  symbolSize: 3,
                  lineStyle: { color: c.revenue, width: 1.5 },
                  itemStyle: { color: c.revenue },
                },
              ]
            : []),
        ],
      };
    }
    chart.setOption(option);
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(ref.current);
    chart.setOption({
      animation: prefs.animation,
      legend: { show: prefs.legend },
      ...(Array.isArray(option.yAxis) && !option.yAxis.length ? {} : { yAxis: { splitLine: { show: prefs.grid } } }),
    });
    chart.on("click", (p) => {
      const point = p.data as { name?: string; field?: string };
      if (point?.field && point.name) {
        state.cross(point.field, point.name);
        return;
      }
      const record = chartRows[p.dataIndex];
      if (tab === 4 && salesActivity && !secondary && record?.date) {
        state.filter({from:String(record.date),to:String(record.date)});
        return;
      }
      if (record?.month) {
        if (String(record.month).length === 10) {
          const end = new Date(String(record.month) + "T00:00:00Z");
          end.setUTCDate(end.getUTCDate() + 6);
          state.filter({
            from: String(record.month),
            to: end.toISOString().slice(0, 10),
          });
          return;
        }
        state.filter({
          from: String(record.month) + "-01",
          to: new Date(
            Date.UTC(
              Number(String(record.month).slice(0, 4)),
              Number(String(record.month).slice(5, 7)),
              0,
            ),
          )
            .toISOString()
            .slice(0, 10),
        });
      } else if (record?.trainer)
        state.cross("trainer", String(record.trainer));
      else if (record?.g0) state.cross(bp.groups[0], String(record.g0));
      else if (record?.member) state.cross("member", String(record.member));
    });
    return () => {
      resize.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, [
    chartRows,
    state.theme,
    table,
    tab,
    secondary,
    salesActivity,
    prefs.animation,
    prefs.legend,
    prefs.grid,
  ]);
  return (
    <div className="chart-surface">
      <ChartControls rows={chartRows} title={chartTitle} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 5 }}>
        <button
          className="icon-button"
          aria-label={table ? "View chart" : "View chart data as table"}
          onClick={() => setTable(!table)}
        >
          {table ? <ChartNoAxesCombined size={13} /> : <Table2 size={13} />}
        </button>
        <button
          className="icon-button"
          aria-label="Export chart PNG"
          onClick={() => {
            const url = instance.current?.getDataURL({
              pixelRatio: 2,
              backgroundColor: colors()["surface-3"],
            });
            if (url) {
              fetch(url)
                .then((r) => r.blob())
                .then((b) => download("atlas-chart.png", b));
            } else exportCSV("chart-data", chartRows);
          }}
        >
          <Download size={13} />
        </button>
      </div>
      {error ? (
        <div className="notice">Chart unavailable: {error}</div>
      ) : table ? (
        <div className="chart-table">
          <table>
            <thead>
              <tr>
                {Object.keys(chartRows[0] || {})
                  .filter((k) => !/^g\d+$/.test(k) && k !== "level")
                  .slice(0, 8)
                  .map((k) => (
                    <th key={k}>{k}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {chartRows.map((r, i) => (
                <tr key={i}>
                  {Object.entries(r)
                    .filter(([k]) => !/^g\d+$/.test(k) && k !== "level")
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <td key={k}>{formatField(k, v)}</td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="chart"
          ref={ref}
          role="img"
          aria-label={chartTitle}
        />
      )}
      <div className="chart-caption">
        <span>
          {secondary
            ? "Each point represents an entity in scope"
            : tab === 4 && salesActivity ? "Daily gross collections (left axis) and transactions (right axis); average order value in tooltips. Only dates with source records are shown." : tab === 5 ? "Bars: newcomers per first-visit month · lines: share of each cohort that returned, converted and is retained (latest recorded outcome)" : tab === 7 || tab === 12 ? "Late cancellations by weekday and class time · hover a cell for its share of that slot's bookings, members and classes affected" : "Actual source observations, aggregated in SQL"}
        </span>
        <span>Hover for details / Click to filter</span>
      </div>
    </div>
  );
}
