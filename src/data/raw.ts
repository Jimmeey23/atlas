import { health, type Row } from "./duckdb";
export async function sourceRows(
  source: string,
  rows: Row[],
): Promise<Record<string, unknown>[]> {
  if (!rows.length) return [];
  const res = await fetch(
    `/api/source-rows/${source}?rows=${rows.map((r) => r.source_row).join(",")}&snapshot=${rows[0]?.source_snapshot || health[source]?.fetchedAt || ""}`,
  );
  if (!res.ok)
    throw new Error(
      "Original source rows are unavailable. Refresh the source.",
    );
  return res.json();
}
