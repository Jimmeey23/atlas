import { useEffect, useMemo, useState } from "react";
import { query, type Row } from "../data/duckdb";
import { comparison, context, metricFacts } from "../data/analytics";
import { ensureSource, usable } from "../data/loader";
import { useStore } from "../state/store";
import { metrics, metricSQL, contributorPredicate } from "../semantics/metrics";
import { catalogue, domainLabels, domains } from "../semantics/catalogue";
import { cellDelta, derived, provenance } from "../semantics/cells";
import { fmt } from "../semantics/formats";
import { sheets } from "../data/sheets.config";
import { Register } from "./Register";
import { exportCSV } from "./exports";
import type { TreeRow } from "./NestedTable";

type Measured = {
  id: string;
  table: string;
  domain: string;
  value: unknown;
  previous: unknown;
  n: number;
};

/**
 * Every metric the app knows how to compute, over the current scope. One query
 * per source table rather than one per metric, so the whole catalogue costs a
 * handful of queries. It loads on demand: opening it pulls the sources this
 * page would not otherwise need.
 */
export function MetricIndex({
  version,
  onDrill,
}: {
  version: number;
  onDrill: (entry: TreeRow) => void;
}) {
  const filters = useStore((s) => s.filters);
  const transient = useStore((s) => s.transient);
  const compare = useStore((s) => s.compare);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Measured[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("all");
  const [problems, setProblems] = useState<string[]>([]);
  const tables = useMemo(() => catalogue(), []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setProblems([]);
    (async () => {
      const measured: Measured[] = [];
      const failed: string[] = [];
      const prior = compare === "none" ? null : comparison(filters, compare);
      for (const [table, entries] of tables) {
        if (!active) return;
        try {
          if (!usable(table)) await ensureSource(table);
          if (!usable(table)) throw new Error("source unavailable");
          const ids = entries.map((e) => e.id);
          const [now, before] = await Promise.all([
            query(
              `SELECT ${metricSQL(ids, context(filters))}, COUNT(*) AS n FROM ${metricFacts(filters, table, transient)}`,
            ),
            prior
              ? query(
                  `SELECT ${metricSQL(ids, context(prior))} FROM ${metricFacts(prior, table, transient)}`,
                )
              : Promise.resolve([{} as Row]),
          ]);
          for (const entry of entries)
            measured.push({
              ...entry,
              value: now[0]?.[entry.id] ?? null,
              previous: before[0]?.[entry.id] ?? null,
              n: Number(now[0]?.n ?? 0),
            });
          // Show each table as it lands rather than waiting for all ten.
          if (active) setRows([...measured]);
        } catch {
          failed.push(sheets.find((s) => s.key === table)?.title || table);
        }
      }
      if (!active) return;
      setProblems(failed);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [open, filters, transient, compare, version, tables]);

  function drill(row: Measured) {
    onDrill({
      id: `catalogue-${row.id}`,
      label: `${metrics[row.id].label} · all records in scope`,
      source: row.table,
      filters,
      metrics: [row.id],
      path: [],
      predicate: contributorPredicate(row.id, context(filters)),
      values: { n: row.n } as Row,
      children: [],
    });
  }

  const term = search.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (domain === "all" || r.domain === domain) &&
      (!term ||
        metrics[r.id].label.toLowerCase().includes(term) ||
        r.id.includes(term) ||
        metrics[r.id].description.toLowerCase().includes(term)),
  );
  const grouped = domains
    .map((d) => [d, visible.filter((r) => r.domain === d)] as const)
    .filter(([, list]) => list.length);

  return (
    <Register
      index="08"
      title="Every metric, in this scope"
      subtitle={`All ${[...tables.values()].reduce((a, b) => a + b.length, 0)} registered measures across every source · the same filters as the rest of the page`}
      actions={
        <button className="button" onClick={() => setOpen(!open)}>
          {open ? "Hide the catalogue" : "Show every metric"}
        </button>
      }
    >
      {!open ? (
        <p className="small">
          The full catalogue reads every source sheet, including ones this page
          does not otherwise need. Open it when you want the complete picture.
        </p>
      ) : (
        <>
          <div className="metric-index-toolbar">
            <input
              aria-label="Search metrics"
              placeholder="Search a metric, or its formula…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Filter by domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            >
              <option value="all">All domains</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {domainLabels[d]}
                </option>
              ))}
            </select>
            <span className="small">
              {visible.length} shown{loading ? " · still measuring…" : ""}
            </span>
            <button
              className="button"
              disabled={!visible.length}
              onClick={() =>
                exportCSV(
                  "metric-catalogue",
                  visible.map((r) => ({
                    Metric: metrics[r.id].label,
                    Id: r.id,
                    Domain: r.domain,
                    Source: sheets.find((s) => s.key === r.table)?.title,
                    Value: r.value ?? "",
                    Comparison: r.previous ?? "",
                    Records: r.n,
                    Formula: metrics[r.id].description,
                  })),
                )
              }
            >
              Export catalogue
            </button>
          </div>
          {problems.length > 0 && (
            <p className="notice warn">
              Could not measure {problems.join(", ")}. Those metrics are omitted
              rather than shown as zero.
            </p>
          )}
          {grouped.map(([key, list]) => (
            <section key={key} className="metric-index-group">
              <h3>
                {domainLabels[key]} <span className="small">{list.length}</span>
              </h3>
              <div className="metric-index-grid">
                {list.map((row) => {
                  const thin = derived(row.id) && row.n > 0 && row.n < metrics[row.id].minSample;
                  const change = cellDelta(row.id, row.value, row.previous);
                  return (
                    <button
                      key={row.id}
                      className={`metric-index-cell${thin ? " cell-thin" : ""}`}
                      title={provenance(row.id, row.value, row.n, thin, row.previous)}
                      onClick={() => drill(row)}
                    >
                      <span className="metric-index-label">
                        {metrics[row.id].label}
                      </span>
                      <span className="metric-index-value">
                        {fmt(row.id, row.value, metrics[row.id].format === "currency")}
                        {thin && <span aria-hidden="true">*</span>}
                      </span>
                      <span className="metric-index-foot">
                        <em>{sheets.find((s) => s.key === row.table)?.title}</em>
                        {change && (
                          <span className={`cell-delta ${change.tone}`}>
                            {change.text}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {loading && <p role="status">Measuring the remaining sources…</p>}
          {!loading && !rows.length && <p>No metrics could be measured in this scope.</p>}
        </>
      )}
    </Register>
  );
}
