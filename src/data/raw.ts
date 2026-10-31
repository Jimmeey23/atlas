import { health, type Row } from "./duckdb";
import { ensureSource } from "./loader";
export async function sourceRows(
  source: string,
  rows: Row[],
): Promise<Record<string, unknown>[]> {
  if (!rows.length) return [];
  const hash = health[source]?.hash || "";
  // The API accepts up to 500 row IDs. Batch instead of silently losing the tail.
  const output: Record<string, unknown>[] = [];
  for (let offset = 0; offset < rows.length; offset += 500) {
    const batch = rows.slice(offset, offset + 500);
    const res = await fetch(
      `/api/source-rows/${source}?rows=${batch.map((r) => r.source_row).join(",")}&snapshot=${rows[0]?.source_snapshot || health[source]?.fetchedAt || ""}&hash=${encodeURIComponent(hash)}`,
    );
    if (res.status === 409) {
      void ensureSource(source, false, true);
      throw new Error("This source was edited since it loaded. The latest data is loading — reopen this drill-down in a moment.");
    }
    if (!res.ok) throw new Error("Original source rows are unavailable. Refresh the source.");
    output.push(...await res.json());
  }
  return output;
}
