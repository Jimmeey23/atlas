import { sqlTypes } from "./normalise";
import { newFieldLabel } from "./new-fields";

/** A sheet column a table may be grouped by. Pure helpers; discovery lives in group-registry.ts. */
export interface GroupField { field: string; label: string }

const identifier = /^[a-z][a-z0-9_]{0,63}$/;
// Personal contact details, technical keys and row-unique identifiers are never offered.
const hidden = new Set([
  "row_id", "source_row", "source_snapshot", "raw_json", "email", "phone", "member_id", "trainer_id", "session_id",
  "sale_id", "membership_id", "unique_id1", "unique_id2", "account_id", "campaign_id", "adset_id", "ad_id",
  "nf_member_id", "nf_email", "nf_phone_number", "nf_first_name", "nf_last_name",
]);
// Numeric columns that are categories in practice (slot sizes, counts of a few values).
const categoricalNumbers = new Set(["capacity", "class_no", "membership_count", "session_limit", "duration", "freeze_count", "touches"]);
/** Grouped regardless of cardinality because the registers always offered them. */
export const uncappedGroupFields = new Set(["member"]);
export const maxGroupCardinality = 5000;

/** True when `field` is a real, non-sensitive table column that is safe to interpolate as an identifier. */
export const groupable = (field: string) =>
  identifier.test(field) && Object.hasOwn(sqlTypes, field) && !hidden.has(field) &&
  (sqlTypes[field] !== "DOUBLE" || categoricalNumbers.has(field));
export const groupCandidates = () => Object.keys(sqlTypes).filter(groupable);
export function assertGroupable(field: string) {
  if (!groupable(field)) throw new Error(`Cannot group by ${field}.`);
  return field;
}
/** Grouping expression as text, so NULL can be labelled and numbers/booleans compare as labels. */
export const groupColumn = (field: string) =>
  sqlTypes[assertGroupable(field)] === "VARCHAR" ? `"${field}"` : `CAST("${field}" AS VARCHAR)`;
export const groupValueSQL = (field: string, empty = "Unspecified") =>
  `COALESCE(${groupColumn(field)},'${empty.replaceAll("'", "''")}')`;

const labels: Record<string, string> = {
  trainer: "Instructor", format: "Class name", format_group: "Format (PowerCycle / Strength Lab / Barre)",
  is_new: "New member", utm_source: "UTM source", utm_medium: "UTM medium", utm_campaign: "UTM campaign",
  utm_content: "UTM content", ltv: "LTV", class_no: "Class number", publisher_platform: "Platform",
};
export const groupLabel = (field: string) =>
  newFieldLabel[field] ? `New sheet · ${newFieldLabel[field]}` : labels[field] ??
  field.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

// Familiar fields lead; everything else follows alphabetically, New-sheet columns last.
const preferred = ["location", "format_group", "format", "trainer", "day", "time", "month", "date", "source", "category",
  "product", "associate", "status", "payment_method", "member", "capacity"];
export function sortGroupFields(fields: string[]): GroupField[] {
  const rank = (f: string) => { const i = preferred.indexOf(f); return i >= 0 ? i : f.startsWith("nf_") ? 2000 : 1000; };
  return [...new Set(fields)]
    .map((field) => ({ field, label: groupLabel(field) }))
    .sort((a, b) => rank(a.field) - rank(b.field) || a.label.localeCompare(b.label));
}
/** Registry fields plus any already-chosen fields, so a saved grouping always renders. */
export function withChosen(fields: GroupField[], chosen: readonly string[]) {
  const missing = chosen.filter((f) => f && !fields.some((x) => x.field === f));
  return missing.length ? [...fields, ...missing.map((field) => ({ field, label: groupLabel(field) }))] : fields;
}
