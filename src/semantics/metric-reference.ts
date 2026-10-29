import { metrics, DEFAULT_COST_RATE } from './metrics';
import { today as kolkataToday } from '../data/periods';
import { metricNotes, currentSnapshotMetrics } from './evidence';
import { metricTable } from './catalogue';
import { sheets } from '../data/sheets.config';

export const referenceScopes: Record<string, string> = {
  sessions: 'Session date; one Sessions source row. Session-count fields can differ on recurring rollups. Instructor slot baselines are calculated before instructor filters.',
  recurring: 'Recurring source date/month and aggregated schedule rows. MAX-based instructor list measures are not latest-state measures.',
  teacher_recurring: 'Teacher Recurring source date/month; aggregated instructor/schedule rows. sessions is the reported TotalSessions/Classes value, not source row count.',
  sales: 'Payment date; known voids are excluded, and Payment Status must be succeeded or missing. Missing void flags are accepted. Import exclusions follow the app toggle. Current membership balances are not historical balances.',
  checkins: 'Source Date or Date (IST); one check-in source row. attended is read from Attended, falling back to Checked In. Distinct session IDs, source rows and attended visits are different populations.',
  new: 'First Visit Date cohort. is_new=true uses normalized Is New labels/booleans. Latest reported statuses are not dated conversion events; row counts are not guaranteed distinct members.',
  leads: 'Created At cohort; selected source filters apply. website_* formulas do not themselves restrict Source to Website: Website views add this scope, general Leads views retain their selected sources.',
  lapsed: 'End Date expiry cohort for standard dated queries, although normalized date stores Purchase Date. Member-expiry-month renewal cohorts and latest-eligible-member lapse counts are separate populations.',
  payroll: 'Calendar month from Month Year. Partial-month selections include corresponding full source months. Source revenue is monthly instructor attribution. Evidence n is SUM(sessions), not row count.',
  bookings: 'Session Date; one booking source row. Some views further restrict to late cancellations. Imported booking lead time is null. Flag-based counts can overlap; exclusive charts apply precedence.',
  meta: 'Meta reporting date; account/network scope without studio identity. Row reach is summed rather than audience-deduplicated; CRM and platform attribution are separate.',
};

/** Only expose a unique outer division as a ratio; nested/compound formulas need their full expression. */
export function referenceRatio(expression: string): { numerator: string; denominator: string } | null {
  let depth = 0, quote = '', index = -1;
  for (let i = 0; i < expression.length; i++) {
    const c = expression[i];
    if (quote) { if (c === quote) { if (expression[i + 1] === quote) i++; else quote = ''; } continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && c === '/') { if (index >= 0) return null; index = i; }
    else if (depth === 0 && (c === '+' || c === '-')) return null;
  }
  return index < 0 ? null : { numerator: expression.slice(0, index).trim(), denominator: expression.slice(index + 1).trim() };
}

export function sourceReference(source: string) {
  const dot = source.indexOf('.');
  const title = dot < 0 ? source : source.slice(0, dot);
  const column = dot < 0 ? '' : source.slice(dot + 1);
  if (title === 'Settings') return { source, status: 'Configured application assumption; not a sheet column' };
  if (title === 'Source') return { source, status: 'Context-dependent source-row count; no fixed sheet' };
  const sheet = sheets.find(s => s.title === title);
  return { source, status: !sheet ? 'Unresolved source title' : sheet.columns.includes(column) ? 'Declared in configured source schema; live availability not verified' : 'Read by implementation or required by metric, but absent from configured column list; live header availability unverified' };
}

