/** Task guidance is retrieved explicitly; it never substitutes for source evidence. */
export const agentSkills = {
  diagnostics: { label: "Explain performance", guidance: "Resolve scope and metric definitions first. Use compare_periods, explain_change and rank_performance. Distinguish measured contributions from causal hypotheses. Include counter-signals, denominators, sample size and one measurable next step." },
  forecasting: { label: "Forecast & scenarios", guidance: "Use forecast or what_if. Separate observations, assumptions and projections. Check complete baseline periods and sample coverage. Never present a forecast as a promise or scenario revenue as recoverable cash. State the model and its limits." },
  data_quality: { label: "Audit source quality", guidance: "Use inspect_source and audit_data_quality. Verify populated fields, grain, missingness, date coverage and duplicate stable IDs before joining. Missing values are not zero. Successful payment-line counts do not establish complete transaction coverage." },
  visualization: { label: "Build charts & tables", guidance: "Decode every measure, dimension, period, filter and requested visual. Reuse query_metrics SQL. Use combo for different units, pivot for exact two-dimensional comparisons, line for chronological trends, and horizontal_bar for long labels. Preview with validate_element; fix errors before save_element. Preserve the selected destination and explicit scope. Never claim saved without a successful save result." },
  retention: { label: "Member journey & retention", guidance: "Use stable Member IDs and member_journey. Separate reported member voice from objective staff observations. Do not infer cancellation or churn from absence alone. Retention observations are right-censored; disclose observation windows. Exclude complimentary, zero-value, intro and 2-for-1 memberships from operational paid-access interventions. Contact availability is not consent." },
  operations: { label: "Studio operations", guidance: "Use recurring weekly class slots with studio, weekday, time and instructor. Exclude hosted one-offs from recurring-class rankings, enforce a minimum sample, and show both non-empty and all-class averages. Schedule changes are observations, not confirmed moves or proof of causality. Complimentary visits come from Sessions.Complimentary." },
  research: { label: "Research & general help", guidance: "Answer general explanations, writing, planning, coding and calculations directly without forcing a studio query. Use calculate for exact arithmetic. Use research_web for public current facts and external references; cite returned URLs and distinguish external research from internal studio evidence. Never put member identities, contacts or private financial figures into a public search query. If research is unavailable, disclose that current facts could not be checked." },
  member_voice: { label: "Document member voice", guidance: "Write internal documentation in third person: Community member reported, Client expressed, Member requested. Capture verbatim statements separately from objective team observations. Use Signature Experiences, Studio Sessions, Studio Instructors, Studio Tools and Progress Journey. Structure follow-up ownership, urgency, member communication preference and closure outcome. Do not invent what a member said." },
};

const fn = (name, description, properties) => ({ type: "function", name, description, strict: true, parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false } });
export function capabilityToolDefs(sources, fields, metricIds) {
  const scope = { type: ["string", "null"], description: "JSON scope overrides; null keeps the resolved question scope." };
  return [
    fn("get_skill", "Retrieve focused task guidance before complex analysis, research, member documentation or element creation. Guidance is not evidence.", { skill: { type: "string", enum: Object.keys(agentSkills) } }),
    fn("get_metric_definitions", "Read exact governed definitions, source and formatting before selecting KPIs. Never substitute a similarly named metric from another source.", { metric_ids: { type: "array", items: { type: "string", enum: metricIds } } }),
    fn("calculate", "Exact arithmetic without executing code: + - * / % ^, parentheses, abs, sqrt, pow, log, min, max, round, floor, ceil. Use explicit numeric inputs from source evidence or user assumptions. percent_change(previous,current) returns a percentage; zero baseline is an error.", { expression: { type: "string" }, basis: { type: "string", description: "Identify source evidence indices or user assumptions used." } }),
    fn("audit_data_quality", "Measure null/blank coverage and distinct values for requested normalized fields, plus source date coverage. Counts refer to fetched scoped rows, not guaranteed complete business activity. Repeated field values do not alone prove duplicate records.", { source: { type: "string", enum: sources }, fields: { type: "array", items: { type: "string", enum: fields } }, scope_json: scope }),
    fn("validate_element", "Execute and preview an element without saving. Checks column names, numeric measures, KPI row count, pie values and pivot grain. Fix errors before saving. body_json is the same artifact contract as save_element.", { body_json: { type: "string" }, scope_json: scope }),
    fn("research_web", "Search public sources for current external facts and return citations. Use only public queries; do not include member identities, contact details or private studio figures. Results are external references, never internal KPI evidence.", { query: { type: "string" } }),
  ];
}

