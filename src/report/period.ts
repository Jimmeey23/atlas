import type { ChapterData } from "./model";

/** Months the appendix grid and the forward view read, inclusive of the report month. */
export const HISTORY_MONTHS = 14;

/** First and last day of a "2026-07" month key. */
export function monthBounds(month: string) {
  const [year, index] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
/** Shift a month key by `by` months. */
export function shiftMonth(month: string, by: number) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1 + by, 1)).toISOString().slice(0, 7);
}
export const monthLabel = (month: string) =>
  new Date(month + "-01T00:00:00Z").toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Stable over re-runs whose figures have not moved, so a regenerated report
 * reuses its cached narratives instead of paying for them again. Only the
 * figures a narrative is written from go in: the build timestamp and the
 * record counts do not, or every rebuild would look like a change.
 */
export function figuresHash(chapterData: Record<string, ChapterData>) {
  const material = Object.entries(chapterData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, data]) => [
      id,
      data.total,
      data.prior,
      data.priorYear,
      data.history,
      data.groups.map((g) => [g.id, g.field, g.rows, g.total, g.prior, g.priorYear, g.diagnostics]),
    ]);
  return hashText(JSON.stringify(material));
}

/** FNV-1a over a string, base 36. */
export function hashText(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