export function metricReference(id: string) {
  const metric = metrics[id];
  const note = metricNotes[id];
  const table = metricTable(id);
  const runtime = metric.sql({ rate: DEFAULT_COST_RATE, today: kolkataToday() });
  const ratio = referenceRatio(runtime);
  const sampleUnit = table === 'payroll' ? 'teaching sessions (SUM(sessions)) in the standard Payroll workspace' : 'source records in standard grouped queries; specialist views can use a different evidence population';
  const population = id === 'new_late_cancels' ? 'Acquisition first-visit cohort from New; all-time Bookings matched by member ID. Uses the same shared formula in Acquisition and the metric catalogue.'
    : currentSnapshotMetrics.has(id) ? 'Current source snapshot relative to today in Asia/Kolkata. Standard cards exclude selected period dates and comparisons; not a reconstructed historical balance.'
    : referenceScopes[table || ''] || 'Workspace-dependent source population; no single fixed date basis.';
  return {
    table, runtime, population, sampleUnit,
    sources: metric.sources.map(sourceReference),
    numerator: note?.numerator || ratio?.numerator || 'Not a single outer ratio; see full formula and definition.',
    denominator: note?.denominator || ratio?.denominator || (['avg', 'median', 'max'].includes(metric.aggregation) ? 'Observation population: non-null qualifying values; median and maximum are order statistics, not ratios.' : 'No single outer denominator; nested divisions and compound calculations are preserved in the full formula.'),
    aggregation: metric.aggregation,
    runtimeNote: id === 'new_late_cancels' ? 'Matches each group’s distinct newcomer member IDs to all-time Bookings. Load both sources. AI scoped queries do not offer this cross-source calculation.'
      : 'This is the expression the engine actually runs, shown with the operator default cost rate and today’s Asia/Kolkata date. Both are replaced by the configured values at query time, and the newcomer subquery is scoped by the active filters. Source normalization and documented view scope also apply.',

  };
}

export const metricAuditFindings = [
  { severity: 'Corrected', area: 'Source lineage', detail: 'Booking-rate pseudo-columns, malformed utilisation references, product-count lineage, and the primary Retention source for unused-credit valuation were corrected. Missing secondary inputs were added.' },
  { severity: 'Corrected', area: 'Population wording', detail: 'Active base counts identities with an Active row without latest-row ranking. Active memberships use status exclusions rather than a three-status whitelist. Expiring purchase value includes Frozen and future-start rows.' },
  { severity: 'Corrected', area: 'Timing and eligibility', detail: 'Bookings within 24 hours replaces same-day wording. Payment eligibility includes missing status. Lapse definitions disclose End Date fallback. Retention and return-visit equality is not guaranteed.' },
  { severity: 'Corrected', area: 'Aggregation and confidence', detail: 'Instructor-list metrics use MAX, not latest state. Renewal counts are additive counts, not weighted rates. Payroll contributing-observation units are teaching sessions. Fixed minimum-sample rules were removed.' },
  { severity: 'Corrected', area: 'Full filtered dataset', detail: 'Fixed metric-level minimums, automatic low-sample badges and confidence restrictions were removed. Names no longer gain Derived merely for a sample threshold. User-selected group/session/transaction filters remain available and default to no sample cutoff.' },
  { severity: 'Corrected', area: 'Cross-tab calculations', detail: 'Acquisition rates, LTV and conversion timing now follow the same newcomer eligibility as the shared registry. Acquisition and catalogue late cancellations share one distinct-member matched booking formula. Retention reconstructions use the same status predicates as current cards. AI queries skip filters on absent source fields; the all-time cross-source booking metric is explicitly unavailable in scoped AI queries.' },
  { severity: 'Unverified source availability', area: 'Optional/missing configured columns', detail: 'Required Leads status/LTV/UTM fields and optional Sales membership-balance fields are absent from the configured column list. Normalization can read dynamic headers; live headers were not refreshed in this audit.' },
  { severity: 'Remaining calculation caveat', area: 'Unequal coverage', detail: 'Some ratios use differing non-null populations. Revenue per hour can include revenue on rows without session IDs while hours require IDs; membership credit valuation can repeat balances. Retention history uses current status eligibility at earlier access dates; past status changes cannot be recovered. These need a separately governed numerical correction.' },
  { severity: 'Coverage boundary', area: 'Specialist measures', detail: 'All 175 registry entries were inspected against formulas and normalization. The code appendix locates specialist implementations but is not an individually approved business definition for every local or user-generated measure. No live source totals were reconciled. Existing saved reports retain their frozen content until rebuilt.' },
];
