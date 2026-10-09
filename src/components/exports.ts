import { buildCSV } from "../data/export-format";
import { health } from "../data/duckdb";
import { metrics } from "../semantics/metrics";
import { useStore, tabs } from "../state/store";
export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCSV(
  name: string,
  rows: Record<string, unknown>[],
  scope?: string,
) {
  const state = useStore.getState();
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const receipt = {
    scope: scope || `${tabs[state.tab]} / current export population`, generatedAt: new Date().toISOString(),
    filters: state.filters, crossFilters: state.transient, comparison: state.compare, rowCount: rows.length,
    sources: Object.entries(health).map(([name, info])=>({name,fetchedAt:info.fetchedAt})),
    definitions: Object.fromEntries(keys.filter(key=>metrics[key]).map(key=>[key,metrics[key].description])),
  };
  const csv = buildCSV(rows, receipt);
  download(
    `${name}.csv`,
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
  );
}
