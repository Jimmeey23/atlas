import { ChartPie } from "lucide-react";
import { query } from "../../data/duckdb";
import { ensureSource, usable, sourceStates } from "../../data/loader";
import { context, metricFacts } from "../../data/analytics";
import { metricSQL } from "../../semantics/metrics";
import { fmt } from "../../semantics/formats";
import { useStore } from "../../state/store";
import { topNWithOther } from "../../data/overview-board";
import { useBoardData } from "./useBoardData";

const palette = ["var(--accent)", "#0ea5e9", "#f59e0b", "#e11d48", "#14b8a6", "#64748b", "#a3a3a3"];

/** Gross revenue split by sales category: the six largest and the remainder as "Other". */
export function RevenueMix({ version }: { version: string }) {
  const filters = useStore((s) => s.filters);
  const transient = useStore((s) => s.transient);
  const { data, loading, error } = useBoardData(async () => {
    await ensureSource("sales");
    if (!usable("sales")) throw new Error(sourceStates.sales?.error || "Sales source unavailable");
    const rows = await query(
      `SELECT COALESCE(NULLIF(TRIM(CAST(category AS VARCHAR)),''),'Uncategorised') AS label, ${metricSQL(["gross_revenue"], context(filters, transient))} FROM ${metricFacts(filters, "sales", transient)} GROUP BY 1`,
    );
    return topNWithOther(rows.map((r) => ({ label: String(r.label), value: Number(r.gross_revenue) })), 6);
  }, [filters, transient, version]);
  const total = (data || []).reduce((n, r) => n + r.value, 0);
  const radius = 54, circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <article className="board-card board-mix">
      <header><div className="board-heading"><span className="board-kicker"><ChartPie size={14} aria-hidden="true" />Sales composition</span><h3>Revenue mix</h3><p>Where recorded sales come from</p></div></header>
      {error ? (
        <p className="board-state board-error" role="alert">{error}</p>
      ) : loading && !data ? (
        <p className="board-state" role="status">Splitting revenue…</p>
      ) : !data?.length || total <= 0 ? (
        <p className="board-state" role="status">No recorded sales revenue in this period.</p>
      ) : (
        <div className="board-mix-body" aria-busy={loading}>
          <svg viewBox="0 0 140 140" role="img" aria-label={`Revenue by category, total ${fmt("gross_revenue", total)}`}>
            <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--hairline, #e5e7eb)" strokeWidth="18" />
            {data.map((r, i) => {
              const length = (Math.max(r.value, 0) / total) * circumference;
              const el = (
                <circle key={r.label} cx="70" cy="70" r={radius} fill="none" stroke={palette[i % palette.length]} strokeWidth="18"
                  strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)">
                  <title>{`${r.label}: ${fmt("gross_revenue", r.value)}`}</title>
                </circle>
              );
              offset += length;
              return el;
            })}
            <text x="70" y="66" textAnchor="middle" className="board-donut-total">{fmt("gross_revenue", total)}</text>
            <text x="70" y="82" textAnchor="middle" className="board-donut-sub">sales revenue</text>
          </svg>
          <ul>
            {data.map((r, i) => (
              <li key={r.label}>
                <i style={{ background: palette[i % palette.length] }} aria-hidden="true" />
                <span title={r.label}>{r.label}</span>
                <strong className="number">{((r.value / total) * 100).toFixed(1)}%</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
