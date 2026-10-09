export interface ExportReceipt {
  scope: string;
  generatedAt: string;
  filters: unknown;
  crossFilters?: unknown;
  comparison?: string;
  sources?: { name: string; fetchedAt: number | null; hash?: string }[];
  definitions?: Record<string, string>;
  rowCount: number;
}
export function csvValue(value: unknown) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^\s*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function buildCSV(
  rows: Record<string, unknown>[],
  receipt: ExportReceipt,
) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    csvValue("Atlas · " + receipt.scope),
    csvValue("Generated: " + receipt.generatedAt),
    csvValue("Filters: " + JSON.stringify(receipt.filters)),
    csvValue("Cross-filters: " + JSON.stringify(receipt.crossFilters || [])),
    csvValue("Comparison: " + (receipt.comparison || "none")),
    csvValue("Sources: " + JSON.stringify(receipt.sources || [])),
    csvValue("Definitions: " + JSON.stringify(receipt.definitions || {})),
    csvValue("Exported rows: " + rows.length),
    keys.map(csvValue).join(","),
    ...rows.map((row) => keys.map((key) => csvValue(row[key])).join(",")),
  ].join("\r\n");
}
