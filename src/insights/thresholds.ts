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
export function thresholds(): Thresholds {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem("floor-thresholds") || "{}"),
    };
  } catch {
    return { ...defaults };
  }
}
