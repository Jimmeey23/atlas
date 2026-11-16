import { TriangleAlert } from "lucide-react";

/** Fetch one row beyond the display limit so a view can say whether it is complete. */
export const ROW_PROBE = 1;
export function capRows<T>(rows: T[], limit: number): { rows: T[]; truncated: boolean } {
  return rows.length > limit ? { rows: rows.slice(0, limit), truncated: true } : { rows, truncated: false };
}

/** A visible statement that a table, chart or preview shows only part of the matching data. */
export function PartialBadge({ shown, what = "rows", hint = "Narrow the period, studio or filters to see everything." }: { shown: number; what?: string; hint?: string }) {
  return (
    <span className="partial-badge" role="status">
      <TriangleAlert size={12} aria-hidden="true" />
      Partial: showing the first {shown.toLocaleString("en-IN")} {what}; more match. {hint}
    </span>
  );
}
