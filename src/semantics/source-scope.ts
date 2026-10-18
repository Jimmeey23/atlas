const scopeFields = ['location','trainer','format','format_group','source','category','day','time',
  'member','month','status','product','associate','capacity','payment_method','session_type','is_new'];
/** Populated fields, rather than shared schema columns, determine applicable filters. */
export function collectPresentFields(rows: Record<string, unknown>[], present = new Set<string>()) {
  for (const row of rows) for (const field of scopeFields) {
    if (!present.has(field) && row[field] !== null && row[field] !== undefined) present.add(field);
  }
  return present;
}
/** Unknown coverage preserves filters; measured all-null fields cannot constrain a source. */
export function sourceCarries(present: ReadonlySet<string> | undefined, field: string) {
  return !present || present.has(field);
}
