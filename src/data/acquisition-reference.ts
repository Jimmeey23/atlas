/**
 * Adapted from physique57-analytics-hub's clientRetention.ts and retentionRates.ts.
 * Verified against GitHub main: clientRetention.ts blob 7dbaf74fae5d95795aa5edf5414c55cbdd04b0fb.
 * Source statuses and new-client denominators are shared by every table and
 * drill-down. The trial cohort is every row whose Is New label contains the
 * word new; conversion and retention are the source status columns alone.
 * Missing source amounts remain unavailable.
 */
import type { Row } from './duckdb';
export const splitMembershipList = (value: unknown): string[] => String(value ?? '').split(/[,;|/]+|\s-\s/).map(v => v.trim()).filter(Boolean);
// Every Is New label containing the word new is a trial. "Not new" is excluded
// so a future negated label cannot be counted as a trial.
export const referenceNew = (row: Row) => {
  const label = String(row.entry_type ?? '').trim();
  return /\bnew\b/i.test(label) && !/^not\b/i.test(label);
};
export const eligibleMembership = (row: Row) => {
  const tokens = splitMembershipList(row.purchase_journey);
  return !tokens.length || tokens.some(token => !/^money credits($| )/.test(token.trim().toLowerCase().replace(/\s+/g, ' ')));
};
export const referenceConverted = (row: Row) => String(row.conversion ?? '').trim() === 'Converted';
export const referenceRetained = (row: Row) => String(row.retention ?? '').trim() === 'Retained';
export const referenceHosted = (row: Row) => /host|p57|birthday|rugby|lrs/i.test(String(row.format ?? ''));
export const membershipUsed = (row: Row) => {
  try { return (JSON.parse(String(row.membership_sequence ?? '[]')) as string[]).join(', ') || 'Unspecified'; }
  catch { return 'Unspecified'; }
};
const avg = (rows: Row[], key: string, positive = false) => {
  const known = rows.filter(r => r[key] != null && Number.isFinite(Number(r[key])) && (!positive || Number(r[key]) > 0));
  return known.length ? known.reduce((s,r) => s + Number(r[key]),0) / known.length : null;
};
export function referenceSummary(rows: Row[], uniqueOutcomes = false) {
  const count = (predicate: (row: Row) => boolean) => uniqueOutcomes
    ? new Set(rows.filter(predicate).map(row => row.member_id).filter(Boolean)).size
    : rows.filter(predicate).length;
  const newcomers = count(referenceNew);
  const converted = rows.some(r => r.conversion != null) ? count(referenceConverted) : null;
  const retained = rows.some(r => r.retention != null) ? count(referenceRetained) : null;
  const ltvRows = rows.filter(r => r.ltv != null);
  return { cohort_rows: rows.length, newcomers, converted_members: converted, retained_members: retained,
    conversion_rate: newcomers && converted != null ? converted / newcomers : null, retention_rate: newcomers && retained != null ? retained / newcomers : null,
    total_ltv: ltvRows.length ? ltvRows.reduce((s,r) => s + Number(r.ltv),0) : null,
    avg_ltv: avg(rows,'ltv'), conversion_span: avg(rows,'conversion_days',true), visits_post: avg(rows,'visits_post',true),
    avg_spend: avg(rows,'avg_purchase_value'), unique_members: new Set(rows.map(r => r.member_id).filter(Boolean)).size };
}
export function metricFilter(metric?: string) {
  if (metric === 'converted_members' || metric === 'conversion_rate') return 'converted';
  if (metric === 'retained_members' || metric === 'retention_rate') return 'retained';
  if (metric === 'newcomers') return 'eligible';
  if (metric === 'converted_30' || metric === 'conversion_30_rate') return 'converted30';
  if (metric === 'retained_30' || metric === 'retention_30_rate') return 'retained30';
  if (metric === 'converted_same_month' || metric === 'conversion_same_month_rate') return 'convertedMonth';
  if (metric === 'retained_same_month' || metric === 'retention_same_month_rate') return 'retainedMonth';
  return metric ? 'contributors' : 'all';
}
export function inclusionReasons(row: Row) {
  return {
    cohort: referenceNew(row) ? `Included in the new-client denominator: Is New is “${row.entry_type}”.` : `Outside the new-client denominator: Is New is “${row.entry_type ?? 'blank'}”.`,
    conversion: referenceConverted(row) ? 'Counted as converted: Conversion Status is Converted.' : `Not counted as converted: Conversion Status is “${row.conversion ?? 'blank'}”.`,
    retention: referenceRetained(row) ? 'Counted as retained: Retention Status is Retained.' : `Not counted as retained: Retention Status is “${row.retention ?? 'blank'}”.`,
  };
}
export interface AcquisitionDrillRequest { title: string; scope: string; predicate?: string; metric?: string; uniqueOutcomes?: boolean; }

/** Member records contributing to the clicked aggregate; rate denominators stay in the full slice. */
export function contributesToMetric(row: Row, metric?: string, uniqueOutcomes = false) {
  const present = (key: string) => row[key] != null && Number.isFinite(Number(row[key]));
  const identified = row.member_id != null && String(row.member_id) !== '';
  if (metric === 'newcomers') return referenceNew(row) && (!uniqueOutcomes || identified);
  if (metric === 'converted_members' || metric === 'conversion_rate') return referenceConverted(row) && (!uniqueOutcomes || identified);
  if (metric === 'retained_members' || metric === 'retention_rate') return referenceRetained(row) && (!uniqueOutcomes || identified);
  if (metric === 'unique_members') return identified;
  if (metric === 'mature_30') return identified;
  if (metric === 'converted_30' || metric === 'conversion_30_rate') return Boolean(row.converted_in_30) && identified;
  if (metric === 'retained_30' || metric === 'retention_30_rate') return Boolean(row.returned_in_30) && identified;
  if (metric === 'converted_same_month' || metric === 'conversion_same_month_rate') return Boolean(row.converted_same_month);
  if (metric === 'retained_same_month' || metric === 'retention_same_month_rate') return Boolean(row.returned_same_month);
  if (metric === 'conversion_span' || metric === 'median_span') return present('conversion_days') && Number(row.conversion_days) > 0;
  if (metric === 'visits_post') return present('visits_post') && Number(row.visits_post) > 0;
  if (metric === 'second_visit_rate') return referenceNew(row) && Number(row.visits_post) > 0;
  if (metric === 'first_purchase') return referenceConverted(row) && Number(row.first_purchase) > 0;
  const sources: Record<string,string> = {avg_ltv:'ltv',total_ltv:'ltv',avg_spend:'avg_purchase_value',post_trial_ltv:'post_trial_ltv',purchases_post:'post_trial_purchases',purchase_freq:'post_trial_purchases',source_visits:'class_no',atv:'ltv',auv:'ltv'};
  if (metric && sources[metric]) return present(sources[metric]);
  if (metric === 'units') return Boolean(String(row.purchase_journey ?? '').trim());
  return true;
}
