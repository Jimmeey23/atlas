import {metrics} from "../semantics/metrics";
import type {Row} from "./duckdb";
import {groupColumn} from "./group-fields";
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
/** Computed comparisons with their own labels; any other groupable sales column may also be ranked. */
export const salesRankingDimensions: [field: string, label: string][] = [
  ["product", "Products"],
  ["category", "Categories"],
  ["associate", "Associates"],
  ["location", "Studios"],
  ["member", "Community members"],
];
/** Entity/label SQL plus the cross-filter field for one ranking group; unknown fields are rejected. */
export function salesRankingGroup(group: string) {
  if (group === "member") return {
    entity: "member_id", label: "COALESCE(MAX(NULLIF(trim(member),'')),'Member '||member_id)",
    where: "WHERE member_id IS NOT NULL", field: "member_id",
  };
  if (salesRankingDimensions.some(([f]) => f === group)) {
    const entity = "COALESCE(NULLIF(trim(" + group + "),''),'Unspecified')";
    return { entity, label: entity, where: "", field: group };
  }
  const entity = `COALESCE(NULLIF(trim(${groupColumn(group)}),''),'Unspecified')`;
  return { entity, label: entity, where: "", field: group };
}
