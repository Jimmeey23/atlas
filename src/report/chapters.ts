export interface GroupSpec {
  id?: string;
  field: string;
  fields?: string[];
  title: string;
  deck: string;
  columns: string[];
  limit?: number;
  rankBy?: string;
  tails?: boolean;
  minMetric?: string;
  minValue?: number;
  compare?: string;
}
export interface ChapterSpec {
  id: string; nav: string; title: string; eyebrow: string; deck: string;
  source: string; metrics: string[]; groups: GroupSpec[]; history: string[]; derived?: boolean;
  renewal?: boolean; network?: boolean; website?: boolean; optional?: boolean;
}
const group = (field: string, title: string, columns: string[], extra: Partial<GroupSpec> = {}): GroupSpec => ({
  field, title, deck: 'Selected-month results. Rankings use eligible samples; comparisons refer to the same group in the previous month and previous year.', columns, limit: 10, ...extra,
});
const demand = ['sessions', 'attendance', 'complimentary_visits', 'session_complimentary_rate', 'avg_class_size_incl', 'fill_rate', 'revenue_per_session'];
const trials = ['new_clients', 'conversion_rate', 'retention_rate', 'avg_ltv'];
const sales = ['gross_revenue', 'net_revenue', 'transactions', 'aov'];
export const chapters: ChapterSpec[] = [
  { id: 'executive-summary', nav: 'Overview', title: 'Executive decision brief', eyebrow: 'The decisions that matter',
    deck: 'The strongest signals across cash sales, acquisition, member continuity and studio demand.', source: 'sessions',
    metrics: ['attendance', 'fill_rate', 'avg_class_size_incl', 'revenue', 'complimentary_visits', 'session_complimentary_rate'], groups: [], history: ['attendance', 'fill_rate'] },
  { id: 'revenue-performance', nav: 'Sales', title: 'Sales, products & revenue quality', eyebrow: 'Commercial performance',
    deck: 'What changed in collections, where the movement came from and how resilient the product mix is.', source: 'sales',
    metrics: ['gross_revenue', 'net_revenue', 'transactions', 'aov', 'buyers', 'discount_rate', 'membership_rev_share', 'units', 'discount_value', 'arpu'],
    history: ['gross_revenue', 'transactions', 'aov', 'discount_rate'], groups: [
      group('category', 'Sales by category', [...sales, 'discount_rate'], { limit: 20, compare: 'gross_revenue' }),
      group('product', 'Sales by product', sales, { limit: 20, compare: 'gross_revenue' }),
      group('payment_method', 'Payment mix', ['gross_revenue', 'transactions', 'aov'], { compare: 'gross_revenue' }),
    ] },
  { id: 'conversion-funnel', nav: 'Newcomers', title: 'Newcomer conversion & retention', eyebrow: 'From first visit to habit',
    deck: 'Which client types, channels and instructors support paid conversion and repeat practice. Recent cohorts have shorter follow-up windows.', source: 'new',
    metrics: ['new_clients', 'conversion_rate', 'retention_rate', 'zero_return_rate', 'avg_first_purchase', 'avg_ltv', 'avg_conversion_span', 'visits_post_trial'],
    history: ['new_clients', 'conversion_rate', 'retention_rate', 'avg_ltv'], groups: [
      group('entry_type', 'Conversion and retention by client type', trials, { compare: 'conversion_rate' }),
      group('source', 'Newcomer acquisition by source', trials, { compare: 'conversion_rate' }),
      group('trainer', 'First-session instructor outcomes', trials, { minMetric: 'new_clients', minValue: 5, compare: 'conversion_rate' }),
    ] },
  { id: 'leads', nav: 'Leads', title: 'Lead sources, stages & conversion', eyebrow: 'Pipeline effectiveness',
    deck: 'Creation-cohort performance, recorded sales-stage outcomes and follow-up discipline. Stage counts are the latest recorded position, not historical stage transitions.', source: 'leads',
    metrics: ['leads', 'converted_leads', 'lead_conversion_rate', 'trials_completed', 'open_leads', 'untouched_leads', 'response_time_hours', 'touches'],
    history: ['leads', 'converted_leads', 'lead_conversion_rate', 'response_time_hours'], groups: [
      group('source', 'Leads by source', ['leads', 'converted_leads', 'lead_conversion_rate', 'response_time_hours'], { compare: 'lead_conversion_rate' }),
      group('stage', 'Lead performance by stage', ['leads', 'trials_completed', 'converted_leads', 'touches'], { compare: 'leads' }),
      group('associate', 'Lead ownership and follow-up', ['leads', 'converted_leads', 'lead_conversion_rate', 'untouched_leads'], { compare: 'lead_conversion_rate' }),
    ] },
  { id: 'renewals', nav: 'Renewals', title: 'Renewals completed & confirmed lapses', eyebrow: 'Membership continuity',
    deck: 'The dashboard’s paid expiry cohorts, deduplicated per member and expiry month. Every due membership is renewed, lapsed (most recent membership with a recorded Churned Date) or frozen.',
    source: 'lapsed', renewal: true,
    metrics: ['due', 'renewed', 'renewal_rate', 'lapsed', 'frozen'], history: ['due', 'renewed', 'lapsed', 'renewal_rate'], groups: [
      group('product', 'Renewals and lapses by membership', ['due', 'renewed', 'lapsed', 'frozen', 'renewal_rate'], { compare: 'renewal_rate', limit: 15 }),
    ] },
  { id: 'lapsed', nav: 'Member health', title: 'Membership usage & engagement risk', eyebrow: 'Members who need attention',
    deck: 'Expiry-cohort usage alongside clearly labelled current membership snapshots. Remaining balances and outcomes can change as the source is updated.', source: 'lapsed',
    metrics: ['memberships_count', 'utilisation', 'churn_rate', 'remaining_sessions', 'active_memberships', 'dormant_actives', 'revenue_at_risk_30d'],
    history: ['memberships_count', 'utilisation', 'churn_rate', 'remaining_sessions'], groups: [
      group('product', 'Member health by membership', ['memberships_count', 'utilisation', 'remaining_sessions', 'days_absent'], { compare: 'utilisation', limit: 15 }),
      group('status', 'Membership status and usage', ['memberships_count', 'utilisation', 'days_absent'], { compare: 'memberships_count' }),
    ] },
  { id: 'instructors', nav: 'Instructors', title: 'Instructor scorecards & rankings', eyebrow: 'Performance with context',
    deck: 'Criterion-based scorecards, with no invented composite score. Rankings require at least five sessions and should be read alongside timetable mix.', source: 'sessions',
    metrics: ['sessions', 'attendance', 'avg_class_size_incl', 'fill_rate', 'revenue_per_session', 'draw_premium_pp'],
    history: ['avg_class_size_incl', 'fill_rate', 'revenue_per_session', 'draw_premium_pp'], groups: [
      group('trainer', 'Instructor performance scorecards', [...demand, 'draw_premium_pp'], { limit: 20, minMetric: 'sessions', minValue: 5, compare: 'fill_rate' }),
      group('trainer', 'Top and bottom instructors by fill rate', demand, { id: 'trainer-fill', rankBy: 'fill_rate', tails: true, minMetric: 'sessions', minValue: 5, compare: 'fill_rate' }),
      group('trainer', 'Top and bottom instructors by class average', demand, { id: 'trainer-size', compare: 'avg_class_size_incl', rankBy: 'avg_class_size_incl', tails: true, minMetric: 'sessions', minValue: 5 }),
      group('trainer', 'Top and bottom instructors by revenue per session', demand, { id: 'trainer-yield', compare: 'revenue_per_session', rankBy: 'revenue_per_session', tails: true, minMetric: 'sessions', minValue: 5 }),
    ] },
  { id: 'instructor-outcomes', nav: 'Outcomes', title: 'Instructor community & economics scorecards', eyebrow: 'Beyond attendance',
    deck: 'Payroll-reported newcomer outcomes and instructor economics. Cost and contribution use the app’s configured rate and are estimates.', source: 'payroll',
    metrics: ['new_handled', 'payroll_conversion', 'payroll_retention', 'payroll_revenue', 'payroll_cost', 'contribution_margin'],
    history: ['payroll_conversion', 'payroll_retention', 'payroll_revenue', 'contribution_margin'], groups: [
      group('trainer', 'Instructor conversion and retention scorecards', ['new_handled', 'payroll_conversion', 'payroll_retention', 'payroll_revenue'], { compare: 'payroll_conversion', minMetric: 'new_handled', minValue: 5, limit: 20 }),
      group('trainer', 'Instructor economics', ['sessions', 'payroll_revenue', 'payroll_cost', 'contribution_margin'], { compare: 'payroll_revenue', minMetric: 'sessions', minValue: 5, limit: 20 }),
    ] },
  { id: 'formats', nav: 'Formats', title: 'Format comparison & demand mix', eyebrow: 'Barre · PowerCycle · Strength Lab',
    deck: 'Class averages, fill and yield across the three formats, with class, instructor and time comparisons.', source: 'sessions',
    metrics: ['sessions', 'attendance', 'avg_class_size_incl', 'fill_rate', 'revenue_per_session', 'late_cancel_rate'],
    history: ['sessions', 'attendance', 'fill_rate', 'avg_class_size_incl'], groups: [
      group('format_group', 'Format comparison with MoM and YoY', demand, { compare: 'fill_rate', limit: 3 }),
      group('format', 'Format metrics by class', demand, { compare: 'fill_rate', limit: 15 }),
      group('format_group', 'Format and instructor combinations', demand, { id: 'format-trainer', fields: ['format_group', 'trainer'], compare: 'fill_rate', minMetric: 'sessions', minValue: 5, limit: 12 }),
      group('format_group', 'Format metrics by time', demand, { id: 'format-time', fields: ['format_group', 'time'], compare: 'fill_rate', minMetric: 'sessions', minValue: 5, limit: 12 }),
    ] },
  { id: 'sessions', nav: 'Schedule', title: 'Schedule winners, weak slots & combinations', eyebrow: 'Where to protect or change capacity',
    deck: 'Best and worst classes, times and class–instructor–day–time combinations, ranked on capacity-weighted fill with at least five sessions.', source: 'sessions',
    metrics: ['sessions', 'capacity', 'booked', 'attendance', 'fill_rate', 'empty_session_rate', 'late_cancel_rate', 'unsold_seats'],
    history: ['sessions', 'fill_rate', 'empty_sessions', 'revenue_per_session'], groups: [
      group('format', 'Best and worst performing scheduled classes', demand, { rankBy: 'fill_rate', tails: true, minMetric: 'sessions', minValue: 5, compare: 'fill_rate' }),
      group('time', 'Best and worst class times', demand, { rankBy: 'fill_rate', tails: true, minMetric: 'sessions', minValue: 5, compare: 'fill_rate' }),
      group('day', 'Day-of-week demand', demand, { compare: 'fill_rate', limit: 7 }),
      group('format', 'Best class, instructor, day and time combinations', demand, { id: 'slot-combinations', fields: ['format', 'trainer', 'day', 'time'], rankBy: 'fill_rate', tails: true, minMetric: 'sessions', minValue: 5, compare: 'fill_rate' }),
    ] },
  { id: 'recurring', nav: 'Recurring', title: 'Recurring class performance', eyebrow: 'Consistency across repeated slots',
    deck: 'Recurring-source session aggregates. These are not additional sessions to add to the Sessions chapter.', source: 'recurring',
    metrics: ['sessions', 'attendance', 'fill_rate', 'avg_class_size_incl', 'empty_session_rate', 'revenue_per_session'],
    history: ['sessions', 'fill_rate', 'avg_class_size_incl', 'empty_session_rate'], groups: [
      group('format', 'Recurring class performance by format', demand, { compare: 'fill_rate', limit: 15 }),
      group('format', 'Best and worst recurring schedule combinations', demand, { id: 'recurring-slots', fields: ['format', 'trainer', 'day', 'time'], rankBy: 'fill_rate', tails: true, minMetric: 'sessions', minValue: 5, compare: 'fill_rate' }),
    ] },
  { id: 'late-cancellations', nav: 'Late cancels', title: 'Late cancellations & attendance leakage', eyebrow: 'Recovery opportunities',
    deck: 'Booking-record cancellations by session date, with MoM and YoY context. Rates use all eligible bookings as the denominator; counts are not distinct people.', source: 'bookings',
    metrics: ['bookings', 'booking_late_cancelled', 'booking_late_rate', 'booking_no_shows', 'booking_no_show_rate', 'booking_attendance_rate'],
    history: ['bookings', 'booking_late_cancelled', 'booking_late_rate', 'booking_no_show_rate'], groups: [
      group('product', 'Late cancellations by membership', ['bookings', 'booking_late_cancelled', 'booking_late_rate'], { rankBy: 'booking_late_cancelled', compare: 'booking_late_cancelled', limit: 12 }),
      group('format', 'Late cancellations by class type', ['bookings', 'booking_late_cancelled', 'booking_late_rate'], { rankBy: 'booking_late_cancelled', compare: 'booking_late_cancelled', limit: 12 }),
      group('trainer', 'Late cancellations by instructor', ['bookings', 'booking_late_cancelled', 'booking_late_rate'], { rankBy: 'booking_late_cancelled', compare: 'booking_late_cancelled', limit: 12 }),
      group('location', 'Late cancellations by location', ['bookings', 'booking_late_cancelled', 'booking_late_rate'], { compare: 'booking_late_cancelled' }),
    ] },
  {id:'community-attendance',nav:'Attendance',title:'Community attendance & practice frequency',eyebrow:'Depth of engagement',deck:'Check-in records and practice frequency, distinct from session aggregates.',source:'checkins',optional:true,
    metrics:['checkins','unique_attendees','visits_per_member','checkin_revenue','revenue_per_checkin','teaching_hours'],history:['checkins','unique_attendees','visits_per_member'],groups:[group('format','Practice frequency by format',['checkins','unique_attendees','visits_per_member'],{compare:'checkins'}),group('trainer','Check-in attendance by instructor',['checkins','unique_attendees','revenue_per_checkin'],{compare:'checkins'})]},
  {id:'website-marketing',nav:'Website',title:'Website acquisition & cohort outcomes',eyebrow:'Recorded marketing outcomes',deck:'Exact Website-source leads, using recorded trial, conversion and retention outcomes for the creation cohort.',source:'leads',website:true,optional:true,
    metrics:['leads','website_trials','website_members','website_win_rate','website_retained','website_contact_rate','website_untouched','response_time_hours'],history:['leads','website_members','website_win_rate'],groups:[group('associate','Website outcomes by associate',['leads','website_trials','website_members','website_win_rate'],{compare:'website_win_rate'})]},
  {id:'meta-marketing',nav:'Meta',title:'Meta media efficiency · account context',eyebrow:'Account-level context',deck:'All available ad accounts in the selected month. These results are not attributed to this studio and cannot be joined to studio conversion without a verified mapping.',source:'meta',network:true,optional:true,
    metrics:['meta_spend','meta_leads','meta_cpl','meta_purchases','meta_roas','meta_impressions','meta_clicks','meta_ctr'],history:['meta_spend','meta_leads','meta_cpl','meta_roas'],groups:[group('campaign_name','Media efficiency by campaign',['meta_spend','meta_leads','meta_cpl','meta_roas'],{compare:'meta_cpl',limit:8})]},
  { id: 'recommendations', nav: 'Recommendations', title: 'Evidence-led recommendations', eyebrow: 'The rationale for leadership',
    deck: 'Recommendations grounded in this month’s performance, the year’s pattern and the alternatives the evidence supports.', source: 'sessions', metrics: [], groups: [], history: [], derived: true },
  { id: 'predictions', nav: 'Outlook', title: 'What happens next: conditional scenarios', eyebrow: 'Assumptions made visible',
    deck: 'Transparent what-if calculations, with leading indicators and conditions that would change the outlook.', source: 'sessions', metrics: [], groups: [], history: [], derived: true },
];
export const chapterById = Object.fromEntries(chapters.map(c => [c.id, c]));
export const chapterNumber = (index: number) => String(index + 1).padStart(2, '0');
