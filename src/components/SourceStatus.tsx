import { dependencies, sourceStates, lastFreshness } from "../data/loader";
import { health } from "../data/duckdb";
import { sheets } from "../data/sheets.config";
/**
 * What the last change probe concluded. Without Drive metadata the app can
 * only reason about age, and says so rather than implying it has checked.
 */
function probeNote(key: string) {
  const report = lastFreshness;
  const entry = report?.sources.find((s) => s.key === key);
  if (!entry) return { text: "Freshness not checked yet", warn: false };
  if (!entry.verified)
    return {
      text: `Change detection unavailable${entry.reason ? ` (${entry.reason})` : ""}; falling back to age`,
      warn: false,
    };
  if (entry.stale)
    return { text: "Source sheet edited since this copy; refreshing", warn: true };
  return {
    text: `Confirmed current with the sheet at ${new Date(report!.checkedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
    warn: false,
  };
}

/** A single word for the summary line, so the state is readable while collapsed. */
function verdict() {
  const report = lastFreshness;
  if (!report) return "";
  const checked = report.sources.filter((s) => s.verified);
  if (!checked.length) return " · age-based";
  return checked.some((s) => s.stale) ? " · update pending" : " · verified current";
}

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
          Source freshness{verdict()} ·{" "}
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
                <span className={probeNote(source.key).warn ? "warn" : undefined}>
                  {probeNote(source.key).text}
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
