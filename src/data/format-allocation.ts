import type { Row } from "./duckdb";
export function formatAllocation(
  rows: Row[],
  measure: "attendance" | "revenue",
): Row[] {
  const sum = (key: string) => {
    const values = rows
      .map((r) => r[key])
      .filter((v) => v != null)
      .map(Number)
      .filter(Number.isFinite);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  const supply = sum("sessions"),
    demand = sum(measure);
  return rows.map((r) => {
    const supplyShare =
      supply != null && supply > 0 && r.sessions != null
        ? Number(r.sessions) / supply
        : null;
    const demandShare =
      demand != null && demand > 0 && r[measure] != null
        ? Number(r[measure]) / demand
        : null;
    return {
      ...r,
      supply_share: supplyShare,
      demand_share: demandShare,
      gap_pp:
        supplyShare == null || demandShare == null
          ? null
          : (demandShare - supplyShare) * 100,
    };
  });
}
