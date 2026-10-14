import { DropdownField } from "./ui/DropdownField";
import { useEffect, useMemo, useState } from "react";
import { query, quote, health, type Row } from "../data/duckdb";
import { historicalTransient, comparisonDates } from "../data/periods";
import { metrics, metricSQL, contributorPredicate } from "../semantics/metrics";
import { metricTable } from "../semantics/catalogue";
import { fmt, delta } from "../semantics/formats";
import { useStore } from "../state/store";
import { context, where, today } from "../data/analytics";

import { WEBSITE, websiteScope, marketingMetricSQL, marketingDimension, marketingDimensionOptions, marketingContributor, websitePeriodWindows, websiteColumns } from "../data/performance-marketing";
import { useGroupFields } from "../data/group-registry";
const websiteIds = [...websiteColumns, "website_contact_rate", "website_untouched", "website_open", "website_pipeline_value"];
const label = (range: { from: string; to: string }) =>
  `${range.from} → ${range.to}`;

import type { TreeRow } from "./NestedTable";
import { marketingDrill } from "./MarketingAnalytics";

export function WebsiteLeadPeriods({ version, onDrill, expanded = false, websiteOnly = true }: { version: string | number; onDrill?: (entry: TreeRow) => void; expanded?: boolean; websiteOnly?: boolean }) {
  const s = useStore();
  const ids = websiteOnly ? websiteIds : Object.keys(metrics).filter(id => metricTable(id) === "leads");
  const compareOff = s.compare === "none";
  const sourceEmpty = health.leads?.recordsCount === 0;
  const [chosen, setGroup] = useState("");
  const [multiLocation, setMultiLocation] = useState(false);
  const [lastWeek, setLastWeek] = useState(true);
  const [custom, setCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(s.filters.from || today());
  const [customTo, setCustomTo] = useState(s.filters.to || today());
  const customValid = !!customFrom && !!customTo && customFrom <= customTo;
  const activeGroup = multiLocation ? "location" : chosen;
  const registry = useGroupFields("leads", activeGroup ? [activeGroup] : []);
  // Date and month are the comparison windows themselves, so they are not segments here.
  const options = useMemo(() => marketingDimensionOptions("leads", registry, ["date", "month"]), [registry]);
  const dimension = activeGroup ? marketingDimension("leads", activeGroup) : undefined;
  const group = dimension ? activeGroup : "";
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const asOf = today();
  const windows = useMemo(() => [
    ...websitePeriodWindows(asOf).filter(w => lastWeek || w.key !== "last_week"),
    ...(custom && customValid ? [{ key: "custom", title: "Custom period", current: { from: customFrom, to: customTo }, prior: comparisonDates(customFrom, customTo, "elapsed") }] : []),
  ], [asOf, lastWeek, custom, customValid, customFrom, customTo]);
  const sourceFilters = websiteOnly ? { ...s.filters, source: [WEBSITE] } : s.filters;
  const scopeFor = (filters: typeof s.filters) => websiteOnly ? websiteScope(where({ ...filters, source: [] }, "leads", transient)) : where(filters, "leads", transient);
  // The source dimension is pinned to Website here, so a source chosen
  // elsewhere must not narrow it further.
  const transient = useMemo(
    () => historicalTransient(s.transient).filter((t) => !websiteOnly || t.field !== "source"),
    [s.transient, websiteOnly],
  );
  const sql = useMemo(
    () =>
      windows
        .flatMap((w) =>
          (["current", "prior"] as const).map((slot) => {
            const range = w[slot];
            const filters = {
              ...sourceFilters,
              from: range.from,
              to: range.to,
            };
            return `SELECT '${w.key}:${slot}' AS bucket,${dimension ? dimension.sql : "'All Website leads'"} AS segment,${(websiteOnly ? marketingMetricSQL : metricSQL)(ids, context(filters, transient))},COUNT(*) AS n FROM "leads"${scopeFor(filters)}${group ? " GROUP BY 2" : ""}`;
          }),
        )
        .join(" UNION ALL "),
    [windows, s.filters, transient, dimension, websiteOnly],
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
    const filters = { ...sourceFilters, ...window[slot] };
    const scope = scopeFor(filters);
    const segmentPredicate = dimension ? `${dimension.sql}=${quote(segment)}` : "";
    const ctx = context(filters, transient);
    const contribution = (websiteOnly ? marketingContributor(id) : "")||contributorPredicate(id,ctx);
    const entry = marketingDrill("leads",scope,`${window.title} · ${slot} · ${segment} · ${metrics[id]?.label || id}`,[id],[segmentPredicate,contribution].filter(Boolean).join(" AND "),segmentPredicate);
    entry.queryContext = ctx;
    onDrill?.(entry);
  };
  return (
    <details id={websiteOnly ? "website-lead-periods" : "lead-periods"} className="secondary website-lead-periods" open={expanded || undefined}>
      <summary>
        {websiteOnly ? "Website leads" : "Leads"} received · weekly, monthly & custom periods
        <span className="small">{websiteOnly ? `Source exactly “${WEBSITE}”` : "Selected lead sources"}</span>
      </summary>
      <div className="secondary-content">
        <div className="pm-controls period-toolbar" aria-label="Period table options">
          <div className="period-toolbar-section">
            <span className="period-toolbar-caption">Columns</span>
            <div className="period-toolbar-toggles">
              <label className="period-toggle"><input type="checkbox" checked={lastWeek} onChange={e=>setLastWeek(e.target.checked)}/><span>Last week</span></label>
              <label className="period-toggle"><input type="checkbox" checked={custom} onChange={e=>setCustom(e.target.checked)}/><span>Custom period</span></label>
            </div>
          </div>
          {custom && <div className="period-date-range">
            <label>Start date<input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/></label>
            <span className="period-date-arrow" aria-hidden="true">→</span>
            <label>End date<input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}/></label>
          </div>}
          <div className="period-toolbar-section period-toolbar-view">
            <span className="period-toolbar-caption">Table view</span>
            <label className="period-toggle"><input type="checkbox" checked={multiLocation} onChange={e=>setMultiLocation(e.target.checked)}/><span>Multi-location</span></label>
          </div>
          <label className="period-group-field">Group by <DropdownField aria-label="Group period comparisons" disabled={multiLocation} value={group} onChange={event=>setGroup(event.target.value)}><option value="">All selected leads</option>{options.map(o=><option key={o.field} value={o.field}>{o.label}</option>)}</DropdownField></label>
        </div>
        {custom && !customValid && <p role="alert">Choose a custom start and end date, with the end on or after the start.</p>}
        {multiLocation && <p className="small">Locations appear separately in one table. Selected studio filters still apply; select multiple studios or all studios to compare them.</p>}
        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">Loading website enquiry periods…</p>}
        {sourceEmpty && <p role="status">The latest Leads snapshot contains no rows. Period totals are unavailable until source data is loaded.</p>}
        {!sourceEmpty && <div className="table-scroll">
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
        </div>}
        <p className="small">
          Last Week covers the completed Monday–Sunday week. Custom dates use the chosen range and compare the preceding equal-length period. Week, month, quarter and year windows run to today and ignore the page
          date filter; the 30-day window is rolling. Other filters still apply.
          Outcomes are the latest recorded statuses for leads created in each window.
        </p>
      </div>
    </details>
  );
}
