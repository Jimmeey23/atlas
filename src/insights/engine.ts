import { query, health } from "../data/duckdb";
import { useStore } from "../state/store";
import { rules, type Insight } from "./rules";
export async function insights(): Promise<Insight[]> {
  const f = useStore.getState().filters;
  const result = await Promise.allSettled(
    rules.map(async (rule) => {
      const sql = rule.sql(f);
      const required = [...sql.matchAll(/(?:FROM|JOIN)\s+"?([a-z_]+)/gi)].map(
        (m) => m[1],
      );
      if (
        required.some(
          (k) => !health[k]?.fetchedAt || health[k].status === "error",
        )
      )
        return [];
      const rows = await query(sql);
      return rows
        .filter(rule.test)
        .filter((r) => r.entity != null && r.entity !== "Unspecified")
        .map((x) => ({ ...rule.build(x), rule: rule.id, tab: rule.tab }));
    }),
  );
  const dismissed = JSON.parse(
    localStorage.getItem("floor-dismissals") || "{}",
  ) as Record<string, number>;
  const all = result
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter(
      (i) =>
        !dismissed[i.rule + i.entity] ||
        Date.now() - dismissed[i.rule + i.entity] > 30 * 86400000,
    )
    .sort((a, b) => b.impactINR - a.impactINR);
  const seen = new Set<string>();
  return all.filter((i) => {
    const key = i.tab + i.entity;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
