import registry from "./registry.json";
export interface QueryContext {
  rate: number;
  today: string;
}
export interface MetricDef {
  id: string;
  label: string;
  description: string;
  domain: "attendance" | "revenue" | "growth" | "people" | "risk";
  format: "currency" | "percent" | "integer" | "decimal" | "ratio" | "days";
  sql: (ctx: QueryContext) => string;
  aggregation: "sum" | "weighted" | "median" | "avg" | "last";
  higherIsBetter: boolean;
  target?: number;
  minSample: number;
  sources: string[];
}
export const metrics: Record<string, MetricDef> = Object.fromEntries(
  registry.map((m) => [
    m.id,
    {
      ...m,
      description: m.expression,
      sql: (ctx: QueryContext) =>
        m.expression
          .replaceAll("{rate}", String(ctx.rate))
          .replaceAll("{today}", ctx.today),
    } as MetricDef,
  ]),
);
export const metricSQL = (ids: string[], ctx: QueryContext) =>
  ids.map((id) => `${metrics[id].sql(ctx)} AS "${id}"`).join(", ");
