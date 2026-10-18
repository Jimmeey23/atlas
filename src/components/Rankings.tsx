import { DropdownField } from "./ui/DropdownField";
import { InstructorAvatar } from "./InstructorAvatar";
import { ChartControls } from "./ChartControls";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Row } from "../data/duckdb";
import { metrics } from "../semantics/metrics";
import { fmt } from "../semantics/formats";
import { Register } from "./Register";
import { MetricInfoHint } from "./ui/MetricInfoHint";
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
  const [minimum, setMinimum] = useState(0);
  const validColumns = columns.filter(x => metrics[x]);
  const id = validColumns.includes(chosen)
    ? chosen
    : validColumns.find((x) => x.includes("rate") || x === "contribution_margin") ||
      validColumns[0];
  const m = metrics[id];
  // Rows may still come from the previous grouping while a new one loads, and analyse drops
  // duplicate/unknown levels, so derive the depth from the rows' own g0..gN columns.
  const depth = Object.keys(rows[0] ?? {}).filter((k) => /^g\d+$/.test(k)).length || groups.length;
  const firstLevel = 2 ** Math.max(depth - 1, 0) - 1;
  const eligible = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            Number(r.level) === firstLevel &&
            (!minimum || Number(r.n) >= minimum) &&
            r[id] != null,
        )
        .sort(
          (a, b) =>
            (Number(b[id]) - Number(a[id])) * (m?.higherIsBetter ? 1 : -1),
        ),
    [rows, id, firstLevel, m, minimum],
  );
  const s = useStore();
  const maximum = Math.max(...eligible.map((r) => Math.abs(Number(r[id]))), 1);
  const top = eligible.slice(0, 5),
    bottom = eligible.slice(-5).reverse();
  if (!m) return null;
  return (
    <Register
      index="04"
      title="Worth your attention"
      actions={
        <>
          <div className="ranking-toolbar">
            <label className="ranking-filter ranking-minimum"><span>Minimum group size</span><input aria-label="Ranking minimum group size" type="number" min={0} value={minimum} onChange={e => setMinimum(Math.max(0, Number(e.target.value) || 0))} /></label>
            <div className="ranking-filter ranking-measure">
              <label htmlFor="ranking-measure">Measure</label>
              <DropdownField
                id="ranking-measure"
                aria-label="Ranking measure"
                value={id}
                onChange={(e) => setChosen(e.target.value)}
              >
                {validColumns.map((x) => (
                  <option key={x} value={x}>
                    {metrics[x].label}
                  </option>
                ))}
              </DropdownField>
              <MetricInfoHint id={id} />
            </div>
            <ChartControls rows={eligible} title="Rankings" />
          </div>
        </>
      }
    >
      <div className="ranking-pair">
        {[top, bottom].map((list, k) => (
          <div key={k} className={k ? "bottom" : ""}>
            <div className={`ranking-head ${k ? "bottom" : ""}`}>
              <div className="ranking-head-title">
                <span className="dot" />
                <span>{k ? "Room to improve" : "Leading the way"} ({m.label})</span>
              </div>
              <MetricInfoHint id={id} />
            </div>
            {list.map((r, i) => (
              <button
                className="ranking-item"
                key={String(r.g0)}
                title={`${r.g0} / ${m.label}: ${fmt(id, r[id])} / n = ${r.n}`}
                onClick={() => onDrill(r)}
              >
                <span className="rank">{k ? eligible.length - i : i + 1}</span>
                {groups[0] === "trainer" && <InstructorAvatar name={String(r.g0)} />}
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
              <p className="small">No entities match the current filters.</p>
            )}
          </div>
        ))}
      </div>
      <div className="ranking-foot">
        {minimum ? `User filter: n ≥ ${minimum} contributing observations.` : "Full filtered dataset; no minimum group size."}{" "}
        {
          rows.filter(
            (r) =>
              Number(r.level) === firstLevel &&
              minimum > 0 && Number(r.n) < minimum,
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
