import { renewalCohortSQL, renewalDrillPredicate, renewalSegmentSQL } from "../data/renewals";
import { GroupByPicker, usePersistentGroups } from "./ui/GroupByPicker";
import { useGroupFields } from "../data/group-registry";
import { groupable } from "../data/group-fields";
import type { TreeRow } from "./NestedTable";
import { acquisitionPeriodLabel } from "../data/acquisition";
import { Fragment, useEffect, useState } from "react";
import { query, type Row } from "../data/duckdb";
import { where, today } from "../data/analytics";
import { useStore } from "../state/store";
export function RenewalCohorts({ version, onDrill }: { version: number; onDrill: (entry: TreeRow) => void }) {
  const filters = useStore((s) => s.filters);
  const transient = useStore((s) => s.transient);
  const [rows, setRows] = useState<Row[]>([]);
  const [segments, setSegments] = useState<Row[]>([]);
  const [error, setError] = useState("");
  // Optional split of each expiry month by one Lapsed column; none keeps the month-only table.
  const [saved, setSplit] = usePersistentGroups("renewal-cohorts", []);
  const split = saved.filter(groupable).slice(0, 1);
  const field = split[0];
  const fields = useGroupFields("lapsed", split);
  function drill(row: Row, state: string) {
    const end = new Date(today() + "T00:00:00Z");
    end.setUTCDate(0);
    const cohortFilters = { ...filters, from: "", to: end.toISOString().slice(0, 10) };
    const scope = where(cohortFilters, "lapsed", transient);
    const segment = field && row.segment != null ? { field, value: String(row.segment) } : undefined;
    onDrill({ id: `renewal-${row.month}-${segment ? `${segment.field}-${segment.value}-` : ""}${state}`, label: `${acquisitionPeriodLabel(row.month)}${segment ? ` · ${segment.value}` : ""} · ${state === 'due' ? 'Total due' : state}`, source: "lapsed", filters: cohortFilters, metrics: ["memberships_count", "membership_revenue"], predicate: renewalDrillPredicate(scope, today(), String(row.month), state, segment), path: [], values: row, children: [] });
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
    Promise.all([query(renewalCohortSQL(scope, today())), field ? query(renewalSegmentSQL(scope, today(), field)) : Promise.resolve([])])
      .then(([r, s]) => {
        if (active) { setRows([...r].reverse()); setSegments(s); }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [filters, transient, version, field]);
  const cells = (r: Row, segment?: string) => <>
    {["due", "renewed", "lapsed", "frozen"].map(
      (k) => (
        <td key={k}><button className="scorecard-cell" aria-label={`Inspect ${k} memberships for ${r.month}${segment ? ` · ${segment}` : ""}`} onClick={() => drill(r, k)}>{r[k]}</button></td>
      ),
    )}
    <td>
      <button className="scorecard-cell" aria-label={`Inspect renewal rate for ${r.month}${segment ? ` · ${segment}` : ""}`} onClick={() => drill(r, 'due')}>{Number(r.due)
        ? ((100 * Number(r.renewed)) / Number(r.due)).toFixed(1) +
          "%"
        : "—"}</button>
    </td>
  </>;
  return (
    <section className="panel intelligence-panel renewal-cohorts">
      <h2>Renewals by expiry month</h2>
      <p className="small">
        14 completed months, independent of date filters. Other filters apply.
        One paid ongoing membership per member per expiry month; zero-value and
        restricted memberships (intro, 2 for 1, single class, private, credit)
        are excluded. Total due = Renewed + Lapsed + Frozen. Lapsed means it
        was the member's most recent membership and the sheet records a
        Churned Date. Renewed means a later paid membership exists, or no churn
        is recorded. Frozen is the membership's own status.
      </p>
      <GroupByPicker name="Renewals" label="Split months by" value={split} onChange={setSplit} fields={fields} defaults={[]} min={0} max={1} emptyLabel="No split" />
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
                  "Frozen",
                  "Renewal rate",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={String(r.month)}>
                  <tr>
                    <td><button className="scorecard-cell" onClick={() => drill(r, 'due')}>{acquisitionPeriodLabel(r.month)}</button></td>
                    {cells(r)}
                  </tr>
                  {field && segments.filter((x) => x.month === r.month).map((x) => (
                    <tr key={String(x.segment)} className="renewal-segment">
                      <td><button className="scorecard-cell" style={{ paddingLeft: 18 }} title={`${fields.find((f) => f.field === field)?.label ?? field}: ${x.segment}`} onClick={() => drill(x, 'due')}>{String(x.segment)}</button></td>
                      {cells(x, String(x.segment))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!rows.length && <p>No paid memberships match the global scope.</p>}
        </div>
      )}
    </section>
  );
}
