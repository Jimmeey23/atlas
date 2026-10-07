import { useEffect, useState } from "react";
import { query, type Row } from "../data/duckdb";
import { where, today } from "../data/analytics";
import { useStore } from "../state/store";
import { acquisitionPeriodLabel } from "../data/acquisition";
import { exportCSV } from "./exports";
import {
  COHORT_MONTHS,
  cohortDrillPredicate,
  cohortRetentionSQL,
  cohortTriangle,
  type CohortRow,
} from "../data/cohorts";
import type { TreeRow } from "./NestedTable";

export function CohortRetention({
  version,
  onDrill,
}: {
  version: number;
  onDrill: (entry: TreeRow) => void;
}) {
  const filters = useStore((s) => s.filters);
  const transient = useStore((s) => s.transient);
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState(true);
  // The triangle reads back over a year, so the global date range would hide
  // every mature cohort. Other filters still scope who entered.
  const cohortFilters = { ...filters, from: "", to: "" };
  const scope = where(cohortFilters, "new", transient);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    query(cohortRetentionSQL(scope, today()))
      .then((r) => {
        if (active) setRows(cohortTriangle(r as Record<string, unknown>[]));
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
  }, [scope, version]);

  function drill(row: CohortRow, offset: number | null) {
    onDrill({
      id: `cohort-${row.month}-${offset ?? "all"}`,
      label: `${acquisitionPeriodLabel(row.month)} cohort · ${offset == null ? "all members" : offset === 0 ? "acquisition month" : `month ${offset}`}`,
      source: "new",
      filters: cohortFilters,
      metrics: ["new_clients", "conversion_rate", "avg_ltv"],
      predicate: cohortDrillPredicate(scope, today(), row.month, offset),
      path: [],
      values: { n: offset == null ? row.size : (row.retained[offset] ?? 0) } as Row,
      children: [],
    });
  }

  const offsets = Array.from({ length: COHORT_MONTHS + 1 }, (_, i) => i);
  const text = (row: CohortRow, offset: number) => {
    const v = row.retained[offset];
    if (v == null) return "";
    return share ? (row.size ? ((100 * v) / row.size).toFixed(0) + "%" : "—") : String(v);
  };

  return (
    <section className="panel intelligence-panel cohort-retention">
      <header className="cohort-head">
        <div>
          <h2>Member retention by acquisition cohort</h2>
          <p className="small">
            Each row is the month members first visited. Month 0 is that same
            month; a later column counts how many of them attended at least one
            session in that month, at any studio. Blank cells are months that
            have not happened yet for that cohort. The global date range does
            not apply; other filters scope who entered.
          </p>
        </div>
        <div className="cohort-actions">
          <button
            className="button"
            aria-pressed={share}
            onClick={() => setShare(!share)}
          >
            {share ? "Show members" : "Show percentage"}
          </button>
          <button
            className="button"
            disabled={!rows.length}
            onClick={() =>
              exportCSV(
                "cohort-retention",
                rows.map((row) => ({
                  Cohort: row.month,
                  Members: row.size,
                  ...Object.fromEntries(
                    offsets.map((o) => [`Month ${o}`, row.retained[o] ?? ""]),
                  ),
                })),
              )
            }
          >
            Export CSV
          </button>
        </div>
      </header>
      {error ? (
        <p role="alert">{error}</p>
      ) : loading ? (
        <p role="status">Building cohorts…</p>
      ) : (
        <div className="intelligence-table cohort-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Cohort</th>
                <th scope="col">Members</th>
                {offsets.map((o) => (
                  <th key={o} scope="col">{o === 0 ? "Month 0" : `+${o}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month}>
                  <th scope="row">
                    <button className="scorecard-cell" onClick={() => drill(row, null)}>
                      {acquisitionPeriodLabel(row.month)}
                    </button>
                  </th>
                  <td>
                    <button className="scorecard-cell" onClick={() => drill(row, null)}>
                      {row.size}
                    </button>
                  </td>
                  {offsets.map((o) => {
                    const v = row.retained[o];
                    const rate = v != null && row.size ? v / row.size : null;
                    return (
                      <td key={o}>
                        {v == null ? (
                          <span className="cohort-empty" aria-hidden="true">·</span>
                        ) : (
                          <button
                            className="scorecard-cell cohort-cell"
                            style={{
                              background: `color-mix(in srgb,var(--accent) ${Math.round(Math.min(1, rate ?? 0) * 60)}%,transparent)`,
                            }}
                            aria-label={`${acquisitionPeriodLabel(row.month)} cohort, month ${o}: ${v} of ${row.size} members`}
                            onClick={() => drill(row, o)}
                          >
                            {text(row, o)}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p>No acquisition cohorts match this scope.</p>}
        </div>
      )}
    </section>
  );
}
