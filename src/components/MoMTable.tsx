import { useEffect, useMemo, useState } from "react";
import { query, type Row } from "../data/duckdb";
import { metrics } from "../semantics/metrics";
import { fmt, delta } from "../semantics/formats";
import { useStore } from "../state/store";
import { today, monthlyHistorySQL } from "../data/analytics";
import { acquisitionPeriodLabel } from "../data/acquisition";
import { Register } from "./Register";
import { exportCSV } from "./exports";
import {
  MonthlyTableControls,
  type MonthlyTableState,
} from "./MonthlyTableControls";
export function MoMTable({ ids, version }: { ids: string[]; version: string }) {
  const s = useStore();
  const [controls, setControls] = useState<MonthlyTableState>({
    periods: 14,
    newest: true,
    dense: true,
    mode: "absolute",
  });
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState("all"),
    [baseline, setBaseline] = useState(false);
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const sql = monthlyHistorySQL(s.tab, ids, s.filters, s.transient);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    query(sql)
      .then((result) => {
        if (active) setRows(result);
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
  }, [sql, version]);
  const allMonths = useMemo(() => {
    const end = new Date(today() + "T00:00:00Z");
    end.setUTCDate(0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 13 + i, 1),
      );
      const key = d.toISOString().slice(0, 7);
      return {
        key,
        label:
          s.tab === 5
            ? acquisitionPeriodLabel(key)
            : d.toLocaleDateString("en-IN", {
                month: "short",
                year: "2-digit",
                timeZone: "UTC",
              }),
        row: rows.find((r) => r.month === key),
      };
    });
  }, [rows, s.tab]);
  const months = allMonths.slice(-controls.periods);
  if (controls.newest) months.reverse();
  const visibleIds = ids.filter(
    (id) =>
      (selected === "all" || !ids.includes(selected) || id === selected) &&
      metrics[id].label.toLowerCase().includes(search.toLowerCase()),
  );
  const prior = (key: string) => {
    const date = new Date(key + "-01T00:00:00Z");
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() - (controls.mode === "year" ? 12 : 1),
        1,
      ),
    )
      .toISOString()
      .slice(0, 7);
  };
  const cellText = (id: string, key: string) => {
    const value = rows.find((r) => r.month === key)?.[id],
      prev = rows.find((r) => r.month === prior(key))?.[id];
    if (controls.mode === "absolute") return fmt(id, value);
    if (controls.mode === "change" || controls.mode === "year")
      return value == null || prev == null ? "—" : delta(id, value, prev);
    const first = allMonths.find((m) => m.row?.[id] != null)?.row?.[id];
    return value == null || !first
      ? "—"
      : ((Number(value) / Number(first)) * 100).toFixed(0);
  };
  return (
    <Register
      index="06"
      dateIndependent
      title="Month by month"
      subtitle="14 completed months available · comparisons ignore date filters; other filters apply"
    >
      <MonthlyTableControls
        state={controls}
        onChange={(patch) => setControls((c) => ({ ...c, ...patch }))}
        modes={[
          ["absolute", "Values"],
          ["change", "MoM Δ"],
          ["year", "YoY Δ"],
          ["index", "Index 100"],
        ]}
        onExport={() =>
          exportCSV(
            `monthly-${s.tab}-${controls.mode}`,
            visibleIds.map((id) => ({
              Measure: metrics[id].label,
              ...Object.fromEntries(
                months.map((m) => [m.key, cellText(id, m.key)]),
              ),
            })),
          )
        }
      >
        <label>
          Measure
          <select
            aria-label="Monthly metric"
            value={ids.includes(selected) ? selected : "all"}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="all">All measures</option>
            {ids.map((id) => (
              <option key={id} value={id}>
                {metrics[id].label}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          aria-label="Search monthly measures"
          placeholder="Find a measure…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="monthly-check">
          <input
            type="checkbox"
            checked={baseline}
            onChange={(e) => setBaseline(e.target.checked)}
          />
          Show baseline
        </label>
      </MonthlyTableControls>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading monthly history…</p>}
      <div
        className={`table-scroll mom monthly-table${controls.dense ? " compact" : " comfortable"}`}
        tabIndex={0}
        aria-label="Monthly comparison table; scroll for more periods"
      >
        <table>
          <thead>
            <tr>
              <th>Performance measure</th>
              {months.map((m) => (
                <th
                  key={m.key}
                  className={
                    m.key === allMonths.at(-1)?.key ? "latest-month" : undefined
                  }
                >
                  {m.label}
                  {m.key === allMonths.at(-1)?.key && <small>Latest</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleIds.map((id) => (
              <tr key={id}>
                <th scope="row" title={metrics[id].description}>
                  {metrics[id].label}
                </th>
                {months.map((m) => {
                  const value = m.row?.[id],
                    prev = rows.find((r) => r.month === prior(m.key))?.[id];
                  const movement =
                    value == null || prev == null
                      ? null
                      : Number(value) - Number(prev);
                  const tone =
                    movement == null || movement === 0
                      ? "neutral"
                      : movement > 0 === metrics[id].higherIsBetter
                        ? "positive"
                        : "negative";
                  return (
                    <td
                      key={m.key}
                      className={
                        m.key === allMonths.at(-1)?.key
                          ? "latest-month"
                          : undefined
                      }
                    >
                      <button
                        className={`monthly-value ${["change", "year"].includes(controls.mode) ? tone : ""}`}
                        title={`${m.label}: ${fmt(id, value)} · baseline: ${fmt(id, prev)} · ${m.row?.n ?? 0} source rows. Click to scope this month.`}
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
                      >
                        {cellText(id, m.key)}
                        {baseline && (
                          <small>
                            {controls.mode === "year"
                              ? "Last year"
                              : "Prior month"}{" "}
                            {fmt(id, prev)}
                          </small>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visibleIds.length && (
        <p className="empty-state">No measures match this selection.</p>
      )}
      <p className="ranking-foot">
        Rates recompute from source numerators and denominators. Missing months
        stay unavailable; changes use percentage points for rates. Index 100
        uses the first available value in the full 14-month window. Click a
        value to scope its month.
      </p>
    </Register>
  );
}
