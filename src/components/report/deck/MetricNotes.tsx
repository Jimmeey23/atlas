import { definition } from "../../../report/definitions";
import type { ChapterData } from "../../../report/model";

/** How a definition's combination is described to a reader, rather than by its SQL keyword. */
const COMBINED: Record<string, string> = { sum: "Total for the period", weighted: "Weighted ratio over the period", avg: "Average of the rows", median: "Median of the rows", last: "End-of-period snapshot" };

/**
 * What a figure counts, how it is combined and where it comes from. The design brief asks every
 * number in the deck to be inspectable on demand — formula, aggregation and source — without
 * putting the technical detail in the reading path, so this renders quietly inside a disclosure
 * or as a single line under a chart.
 */
export function MetricNotes({ id, data, compact }: { id: string; data: ChapterData; compact?: boolean }) {
  const m = definition(id);
  const thin = !!m?.minSample && data.n > 0 && data.n < m.minSample;
  const coverage = `${data.n.toLocaleString("en-IN")} contributing records · ${data.history.length} months${thin ? ` · under the ${m?.minSample}-record floor, so read it as a signal` : ""}`;
  if (compact) return <p className="deck-def-compact" title={`${m?.label ?? id} · ${m?.description ?? ""} · ${m?.sources?.join(", ") ?? ""}`}>
    {m?.description && <code>{m.description}</code>}
    <span>{COMBINED[m?.aggregation ?? "sum"] ?? m?.aggregation}</span>
  </p>;
  return <dl className="deck-def" aria-label={`${m?.label ?? id} definition`}>
    {m?.description && <div><dt>How it is calculated</dt><dd><code>{m.description}</code></dd></div>}
    <div><dt>How it is combined</dt><dd>{COMBINED[m?.aggregation ?? "sum"] ?? m?.aggregation}</dd></div>
    {!!m?.sources?.length && <div><dt>Built from</dt><dd>{m.sources.join(" · ")}</dd></div>}
    <div><dt>Coverage</dt><dd>{coverage}{data.notes?.length ? ` · ${data.notes.join(" ")}` : ""}</dd></div>
  </dl>;
}
