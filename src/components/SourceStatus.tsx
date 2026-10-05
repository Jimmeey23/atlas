import { dependencies, sourceStates } from "../data/loader";
import { health } from "../data/duckdb";
import { sheets } from "../data/sheets.config";
export function SourceStatus({
  tab,
  onRetry,
}: {
  tab: number;
  version: number;
  onRetry: (key: string) => void;
}) {
  return (
    <>
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
      <details className="source-status">
        <summary>
          Source freshness ·{" "}
          {dependencies(tab)
            .map((k) => {
              const h = health[k],
                state = sourceStates[k];
              return `${sheets.find((s) => s.key === k)?.title}: ${!h?.fetchedAt ? state.state : Date.now() - h.fetchedAt >= 900000 ? "saved snapshot" : state.state === "refreshing" ? "updating" : "ready"}`;
            })
            .join(" / ")}
        </summary>
        <div className="source-status-grid">
          {sheets.map((source) => {
            const h = health[source.key],
              state = sourceStates[source.key],
              stale = h?.fetchedAt && Date.now() - h.fetchedAt >= 900000;
            return (
              <div key={source.key}>
                <strong>{source.title}</strong>
                <span>
                  {h?.fetchedAt
                    ? `${stale ? "Saved snapshot" : "Fetched"} ${new Date(h.fetchedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`
                    : "Not loaded"}
                </span>
                <span>
                  {state.state === "refreshing"
                    ? "Updating; displayed data retains its timestamp"
                    : state.state}
                </span>
                {state.error && (
                  <span className="warn">
                    {state.error}
                    {h?.fetchedAt
                      ? " · Showing the last successful snapshot."
                      : ""}
                  </span>
                )}
                <button
                  className="button"
                  disabled={["loading", "refreshing"].includes(state.state)}
                  onClick={() => onRetry(source.key)}
                >
                  {state.state === "error" ? "Retry source" : "Refresh source"}
                </button>
              </div>
            );
          })}
        </div>
      </details>
    </>
  );
}
