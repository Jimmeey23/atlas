import { GitBranch } from "lucide-react";
import { query } from "../../data/duckdb";
import { ensureSource } from "../../data/loader";
import { context, metricFacts } from "../../data/analytics";
import { metricSQL, metrics } from "../../semantics/metrics";
import { MetricInfoHint } from "../ui/MetricInfoHint";
import { metricTable } from "../../semantics/catalogue";
import { fmt } from "../../semantics/formats";
import { useStore } from "../../state/store";
import { funnelSteps } from "../../data/overview-board";
import { useBoardData } from "./useBoardData";

// Lead stages follow one another. Converted and retained newcomers are separate outcomes of the same
// cohort (a retained client need not have converted), so they are shown against the cohort, not step to step.
const funnels = [
  { title: "Leads to members", ids: ["leads", "trials_completed", "converted_leads"], sequential: true },
  { title: "New client outcomes", ids: ["new_clients", "new_converted", "new_retained"], sequential: false },
];

/** Each funnel reads one governed source, so its steps match the figures on the other tabs. */
export function ConversionFunnel({ version }: { version: string }) {
  const filters = useStore((s) => s.filters);
  const transient = useStore((s) => s.transient);
  const { data, loading, error } = useBoardData(
    () =>
      Promise.all(
        funnels.map(async (f) => {
          const table = metricTable(f.ids[0]);
          if (!table) throw new Error(`${f.title} has no source sheet.`);
          await ensureSource(table);
          const rows = await query(`SELECT ${metricSQL(f.ids, context(filters, transient))} FROM ${metricFacts(filters, table, transient)}`);
          const steps = funnelSteps(f.ids.map((id) => ({ id, label: metrics[id].label, value: rows[0]?.[id] == null ? null : Number(rows[0][id]) })));
          return f.sequential ? steps : steps.map((s) => ({ ...s, ofPrevious: null, biggestDrop: false }));
        }),
      ),
    [filters, transient, version],
  );
  return (
    <article className="board-card board-funnel">
      <header><div className="board-heading"><span className="board-kicker"><GitBranch size={14} aria-hidden="true" />Acquisition & progression</span><h3>Conversion funnels</h3><p>Follow each stage of the journey</p></div></header>
      {error ? (
        <p className="board-state board-error" role="alert">{error}</p>
      ) : loading && !data ? (
        <p className="board-state" role="status">Counting each step…</p>
      ) : (
        <div className="board-funnels" aria-busy={loading}>
          {funnels.map((f, i) => {
            const steps = data?.[i] || [];
            return (
              <section className="board-funnel-panel" key={f.title}>
                <h4>{f.title}</h4><p className="board-funnel-caption">{f.sequential ? "Progression between recorded lead stages" : "Independent outcomes of the first-visit cohort"}</p>
                {!steps[0] || !steps[0].value ? (
                  <p className="board-state" role="status">No {metrics[f.ids[0]].label.toLowerCase()} in this period.</p>
                ) : (
                  <ol>
                    {steps.map((s) => (
                      <li key={s.id} className={s.biggestDrop ? "drop" : ""}>
                        <span className="board-funnel-bar" style={{ width: `${Math.max(4, (s.ofFirst ?? 0) * 100)}%` }} aria-hidden="true" />
                        <span className="board-funnel-label">
                          {s.label}
                          <MetricInfoHint id={s.id} label={s.label} />
                        </span>
                        <strong className="number">{fmt(s.id, s.value)}</strong>
                        <small>
                          {f.sequential
                            ? s.ofPrevious === null ? "" : `${(s.ofPrevious * 100).toFixed(0)}% of previous`
                            : s.ofFirst === null || s === steps[0] ? "" : `${(s.ofFirst * 100).toFixed(0)}% of ${steps[0].label.toLowerCase()}`}
                          {s.biggestDrop ? " · biggest drop-off" : ""}
                        </small>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}
    </article>
  );
}
