import {metrics} from "../semantics/metrics";
import type {Row} from "./duckdb";
export const salesRankingCriteria = [
  "gross_revenue",
  "net_revenue",
  "transactions",
  "aov",
  "buyers",
  "arpu",
  "discount_rate",
];
export function splitSalesRankings(rows: Row[], metric: string, limit: number) {
  const eligible = rows
    .filter((r) => r[metric] != null && Number.isFinite(Number(r[metric])))
    .sort(
      (a, b) =>
        (Number(b[metric]) - Number(a[metric])) *
          (metrics[metric].higherIsBetter ? 1 : -1) ||
        String(a.entity).localeCompare(String(b.entity)),
    );
  const top = eligible.slice(
    0,
    Math.min(limit, Math.ceil(eligible.length / 2)),
  );
  const seen = new Set(top.map((r) => String(r.entity)));
  const bottom = [...eligible]
    .reverse()
    .filter((r) => !seen.has(String(r.entity)))
    .slice(0, limit);
  return { top, bottom, eligible };
}
