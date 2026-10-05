import { renewalCohortSQL } from "../data/renewals";
import { useEffect, useState } from "react";
import { query, type Row } from "../data/duckdb";
import { where, today } from "../data/analytics";
import { useStore } from "../state/store";
export function RenewalCohorts({ version }: { version: number }) {
  const filters = useStore((s) => s.filters);
  const transient = useStore((s) => s.transient);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
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
                  <td>{r.month}</td>
                  {["due", "renewed", "lapsed", "grace", "upcoming"].map(
                    (k) => (
                      <td key={k}>{r[k]}</td>
                    ),
                  )}
                  <td>
                    {Number(r.due)
                      ? ((100 * Number(r.renewed)) / Number(r.due)).toFixed(1) +
                        "%"
                      : "—"}
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
