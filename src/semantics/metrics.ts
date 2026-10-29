import { evidenceSQL } from "./evidence";
import registry from "./registry.json";
import { today as kolkataToday } from "../data/periods";
export interface QueryContext {
  rate: number;
  today: string;
  newWhere?: string;
  source?: string;
}
export interface MetricDef {
  id: string;
  label: string;
  /** The registry expression exactly as registered, placeholders included. Never display it. */
  template: string;
  description: string;
  domain: "attendance" | "revenue" | "growth" | "people" | "risk";
  format: "currency" | "percent" | "integer" | "decimal" | "ratio" | "days";
  sql: (ctx: QueryContext) => string;
  aggregation: "sum" | "weighted" | "median" | "avg" | "max";
  higherIsBetter: boolean;
  target?: number;
  sources: string[];
}
/** Applies the `{cost_rate}` / `{today_ist}` context to a raw registry expression. */
const substitute = (expression: string, ctx: QueryContext) =>
  expression
    .replace(
      "(SELECT AVG(first_purchase) FROM new WHERE is_new)",
      `(SELECT AVG(first_purchase) FROM new${ctx.newWhere || " WHERE TRUE"} AND is_new AND conversion='Converted' AND first_purchase>0)`,
    )
    .replaceAll("{cost_rate}", String(ctx.rate))
    .replaceAll("{today_ist}", ctx.today);

export const metrics: Record<string, MetricDef> = Object.fromEntries(
  registry.map((m) => [
    m.id,
    {
      ...m,
      template: m.expression,
      description: m.expression,
      sql: (ctx: QueryContext) => substitute(m.expression, ctx),
    } as MetricDef,
  ]),
);

/**
 * The default cost per taught session. It is an editable operator assumption, not
 * payroll actually paid, and matches the store's default so a displayed formula and a
 * computed cell agree.
 */
export const DEFAULT_COST_RATE = 1200;

/**
 * A context for *display only*. A formula shown to a reader or a model must never
 * contain an unresolved `{cost_rate}` / `{today_ist}` placeholder: a reader cannot act
 * on one and a model will invent a value for it.
 */
export const displayContext = (
  rate: number = DEFAULT_COST_RATE,
  today: string = kolkataToday(),
): QueryContext => ({ rate, today });

/**
 * The expression for `id` with every placeholder resolved, ready to display.
 * Prefer the caller's own context so a tooltip shows the rate the operator actually
 * configured; fall back to the documented defaults.
 */
export const describeMetric = (id: string, ctx: QueryContext = displayContext()): string => {
  const metric = Object.hasOwn(metrics, id) ? metrics[id] : undefined;
  if (!metric) return "";
  return substitute(metric.template, ctx);
};
// Older reports and saved workspace selections keep source-specific session IDs.
// Resolve them to a per-source session measure without advertising duplicate metrics
// in the catalogue or losing their original source identity.
//
// Payroll and Recurring report a session *total* per row (how many sessions a trainer
// taught, or how many times a recurring class ran). Those must be summed, never
// de-duplicated, so they keep their own expression rather than inheriting `sessions`.
const REPORTED_SESSION_TOTAL = "SUM(sessions)";
for (const [id, source, label] of [
  ['payroll_sessions', 'Payroll.Total Sessions', 'Payroll sessions'],
  ['recurring_sessions', 'Recurring.TotalSessions', 'Recurring sessions'],
]) {
  Object.defineProperty(metrics, id, {
    value: {
      ...metrics.sessions,
      id,
      label,
      sources: [source],
      description: REPORTED_SESSION_TOTAL,
      sql: () => REPORTED_SESSION_TOTAL,
    },
    enumerable: false,
  });
}

/**
 * Renders one SQL column per metric.
 *
 * `overrides` lets a caller substitute a different expression for a metric without
 * registering a second, near-duplicate entry in the catalogue. It exists for one
 * real difference in grain (see AGENT_SESSION_COUNT in server/agent-metrics.mjs):
 * the agent counts session *identity*, while registers and tables count source rows.
 * Every override must be declared and explained at the call site.
 */
export const metricSQL = (
  ids: string[],
  ctx: QueryContext,
  overrides: Readonly<Record<string, string>> = {},
) =>
  ids.map((id) => {
    const metric = Object.hasOwn(metrics, id) ? metrics[id] : undefined;
    if (!metric || typeof metric.sql !== 'function') {
      throw new Error(`Unknown metric: ${String(id)}. Choose a current metric from the metric catalogue.`);
    }
    const expression = overrides[id] ? substitute(overrides[id], ctx) : metric.sql(ctx);
    return `${expression} AS "${id}"${evidenceSQL(id)}`;
  }).join(", ");

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
  // avg/median/max each reduce a set of row values to one number, so the population
  // behind the cell is the count of the non-null values that function received.
  if(['avg','median','max'].includes(metrics[id].aggregation)) {
    const match=/^(?:AVG|MEDIAN|MAX)\(/i.exec(expression.trim());
    return match?expression.trim().replace(/^(?:AVG|MEDIAN|MAX)/i,'COUNT'):null;
  }
  if(metrics[id].aggregation!=='weighted')return null;
  const start=expression.indexOf('NULLIF(');if(start<0)return null;
  let depth=0;for(let i=start+7;i<expression.length;i++){if(expression[i]==='(')depth++;else if(expression[i]===')')depth--;else if(expression[i]===','&&depth===0)return expression.slice(start+7,i).trim();}
  return null;
}
