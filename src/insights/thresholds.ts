export interface Thresholds {
  deadFill: number;
  deadSample: number;
  noShow: number;
  dormancyDays: number;
  secondVisit: number;
  dependency: number;
  responseHours: number;
  lowUtilisation: number;
  reconciliation: number;
}
export const defaults: Thresholds = {
  deadFill: 0.2,
  deadSample: 8,
  noShow: 0.15,
  dormancyDays: 21,
  secondVisit: 0.4,
  dependency: 0.6,
  responseHours: 4,
  lowUtilisation: 0.25,
  reconciliation: 0.03,
};
/**
 * Resolved once per change, not once per rule per row.
 *
 * `rules.ts` consults these inside `test`/`build`, which run for every candidate row of
 * every rule. Reading `localStorage` and re-parsing JSON there meant hundreds of
 * synchronous, disk-backed reads per insight refresh.
 */
let resolved: Thresholds | null = null;

export function thresholds(): Thresholds {
  if (resolved) return resolved;
  try {
    resolved = {
      ...defaults,
      ...JSON.parse(localStorage.getItem("floor-thresholds") || "{}"),
    };
  } catch {
    resolved = { ...defaults };
  }
  return resolved ?? { ...defaults };
}

/** Drop the cached value after thresholds are written, so the next evaluation sees them. */
export function refreshThresholds(): void {
  resolved = null;
}
