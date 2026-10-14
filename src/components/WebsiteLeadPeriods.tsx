import { DropdownField } from "./ui/DropdownField";
import { useEffect, useMemo, useState } from "react";
import { query, quote, health, type Row } from "../data/duckdb";
import { historicalTransient } from "../data/periods";
import { metrics, contributorPredicate } from "../semantics/metrics";
import { fmt, delta } from "../semantics/formats";
import { useStore } from "../state/store";
import { context, where, today } from "../data/analytics";

import { WEBSITE, websiteScope, marketingMetricSQL, marketingDimension, marketingDimensionOptions, marketingContributor, websitePeriodWindows, websiteColumns } from "../data/performance-marketing";
import { useGroupFields } from "../data/group-registry";
const ids = [...websiteColumns, "website_contact_rate", "website_untouched", "website_open", "website_pipeline_value"];
const label = (range: { from: string; to: string }) =>
  `${range.from} → ${range.to}`;

import type { TreeRow } from "./NestedTable";
import { marketingDrill } from "./MarketingAnalytics";

export function WebsiteLeadPeriods({ version, onDrill, expanded = false }: { version: string | number; onDrill?: (entry: TreeRow) => void; expanded?: boolean }) {
  const s = useStore();
  const compareOff = s.compare === "none";
  const sourceEmpty = health.leads?.recordsCount === 0;
  const [chosen, setGroup] = useState("");
  const registry = useGroupFields("leads", chosen ? [chosen] : []);
  // Date and month are the comparison windows themselves, so they are not segments here.
  const options = useMemo(() => marketingDimensionOptions("leads", registry, ["date", "month"]), [registry]);
  const dimension = chosen ? marketingDimension("leads", chosen) : undefined;
  const group = dimension ? chosen : "";
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const asOf = today();
  const windows = useMemo(() => websitePeriodWindows(asOf), [asOf]);
  // The source dimension is pinned to Website here, so a source chosen
  // elsewhere must not narrow it further.
  const transient = useMemo(
    () => historicalTransient(s.transient).filter((t) => t.field !== "source"),
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
            return `SELECT '${w.key}:${slot}' AS bucket,${dimension ? dimension.sql : "'All Website leads'"} AS segment,${marketingMetricSQL(ids, context(filters, transient))},COUNT(*) AS n FROM "leads"${websiteScope(where({ ...filters, source: [] }, "leads", transient))}${group ? " GROUP BY 2" : ""}`;
          }),
        )
        .join(" UNION ALL "),
    [windows, s.filters, transient, dimension],
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
    const segmentPredicate = dimension ? `${dimension.sql}=${quote(segment)}` : "";
    const ctx = context(filters, transient);
    const contribution = marketingContributor(id)||contributorPredicate(id,ctx);
    const entry = marketingDrill("leads",scope,`${window.title} · ${slot} · ${segment} · ${metrics[id]?.label || id}`,[id],[segmentPredicate,contribution].filter(Boolean).join(" AND "),segmentPredicate);
    entry.queryContext = ctx;
    onDrill?.(entry);
  };
  return (
    <details id="website-lead-periods" className="secondary website-lead-periods" open={expanded || undefined}>
      <summary>
        Website leads received · weekly, monthly & other periods
        <span className="small">Source exactly “{WEBSITE}”</span>
      </summary>
      <div className="secondary-content">
        <div className="pm-controls"><label>Group comparisons <DropdownField aria-label="Group Website period comparisons" value={group} onChange={event=>setGroup(event.target.value)}><option value="">All Website leads</option>{options.map(o=><option key={o.field} value={o.field}>{o.label}</option>)}</DropdownField></label></div>
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
          Week, month, quarter and year windows run to today and ignore the page
          date filter; the 30-day window is rolling. Other filters still apply.
          Outcomes are the latest recorded statuses for leads created in each window.
        </p>
      </div>
    </details>
  );
}
