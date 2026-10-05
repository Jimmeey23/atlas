import { ChartControls } from "./ChartControls";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Row } from "../data/duckdb";
import { metrics } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { Register } from "./Register";
import { useStore } from "../state/store";
export function Rankings({
  rows,
  groups,
  columns,
  onDrill,
}: {
  rows: Row[];
  groups: string[];
  columns: string[];
  onDrill: (row: Row) => void;
}) {
  const [chosen, setChosen] = useState("");
  const id = columns.includes(chosen)
    ? chosen
    : columns.find((x) => x.includes("rate") || x === "contribution_margin") ||
      columns[0];
  const m = metrics[id];
  const eligible = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            Number(r.level) === 2 ** (groups.length - 1) - 1 &&
            Number(r.n) >= m.minSample &&
            r[id] != null,
        )
        .sort(
          (a, b) =>
            (Number(b[id]) - Number(a[id])) * (m.higherIsBetter ? 1 : -1),
        ),
    [rows, id, groups, m],
  );
  const s = useStore();
  const maximum = Math.max(...eligible.map((r) => Math.abs(Number(r[id]))), 1);
  const top = eligible.slice(0, 5),
    bottom = eligible.slice(-5).reverse();
  return (
    <Register
      index="04"
      title="Worth your attention"
      actions={
        <>
          <ChartControls rows={eligible} title="Rankings" />
          <select
            aria-label="Ranking measure"
            value={id}
            style={{ fontSize: 11, minHeight: 28, padding: "3px 7px" }}
            onChange={(e) => setChosen(e.target.value)}
          >
            {columns.map((x) => (
              <option key={x} value={x}>
                {metrics[x].label}
              </option>
            ))}
          </select>
        </>
      }
    >
      <div className="ranking-pair">
        {[top, bottom].map((list, k) => (
          <div key={k} className={k ? "bottom" : ""}>
            <div className={`ranking-head ${k ? "bottom" : ""}`}>
              <span className="dot" />
              {k ? "Room to improve" : "Leading the way"}
            </div>
            {list.map((r, i) => (
              <button
                className="ranking-item"
                key={String(r.g0)}
                title={`${r.g0} / ${m.label}: ${fmt(id, r[id])} / n = ${r.n}`}
                onClick={() => onDrill(r)}
              >
                <span className="rank">{k ? eligible.length - i : i + 1}</span>
                <span className="ranking-name">
                  {r.g0}
                  <span className="rank-bar">
                    <i
                      style={{
                        width: `${(Math.abs(Number(r[id])) / maximum) * 100}%`,
                      }}
                    />
                  </span>
                </span>
                <span className="ranking-value">{fmt(id, r[id])}</span>
              </button>
            ))}
            {!list.length && (
              <p className="small">No entities meet the minimum sample.</p>
            )}
          </div>
        ))}
      </div>
      <div className="ranking-foot">
        n ≥ {m.minSample} source records.{" "}
        {
          rows.filter(
            (r) =>
              Number(r.level) === 2 ** (groups.length - 1) - 1 &&
              Number(r.n) < m.minSample,
          ).length
        }{" "}
        groups excluded. Both lists share one scale.
      </div>
      <button
        className="small"
        style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 10 }}
        onClick={() => s.set({ signalOpen: true })}
      >
        Read the signals <ChevronDown size={11} />
      </button>
    </Register>
  );
}
