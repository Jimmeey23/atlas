import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Building2 } from "lucide-react";
import { query } from "../../data/duckdb";
import { ensureSource, usable, sourceStates } from "../../data/loader";
import { comparison, context, metricFacts } from "../../data/analytics";
import { metricSQL, metrics } from "../../semantics/metrics";
import { MetricInfoHint } from "../ui/MetricInfoHint";
import { metricTable } from "../../semantics/catalogue";
import { fmt } from "../../semantics/formats";
import { useStore } from "../../state/store";
import { rankRows } from "../../data/overview-board";
import { useBoardData } from "./useBoardData";

const options = ["gross_revenue", "attendance", "fill_rate"];

/** Studios ranked on one metric, with change against the comparison period and a click-through filter. */
export function StudioLeaderboard({ version }: { version: string }) {
  const filters = useStore((s) => s.filters);
  const transient = useStore((s) => s.transient);
  const compare = useStore((s) => s.compare);
  const set = useStore((s) => s.set);
  const [id, setId] = useState(options[0]);
  const { data, loading, error } = useBoardData(async () => {
    const table = metricTable(id);
    if (!table) throw new Error("This metric has no source sheet.");
    await ensureSource(table);
    if (!usable(table)) throw new Error(sourceStates[table]?.error || `${table} source unavailable`);
    const run = (f: typeof filters) =>
      query(
        `SELECT COALESCE(NULLIF(TRIM(CAST(location AS VARCHAR)),''),'Unspecified') AS label, ${metricSQL([id], context(f, transient))} FROM ${metricFacts(f, table, transient)} GROUP BY 1`,
      );
    const [now, before] = await Promise.all([
      run(filters),
      compare === "none" ? Promise.resolve([]) : run(comparison(filters, compare)),
    ]);
    const prior = new Map(before.map((r) => [String(r.label), r[id] == null ? null : Number(r[id])]));
    return rankRows(
      now.map((r) => ({
        label: String(r.label),
        value: r[id] == null ? null : Number(r[id]),
        previous: prior.get(String(r.label)) ?? null,
      })),
      metrics[id].higherIsBetter,
    );
  }, [id, filters, transient, compare, version]);
  const max = Math.max(...(data || []).map((r) => Math.abs(r.value)), 1);
  const better = metrics[id].higherIsBetter;
  return (
    <article className="board-card board-leaderboard">
      <header>
        <div className="board-heading"><span className="board-kicker"><Building2 size={14} aria-hidden="true" />Studio comparison</span><h3>Studio leaderboard</h3><p>Ranked by the selected measure</p></div>
        <div className="board-tabs" role="tablist" aria-label="Leaderboard metric">
          {options.map((o) => (
            <button key={o} role="tab" aria-selected={o === id} onClick={() => setId(o)}>
              <span>{metrics[o].label}</span>
              <MetricInfoHint id={o} />
            </button>
          ))}
        </div>
      </header>
      {error ? (
        <p className="board-state board-error" role="alert">{error}</p>
      ) : loading && !data ? (
        <p className="board-state" role="status">Ranking studios…</p>
      ) : !data?.length ? (
        <p className="board-state" role="status">No studio has {metrics[id].label.toLowerCase()} for these filters.</p>
      ) : (
        <ol aria-busy={loading}>
          {data.map((r, i) => {
            const good = r.change === null ? null : r.change >= 0 === better;
            return (
              <li key={r.label}>
                <button
                  className="board-row"
                  onClick={() => set({ filters: { ...filters, location: [r.label] } })}
                  aria-label={`Filter to ${r.label}`}
                >
                  <span className="board-rank">{i + 1}</span>
                  <span className="board-name">{r.label}</span>
                  <span className="board-bar" aria-hidden="true"><i style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} /></span>
                  <strong className="number">{fmt(id, r.value)}</strong>
                  <span className={`board-delta ${good === null ? "muted" : good ? "positive" : "negative"}`}>
                    {r.change === null ? "" : r.change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {r.change === null ? "—" : `${Math.abs(r.change * 100).toFixed(1)}%`}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}
