import { renewalCohortSQL, renewalDrillPredicate } from "../data/renewals";
import type { TreeRow } from "./NestedTable";
import { acquisitionPeriodLabel } from "../data/acquisition";
import { useEffect, useState } from "react";
import { query, type Row } from "../data/duckdb";
import { where, today } from "../data/analytics";
import { useStore } from "../state/store";
export function RenewalCohorts({ version, onDrill }: { version: number; onDrill: (entry: TreeRow) => void }) {
  const filters = useStore((s) => s.filters);
  const transient = useStore((s) => s.transient);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  function drill(row: Row, state: string) {
    const end = new Date(today() + "T00:00:00Z");
    end.setUTCDate(0);
    const cohortFilters = { ...filters, from: "", to: end.toISOString().slice(0, 10) };
    const scope = where(cohortFilters, "lapsed", transient);
    onDrill({ id: `renewal-${row.month}-${state}`, label: `${acquisitionPeriodLabel(row.month)} · ${state === 'due' ? 'Total due' : state === 'grace' ? 'Within grace' : state}`, source: "lapsed", filters: cohortFilters, metrics: ["memberships_count", "membership_revenue"], predicate: renewalDrillPredicate(scope, today(), String(row.month), state), path: [], values: row, children: [] });
  }
  useEffect(() => {
    let active = true;
    setError("");
    const end = new Date(today() + "T00:00:00Z");
    end.setUTCDate(0);
    const scope = where(
      { ...filters, from: "", to: end.toISOString().slice(0, 10) },
      "lapsed",
      transient,
    );
    query(renewalCohortSQL(scope, today()))
      .then((r) => {
        if (active) setRows([...r].reverse());
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [filters, transient, version]);
  return (
    <section className="panel intelligence-panel renewal-cohorts">
      <h2>Renewals by expiry month</h2>
      <p className="small">
        14 completed months, independent of date filters. Other filters apply.
        One paid ongoing membership per community member per expiry month.
        Renewed means a later paid entitlement extends access and starts by 30
        days after expiry. Lapsed means no recorded renewal after that grace
        period. Future expiries remain upcoming. Source coverage may omit
        renewals.
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <div className="intelligence-table">
          <table>
            <thead>
              <tr>
                {[
                  "Expiry month",
                  "Total due",
                  "Renewed",
                  "Lapsed",
                  "Within grace",
                  "Upcoming",
                  "Renewal rate",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.month)}>
                  <td><button className="scorecard-cell" onClick={() => drill(r, 'due')}>{acquisitionPeriodLabel(r.month)}</button></td>
                  {["due", "renewed", "lapsed", "grace", "upcoming"].map(
                    (k) => (
                      <td key={k}><button className="scorecard-cell" aria-label={`Inspect ${k} memberships for ${r.month}`} onClick={() => drill(r, k)}>{r[k]}</button></td>
                    ),
                  )}
                  <td>
                    <button className="scorecard-cell" aria-label={`Inspect renewal rate for ${r.month}`} onClick={() => drill(r, 'due')}>{Number(r.due)
                      ? ((100 * Number(r.renewed)) / Number(r.due)).toFixed(1) +
                        "%"
                      : "—"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p>No paid memberships match the global scope.</p>}
        </div>
      )}
    </section>
  );
}
