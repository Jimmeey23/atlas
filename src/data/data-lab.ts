import { sqlTypes } from "./normalise";
import { sheets } from "./sheets.config";
export type LabField = { source: string; column: string };
export type LabMeasureFilter = {
  column: string;
  op: "=" | "!=" | "in";
  values: string[];
};
export type LabMeasure = LabField & {
  id: string;
  aggregate: string;
  label: string;
  where?: LabMeasureFilter;
};
export type LabRelationship = {
  duplicates?: "require_unique" | "latest" | "earliest";
  orderBy?: string;
  scope?: "global" | "all_dates" | "unfiltered";
  id: string;
  from: string;
  fromKey: string;
  to: string;
  toKey: string;
  join: "LEFT" | "INNER";
};
export type LabSpec = {
  valueMode?: string;
  sortBy?: string;
  id: string;
  title: string;
  source: string;
  type: string;
  rows: LabField[];
  columns: LabField[];
  measures: LabMeasure[];
  relationships: LabRelationship[];
  /** Extra sheets compared side by side: each is aggregated on its own by the shared hierarchy fields (matched by column name), so measures never inflate. */
  sharedSheets?: string[];
  limit: number;
  sort: "ASC" | "DESC";
  color: string;
  decimals: number;
  format: string;
  totals: boolean;
  heat: boolean;
  density: string;
  filterField: string;
  filterValue: string;
};
export const labTypes = [
  "Pivot table",
  "Table",
  "Merged table",
  "Metric cards",
  "List",
  "Bar chart",
  "Line chart",
  "Area chart",
  "Stacked bar",
  "Pie chart",
  "Heatmap",
];
export const labAggregates = [
  "SUM",
  "AVG",
  "COUNT",
  "COUNT DISTINCT",
  "MIN",
  "MAX",
  "MEDIAN",
  "STDDEV_SAMP",
];
export const labId = (s: string) => '"' + s.replaceAll('"', '""') + '"';
export const labLiteral = (s: string) => "'" + s.replaceAll("'", "''") + "'";
export function assertField(f: LabField) {
  if (!sheets.some((s) => s.key === f.source) || !(f.column in sqlTypes))
    throw new Error("Choose a valid source field.");
}
export function labMeasureAgg(m: LabMeasure) {
  const ref = `${labId(m.source)}.${labId(m.column)}`;
  let agg =
    m.aggregate === "COUNT DISTINCT"
      ? `COUNT(DISTINCT ${ref})`
      : `${m.aggregate}(${ref})`;
  const w = m.where;
  if (w) {
    assertField({ source: m.source, column: w.column });
    if (
      !["=", "!=", "in"].includes(w.op) ||
      !Array.isArray(w.values) ||
      !w.values.length ||
      w.values.length > 50 ||
      w.values.some((v) => typeof v !== "string" || v.length > 200)
    )
      throw new Error("Choose a value for the measure filter.");
    const c = `${labId(m.source)}.${labId(w.column)}::VARCHAR`;
    const cond =
      w.op === "in"
        ? `${c} IN (${w.values.map(labLiteral).join(", ")})`
        : w.op === "="
          ? `${c} = ${labLiteral(w.values[0])}`
          : `${c} IS DISTINCT FROM ${labLiteral(w.values[0])}`;
    agg += ` FILTER (WHERE ${cond})`;
  }
  return agg;
}
function labSharedSQL(spec: LabSpec, scopes: Record<string, string>) {
  const used = [spec.source, ...(spec.sharedSheets || [])];
  if (new Set(used).size !== used.length)
    throw new Error("Each compared sheet can only be added once.");
  if (spec.type === "Merged table")
    throw new Error(
      "Side-by-side comparison works for pivots, charts and metric cards. Use a row-level merge for Merged table.",
    );
  if (spec.relationships.length)
    throw new Error(
      "Use either row-level merges or side-by-side comparison, not both.",
    );
  if (!spec.measures.length) throw new Error("Add at least one measure.");
  const pivot = spec.type === "Pivot table";
  const rows = spec.type === "Metric cards" ? [] : spec.rows;
  const cols = pivot ? spec.columns : [];
  const dims = [...rows, ...cols];
  if (new Set(dims.map((f) => f.column)).size !== dims.length)
    throw new Error("Each hierarchy field can only be used once.");
  for (const f of dims) assertField({ source: spec.source, column: f.column });
  for (const m of spec.measures) {
    assertField(m);
    if (!used.includes(m.source))
      throw new Error("Add this sheet to the comparison before measuring it.");
    if (!labAggregates.includes(m.aggregate))
      throw new Error("Invalid aggregation.");
    if (
      !["COUNT", "COUNT DISTINCT", "MIN", "MAX"].includes(m.aggregate) &&
      !/DOUBLE|INT|DECIMAL|FLOAT/.test(
        sqlTypes[m.column as keyof typeof sqlTypes],
      )
    )
      throw new Error(`${m.aggregate} requires a numeric field.`);
  }
  if (spec.type === "Pie chart" && spec.measures.length !== 1)
    throw new Error("A pie chart needs exactly one measure.");
  for (const src of spec.sharedSheets || [])
    if (!spec.measures.some((m) => m.source === src))
      throw new Error(`Add a measure from ${src} or remove it from the comparison.`);
  const extra = spec.filterField ? (JSON.parse(spec.filterField) as LabField) : null;
  if (extra) assertField(extra);
  const dimNames = dims.map((_, i) => `d${i}`);
  const flags = pivot ? ["gr", "gc"] : [];
  const ctes: { name: string; sql: string; src: string }[] = [];
  for (const src of used) {
    const ms = spec.measures.map((m, i) => [m, i] as const).filter(([m]) => m.source === src);
    if (!ms.length) continue;
    const ref = (f: LabField) => `${labId(src)}.${labId(f.column)}`;
    const select = [
      ...dims.map((f, i) => `${ref(f)} AS d${i}`),
      ...ms.map(([m, i]) => `${labMeasureAgg(m)} AS m${i}`),
      ...(pivot
        ? [
            rows.length ? `GROUPING(${rows.map(ref).join(",")}) AS gr` : "0 AS gr",
            cols.length ? `GROUPING(${cols.map(ref).join(",")}) AS gc` : "0 AS gc",
          ]
        : []),
    ];
    const groups = pivot
      ? [
          rows.length ? `ROLLUP(${rows.map(ref).join(",")})` : "",
          cols.length ? `ROLLUP(${cols.map(ref).join(",")})` : "",
        ].filter(Boolean)
      : dims.map(ref);
    const filter = extra
      ? ` WHERE ${labId(src)}.${labId(extra.column)}::VARCHAR = ${labLiteral(spec.filterValue)}`
      : "";
    ctes.push({
      name: `s${ctes.length}`,
      src,
      sql: `SELECT ${select.join(", ")} FROM (SELECT * FROM ${labId(src)} ${scopes[src] || ""}) AS ${labId(src)}${filter}${groups.length ? " GROUP BY " + groups.join(", ") : ""}`,
    });
  }
  const keyCols = [...dimNames, ...flags];
  const keys = keyCols.length
    ? ctes.map((c) => `SELECT ${keyCols.join(", ")} FROM ${c.name}`).join(" UNION ")
    : "SELECT 1 AS one";
  const join = (c: { name: string }) =>
    keyCols.length
      ? ` LEFT JOIN ${c.name} ON ${keyCols.map((k) => `k.${k} IS NOT DISTINCT FROM ${c.name}.${k}`).join(" AND ")}`
      : ` CROSS JOIN ${c.name}`;
  const owner = (src: string) => ctes.find((c) => c.src === src)!.name;
  const outer = [
    ...keyCols.map((k) => `k.${k} AS ${k}`),
    ...spec.measures.map((m, i) => {
      const v = `${owner(m.source)}.m${i}`;
      return ["MIN", "MAX", "AVG", "MEDIAN", "STDDEV_SAMP"].includes(m.aggregate)
        ? `${v} AS m${i}`
        : `COALESCE(${v}, 0) AS m${i}`;
    }),
  ];
  const dimOrder = dimNames.map((d) => `${d} ${spec.sort === "DESC" ? "DESC" : "ASC"} NULLS LAST`).join(", ");
  const order = pivot
    ? `gr DESC, gc DESC${dimOrder ? ", " + dimOrder : ""}`
    : spec.sortBy === "Measure" || !dims.length
      ? "m0 DESC"
      : dimOrder;
  return `WITH ${ctes.map((c) => `${c.name} AS (${c.sql})`).join(", ")}, k AS (${keys}) SELECT ${outer.join(", ")} FROM k${ctes.map(join).join("")} ORDER BY ${order} LIMIT ${Math.max(1, Math.min(10000, spec.limit)) + 1}`;
}
export function labTargetSQL(
  r: LabRelationship,
  scopes: Record<string, string> = {},
) {
  assertField({ source: r.to, column: r.toKey });
  if (
    r.duplicates &&
    !["require_unique", "latest", "earliest"].includes(r.duplicates)
  )
    throw new Error("Choose a supported duplicate match rule.");
  const mode = r.duplicates || "require_unique";
  const order = r.orderBy || "date";
  assertField({ source: r.to, column: order });
  const deduplicate =
    mode !== "require_unique"
      ? ` QUALIFY ROW_NUMBER() OVER (PARTITION BY ${labId(r.toKey)} ORDER BY ${labId(order)} ${mode === "latest" ? "DESC" : "ASC"} NULLS LAST, row_id ${mode === "latest" ? "DESC" : "ASC"}) = 1`
      : "";
  return `(SELECT * FROM ${labId(r.to)} ${scopes[r.to] || ""}${deduplicate})`;
}
export function labFrom(spec: LabSpec, scopes: Record<string, string> = {}) {
  const seen = new Set([spec.source]);
  if (!sheets.some((s) => s.key === spec.source))
    throw new Error("Unknown source.");
  const table = (key: string) =>
    `(SELECT * FROM ${labId(key)} ${scopes[key] || ""}) AS ${labId(key)}`;
  let sql = table(spec.source);
  for (const r of spec.relationships) {
    assertField({ source: r.from, column: r.fromKey });
    assertField({ source: r.to, column: r.toKey });
    if (!seen.has(r.from) || seen.has(r.to))
      throw new Error(
        "Relationships must extend from an included sheet to a new sheet.",
      );
    if (!["LEFT", "INNER"].includes(r.join)) throw new Error("Invalid join.");
    sql += ` ${r.join} JOIN ${labTargetSQL(r, scopes)} AS ${labId(r.to)} ON ${labId(r.from)}.${labId(r.fromKey)} = ${labId(r.to)}.${labId(r.toKey)}`;
    seen.add(r.to);
  }
  return sql;
}
export function labSQL(spec: LabSpec, scopes: Record<string, string> = {}) {
  if (spec.sharedSheets?.length) return labSharedSQL(spec, scopes);
  if (spec.type === "Merged table") {
    if (!spec.rows.length)
      throw new Error("Select columns to include in the merged table.");
    const available = new Set([
      spec.source,
      ...spec.relationships.map((r) => r.to),
    ]);
    const selected = spec.rows.map((f, i) => {
      assertField(f);
      if (!available.has(f.source))
        throw new Error("Link this sheet before selecting its columns.");
      return `${labId(f.source)}.${labId(f.column)} AS d${i}`;
    });
    if (
      new Set(spec.rows.map((f) => f.source + "." + f.column)).size !==
      spec.rows.length
    )
      throw new Error("Each table column can only be used once.");
    let filter = "";
    if (spec.filterField) {
      const f: LabField = JSON.parse(spec.filterField);
      assertField(f);
      if (!available.has(f.source))
        throw new Error("Link the filter sheet first.");
      filter = ` WHERE ${labId(f.source)}.${labId(f.column)}::VARCHAR = ${labLiteral(spec.filterValue)}`;
    }
    return `SELECT ${selected.join(", ")} FROM ${labFrom(spec, scopes)}${filter} ORDER BY ${spec.rows.map((_, i) => `d${i} ${spec.sort === "DESC" ? "DESC" : "ASC"} NULLS LAST`).join(", ")} LIMIT ${Math.max(1, Math.min(10000, spec.limit)) + 1}`;
  }
  if (!spec.measures.length) throw new Error("Add at least one measure.");
  const sources = new Set([
    spec.source,
    ...spec.relationships.map((r) => r.to),
  ]);
  const field = (f: LabField) => {
    assertField(f);
    if (!sources.has(f.source))
      throw new Error("A selected field needs a relationship to its sheet.");
    return `${labId(f.source)}.${labId(f.column)}`;
  };
  const pivot = spec.type === "Pivot table";
  const rows = spec.type === "Metric cards" ? [] : spec.rows;
  const cols = pivot ? spec.columns : [];
  const dims = [...rows, ...cols];
  if (new Set(dims.map((f) => `${f.source}.${f.column}`)).size !== dims.length)
    throw new Error("Each hierarchy field can only be used once.");
  if (spec.type === "Pie chart" && spec.measures.length !== 1)
    throw new Error(
      "A pie chart needs exactly one measure. Use a bar chart to compare multiple measures.",
    );
  const select = dims.map((f, i) => `${field(f)} AS d${i}`);
  for (const [i, m] of spec.measures.entries()) {
    if (!labAggregates.includes(m.aggregate))
      throw new Error("Invalid aggregation.");
    if (
      !["COUNT", "COUNT DISTINCT", "MIN", "MAX"].includes(m.aggregate) &&
      !/DOUBLE|INT|DECIMAL|FLOAT/.test(
        sqlTypes[m.column as keyof typeof sqlTypes],
      )
    )
      throw new Error(`${m.aggregate} requires a numeric field.`);
    if (
      (spec.type.includes("chart") ||
        ["Stacked bar", "Heatmap"].includes(spec.type)) &&
      ["MIN", "MAX"].includes(m.aggregate) &&
      !/DOUBLE|INT|DECIMAL|FLOAT/.test(
        sqlTypes[m.column as keyof typeof sqlTypes],
      )
    )
      throw new Error(
        "Charts require numeric measures. Use a table or list for text aggregates.",
      );
    field(m);
    select.push(`${labMeasureAgg(m)} AS m${i}`);
  }
  if (pivot) {
    select.push(
      rows.length ? `GROUPING(${rows.map(field).join(",")}) AS gr` : "0 AS gr",
    );
    select.push(
      cols.length ? `GROUPING(${cols.map(field).join(",")}) AS gc` : "0 AS gc",
    );
  }
  const groups = pivot
    ? [
        rows.length ? `ROLLUP(${rows.map(field).join(",")})` : "",
        cols.length ? `ROLLUP(${cols.map(field).join(",")})` : "",
      ].filter(Boolean)
    : dims.map(field);
  const filter = spec.filterField
    ? ` WHERE ${field(JSON.parse(spec.filterField))}::VARCHAR = ${labLiteral(spec.filterValue)}`
    : "";
  return `SELECT ${select.join(", ")} FROM ${labFrom(spec, scopes)}${filter}${groups.length ? " GROUP BY " + groups.join(", ") : ""} ORDER BY ${pivot ? "gr DESC, gc DESC, " : ""}${spec.sortBy === "Measure" && !pivot ? "m0 DESC" : dims.length ? dims.map((_, i) => `d${i} ${spec.sort === "DESC" ? "DESC" : "ASC"} NULLS LAST`).join(", ") : "m0 DESC"} LIMIT ${Math.max(1, Math.min(10000, spec.limit)) + 1}`;
}
export const newLabSpec = (): LabSpec => ({
  id: crypto.randomUUID(),
  title: "Untitled analysis",
  source: "sales",
  type: "Pivot table",
  rows: [
    { source: "sales", column: "location" },
    { source: "sales", column: "product" },
  ],
  columns: [{ source: "sales", column: "month" }],
  measures: [
    {
      id: crypto.randomUUID(),
      source: "sales",
      column: "revenue",
      aggregate: "SUM",
      label: "Sales revenue",
    },
  ],
  relationships: [],
  limit: 2000,
  sort: "ASC",
  color: "#1e3a8a",
  decimals: 0,
  format: "Number",
  totals: true,
  heat: false,
  density: "Comfortable",
  filterField: "",
  filterValue: "",
});

