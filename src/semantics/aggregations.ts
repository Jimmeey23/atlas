import type { Row } from "../data/duckdb";
export function slotVerdict(row: Row, rate: number) {
  if (Number(row.n) < 8) return "Low sample";
  if (row.fill_rate == null || row.revenue_per_session == null)
    return "Unavailable";
  if (Number(row.fill_rate) < 0.2) return "Cut";
  if (Number(row.revenue_per_session) < rate) return "Move";
  return Number(row.fill_rate) < 0.4 ? "Watch" : "Keep";
}
export function revenueBridge(current: Row, previous: Row) {
  if (
    current.revenue == null ||
    previous.revenue == null ||
    !Number(previous.attendance)
  )
    return [];
  const before = Number(previous.revenue),
    after = Number(current.revenue),
    a0 = Number(previous.attendance),
    a1 = Number(current.attendance),
    yield0 = before / a0,
    yield1 = a1 ? after / a1 : 0;
  return [
    { name: "Prior period", value: before },
    { name: "Attendance volume", value: (a1 - a0) * yield0 },
    { name: "Realised yield", value: a1 * (yield1 - yield0) },
    { name: "Current period", value: after },
  ];
}
