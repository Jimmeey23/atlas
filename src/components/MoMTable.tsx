import { useEffect, useMemo, useState } from "react";
import { query, type Row } from "../data/duckdb";
import { metrics } from "../semantics/metrics";
import { fmt, delta } from "../semantics/formats";
import { useStore } from "../state/store";
import { today, monthlyHistorySQL } from "../data/analytics";
import { acquisitionPeriodLabel } from "../data/acquisition";
import { Register } from "./Register";
export function MoMTable({ ids, version }: { ids: string[]; version: string }) {
  const [mode, setMode] = useState("absolute");
  const s = useStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sql = monthlyHistorySQL(s.tab, ids, s.filters, s.transient);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    query(sql).then(result => { if (active) setRows(result); })
      .catch(e => { if (active) setError(String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sql, version]);
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
        label: s.tab === 5 ? acquisitionPeriodLabel(key) : d.toLocaleDateString("en-IN", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        }),
        row: rows.find((r) => r.month === key),
      };
    });
  }, [rows, s.tab]);
  return (
    <Register
      index="06"
      dateIndependent
      title="Month by month"
      subtitle="14 completed months · MoM and YoY ignore date filters; other filters apply"
      actions={
        <div className="segmented">
          {["absolute", "change", "year", "index"].map((m) => (
            <button
              className={mode === m ? "active" : ""}
              onClick={() => setMode(m)}
              key={m}
            >
              {m === "absolute"
                ? "Values"
                : m === "change"
                  ? "MoM Δ"
                  : m === "year" ? "YoY Δ" : "Index 100"}
            </button>
          ))}
        </div>
      }
    >
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading monthly history…</p>}
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
                    const date = new Date(m.key + "-01T00:00:00Z");
                    const priorKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - (mode === "year" ? 12 : 1), 1)).toISOString().slice(0, 7);
                    const prev = rows.find(row => row.month === priorKey)?.[id];
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
                          : mode === "change" || mode === "year"
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
