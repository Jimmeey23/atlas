import { health, type Row } from "./duckdb";
import { ensureSource } from "./loader";
export async function sourceRows(
  source: string,
  rows: Row[],
): Promise<Record<string, unknown>[]> {
  if (!rows.length) return [];
  const hash = health[source]?.hash || "";
  const res = await fetch(
    `/api/source-rows/${source}?rows=${rows.map((r) => r.source_row).join(",")}&snapshot=${rows[0]?.source_snapshot || health[source]?.fetchedAt || ""}&hash=${hash}`,
  );
  if (res.status === 409) {
    // Rows are positional, so an edited sheet cannot answer for the version on screen.
    void ensureSource(source, false, true);
    throw new Error("This source was edited since it loaded. The latest data is loading — reopen this drill-down in a moment.");
  }
  if (!res.ok)
    throw new Error(
      "Original source rows are unavailable. Refresh the source.",
    );
  return res.json();
}
