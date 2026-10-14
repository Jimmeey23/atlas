import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as echarts from "echarts";
import type { Row } from "../data/duckdb";
import "./DataLab.css";
import type { LabField, LabSpec } from "../data/data-lab";
const name = (f: LabField) => `${f.source} · ${f.column}`;
/** Presentational result of a Data Lab analysis: shared by the builder and saved agent elements. */
export function LabResult({ spec, rows }: { spec: LabSpec; rows: Row[] }) {
  return (
    <div
      className={spec.density === "Compact" ? "lab-compact" : ""}
      style={{ "--lab-accent": spec.color } as CSSProperties}
    >
      <LabResultBody spec={spec} rows={rows} />
    </div>
  );
}
function LabResultBody({ spec: resultSpec, rows }: { spec: LabSpec; rows: Row[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const chart = useRef<HTMLDivElement>(null);
  useEffect(() => setCollapsed(new Set()), [rows]);
  const s = resultSpec;
  const format = (v: unknown) =>
    v == null
      ? "—"
      : typeof v === "number"
        ? new Intl.NumberFormat("en-IN", {
            maximumFractionDigits: resultSpec?.decimals ?? 0,
            ...(resultSpec?.format === "Currency"
              ? { style: "currency", currency: "INR" }
              : resultSpec?.format === "Percent"
                ? { style: "percent" }
                : {}),
          }).format(v)
        : String(v);
  useEffect(() => {
    if (
      !chart.current ||
      !rows.length ||
      (!resultSpec.type.includes("chart") &&
        !["Stacked bar", "Heatmap"].includes(resultSpec.type))
    )
      return;
    const s = resultSpec,
      instance = echarts.init(chart.current);
    const labels = rows.map(
      (r) =>
        s.rows.map((_, i) => r["d" + i] ?? "(Missing)").join(" / ") || s.title,
    );
    const series = s.measures.map((m, i) => ({
      name: m.label,
      type:
        s.type === "Pie chart"
          ? "pie"
          : s.type === "Line chart" || s.type === "Area chart"
            ? "line"
            : "bar",
      ...(s.type === "Stacked bar" ? { stack: "total" } : {}),
      ...(s.type === "Area chart" ? { areaStyle: {} } : {}),
      data:
        s.type === "Pie chart"
          ? rows.map((r, j) => ({ name: labels[j], value: r["m" + i] }))
          : rows.map((r) => r["m" + i]),
    }));
    const option: any = {
      color: [s.color, "#c69959", "#ae7285", "#6375a4"],
      tooltip: { trigger: s.type === "Pie chart" ? "item" : "axis" },
      legend: { type: "scroll" },
      grid: { left: 75, right: 30, bottom: 85 },
      xAxis: { type: "category", data: labels, axisLabel: { rotate: 30 } },
      yAxis: { type: "value" },
      dataZoom: [{ type: "inside" }, { type: "slider", bottom: 10 }],
      series,
    };
    if (s.type === "Pie chart") {
      delete option.xAxis;
      delete option.yAxis;
      delete option.dataZoom;
      option.series = series.slice(0, 1);
    }
    if (s.type === "Heatmap") {
      option.xAxis = { type: "category", data: s.measures.map((m) => m.label) };
      option.yAxis = { type: "category", data: labels };
      delete option.dataZoom;
      option.visualMap = {
        min: Math.min(
          0,
          ...rows.flatMap((r) =>
            s.measures.map((_, i) => Number(r["m" + i] || 0)),
          ),
        ),
        max: Math.max(
          1,
          ...rows.flatMap((r) =>
            s.measures.map((_, i) => Number(r["m" + i] || 0)),
          ),
        ),
        calculable: true,
        orient: "horizontal",
        bottom: 0,
      };
      option.series = [
        {
          type: "heatmap",
          data: rows.flatMap((r, j) =>
            s.measures.flatMap((_, i) =>
              r["m" + i] == null ? [] : [[i, j, r["m" + i]]],
            ),
          ),
        },
      ];
    }
    instance.setOption(option);
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(chart.current);
    return () => {
      resize.disconnect();
      instance.dispose();
    };
  }, [rows, resultSpec]);
  if (!rows.length)
    return <p className="lab-empty">No records match this scope. Adjust the filters.</p>;
    if (s.type === "Metric cards")
      return (
        <div key="metrics" className="lab-metrics">
          {s.measures.map((m, i) => (
            <article key={m.id}>
              <span>{m.label}</span>
              <strong>{format(rows[0]["m" + i])}</strong>
              <small>
                {m.aggregate} · {name(m)}
              </small>
            </article>
          ))}
        </div>
      );
    if (s.type.includes("chart") || ["Stacked bar", "Heatmap"].includes(s.type))
      return (
        <div
          key="chart"
          ref={chart}
          className="lab-chart"
          role="img"
          aria-label={s.title}
        />
      );
    if (s.type === "Pivot table") {
      const depth = (mask: unknown, length: number) =>
        length -
        (Number(mask)
          ? Number(mask).toString(2).replaceAll("0", "").length
          : 0);
      const path = (r: Row, start: number, count: number) =>
        JSON.stringify(
          Array.from({ length: count }, (_, i) => r["d" + (start + i)]),
        );
      const colMap = new Map<string, Row>(),
        rowMap = new Map<string, Row>(),
        cells = new Map<string, Row>();
      for (const r of rows) {
        const rd = depth(r.gr, s.rows.length),
          cd = depth(r.gc, s.columns.length);
        const rk = path(r, 0, rd),
          ck = path(r, s.rows.length, cd);
        if (s.totals || cd === s.columns.length) colMap.set(ck, r);
        if (s.totals || rd > 0) rowMap.set(rk, r);
        cells.set(rk + "|" + ck, r);
      }
      const comparePath = (a: [string, Row], b: [string, Row]) => {
        const av = JSON.parse(a[0]) as (string | number | null)[],
          bv = JSON.parse(b[0]) as (string | number | null)[];
        for (let i = 0; i < Math.min(av.length, bv.length); i++) {
          if (av[i] === bv[i]) continue;
          const c =
            av[i] == null
              ? 1
              : bv[i] == null
                ? -1
                : String(av[i]).localeCompare(String(bv[i]), undefined, {
                    numeric: true,
                  });
          if (c) return s.sort === "DESC" ? -c : c;
        }
        return av.length - bv.length;
      };
      const columns = [...colMap.entries()].sort(comparePath),
        max = Math.max(
          1,
          ...rows.flatMap((r) =>
            s.measures.map((_, i) =>
              typeof r["m" + i] === "number" ? Math.abs(Number(r["m" + i])) : 0,
            ),
          ),
        );
      return (
        <div className="lab-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{s.rows.map((f) => f.column).join(" › ") || "Total"}</th>
                {columns.flatMap(([ck, c]) =>
                  s.measures.map((m, i) => (
                    <th key={ck + i}>
                      {depth(c.gc, s.columns.length)
                        ? Array.from(
                            { length: depth(c.gc, s.columns.length) },
                            (_, j) =>
                              c["d" + (s.rows.length + j)] ?? "(Missing)",
                          ).join(" / ")
                        : "Grand total"}
                      <small>{m.label}</small>
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {[...rowMap.entries()]
                .sort(comparePath)
                .filter(([, r]) => {
                  const d = depth(r.gr, s.rows.length);
                  return !Array.from({ length: Math.max(0, d - 1) }, (_, i) =>
                    path(r, 0, i + 1),
                  ).some((p) => collapsed.has(p));
                })
                .map(([rk, r]) => {
                  const d = depth(r.gr, s.rows.length);
                  return (
                    <tr
                      key={rk}
                      className={d < s.rows.length ? "lab-subtotal" : ""}
                    >
                      <th style={{ paddingLeft: 12 + Math.max(0, d - 1) * 20 }}>
                        {d > 0 && d < s.rows.length && (
                          <button
                            aria-label={`Toggle ${String(r["d" + (d - 1)])}`}
                            onClick={() =>
                              setCollapsed((v) => {
                                const n = new Set(v);
                                n.has(rk) ? n.delete(rk) : n.add(rk);
                                return n;
                              })
                            }
                          >
                            {collapsed.has(rk) ? "+" : "−"}
                          </button>
                        )}
                        {d
                          ? String(r["d" + (d - 1)] ?? "(Missing)")
                          : "Grand total"}
                        {d > 0 && d < s.rows.length && <small>Subtotal</small>}
                      </th>
                      {columns.flatMap(([ck]) =>
                        s.measures.map((_, i) => {
                          const raw = cells.get(rk + "|" + ck)?.["m" + i];
                          const denominator = cells.get(
                            (s.valueMode === "% of row total" ? rk : "[]") +
                              "|" +
                              (s.valueMode === "% of column total" ? ck : "[]"),
                          )?.["m" + i];
                          const v =
                            s.valueMode && s.valueMode !== "Value"
                              ? raw == null ||
                                denominator == null ||
                                Number(denominator) === 0
                                ? null
                                : Number(raw) / Number(denominator)
                              : raw;
                          const display =
                            s.valueMode &&
                            s.valueMode !== "Value" &&
                            typeof v === "number"
                              ? new Intl.NumberFormat("en-IN", {
                                  style: "percent",
                                  maximumFractionDigits: s.decimals,
                                }).format(v)
                              : format(v);
                          return (
                            <td
                              key={ck + i}
                              style={
                                s.heat && v != null
                                  ? {
                                      background: `color-mix(in srgb, ${s.color} ${Math.round((Math.abs(Number(v)) / max) * 55)}%, transparent)`,
                                    }
                                  : undefined
                              }
                            >
                              {display}
                            </td>
                          );
                        }),
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      );
    }
    if (s.type === "List")
      return (
        <ol className="lab-list">
          {rows.map((r, j) => (
            <li key={j}>
              <strong>
                {s.rows
                  .map((_, i) => String(r["d" + i] ?? "(Missing)"))
                  .join(" / ") || s.title}
              </strong>
              <div>
                {s.measures.map((m, i) => (
                  <span key={m.id}>
                    {m.label}: <b>{format(r["m" + i])}</b>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      );
    const headers = [
      ...s.rows.map((f) => (s.type === "Merged table" ? name(f) : f.column)),
      ...(s.type === "Merged table" ? [] : s.measures.map((m) => m.label)),
    ];
    return (
      <div className="lab-table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, j) => (
              <tr key={j}>
                {[
                  ...s.rows.map((_, i) => r["d" + i]),
                  ...(s.type === "Merged table"
                    ? []
                    : s.measures.map((_, i) => r["m" + i])),
                ].map((v, i) => (
                  <td key={i}>{format(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
}
