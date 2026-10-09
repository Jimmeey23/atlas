import { DropdownField } from "./ui/DropdownField";
import {
  Download,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  ListFilter,
} from "lucide-react";
import { useEffect } from "react";
import { useStore } from "../state/store";

/** Display modes that compare periods; hidden while the global comparison is off. */
export const comparisonModes = new Set(["change", "year"]);
export type MonthlyTableState = {
  periods: number;
  newest: boolean;
  dense: boolean;
  mode: string;
};
export function MonthlyTableControls({
  state,
  onChange,
  onExport,
  modes = [
    ["absolute", "Values"],
    ["change", "MoM Δ"],
    ["year", "YoY Δ"],
  ],
  children,
}: {
  state: MonthlyTableState;
  onChange: (patch: Partial<MonthlyTableState>) => void;
  onExport?: () => void;
  modes?: string[][];
  children?: React.ReactNode;
}) {
  const compareOff = useStore((s) => s.compare) === "none";
  const shown = compareOff ? modes.filter(([key]) => !comparisonModes.has(key)) : modes;
  useEffect(() => {
    if (compareOff && comparisonModes.has(state.mode) && shown[0]) onChange({ mode: shown[0][0] });
  }, [compareOff, state.mode]);
  return (
    <div className="monthly-table-controls">
      <div className="segmented" aria-label="Monthly comparison display" hidden={shown.length < 2}>
        {shown.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={state.mode === key}
            className={state.mode === key ? "active" : ""}
            onClick={() => onChange({ mode: key })}
          >
            {label}
          </button>
        ))}
      </div>
      {children}
      <label>
        <ListFilter size={12} />
        Periods
        <DropdownField
          aria-label="Monthly periods shown"
          value={state.periods}
          onChange={(e) => onChange({ periods: Number(e.target.value) })}
        >
          {[3, 6, 12, 14].map((n) => (
            <option key={n} value={n}>
              Last {n} months
            </option>
          ))}
        </DropdownField>
      </label>
      <button
        className="button"
        aria-label="Reverse monthly order"
        onClick={() => onChange({ newest: !state.newest })}
      >
        {state.newest ? (
          <ArrowDownWideNarrow size={12} />
        ) : (
          <ArrowUpWideNarrow size={12} />
        )}{" "}
        {state.newest ? "Newest first" : "Oldest first"}
      </button>
      <span className="table-row-standard">32px rows</span>
      {onExport && (
        <button className="button" onClick={onExport}>
          <Download size={12} />
          CSV
        </button>
      )}
    </div>
  );
}
