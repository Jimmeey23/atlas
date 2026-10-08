import { InstructorName } from "./InstructorAvatar";
import { useEffect, useState } from "react";
import { analyse, type Analysis } from "../data/analytics";
import { blueprints } from "../data/blueprints";
import { metrics } from "../semantics/metrics";
import { fmt, delta } from "../semantics/formats";
import { useStore } from "../state/store";
import { sourceStates } from "../data/loader";
import { Register } from "./Register";
import { MetricCard } from "./MetricCard";
import { exportCSV } from "./exports";
import type { Row } from "../data/duckdb";

// Economics is its own blueprint (payroll) rendered inside the instructor tab,
// so the page keeps one source of truth for both halves of an instructor.
const ECONOMICS_TAB = 10;
const bp = blueprints[ECONOMICS_TAB];
const blank: Analysis = { total: {}, previous: {}, trend: [], groups: [], previousGroups: [], heat: [], raw: [], count: 0, elapsed: 0 };

export function InstructorEconomics({ version }: { version: string | number }) {
  const s = useStore();
  const [analysis, setAnalysis] = useState<Analysis>(blank);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const ready = sourceStates.payroll?.state === "ready";
  useEffect(() => {
    if (!ready) return;
    let active = true;
    setBusy(true);
    setError("");
    // analyse() reads the live store, so the tab's own filters already apply.
    analyse(ECONOMICS_TAB, ["trainer"], bp.columns)
      .then((result) => {
        if (active) {
          setAnalysis(result);
          setBusy(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(String(e));
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [ready, version, s.filters, s.transient, s.compare, s.rate]);
  const rows = analysis.groups
    .filter((g) => Number(g.level) === 0)
    .sort((a, b) => Number(b[bp.columns[0]] ?? 0) - Number(a[bp.columns[0]] ?? 0));
  return (
    <Register
      index="03b"
      title="Instructor economics"
      subtitle="Payroll-sourced cost, revenue and contribution for the same filters"
      actions={
        <button
          className="button"
          disabled={!rows.length}
          onClick={() =>
            exportCSV(
              "instructor-economics",
              rows.map((r) => ({
                Instructor: r.g0,
                ...Object.fromEntries(bp.columns.map((id) => [metrics[id]?.label || id, r[id]])),
              })) as Row[],
            )
          }
        >
          Export CSV
        </button>
      }
    >
      {!ready ? (
        <p role="status">Payroll source still loading…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <div className="metric-strip eight">
            {bp.kpis.map((id) => (
              <MetricCard
                key={id}
                id={id}
                value={analysis.total[id]}
                previous={analysis.previous[id]}
                trend={analysis.trend}
                n={Number(analysis.total.n || analysis.count)}
                evidence={analysis.total}
                compare={s.compare !== "none"}
              />
            ))}
          </div>
          {busy && <p role="status">Recalculating instructor economics…</p>}
          <div className="table-scroll">
            <table className="worklist-table">
              <thead>
                <tr>
                  <th>Instructor</th>
                  {bp.columns.map((id) => (
                    <th key={id}>{metrics[id]?.label || id}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.g0)}>
                    <th scope="row"><InstructorName name={String(r.g0 ?? "Unspecified")}/></th>
                    {bp.columns.map((id) => (
                      <td key={id}>{fmt(id, r[id])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">All instructors</th>
                  {bp.columns.map((id) => (
                    <td key={id}>
                      {fmt(id, analysis.total[id])}
                      {s.compare !== "none" && (
                        <small>{delta(id, analysis.total[id], analysis.previous[id])}</small>
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          {!rows.length && !busy && (
            <p className="empty-state">No payroll records match the current filters.</p>
          )}
        </>
      )}
    </Register>
  );
}
