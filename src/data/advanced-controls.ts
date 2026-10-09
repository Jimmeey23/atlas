/** Pure, validated controls shared by global filters and analytical sections. */
export type Grain = "day" | "week" | "month" | "quarter";
export type FilterOperator =
  | "in"
  | "not_in"
  | "contains"
  | "not_contains"
  | "eq"
  | "neq"
  | "between"
  | "gte"
  | "lte"
  | "missing"
  | "present";
export interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  upper?: string;
}
export interface FilterGroup {
  id: string;
  join: "and" | "or";
  rules: (FilterRule | FilterGroup)[];
}
export const emptyGroup = (): FilterGroup => ({
  id: crypto.randomUUID(),
  join: "and",
  rules: [],
});
export const isGroup = (rule: FilterRule | FilterGroup): rule is FilterGroup =>
  "rules" in rule;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
export function compileFilters(
  group: FilterGroup | undefined,
  types: Record<string, string>,
  depth = 0,
): string {
  if (!group) return "";
  if (!Array.isArray(group.rules) || depth > 4 || group.rules.length > 64)
    throw new Error(
      "Use at most 64 conditions per group and four nested levels.",
    );
  if (!group.rules.length) return "";
  if (!["and", "or"].includes(group.join))
    throw new Error("Choose AND or OR for the filter group.");
  const terms = group.rules.map((rule) => {
    if (isGroup(rule)) return compileFilters(rule, types, depth + 1);
    if (
      !Object.hasOwn(types, rule.field) ||
      !/^[a-z_][a-z0-9_]*$/.test(rule.field)
    )
      throw new Error("Unknown filter field.");
    const field = `"${rule.field}"`;
    const numeric = types[rule.field] === "DOUBLE";
    const value = (raw: string) => {
      if (numeric) {
        if (!raw.trim() || !Number.isFinite(Number(raw)))
          throw new Error(`Enter a number for ${rule.field}.`);
        return String(Number(raw));
      }
      if (types[rule.field] === "BOOLEAN") {
        if (!["true", "false"].includes(raw.toLowerCase()))
          throw new Error(`Choose true or false for ${rule.field}.`);
        return raw.toUpperCase();
      }
      return literal(raw);
    };
    switch (rule.operator) {
      case "missing":
        return `(${field} IS NULL${types[rule.field] === "VARCHAR" ? ` OR trim(${field})=''` : ""})`;
      case "present":
        return `(${field} IS NOT NULL${types[rule.field] === "VARCHAR" ? ` AND trim(${field})<>''` : ""})`;
      case "in":
      case "not_in": {
        const values = rule.value
          .split("|")
          .map((v) => v.trim())
          .filter(Boolean);
        if (!values.length) throw new Error("Enter at least one filter value.");
        return `${field} ${rule.operator === "not_in" ? "NOT " : ""}IN (${values.map(value).join(",")})`;
      }
      case "contains":
      case "not_contains":
        return `${rule.operator === "not_contains" ? "NOT " : ""}contains(lower(CAST(${field} AS VARCHAR)),lower(${literal(rule.value)}))`;
      case "between": {
        if (numeric && Number(rule.value) > Number(rule.upper))
          throw new Error("Range minimum must not exceed maximum.");
        return `${field} BETWEEN ${value(rule.value)} AND ${value(rule.upper || "")}`;
      }
      case "eq":
      case "neq":
      case "gte":
      case "lte":
        return `${field}${{ eq: "=", neq: "<>", gte: ">=", lte: "<=" }[rule.operator]}${value(rule.value)}`;
      default:
        throw new Error("Unknown filter operation.");
    }
  });
  const active = terms.filter(Boolean);
  return active.length
    ? `(${active.join(group.join === "and" ? " AND " : " OR ")})`
    : "";
}
export function filterFields(group?: FilterGroup): string[] {
  return [
    ...new Set(
      group?.rules.flatMap((rule) =>
        isGroup(rule) ? filterFields(rule) : [rule.field],
      ) || [],
    ),
  ];
}
const iso = (date: Date) => date.toISOString().slice(0, 10);
export const shiftDays = (date: string, days: number) =>
  iso(new Date(new Date(date + "T00:00:00Z").getTime() + days * 86400000));
