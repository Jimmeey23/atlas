import { dependencies, sourceStates } from "../data/loader";
import { health } from "../data/duckdb";
import { sheets } from "../data/sheets.config";

/** Surfaces only failed sources; freshness detail lives on the Data quality tab. */
export function SourceStatus({
  tab,
  onRetry,
}: {
  tab: number;
  version: number;
  onRetry: (key: string) => void;
  additionalSources?: string[];
}) {
  return (
    <div role="status">
      {dependencies(tab)
        .filter((k) => sourceStates[k].state === "error")
        .map((k) => (
          <p className="notice warn" key={k}>
            {sheets.find((s) => s.key === k)?.title}: {sourceStates[k].error}{" "}
            {health[k]?.fetchedAt
              ? "Showing the dated saved snapshot."
              : "Metrics from this source are unavailable."}{" "}
            <button className="button" onClick={() => onRetry(k)}>
              Retry source
            </button>
          </p>
        ))}
    </div>
  );
}
