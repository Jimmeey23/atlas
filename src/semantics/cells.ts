import { metrics, describeMetric, type QueryContext } from "./metrics";
import { fmt, delta } from "./formats";

/**
 * Counts are exact at any sample size; only values derived from a sample —
 * rates, averages, medians — mislead when the sample is small.
 */
export function derived(id: string) {
  const m = metrics[id];
  return (
    ["percent", "ratio", "decimal", "days"].includes(m.format) ||
    ["weighted", "median", "avg", "max"].includes(m.aggregation)
  );
}

/** Movement against the comparison period, using the shared delta wording. */
export function cellDelta(id: string, value: unknown, before: unknown) {
  if (value == null || before == null) return null;
  const now = Number(value),
    was = Number(before);
  if (!Number.isFinite(now) || !Number.isFinite(was)) return null;
  const text = delta(id, value, before);
  if (text === "No comparison" || text === "No baseline") return null;
  const change = now - was;
  return {
    text,
    tone:
      Math.abs(change) < Number.EPSILON
        ? "muted"
        : change > 0 === metrics[id].higherIsBetter
          ? "positive"
          : "negative",
  };
}

/** Everything behind the number, for the cell's tooltip. */
export function provenance(
  id: string,
  value: unknown,
  n: number,
  before: unknown,
  ctx?: QueryContext,
) {
  const m = metrics[id];
  const lines = [
    `${m.label}: ${fmt(id, value, true)}`,
    // Resolved, so the tooltip shows the rate and date actually used, never a placeholder.
    `Formula: ${describeMetric(id, ctx)}`,
    `Source columns: ${m.sources.join(", ")}`,
    `Contributing records: ${fmt("records", n)}`,
  ];
  if (before != null)
    lines.push(`Comparison period: ${fmt(id, before, true)}`);
  lines.push("Click to inspect the records behind this cell.");
  return lines.join("\n");
}
