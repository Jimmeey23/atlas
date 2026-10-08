import { useEffect, useMemo, useState } from "react";
import { query, quote, type Row } from "../data/duckdb";
import { metrics, contributorPredicate } from "../semantics/metrics";
import { fmt, delta } from "../semantics/formats";
import { useStore } from "../state/store";
import { context, where, today } from "../data/analytics";
import { comparisonDates, relativePeriod } from "../data/periods";
import { blueprints } from "../data/blueprints";

import { WEBSITE, websiteScope, marketingMetricSQL, leadDimensions, marketingContributor } from "../data/performance-marketing";
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
const ids = blueprints[8].columns.map(id => ({ trials_completed: "website_trials", converted_leads: "website_members", lead_conversion_rate: "website_win_rate", untouched_leads: "website_untouched", open_leads: "website_open", pipeline_value: "website_pipeline_value" }[id] || id));
const label = (range: { from: string; to: string }) =>
  `${range.from} → ${range.to}`;

import type { TreeRow } from "./NestedTable";
import { marketingDrill } from "./MarketingAnalytics";

export function WebsiteLeadPeriods({ version, onDrill }: { version: string | number; onDrill?: (entry: TreeRow) => void }) {
  const s = useStore();
  const compareOff = s.compare === "none";
  const [group, setGroup] = useState("");
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
            return `SELECT '${w.key}:${slot}' AS bucket,${group ? leadDimensions[group].sql : "'All Website leads'"} AS segment,${marketingMetricSQL(ids, context(filters, transient))},COUNT(*) AS n FROM "leads"${websiteScope(where({ ...filters, source: [] }, "leads", transient))}${group ? " GROUP BY 2" : ""}`;
          }),
        )
        .join(" UNION ALL "),
    [windows, s.filters, transient, group],
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
  const segments = [...new Set(rows.map(r=>String(r.segment)))].sort();
  const bucket = (key: string, segment: string) => rows.find(r=>r.bucket===key && r.segment===segment);
  const inspect = (key: string, slot: "current" | "prior", segment: string, id: string) => {
    const window = windows.find(w=>w.key===key)!;
    const filters = { ...s.filters, ...window[slot], source: [WEBSITE] };
    const scope = websiteScope(where({ ...filters, source: [] }, "leads", transient));
    const segmentPredicate = group ? `${leadDimensions[group].sql}=${quote(segment)}` : "";
    const ctx = context(filters, transient);
    const contribution = marketingContributor(id)||contributorPredicate(id,ctx);
    const entry = marketingDrill("leads",scope,`${window.title} · ${slot} · ${segment} · ${metrics[id]?.label || id}`,[id],[segmentPredicate,contribution].filter(Boolean).join(" AND "),segmentPredicate);
    entry.queryContext = ctx;
    onDrill?.(entry);
  };
  return (
    <details className="secondary">
      <summary>
        Website enquiries · WoW, MoM, YoY
        <span className="small">Source exactly “{WEBSITE}”</span>
      </summary>
      <div className="secondary-content">
        <div className="pm-controls"><label>Group comparisons <select aria-label="Group Website period comparisons" value={group} onChange={event=>setGroup(event.target.value)}><option value="">All Website leads</option>{Object.entries(leadDimensions).filter(([key])=>!["date","month"].includes(key)).map(([key,dimension])=><option key={key} value={key}>{dimension.label}</option>)}</select></label></div>
        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">Loading website enquiry periods…</p>}
        <div className="table-scroll">
          <table className="worklist-table">
            <thead>
              <tr>
                <th rowSpan={2}>Performance measure</th>
                {windows.map((w) => (
                  <th key={w.key} colSpan={compareOff ? 1 : 3}>
                    {w.title}
                    <small>
                      {label(w.current)}{compareOff ? "" : ` vs ${label(w.prior)}`}
                    </small>
                  </th>
                ))}
              </tr>
              <tr>
                {windows.flatMap((w) => [
                  <th key={w.key + "c"}>Current</th>,
                  ...(compareOff ? [] : [<th key={w.key + "p"}>Prior</th>, <th key={w.key + "d"}>Δ</th>]),
                ])}
              </tr>
            </thead>
            <tbody>
              {segments.flatMap(segment=>ids.map((id) => (
                <tr key={segment+id}>
                  <th scope="row">{group ? `${segment} · ` : ""}{metrics[id]?.label || id}</th>
                  {windows.flatMap((w) => {
                    const current = bucket(`${w.key}:current`,segment)?.[id];
                    const prior = bucket(`${w.key}:prior`,segment)?.[id];
                    return [
                      <td key={w.key + "c"}><button className="pm-cell" disabled={!onDrill||current==null} onClick={()=>inspect(w.key,"current",segment,id)}>{fmt(id, current)}</button></td>,
                      ...(compareOff ? [] : [
                        <td key={w.key + "p"}><button className="pm-cell" disabled={!onDrill||prior==null} onClick={()=>inspect(w.key,"prior",segment,id)}>{fmt(id, prior)}</button></td>,
                        <td key={w.key + "d"}>{delta(id, current, prior)}</td>,
                      ]),
                    ];
                  })}
                </tr>
              )))}
              {segments.map(segment=><tr key={segment}>
                <th scope="row">{group ? `${segment} · ` : ""}Contributing rows</th>
                {windows.flatMap((w) => [
                  <td key={w.key + "c"}>
                    <button className="pm-cell" disabled={!onDrill} onClick={()=>inspect(w.key,"current",segment,"leads")}>{fmt("records", bucket(`${w.key}:current`,segment)?.n)}</button>
                  </td>,
                  ...(compareOff ? [] : [
                    <td key={w.key + "p"}>
                      <button className="pm-cell" disabled={!onDrill} onClick={()=>inspect(w.key,"prior",segment,"leads")}>{fmt("records", bucket(`${w.key}:prior`,segment)?.n)}</button>
                    </td>,
                    <td key={w.key + "d"}>—</td>,
                  ]),
                ])}
              </tr>)}
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