/** Bounded recursive-descent calculator. No eval, property access, variables or code execution. */
export function calculate(expression) {
  if (typeof expression !== "string" || !expression.trim() || expression.length > 1000) throw new Error("Use an arithmetic expression of 1–1,000 characters.");
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z_]+|[+\-*/%^(),]|\S/gi) || [];
  let i = 0, depth = 0;
  const take = t => tokens[i] === t ? (i++, true) : false;
  const finite = n => { if (!Number.isFinite(n)) throw new Error("Calculation is undefined or outside the finite numeric range."); return n; };
  const functions = {
    abs: [1, Math.abs], sqrt: [1, Math.sqrt], log: [1, Math.log], floor: [1, Math.floor], ceil: [1, Math.ceil],
    pow: [2, Math.pow], round: [2, (n, places) => { if (!Number.isInteger(places) || Math.abs(places) > 12) throw new Error("Rounding precision must be an integer from -12 to 12."); return Math.round(n * 10 ** places) / 10 ** places; }],
    min: [null, Math.min], max: [null, Math.max],
    percent_change: [2, (a, b) => { if (a === 0) throw new Error("Percentage change is unavailable with a zero baseline."); return (b - a) / Math.abs(a) * 100; }],
  };
  function primary() {
    if (++depth > 48) throw new Error("Expression is too deeply nested.");
    try {
      if (take("(")) { const n = sum(); if (!take(")")) throw new Error("Close the parenthesis."); return n; }
      const token = tokens[i++];
      if (/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token || "")) return finite(Number(token));
      const definition = Object.hasOwn(functions, token) ? functions[token] : null;
      if (!definition || !take("(")) throw new Error(`Unsupported arithmetic token: ${token || "end of expression"}.`);
      const args = [];
      if (!take(")")) { do { args.push(sum()); } while (take(",")); if (!take(")")) throw new Error("Close the function parenthesis."); }
      if (!args.length || (definition[0] != null && args.length !== definition[0])) throw new Error(`${token} has the wrong number of arguments.`);
      return finite(definition[1](...args));
    } finally { depth--; }
  }
  function power() { let n = primary(); if (take("^")) n = finite(n ** unary()); return n; }
  function unary() { if (take("+")) return unary(); if (take("-")) return -unary(); return power(); }
  function product() { let n = unary(); while (["*", "/", "%"].includes(tokens[i])) { const op = tokens[i++], b = unary(); n = finite(op === "*" ? n * b : op === "/" ? n / b : n % b); } return n; }
  function sum() { let n = product(); while (["+", "-"].includes(tokens[i])) { const op = tokens[i++], b = product(); n = finite(op === "+" ? n + b : n - b); } return n; }
  const result = sum();
  if (i !== tokens.length) throw new Error(`Unexpected token: ${tokens[i]}.`);
  return result;
}

export function dataQualitySQL(source, fields, sources, schema) {
  if (!sources.includes(source)) throw new Error("Unknown data source.");
  if (!Array.isArray(fields) || !fields.length || fields.length > 12 || fields.some(f => !Object.hasOwn(schema, f) || ["email", "phone", "member"].includes(f))) throw new Error("Choose 1–12 non-contact normalized fields.");
  const columns = [...new Set(fields)];
  return `SELECT COUNT(*) AS source_rows, MIN(date) AS first_date, MAX(date) AS last_date, ${columns.flatMap(f => [`COUNT(*) FILTER (WHERE "${f}" IS NULL OR trim(CAST("${f}" AS VARCHAR))='') AS "${f}_missing"`, `COUNT(DISTINCT "${f}") AS "${f}_distinct"`]).join(", ")} FROM "${source}"`;
}

export function publicResearchQuery(query) {
  if (typeof query !== "string" || !query.trim() || query.length > 1200) throw new Error("Use a public research query of 1–1,200 characters.");
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\s()-]*){9,}/i.test(query)) throw new Error("Remove contact details and private identifiers from the public research query.");
  return query.trim();
}