export async function validateLabRelationships(
  spec: LabSpec,
  query: (sql: string) => Promise<Record<string, any>[]>,
  scopes: Record<string, string> = {},
) {
  if (spec.sharedSheets?.length) {
    labSQL(spec, scopes);
    const dim = (spec.type === "Pivot table" ? [...spec.rows, ...spec.columns] : spec.rows)[0];
    if (!dim) return [];
    const used = [spec.source, ...spec.sharedSheets],
      c = labId(dim.column),
      seen: Record<string, Set<string>> = {};
    for (const src of used) {
      const r = await query(
        `SELECT DISTINCT ${c}::VARCHAR AS v FROM ${labId(src)} ${scopes[src] || ""}`,
      );
      seen[src] = new Set(r.map((x) => String(x.v)));
    }
    return used.slice(1).map((src) => {
      const missing = [...seen[src]].filter((v) => !seen[spec.source].has(v)).length;
      const absent = [...seen[spec.source]].filter((v) => !seen[src].has(v)).length;
      return `${src} compared by ${dim.column}: ${missing} value(s) only in ${src}, ${absent} only in ${spec.source}; unmatched values show 0 for the other sheet's counts and sums.`;
    });
  }
  labFrom(spec, scopes); // Validate topology and identifiers before executing any profile.
  const checks: string[] = [];
  for (const r of spec.relationships) {
    const t = labTargetSQL(r, scopes),
      k = labId(r.toKey);
    const profile = await query(
      `SELECT COUNT(*) AS n, COUNT(${k}) AS populated, COUNT(DISTINCT ${k}) AS unique_keys FROM ${t} AS target_rows`,
    );
    if (Number(profile[0].n) > 0 && !Number(profile[0].populated))
      throw new Error(
        `${r.to}.${r.toKey} has no populated keys. Choose a populated business identifier.`,
      );
    if (
      spec.type !== "Merged table" &&
      Number(profile[0].populated) > Number(profile[0].unique_keys)
    )
      throw new Error(
        `${r.to}.${r.toKey} contains duplicate keys. This relationship would multiply records. Choose Latest record or Earliest record under Duplicate matches, or use Merged table to keep every match.`,
      );
    const coverage = await query(
      `SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${t} t WHERE f.${labId(r.fromKey)} = t.${k})) AS matched FROM ${labId(r.from)} f`,
    );
    checks.push(
      `${r.duplicates && r.duplicates !== "require_unique" ? `Using ${r.duplicates} record per ${r.to}.${r.toKey}, ordered by ${r.orderBy || "date"}; other matching target records excluded. ` : ""}${Number(profile[0].populated) > Number(profile[0].unique_keys) ? "Multiple target matches expand into separate merged rows. " : ""}${r.from} → ${r.to}: ${coverage[0].matched} of ${coverage[0].n} source records match; ${Number(profile[0].n) - Number(profile[0].populated)} target keys missing. ${r.join === "INNER" ? "Unmatched records excluded." : "Unmatched records retained."}`,
    );
  }
  if (spec.type === "Merged table") return checks;
  // A unique lookup key prevents fan-out but lookup measures can still repeat.
  for (const source of new Set(
    spec.measures
      .filter(
        (m) =>
          m.source !== spec.source &&
          !["COUNT DISTINCT", "MIN", "MAX"].includes(m.aggregate),
      )
      .map((m) => m.source),
  )) {
    const relationship = spec.relationships.find((r) => r.to === source);
    if (!relationship)
      throw new Error("A selected measure needs a relationship.");
    const column = `${labId(source)}.${labId(relationship.toKey)}`;
    const repeated = await query(
      `SELECT COUNT(${column}) AS n, COUNT(DISTINCT ${column}) AS unique_keys FROM ${labFrom(spec, scopes)}`,
    );
    if (Number(repeated[0].n) > Number(repeated[0].unique_keys))
      throw new Error(
        `${source} measures repeat across linked source records. Use a distinct count, minimum or maximum, or start the analysis from ${source} to avoid inflated totals and biased averages.`,
      );
  }
  return checks;
}

