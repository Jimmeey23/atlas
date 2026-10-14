import { useState } from "react";
import { Target } from "lucide-react";
import type { Analysis } from "../../data/analytics";
import { today } from "../../data/analytics";
import { metrics } from "../../semantics/metrics";
import { fmt } from "../../semantics/formats";
import { useStore } from "../../state/store";
import { goalProgress } from "../../data/overview-board";

const goals = ["gross_revenue", "new_clients", "fill_rate"];
const storageKey = "atlas-overview-goals-v1";
const read = (): Record<string, number> => {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === "number" && n > 0)) as Record<string, number>;
  } catch {
    return {};
  }
};

/** Progress rings against targets kept in this browser. A running period is compared with the share of it elapsed. */
export function GoalRings({ data }: { data: Analysis }) {
  const filters = useStore((s) => s.filters);
  const [targets, setTargets] = useState(read);
  const [editing, setEditing] = useState<string | null>(null);
  const save = (id: string, raw: string) => {
    const percent = metrics[id].format === "percent";
    const n = Number(raw.replace(/,/g, "")) / (percent ? 100 : 1);
    const next = { ...targets };
    if (Number.isFinite(n) && n > 0) next[id] = n;
    else delete next[id];
    setTargets(next);
    setEditing(null);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Targets stay for this session when storage is unavailable. */
    }
  };
  const radius = 34, circumference = 2 * Math.PI * radius;
  return (
    <article className="board-card board-goals">
      <header>
        <h3>Goals for this period</h3>
        <span className="board-hint">Targets are saved in this browser</span>
      </header>
      {!filters.from || !filters.to ? <p className="board-state" role="status">Select a start and end date to track progress.</p> : null}
      <div className="board-rings">
        {goals.map((id) => {
          const value = data.total[id] == null ? null : Number(data.total[id]);
          const p = goalProgress({ value, target: targets[id] || 0, from: filters.from, to: filters.to, today: today() });
          const shown = Math.min(1, p.progress);
          const percent = metrics[id].format === "percent";
          return (
            <section key={id} className={`board-ring ${p.status}`}>
              <svg viewBox="0 0 84 84" role="img" aria-label={`${metrics[id].label} ${p.status === "none" ? "has no target" : Math.round(p.progress * 100) + "% of target"}`}>
                <circle cx="42" cy="42" r={radius} fill="none" stroke="var(--hairline, #e5e7eb)" strokeWidth="8" />
                {p.status !== "none" && (
                  <circle cx="42" cy="42" r={radius} fill="none" strokeWidth="8" strokeLinecap="round" className="board-ring-value"
                    strokeDasharray={`${shown * circumference} ${circumference}`} transform="rotate(-90 42 42)" />
                )}
                <text x="42" y="47" textAnchor="middle">{p.status === "none" ? "—" : `${Math.round(p.progress * 100)}%`}</text>
              </svg>
              <div>
                <strong>{metrics[id].label}</strong>
                <span className="number">{fmt(id, value)}</span>
                {editing === id ? (
                  <form onSubmit={(e) => { e.preventDefault(); save(id, String(new FormData(e.currentTarget).get("target") || "")); }}>
                    <input name="target" autoFocus inputMode="decimal" aria-label={`${metrics[id].label} target${percent ? " in percent" : ""}`}
                      defaultValue={targets[id] ? String(percent ? +(targets[id] * 100).toFixed(2) : targets[id]) : ""} />
                    <button type="submit">Save</button>
                  </form>
                ) : (
                  <button className="board-set" onClick={() => setEditing(id)}>
                    <Target size={12} aria-hidden="true" />
                    {targets[id] ? `Target ${fmt(id, targets[id])}` : "Set target"}
                  </button>
                )}
                {p.status !== "none" && (
                  <small>
                    {p.status === "met" ? "Target met" : p.status === "ahead" ? "Ahead of pace" : "Behind pace"}
                    {p.elapsed < 1 ? ` · ${Math.round(p.elapsed * 100)}% of period elapsed` : ""}
                  </small>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}
