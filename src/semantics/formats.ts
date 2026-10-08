import { metrics } from "./metrics";
export function fmt(id: string, v: unknown, full = false): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  if (id === "draw_premium_pp")
    return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}pp`;
  switch (metrics[id]?.format) {
    case "currency":
      return !full && Math.abs(n) >= 1e7
        ? `₹${(n / 1e7).toFixed(1)}Cr`
        : !full && Math.abs(n) >= 1e5
          ? `₹${(n / 1e5).toFixed(1)}L`
          : // Whole rupees when written in full; decimals only accompany L / Cr.
            new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: "INR",
              maximumFractionDigits: 0,
            }).format(n);
    case "percent":
      return `${(n * 100).toFixed(1)}%`;
    case "ratio":
      return `${n.toFixed(1)}×`;
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

/** Display source and generated fields without rounding identifiers or changing exported data. */
export function formatField(field: string, value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (metrics[field]) return fmt(field, value, true);
  if (/\b(id|phone|email|token|reference|code)\b/i.test(field.replaceAll("_", " ")) || /(?:^|_)(?:date|month|time|snapshot)(?:_|$)|\b(?:date|month|time|snapshot)\b/i.test(field)) return String(value);
  const text = String(value).trim();
  if (!/^-?(?:₹\s*)?\d[\d,]*(?:\.\d+)?$/.test(text)) return text;
  const number = Number(text.replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(number)) return text;
  const isCount = /count|known|missing|rows|lines|records|quantity|credits|rank/i.test(field);
  if (!isCount && /revenue|amount|price|cost|paid|payment value|vat|discount|gross.sales|net.sales|total.sales|sales.total|(?:total|left|paid|balance).*money|money.*(?:left|total|balance)/i.test(field.replaceAll("_", " "))) return fmt("revenue", number, true);
  return new Intl.NumberFormat("en-IN", {maximumFractionDigits:1}).format(number);
}
