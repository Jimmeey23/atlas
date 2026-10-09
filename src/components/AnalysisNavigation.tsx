import { useStore } from "../state/store";
export function AnalysisNavigation() {
  const store = useStore();
  return (
    <nav className="analysis-navigation" aria-label="Analysis navigation">
      <button
        disabled={!store.past.length}
        onClick={store.undo}
        title="Undo the last scope or navigation change"
      >
        ← Back / undo
      </button>
      <button
        disabled={!store.future.length}
        onClick={store.redo}
        title="Redo the last scope or navigation change"
      >
        Forward / redo →
      </button>
      <button
        onClick={() => window.dispatchEvent(new Event("atlas-open-analysis"))}
      >
        Advanced analysis
      </button>
      <span className="analysis-global-scope">
        Global scope · {store.filters.from || "All dates"} —{" "}
        {store.filters.to || "latest"}
        {store.transient.length
          ? ` · ${store.transient.length} cross-filters`
          : ""}
        {store.filters.advanced?.rules.length ? ` · advanced conditions` : ""}
      </span>
    </nav>
  );
}
