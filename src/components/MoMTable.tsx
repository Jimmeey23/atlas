import { useMemo, useState } from "react";
import type { Row } from "../data/duckdb";
import { metrics } from "../semantics/metrics";
import { fmt, delta } from "../semantics/formats";
import { useStore } from "../state/store";
import { today } from "../data/analytics";
import { Register } from "./Register";
export function MoMTable({ rows, ids }: { rows: Row[]; ids: string[] }) {
  const [mode, setMode] = useState("absolute");
  const s = useStore();
  const months = useMemo(() => {
    const end = new Date(today() + "T00:00:00Z");
    end.setUTCDate(0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 13 + i, 1),
      );
      const key = d.toISOString().slice(0, 7);
      return {
        key,
        label: d.toLocaleDateString("en-IN", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        }),
        row: rows.find((r) => r.month === key),
      };
    });
  }, [rows]);
  return (
    <Register
      index="06"
      title="Month by month"
      subtitle="14 completed months · date filters do not restrict this table"
      actions={
        <div className="segmented">
          {["absolute", "change", "index"].map((m) => (
            <button
              className={mode === m ? "active" : ""}
              onClick={() => setMode(m)}
              key={m}
            >
              {m === "absolute"
                ? "Values"
                : m === "change"
                  ? "MoM Δ"
                  : "Index 100"}
            </button>
          ))}
        </div>
      }
    >
      <div className="table-scroll mom">
        <table>
          <thead>
            <tr>
              <th>Performance measure</th>
              {months.map((m) => (
                <th key={m.key}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const values = months
                .map((m) => m.row?.[id])
                .filter((v) => v != null)
                .map(Number);
              const min = Math.min(...values),
                max = Math.max(...values);
              const first = months.find((m) => m.row?.[id] != null)?.row?.[id];
              return (
                <tr key={id}>
                  <td title={metrics[id].description}>{metrics[id].label}</td>
                  {months.map((m, i) => {
                    const value = m.row?.[id];
                    const prev = months[i - 1]?.row?.[id];
                    const positive =
                      value != null &&
                      Number(value) >= Number(prev) ===
                        metrics[id].higherIsBetter;
                    const normalized =
                      value == null
                        ? 0
                        : (Number(value) - min) / (max - min || 1);
                    return (
                      <td
                        key={m.key}
                        tabIndex={0}
                        title={`${m.label}: ${fmt(id, value)}; prior: ${delta(id, value, prev)}; n = ${m.row?.n ?? 0}. Click to scope this month.`}
                        style={{
                          background:
                            value == null
                              ? undefined
                              : `color-mix(in srgb,var(--${positive ? "pos" : "neg"}) ${Math.round(5 + normalized * 14)}%,var(--surface-1))`,
                        }}
                        onClick={() =>
                          s.filter({
                            from: m.key + "-01",
                            to: new Date(
                              Date.UTC(
                                Number(m.key.slice(0, 4)),
                                Number(m.key.slice(5, 7)),
                                0,
                              ),
                            )
                              .toISOString()
                              .slice(0, 10),
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.click();
                        }}
                      >
                        {mode === "absolute"
                          ? fmt(id, value)
                          : mode === "change"
                            ? value == null || prev == null
                              ? "—"
                              : delta(id, value, prev)
                            : value == null || !first
                              ? "—"
                              : ((Number(value) / Number(first)) * 100).toFixed(
                                  0,
                                )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="ranking-foot">
        Rates recompute from numerator and denominator. Missing months remain
        unavailable. Click a month to inspect its contributors.
      </p>
    </Register>
  );
}
