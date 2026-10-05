import { metrics } from "./metrics";
export function fmt(id: string, v: unknown, full = false): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  if (id === "draw_premium_pp")
    return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}pp`;
  switch (metrics[id]?.format) {
    case "currency":
      return !full && Math.abs(n) >= 1e7
        ? `₹${(n / 1e7).toFixed(2)}Cr`
        : !full && Math.abs(n) >= 1e5
          ? `₹${(n / 1e5).toFixed(2)}L`
          : new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: "INR",
              maximumFractionDigits: full ? 2 : 0,
              minimumFractionDigits: full ? 2 : 0,
            }).format(n);
    case "percent":
      return `${(n * 100).toFixed(1)}%`;
    case "ratio":
      return `${n.toFixed(2)}×`;
    case "days":
      return `${n.toFixed(1)}d`;
    case "decimal":
      return n.toFixed(1);
    default:
      return new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 0,
      }).format(n);
  }
}
export function delta(id: string, current: unknown, previous: unknown): string {
  if (current == null || previous == null) return "No comparison";
  const c = Number(current),
    p = Number(previous);
  if (metrics[id]?.format === "percent") {
    const d = (c - p) * 100;
    return `${d >= 0 ? "+" : ""}${d.toFixed(1)}pp`;
  }
  if (!p) return "No baseline";
  const d = (c / p - 1) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}
