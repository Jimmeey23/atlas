/**
 * The saved-element contract shared by the agent (which writes it), the server (which
 * validates it against the real query result) and the workspace (which renders it).
 */
export const elementTypes = [
  "table",
  "list",
  "bar",
  "horizontal_bar",
  "stacked_bar",
  "line",
  "area",
  "combo",
  "pie",
  "donut",
  "scatter",
  "heatmap",
  "pivot",
  "kpi",
] as const;
export type ElementType = (typeof elementTypes)[number];
export const chartTypes: ElementType[] = ["bar", "horizontal_bar", "stacked_bar", "line", "area", "combo", "pie", "donut", "scatter", "heatmap"];

export interface ElementSpec {
  type: ElementType;
  sql: string;
  x: string;
  series: string[];
  y2: string[];
  group: string;
  value: string;
  compare: (string | null)[];
}

const names = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s) : typeof v === "string" && v ? [v] : []);
const name = (v: unknown) => (typeof v === "string" ? v : "");

/** Reads a stored body, including the original single-measure `{type,sql,x,y}` shape. */
export function elementSpec(body: any): ElementSpec {
  const series = names(body?.series);
  return {
    type: body?.type,
    sql: name(body?.sql),
    x: name(body?.x),
    series: series.length ? series : names(body?.y),
    y2: names(body?.y2),
    group: name(body?.group),
    value: name(body?.value),
    compare: Array.isArray(body?.compare) ? body.compare.map((c: unknown) => (typeof c === "string" && c ? c : null)) : [],
  };
}

/** Field names, the reason the type needs them, and how many measures it takes. */
function requirements(s: ElementSpec): string | null {
  const need = (field: string, why: string) => `${s.type} needs "${field}" (${why}).`;
  switch (s.type) {
    case "bar":
    case "horizontal_bar":
    case "stacked_bar":
    case "line":
    case "area":
      if (!s.x) return need("x", "the category or time column");
      if (!s.series.length || s.series.length > 6) return `${s.type} needs "series" with 1–6 numeric columns.`;
      return null;
    case "combo":
      if (!s.x) return need("x", "the category or time column");
      if (!s.series.length) return need("series", "numeric columns drawn as bars on the left axis");
      if (!s.y2.length) return need("y2", "numeric columns drawn as lines on the right axis");
      if (s.series.length + s.y2.length > 6) return "combo takes at most 6 measures across series and y2.";
      return null;
    case "pie":
    case "donut":
    case "scatter":
      if (!s.x) return need("x", s.type === "scatter" ? "the numeric horizontal column" : "the slice label column");
      if (s.series.length !== 1) return `${s.type} needs exactly one column in "series".`;
      return null;
    case "heatmap":
    case "pivot":
      if (!s.x) return need("x", "the row dimension");
      if (!s.group) return need("group", "the column dimension");
      if (!s.value) return need("value", "the numeric cell value");
      return null;
    case "kpi":
      if (!s.series.length || s.series.length > 6) return 'kpi needs "series" with 1–6 numeric columns from a one-row result.';
      if (s.compare.length && s.compare.length !== s.series.length)
        return '"compare" must list one previous-period column (or null) for each series column, in the same order.';
      return null;
    default:
      return null;
  }
}

/**
 * Null when the body is a complete element. With `columns` (from running its SQL), also
 * proves every referenced field is a column of the result.
 */
export function elementSpecError(body: any, columns?: string[]): string | null {
  if (!elementTypes.includes(body?.type))
    return `Unsupported element type "${body?.type}". Use one of: ${elementTypes.join(", ")}.`;
  const s = elementSpec(body);
  if (!s.sql.trim()) return "An element needs its live \"sql\".";
  const missing = requirements(s);
  if (missing) return missing;
  if (columns?.length) {
    const fields = [s.x, ...s.series, ...s.y2, s.group, s.value, ...s.compare].filter((f): f is string => !!f);
    const absent = fields.find((f) => !columns.includes(f));
    if (absent)
      return `"${absent}" is not a column of the query result. Result columns: ${columns.join(", ")}. Alias the SQL columns or change the element fields to match.`;
  }
  return null;
}

/** Rates, averages and shares do not add up across cells, so they get no totals. */
const nonAdditive = /(rate|pct|percent|avg|average|mean|median|per_|ratio|share|fill|aov|ltv|_size|yield)/i;

export function pivotRows(rows: Record<string, unknown>[], x: string, group: string, value: string) {
  const rowKeys: string[] = [];
  const colKeys: string[] = [];
  const cells = new Map<string, number>();
  const key = (r: string, c: string) => r + "\u0000" + c;
  for (const row of rows) {
    const r = String(row[x] ?? "—"),
      c = String(row[group] ?? "—");
    if (!rowKeys.includes(r)) rowKeys.push(r);
    if (!colKeys.includes(c)) colKeys.push(c);
    const v = row[value];
    if (v != null && v !== "" && Number.isFinite(Number(v))) cells.set(key(r, c), (cells.get(key(r, c)) ?? 0) + Number(v));
  }
  // Months, dates and times read left to right; named columns (weekdays, studios) keep query order.
  if (colKeys.every((c) => /^\d/.test(c))) colKeys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const cell = (r: string, c: string) => cells.get(key(r, c)) ?? null;
  const sum = (values: (number | null)[]) => values.reduce<number>((t, v) => t + (v ?? 0), 0);
  return {
    rowKeys,
    colKeys,
    cell,
    totals: !nonAdditive.test(value),
    rowTotal: (r: string) => sum(colKeys.map((c) => cell(r, c))),
    colTotal: (c: string) => sum(rowKeys.map((r) => cell(r, c))),
    total: sum([...cells.values()]),
  };
}
