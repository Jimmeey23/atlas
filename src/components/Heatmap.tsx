import { ChartControls } from "./ChartControls";
import { useMemo } from "react";
import type { Row } from "../data/duckdb";
import { fmt } from "../semantics/formats";
import { useStore } from "../state/store";
const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function Heatmap({
  rows,
  metric = "fill_rate",
  schedule = false,
}: {
  rows: Row[];
  metric?: string;
  schedule?: boolean;
}) {
  const s = useStore();
  const times = useMemo(
    () =>
      [...new Set(rows.map((r) => String(r.time || "Unspecified")))]
        .sort()
        .filter((t) => t !== "Unspecified"),
    [rows, schedule],
  );
  const maxValue = useMemo(
    () =>
      Math.max(
        1e-9,
        ...rows
          .map((r) => Math.abs(Number(r[metric] || 0)))
          .filter((v) => Number.isFinite(v)),
      ),
    [rows, metric],
  );
  return (
    <div className="chart-surface">
      <ChartControls
        rows={rows}
        title={schedule ? "Schedule heatmap" : "Weekly heatmap"}
      />
      <div className="heatmap">
        <span className="label">{schedule ? "Schedule" : "Time / day"}</span>
        {days.map((d) => (
          <span key={d} className="label">
            {d.slice(0, 3)}
          </span>
        ))}
        {times.map((time) => (
          <div style={{ display: "contents" }} key={time}>
            <span className="label">{time.slice(0, 5)}</span>
            {days.map((day) => {
              const r = rows.find((r) => r.day === day && r.time === time);
              const value = r?.[metric];
              const intensity =
                value == null
                  ? 0
                  : Math.max(
                      5,
                      Math.min(
                        45,
                        (Math.abs(Number(value)) / maxValue) * 45,
                      ),
                    );
              return (
                <button
                  key={day}
                  className={`heat-cell ${value == null ? "empty" : ""}`}
                  style={
                    value != null
                      ? {
                          background: `color-mix(in srgb,var(--accent) ${intensity}%,var(--surface-1))`,
                        }
                      : undefined
                  }
                  title={
                    r
                      ? `${day} ${time}: ${fmt(metric, value)} / n = ${r.n}. Click to filter.`
                      : `${day} ${time}: no observed rows`
                  }
                  aria-label={`${day} ${time}, ${fmt(metric, value)}`}
                  onClick={() => {
                    if (r) {
                      s.set({
                        transient: [
                          ...s.transient.filter(
                            (t) => !["day", "time"].includes(t.field),
                          ),
                          { field: "day", value: day },
                          { field: "time", value: time },
                        ],
                      });
                    }
                  }}
                >
                  {fmt(metric, value)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {!times.length && (
        <div className="empty-state">
          <h3>No time-level observations</h3>
          <p>
            This source does not contain a usable time field in the current
            scope.
          </p>
        </div>
      )}
      <div className="heat-legend">
        <span>Low</span>
        {[10, 20, 30, 40, 55].map((n) => (
          <i key={n} style={{ opacity: n / 55 }} />
        ))}
        <span>High</span>
        <span style={{ marginLeft: 12 }}>— No observations</span>
      </div>
    </div>
  );
}
