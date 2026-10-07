import { metrics } from "./metrics";
import { sheets } from "../data/sheets.config";

/**
 * Which table a metric is computed over. A metric names its source columns as
 * "Sheet Title.Column"; several metrics read two sheets (payroll cost against
 * session revenue, say) and are computed over the first, which is the one the
 * analytics layer joins the rest onto.
 */
export function metricTable(id: string): string | null {
  const titles = new Map(sheets.map((s) => [s.title.toLowerCase(), s.key]));
  for (const source of metrics[id]?.sources || []) {
    const title = source.split(".")[0].split(" → ")[0].trim().toLowerCase();
    const key = titles.get(title);
    if (key) return key;
  }
  return null;
}

export const domains = ["attendance", "revenue", "growth", "people", "risk"] as const;
export const domainLabels: Record<(typeof domains)[number], string> = {
  attendance: "Attendance & capacity",
  revenue: "Revenue & yield",
  growth: "Acquisition & growth",
  people: "Members & people",
  risk: "Risk & attrition",
};

export interface CatalogueEntry {
  id: string;
  table: string;
  domain: string;
}

/**
 * Every registered metric that can actually be computed, grouped by the table
 * it reads. `records` is excluded: it counts rows rather than measuring them.
 */
export function catalogue(): Map<string, CatalogueEntry[]> {
  const byTable = new Map<string, CatalogueEntry[]>();
  for (const id of Object.keys(metrics)) {
    if (id === "records") continue;
    const table = metricTable(id);
    if (!table) continue;
    const list = byTable.get(table) || [];
    list.push({ id, table, domain: metrics[id].domain });
    byTable.set(table, list);
  }
  return byTable;
}
