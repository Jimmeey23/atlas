import { evidenceSQL } from "./evidence";
import registry from "./registry.json";
export interface QueryContext {
  rate: number;
  today: string;
  newWhere?: string;
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
          .replace("(SELECT AVG(first_purchase) FROM new WHERE is_new)", `(SELECT AVG(first_purchase) FROM new${ctx.newWhere || " WHERE TRUE"} AND is_new AND conversion='Converted' AND first_purchase>0)`)
          .replaceAll("{rate}", String(ctx.rate))
          .replaceAll("{today}", ctx.today),
    } as MetricDef,
  ]),
);
export const metricSQL = (ids: string[], ctx: QueryContext) =>
  ids.map((id) => `${metrics[id].sql(ctx)} AS "${id}"${evidenceSQL(id)}`).join(", ");

// The records behind a single cell: a metric's first FILTER (WHERE …) clause is
// its numerator condition, so a drill-down can show only the contributing rows.
export function contributorPredicate(id: string, ctx: QueryContext) {
  const expression = metrics[id]?.sql(ctx);
  if (!expression) return undefined;
  const start = expression.indexOf("FILTER (WHERE ");
  if (start < 0) return undefined;
  let depth = 1;
  let i = start + "FILTER (".length;
  const from = i + "WHERE ".length;
  for (i = from; i < expression.length && depth > 0; i++) {
    if (expression[i] === "(") depth++;
    else if (expression[i] === ")") depth--;
  }
  return depth === 0 ? expression.slice(from, i - 1).trim() : undefined;
}

/** The protected rate denominator, when the registry explicitly supplies one. */
export function metricDenominatorSQL(id:string,ctx:QueryContext):string|null {
  const expression=metrics[id]?.sql(ctx);if(!expression)return null;
  if(metrics[id].aggregation==='avg'||metrics[id].aggregation==='median') {const match=/^(?:AVG|MEDIAN)\(([^()]+)\)/i.exec(expression.trim());return match?expression.trim().replace(/^(AVG|MEDIAN)/i,'COUNT'):null;}
  if(metrics[id].aggregation!=='weighted')return null;
  const start=expression.indexOf('NULLIF(');if(start<0)return null;
  let depth=0;for(let i=start+7;i<expression.length;i++){if(expression[i]==='(')depth++;else if(expression[i]===')')depth--;else if(expression[i]===','&&depth===0)return expression.slice(start+7,i).trim();}
  return null;
}
