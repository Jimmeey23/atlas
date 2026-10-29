/**
 * The instructor/format scorecard's pure configuration.
 *
 * Kept apart from scorecard.ts, which builds SQL and therefore pulls in the query
 * engine, so tests and tooling can assert on the configuration without booting DuckDB.
 */

export type ScorecardDimension = "format_group" | "trainer" | (string & {});

/** The session measures every scorecard row reports. */
export const SCORECARD_SESSION_IDS = [
  "sessions",
  "empty_sessions",
  "booked",
  "attendance",
  "avg_class_size_excl",
  "avg_class_size_incl",
  "fill_rate",
  "revenue",
  "revenue_per_session",
];

/** The busiest value of a second dimension inside each row, by attendance. */
const TOP_COLUMNS: [id: string, column: string, label: string][] = [
  ["top_trainer", "trainer", "Top instructor"],
  ["top_format", "format_group", "Top format"],
  ["top_class", "format", "Top class"],
  ["top_slot", "time", "Top time slot"],
  ["top_day", "day", "Top day"],
  ["top_studio", "location", "Top studio"],
];

/** Every other familiar session dimension; the row's own column is never its own "top". */
export const scorecardTops = (dimension: ScorecardDimension) =>
  TOP_COLUMNS.filter(([, column]) => column !== dimension).slice(0, 5);

/**
 * Inputs to the composite score; inverse measures count lower as better.
 *
 * The late-cancellation input is `booking_late_rate`, read from Bookings. The
 * Sessions measure `late_cancel_rate` divides by booked seats on Sessions rows and is a
 * different figure; substituting it here would silently change every score.
 */
export const COMPOSITE_INPUTS: [expression: string, inverse: boolean][] = [
  ["fill_rate", false],
  ["avg_class_size_excl", false],
  ["revenue_per_session", false],
  ["conversion_rate", false],
  ["retention_rate", false],
  ["booking_late_rate", true],
  ["empty_share", true],
];
