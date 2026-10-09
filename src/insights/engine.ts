import { query, health } from "../data/duckdb";
import { useStore } from "../state/store";
import { sheets } from "../data/sheets.config";
import { rules, type Insight } from "./rules";
import type { Filters } from "../state/store";
/** Every rule that fires for `f`, skipping rules whose sources have not loaded. */
export async function evaluateRules(f: Filters): Promise<Insight[]> {
  const result = await Promise.allSettled(
    rules.map(async (rule) => {
      const sql = rule.sql(f);
      const required = [...sql.matchAll(/(?:FROM|JOIN)\s+"?([a-z_]+)/gi)].map(
        (m) => m[1],
      ).filter(k=>sheets.some(source=>source.key===k));
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
  return result.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
export async function insights(): Promise<Insight[]> {
  const fired = await evaluateRules(useStore.getState().filters);
  let dismissed:Record<string,number>={};
  try {dismissed=JSON.parse(localStorage.getItem("floor-dismissals")||"{}");}catch{/* Ignore obsolete stored dismissal data. */}
  const all = fired
    .filter(
      (i) =>
        !dismissed[i.rule + i.entity] ||
        Date.now() - dismissed[i.rule + i.entity] > 30 * 86400000,
    )
    .sort((a, b) => ({critical:0,attention:1,opportunity:2,context:3}[a.severity] - {critical:0,attention:1,opportunity:2,context:3}[b.severity]) || b.impactINR - a.impactINR);
  const seen = new Set<string>();
  return all.filter((i) => {
    const key = i.tab + i.entity;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
