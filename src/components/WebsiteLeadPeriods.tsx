import { useEffect, useMemo, useState } from "react";
import { query, type Row } from "../data/duckdb";
import { metrics, metricSQL } from "../semantics/metrics";
import { fmt, delta } from "../semantics/formats";
import { useStore } from "../state/store";
import { context, metricFacts, today } from "../data/analytics";
import { comparisonDates, relativePeriod } from "../data/periods";
import { blueprints } from "../data/blueprints";

const WEBSITE = "Website";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shiftDays = (range: { from: string; to: string }, days: number) => ({
  from: iso(new Date(Date.parse(range.from + "T00:00:00Z") + days * 86400000)),
  to: iso(new Date(Date.parse(range.to + "T00:00:00Z") + days * 86400000)),
});
// Same calendar days one month back, clamped to that month's length.
const previousMonth = (range: { from: string; to: string }) => {
  const end = new Date(range.to + "T00:00:00Z");
  const start = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1);
  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0),
  ).getUTCDate();
  return {
    from: iso(new Date(start)),
    to: iso(
      new Date(
        Date.UTC(
          end.getUTCFullYear(),
          end.getUTCMonth() - 1,
          Math.min(end.getUTCDate(), lastDay),
        ),
      ),
    ),
  };
};
const ids = blueprints[8].columns;
const label = (range: { from: string; to: string }) =>
  `${range.from} → ${range.to}`;

export function WebsiteLeadPeriods({ version }: { version: string | number }) {
  const s = useStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const windows = useMemo(() => {
    const now = today();
    const year = relativePeriod("This year", now);
    const week = relativePeriod("This week", now);
    const month = relativePeriod("This month", now);
    // Every current window is period-to-date, so each prior window covers the
    // same elapsed span. Comparing two days against a full week would read as a
    // collapse that never happened.
    return [
      {
        key: "wow",
        title: "Week on week",
        current: week,
        prior: shiftDays(week, -7),
      },
      {
        key: "mom",
        title: "Month on month",
        current: month,
        prior: previousMonth(month),
      },
      {
        key: "yoy",
        title: "Year on year",
        current: year,
        prior: comparisonDates(year.from, year.to, "year"),
      },
    ];
  }, []);
  // The source dimension is pinned to Website here, so a source chosen
  // elsewhere must not narrow it further.
  const transient = useMemo(
    () => s.transient.filter((t) => t.field !== "source"),
    [s.transient],
  );
  const sql = useMemo(
    () =>
      windows
        .flatMap((w) =>
          (["current", "prior"] as const).map((slot) => {
            const range = w[slot];
            const filters = {
              ...s.filters,
              from: range.from,
              to: range.to,
              source: [WEBSITE],
            };
            return `SELECT '${w.key}:${slot}' AS bucket,${metricSQL(ids, context(filters, transient))},COUNT(*) AS n FROM ${metricFacts(filters, "leads", transient)}`;
          }),
        )
        .join(" UNION ALL "),
    [windows, s.filters, transient],
  );
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
  const bucket = (key: string) => rows.find((r) => r.bucket === key);
  return (
    <details className="secondary">
      <summary>
        Website enquiries · WoW, MoM, YoY
        <span className="small">Source exactly “{WEBSITE}”</span>
      </summary>
      <div className="secondary-content">
        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">Loading website enquiry periods…</p>}
        <div className="table-scroll">
          <table className="worklist-table">
            <thead>
              <tr>
                <th rowSpan={2}>Performance measure</th>
                {windows.map((w) => (
                  <th key={w.key} colSpan={3}>
                    {w.title}
                    <small>
                      {label(w.current)} vs {label(w.prior)}
                    </small>
                  </th>
                ))}
              </tr>
              <tr>
                {windows.flatMap((w) => [
                  <th key={w.key + "c"}>Current</th>,
                  <th key={w.key + "p"}>Prior</th>,
                  <th key={w.key + "d"}>Δ</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => (
                <tr key={id}>
                  <th scope="row">{metrics[id]?.label || id}</th>
                  {windows.flatMap((w) => {
                    const current = bucket(`${w.key}:current`)?.[id];
                    const prior = bucket(`${w.key}:prior`)?.[id];
                    return [
                      <td key={w.key + "c"}>{fmt(id, current)}</td>,
                      <td key={w.key + "p"}>{fmt(id, prior)}</td>,
                      <td key={w.key + "d"}>{delta(id, current, prior)}</td>,
                    ];
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row">Contributing rows</th>
                {windows.flatMap((w) => [
                  <td key={w.key + "c"}>
                    {fmt("records", bucket(`${w.key}:current`)?.n)}
                  </td>,
                  <td key={w.key + "p"}>
                    {fmt("records", bucket(`${w.key}:prior`)?.n)}
                  </td>,
                  <td key={w.key + "d"}>—</td>,
                ])}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="small">
          Week and month windows are period-to-date and ignore the page date
          filter; every other active filter applies. Year on year compares this
          calendar year to date with the same span last year.
        </p>
      </div>
    </details>
  );
}