export function bucketStart(date: string, grain: Grain): string {
  const d = new Date(date + "T00:00:00Z");
  if (grain === "week")
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (grain === "month") d.setUTCDate(1);
  if (grain === "quarter")
    d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3, 1);
  return iso(d);
}
export function nextBucket(date: string, grain: Grain): string {
  const d = new Date(bucketStart(date, grain) + "T00:00:00Z");
  if (grain === "day" || grain === "week")
    d.setUTCDate(d.getUTCDate() + (grain === "day" ? 1 : 7));
  else d.setUTCMonth(d.getUTCMonth() + (grain === "month" ? 1 : 3));
  return iso(d);
}
export function completeRange(
  from: string,
  to: string,
  grain: Grain,
  now: string,
) {
  if (!from || !to || from > to)
    throw new Error("Choose a valid start and end date.");
  const start =
    bucketStart(from, grain) === from ? from : nextBucket(from, grain);
  const latest = to < shiftDays(now, -1) ? to : shiftDays(now, -1);
  const end =
    shiftDays(nextBucket(latest, grain), -1) === latest
      ? latest
      : shiftDays(bucketStart(latest, grain), -1);
  if (start > end) throw new Error("This range contains no complete periods.");
  return { from: start, to: end };
}
export function grainSQL(column: string, grain: Grain) {
  if (!/^[a-z_]+$/.test(column)) throw new Error("Invalid date field.");
  return `strftime(date_trunc('${grain}',TRY_CAST("${column}" AS DATE)),'%Y-%m-%d')`;
}
export type Calculation =
  | "value"
  | "share"
  | "cumulative"
  | "per_session"
  | "per_member";
export type Aggregate =
  | "metric"
  | "count"
  | "distinct"
  | "sum"
  | "median"
  | "average";
export type SortRule = { id: string; desc: boolean };
export function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  sorts: SortRule[],
): T[] {
  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const x = a[sort.id],
        y = b[sort.id];
      if (x == null && y == null) continue;
      if (x == null) return 1;
      if (y == null) return -1;
      const delta =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true });
      if (delta) return sort.desc ? -delta : delta;
    }
    return 0;
  });
}
export function displayCalculation(
  value: unknown,
  calculation: Calculation,
  total: unknown,
  denominator: unknown,
): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  if (calculation === "share")
    return total != null && Number(total) !== 0
      ? Number(value) / Number(total)
      : null;
  if (calculation === "per_session" || calculation === "per_member")
    return denominator != null && Number(denominator) > 0
      ? Number(value) / Number(denominator)
      : null;
  return Number(value);
}
export function deltaValues(
  current: unknown,
  prior: unknown,
  percentMetric = false,
) {
  if (current == null || prior == null)
    return { absolute: null, relative: null, points: null };
  const absolute = Number(current) - Number(prior);
  return {
    absolute,
    relative: Number(prior) === 0 ? null : absolute / Math.abs(Number(prior)),
    points: percentMetric ? absolute * 100 : null,
  };
}

/** Shift comparison observations onto the current time axis before grouping. */
export function alignedGrainSQL(
  dateExpression: string,
  grain: Grain,
  current: { from: string; to: string },
  prior: { from: string; to: string },
  mode: string,
): string {
  const months = { month: 1, quarter: 3, year: 12, year2: 24 }[
    mode as "month" | "quarter" | "year" | "year2"
  ];
  let unit = "DAY";
  let amount = Math.round(
    (Date.parse(current.from + "T00:00:00Z") -
      Date.parse(prior.from + "T00:00:00Z")) /
      86400000,
  );
  if (months) {
    unit = "MONTH";
    amount = months;
  } else if (
    mode === "prior" &&
    current.from.endsWith("-01") &&
    shiftDays(nextBucket(current.to, "month"), -1) === current.to
  ) {
    const a = new Date(current.from + "T00:00:00Z"),
      b = new Date(prior.from + "T00:00:00Z");
    unit = "MONTH";
    amount =
      (a.getUTCFullYear() - b.getUTCFullYear()) * 12 +
      a.getUTCMonth() -
      b.getUTCMonth();
  }
  if (!Number.isFinite(amount))
    throw new Error("Comparisons require a bounded date range.");
  return `strftime(date_trunc('${grain}',TRY_CAST(${dateExpression} AS DATE)+INTERVAL '${amount} ${unit}'),'%Y-%m-%d')`;
}
