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
  const quote = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replaceAll('"', '""')
      .replace(/^[=+@-]/, "'") +
    '"';
  const state = useStore.getState();
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const header = scope
    ? `Atlas / ${tabs[state.tab]} / ${scope}`
    : `Atlas / ${tabs[state.tab]} / Filters: ${JSON.stringify(state.filters)} / Cross-filters: ${JSON.stringify(state.transient)} / Rate assumption: INR ${state.rate}`;
  const csv = [
    quote(header),
    keys.map(quote).join(","),
    ...rows.map((r) => keys.map((k) => quote(r[k])).join(",")),
  ].join("\r\n");
  download(
    `${name}.csv`,
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
  );
}