export function parseLabCollection(text: string): LabSpec[] {
  const values: unknown = JSON.parse(text);
  if (!Array.isArray(values) || values.length > 100)
    throw new Error("A collection must contain up to 100 analyses.");
  return values.map((s: LabSpec) => {
    if (
      !s ||
      typeof s.id !== "string" ||
      typeof s.title !== "string" ||
      s.title.length > 200 ||
      !labTypes.includes(s.type) ||
      !Array.isArray(s.rows) ||
      !Array.isArray(s.columns) ||
      !Array.isArray(s.measures) ||
      !Array.isArray(s.relationships) ||
      (s.sharedSheets !== undefined &&
        (!Array.isArray(s.sharedSheets) ||
          s.sharedSheets.length > 5 ||
          s.sharedSheets.some((x) => typeof x !== "string"))) ||
      s.rows.length > (s.type === "Merged table" ? 40 : 6) ||
      s.columns.length > 6 ||
      s.measures.length > 20 ||
      !Number.isFinite(s.limit) ||
      s.limit < 1 ||
      s.limit > 10000 ||
      !Number.isInteger(s.decimals) ||
      s.decimals < 0 ||
      s.decimals > 8 ||
      !/^#[0-9a-f]{6}$/i.test(s.color)
    )
      throw new Error("This collection contains an invalid analysis.");
    if (
      s.measures.some(
        (m) =>
          !m ||
          typeof m.id !== "string" ||
          typeof m.label !== "string" ||
          m.label.length > 200,
      )
    )
      throw new Error("Each measure needs a valid ID and display name.");
    const dimensions =
      s.type === "Pivot table" ? [...s.rows, ...s.columns] : s.rows;
    if (
      new Set(dimensions.map((f) => f.source + "." + f.column)).size !==
      dimensions.length
    )
      throw new Error("Each hierarchy field can only be used once.");
    labSQL(s);
    return s;
  });
}

