/**
 * The one definition of a hosted (one-off, partnership or event) class. Every page that
 * separates hosted classes from the regular timetable uses this, in JavaScript and in
 * SQL, so Studio operations, Acquisition and the class cleaner always agree.
 *
 * Written with \b word boundaries only, which JavaScript and DuckDB (RE2) both support.
 */
export const HOSTED_PATTERN_SOURCE =
  "\\b(hosted|host|partnership|influencer|guest|workshop|bridal|olympics|soundrise|outdoor|wework|rugby|raheja|birthday|shower|laani|physique|peakst8hosted|lrs|p57|x)\\b|sweat\\s*in\\s*30";
export const HOSTED_PATTERN = new RegExp(HOSTED_PATTERN_SOURCE, "i");
export const isHostedClass = (...names: unknown[]) =>
  names.some((name) => name != null && HOSTED_PATTERN.test(String(name)));
/** SQL boolean: true when any of the given expressions names a hosted class. */
export const hostedSQL = (...expressions: string[]) =>
  `regexp_matches(lower(${expressions.map((e) => `COALESCE(CAST(${e} AS VARCHAR),'')`).join(" || ' ' || ")}), '${HOSTED_PATTERN_SOURCE}')`;
