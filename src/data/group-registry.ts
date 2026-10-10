import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { query, dataVersion, onData } from "./duckdb";
import { groupCandidates, maxGroupCardinality, sortGroupFields, uncappedGroupFields, withChosen, type GroupField } from "./group-fields";
export type { GroupField } from "./group-fields";

const cache = new Map<string, Promise<GroupField[]>>();
/**
 * Every column of `source` worth grouping by: populated, more than one value and
 * not row-unique. One batched query per table, cached per data version.
 */
export function groupFieldsFor(source: string): Promise<GroupField[]> {
  if (!/^[a-z_]+$/.test(source)) return Promise.resolve([]);
  const key = `${source}:${dataVersion()}`;
  if (!cache.has(key)) {
    const candidates = groupCandidates();
    const work = query(`SELECT ${candidates.map((f) => `approx_count_distinct("${f}") AS "${f}"`).join(",")} FROM "${source}"`)
      .then(([row]) => sortGroupFields(candidates.filter((f) => {
        const n = Number(row?.[f] ?? 0);
        return n > 1 && (n <= maxGroupCardinality || uncappedGroupFields.has(f));
      })));
    cache.set(key, work);
    work.catch(() => cache.delete(key));
  }
  return cache.get(key)!;
}
/** Group-by fields for a table; refreshes when data reloads and always includes `chosen`. */
export function useGroupFields(source: string | undefined, chosen: readonly string[] = []) {
  const version = useSyncExternalStore(onData, dataVersion);
  const [fields, setFields] = useState<GroupField[]>([]);
  useEffect(() => {
    let live = true;
    if (source) groupFieldsFor(source).then((f) => live && setFields(f)).catch(() => live && setFields([]));
    else setFields([]);
    return () => { live = false; };
  }, [source, version]);
  const key = chosen.join("\u0000");
  return useMemo(() => withChosen(fields, chosen), [fields, key]); // eslint-disable-line react-hooks/exhaustive-deps
}
