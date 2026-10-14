import { query } from "../../data/duckdb";
import { ensureSource } from "../../data/loader";
import { context, metricFacts } from "../../data/analytics";
import { metricSQL, metrics } from "../../semantics/metrics";
import { metricTable } from "../../semantics/catalogue";
import { fmt } from "../../semantics/formats";
import { useStore } from "../../state/store";
import { funnelSteps } from "../../data/overview-board";
import { useBoardData } from "./useBoardData";

const funnels = [
  { title: "Leads to members", ids: ["leads", "trials_completed", "converted_leads"] },
  { title: "New clients to retained", ids: ["new_clients", "new_converted", "new_retained"] },
];

/** Each funnel reads one governed source, so its steps match the figures on the other tabs. */
export function ConversionFunnel({ version }: { version: number }) {
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
          return funnelSteps(f.ids.map((id) => ({ id, label: metrics[id].label, value: rows[0]?.[id] == null ? null : Number(rows[0][id]) })));
        }),
      ),
    [filters, transient, version],
  );
  return (
    <article className="board-card board-funnel">
      <header><h3>Conversion funnels</h3></header>
      {error ? (
        <p className="board-state board-error" role="alert">{error}</p>
      ) : loading && !data ? (
        <p className="board-state" role="status">Counting each step…</p>
      ) : (
        <div className="board-funnels" aria-busy={loading}>
          {funnels.map((f, i) => {
            const steps = data?.[i] || [];
            return (
              <section key={f.title}>
                <h4>{f.title}</h4>
                {!steps[0] || !steps[0].value ? (
                  <p className="board-state" role="status">No {metrics[f.ids[0]].label.toLowerCase()} in this period.</p>
                ) : (
                  <ol>
                    {steps.map((s) => (
                      <li key={s.id} className={s.biggestDrop ? "drop" : ""}>
                        <span className="board-funnel-bar" style={{ width: `${Math.max(4, (s.ofFirst ?? 0) * 100)}%` }} aria-hidden="true" />
                        <span className="board-funnel-label">{s.label}</span>
                        <strong className="number">{fmt(s.id, s.value)}</strong>
                        <small>
                          {s.ofPrevious === null ? "" : `${(s.ofPrevious * 100).toFixed(0)}% of previous`}
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
