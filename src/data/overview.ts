import { blueprints } from './blueprints';
import { context, metricFacts, where } from './analytics';
import { metricSQL } from '../semantics/metrics';
import { metaScope } from './marketing-channels';
import { websiteScope } from './performance-marketing';
import type { Filters } from '../state/store';
import { groupable, groupLabel } from './group-fields';

export interface OverviewModule {
  key: string; title: string; tab: number; source: string; group: string;
  groupLabel: string; ids: string[]; note: string; view?: string;
}
const module = (tab: number, group: string, groupLabel: string, ids: string[], note: string): OverviewModule => ({
  key: String(tab), title: '', tab, source: blueprints[tab].source, group, groupLabel, ids, note,
});
export const overviewModules: OverviewModule[] = [
  module(4, 'category', 'Product category', ['gross_revenue', 'transactions', 'discount_rate'], 'Successful, non-voided collections by payment date.'),
  module(8, 'source', 'Lead source', ['leads', 'converted_leads', 'untouched_leads'], 'Lead creation-date cohort by source; latest recorded stage and outcomes.'),
  {key:'website', title:'Performance marketing · Website',tab:8,view:'performance-marketing',source:'leads',group:'utm_campaign',groupLabel:'UTM campaign',ids:['leads','website_members','website_win_rate'],note:'Website CRM leads by creation date; untagged campaigns remain visible.'},
  {key:'meta', title:'Performance marketing · Meta',tab:8,view:'performance-marketing',source:'meta',group:'campaign_name',groupLabel:'Campaign',ids:['meta_spend','meta_leads','meta_cpl'],note:'Meta reporting dates; studio filters do not apply. Meta and CRM leads may overlap.'},
  module(5, 'source', 'Acquisition source', ['new_clients', 'conversion_rate', 'second_visit_rate'], 'Newcomer first-visit cohort and recorded conversion outcomes.'),
  module(6, 'product', 'Access package', ['memberships_count', 'churn_rate', 'utilisation'], 'Membership expiry-date cohort; churn uses recorded churn evidence.'),
  module(12, 'format', 'Signature experience', ['booking_late_cancelled', 'late_affected_sessions', 'late_recorded_value'], 'Late-cancelled booking records only; recorded value is not an estimate of lost revenue.'),
  module(1, 'location', 'Studio', ['sessions', 'attendance', 'fill_rate'], 'Studio sessions; fill is total attendance divided by total capacity.'),
  module(2, 'day', 'Weekday', ['sessions', 'fill_rate', 'empty_sessions'], 'Timetable demand and empty sessions in the selected period.'),
  module(7, 'location', 'Studio', ['bookings', 'cancellation_rate', 'booking_no_show_rate'], 'Booking records; cancellations and no-shows use booking denominators.'),
  module(9, 'location', 'Studio', ['checkins', 'unique_attendees', 'visits_per_member'], 'Recorded check-ins; unique attendees are recalculated for the whole scope.'),
  module(14, 'format_group', 'Format', ['sessions', 'fill_rate', 'revenue'], 'Session-attributed earned revenue by format, separate from collections.'),
  module(3, 'trainer', 'Instructor', ['sessions', 'avg_class_size_incl', 'revenue_per_session'], 'Session performance by instructor; compare alongside sample size.'),
  module(10, 'trainer', 'Instructor', ['payroll_revenue', 'payroll_cost', 'contribution_margin'], 'Payroll-source economics using the module’s governed cost calculation.'),
];

/** The module with a viewer-chosen breakdown column; unknown or unsafe columns fall back to the default. */
export function withOverviewGroup(m: OverviewModule, group?: string): OverviewModule {
  if (!group || group === m.group || !groupable(group)) return m;
  return { ...m, group, groupLabel: groupLabel(group) };
}

export function overviewSQL(m: OverviewModule, filters: Filters, transient: {field:string;value:string}[]) {
  const ctx = context(filters, transient);
  let facts: string;
  if (m.key === 'meta') facts = `meta${metaScope(filters.from, filters.to, {})}`;
  else if (m.key === 'website') facts = `leads${websiteScope(where({...filters,source:[]},'leads',transient.filter(t=>t.field!=='source')))}`;
  else {
    const scope = where(filters,m.source,transient);
    const restricted = m.tab === 12 ? `${scope}${scope ? ' AND ' : ' WHERE '}late_cancelled>0` : scope;
    facts = metricFacts(filters,m.source,transient,restricted);
  }
  const aggregate = `${metricSQL(m.ids,ctx)},COUNT(*) AS n`;
  return {
    total: `SELECT ${aggregate} FROM ${facts}`,
    rows: `SELECT COALESCE(CAST("${m.group}" AS VARCHAR),'Unspecified') AS label,${aggregate} FROM ${facts} GROUP BY "${m.group}" ORDER BY "${m.ids[0]}" DESC NULLS LAST,label LIMIT 5`,
  };
}