export const labFormats = ["Number", "Currency", "Percent"];
export const labDensities = ["Comfortable", "Compact"];
export const labValueModes = [
  "Value",
  "% of row total",
  "% of column total",
  "% of grand total",
];
const labPatchKeys = [
  "title", "type", "source", "rows", "columns", "measures", "relationships",
  "sharedSheets", "limit", "sort", "sortBy", "color", "decimals", "format",
  "valueMode", "totals", "heat", "density", "filterField", "filterValue",
];
/**
 * Completes and validates an analysis written by the agent. Every field the builder can set
 * is checked against the same allowed values, and the SQL is generated once so an invalid
 * hierarchy, relationship or measure filter fails before anything is saved.
 */
export function sanitizeLabSpec(raw: any, maxLimit = 500): LabSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("The analysis must be an object.");
  const base = newLabSpec();
  const field = (f: any): LabField => ({ source: String(f?.source), column: String(f?.column) });
  const bool = (v: unknown, d: boolean, n: string) => {
    if (v === undefined) return d;
    if (typeof v !== "boolean") throw new Error(`${n} must be true or false.`);
    return v;
  };
  const oneOf = (v: unknown, list: string[], d: string, n: string) => {
    if (v === undefined) return d;
    if (typeof v !== "string" || !list.includes(v))
      throw new Error(`${n} must be one of: ${list.join(", ")}.`);
    return v;
  };
  const list = (v: unknown, n: string) => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new Error(`${n} must be a list.`);
    return v;
  };
  const spec: LabSpec = {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Untitled analysis",
    source: typeof raw.source === "string" ? raw.source : base.source,
    type: oneOf(raw.type, labTypes, "Pivot table", "type"),
    rows: list(raw.rows, "rows").map(field),
    columns: list(raw.columns, "columns").map(field),
    measures: list(raw.measures, "measures").map((m: any) => {
      const f = field(m);
      return {
        ...f,
        id: typeof m?.id === "string" && m.id ? m.id : crypto.randomUUID(),
        aggregate: String(m?.aggregate ?? "COUNT"),
        label: typeof m?.label === "string" && m.label.trim() ? m.label : `${m?.aggregate ?? "COUNT"} ${f.column}`,
        ...(m?.where ? { where: m.where } : {}),
      };
    }),
    relationships: list(raw.relationships, "relationships").map((r: any) => ({
      id: typeof r?.id === "string" && r.id ? r.id : crypto.randomUUID(),
      from: String(r?.from), fromKey: String(r?.fromKey),
      to: String(r?.to), toKey: String(r?.toKey),
      join: r?.join === "INNER" ? "INNER" : "LEFT",
      ...(r?.duplicates ? { duplicates: r.duplicates } : {}),
      ...(r?.orderBy ? { orderBy: r.orderBy } : {}),
      ...(r?.scope ? { scope: r.scope } : {}),
    })),
    ...(raw.sharedSheets !== undefined ? { sharedSheets: list(raw.sharedSheets, "sharedSheets").map(String) } : {}),
    limit: raw.limit === undefined ? Math.min(base.limit, maxLimit) : raw.limit,
    sort: oneOf(raw.sort, ["ASC", "DESC"], "ASC", "sort") as "ASC" | "DESC",
    color: raw.color === undefined ? base.color : raw.color,
    decimals: raw.decimals === undefined ? base.decimals : raw.decimals,
    format: oneOf(raw.format, labFormats, "Number", "format"),
    totals: bool(raw.totals, true, "totals"),
    heat: bool(raw.heat, false, "heat"),
    density: oneOf(raw.density, labDensities, "Comfortable", "density"),
    filterField: typeof raw.filterField === "string" ? raw.filterField : "",
    filterValue: typeof raw.filterValue === "string" ? raw.filterValue : "",
    ...(raw.valueMode !== undefined ? { valueMode: oneOf(raw.valueMode, labValueModes, "Value", "valueMode") } : {}),
    ...(raw.sortBy !== undefined ? { sortBy: oneOf(raw.sortBy, ["Dimensions", "Measure"], "Dimensions", "sortBy") } : {}),
  };
  if (!Number.isFinite(spec.limit) || spec.limit < 1 || spec.limit > maxLimit)
    throw new Error(`limit must be between 1 and ${maxLimit}.`);
  if (typeof spec.color !== "string" || !/^#[0-9a-f]{6}$/i.test(spec.color))
    throw new Error("color must be a six-digit hex value such as #2f6f5e.");
  if (!Number.isInteger(spec.decimals) || spec.decimals < 0 || spec.decimals > 8)
    throw new Error("decimals must be a whole number from 0 to 8.");
  if (spec.title.length > 200) throw new Error("title must be at most 200 characters.");
  if (spec.measures.some((m) => m.label.length > 200)) throw new Error("Measure labels must be at most 200 characters.");
  if (!sheets.some((s) => s.key === spec.source)) throw new Error("Unknown source sheet.");
  // Shared structural rules (sizes, color, decimals, display names) and the generated SQL.
  parseLabCollection(JSON.stringify([spec]));
  return spec;
}
/** Applies a restyle/edit to an agent-created analysis; the identity of the element never changes. */
export function patchLabSpec(spec: LabSpec, patch: any, maxLimit = 500): LabSpec {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new Error("The patch must be an object.");
  if ("id" in patch) throw new Error("The analysis id cannot be changed.");
  const unknown = Object.keys(patch).filter((k) => !labPatchKeys.includes(k));
  if (unknown.length) throw new Error(`Unknown analysis field(s): ${unknown.join(", ")}.`);
  return sanitizeLabSpec({ ...spec, ...patch, id: spec.id }, maxLimit);
}
