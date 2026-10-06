import {
  Download,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  ListFilter,
} from "lucide-react";
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
  return (
    <div className="monthly-table-controls">
      <div className="segmented" aria-label="Monthly comparison display">
        {modes.map(([key, label]) => (
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
        <select
          aria-label="Monthly periods shown"
          value={state.periods}
          onChange={(e) => onChange({ periods: Number(e.target.value) })}
        >
          {[3, 6, 12, 14].map((n) => (
            <option key={n} value={n}>
              Last {n} months
            </option>
          ))}
        </select>
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
      <button
        className="button"
        aria-pressed={state.dense}
        onClick={() => onChange({ dense: !state.dense })}
      >
        {state.dense ? "Compact rows" : "Comfortable rows"}
      </button>
      {onExport && (
        <button className="button" onClick={onExport}>
          <Download size={12} />
          CSV
        </button>
      )}
    </div>
  );
}
