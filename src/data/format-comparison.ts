/**
 * The Format comparison page's configuration, kept out of the component so it can be
 * asserted on directly instead of being matched as source text in a test.
 */

// Every section groups by format_group, derived from the class name in
// normalise.ts. Formats come from the data rather than a fixed list so a
// renamed or retired format does not leave an empty column behind.
export const SCORECARD_SECTIONS: { heading: string; ids: string[] }[] = [
  { heading: "Supply", ids: ["sessions", "capacity", "trainers", "active_slots", "overbooked_sessions"] },
  { heading: "Demand", ids: ["booked", "attendance", "paid_attendance", "avg_class_size_incl", "avg_class_size_excl", "intro_penetration", "complimentary_visits", "session_complimentary_rate"] },
  { heading: "Efficiency", ids: ["fill_rate", "booking_fill_rate", "show_up_rate", "empty_sessions", "empty_session_rate", "unsold_seats", "attendance_cv", "nonempty_reliability"] },
  // late_cancel_rate here is the Sessions definition, read from the Sessions source.
  // The instructor scorecard reads Bookings instead (booking_late_rate); the two are
  // different measures with different denominators and must not be swapped.
  { heading: "Leakage", ids: ["late_cancel_rate", "no_shows", "no_show_rate", "non_paid_rate", "complimentary_rate"] },
  { heading: "Yield", ids: ["revenue", "revenue_per_session", "rev_pac", "rev_pas", "lost_revenue", "membership_att_share"] },
];

export const SCORECARD_IDS = SCORECARD_SECTIONS.flatMap((s) => s.ids);
export const SHARE_IDS = ["sessions", "capacity", "attendance", "revenue"];
// `trainers` is a lifetime recurring rollup, so it is excluded from the monthly trend.
export const TREND_IDS = SCORECARD_IDS.filter((id) => id !== "trainers");
export const SLOT_IDS = ["sessions", "attendance", "fill_rate", "avg_class_size_incl", "revenue_per_session", "show_up_rate", "late_cancel_rate", "no_show_rate", "empty_session_rate", "rev_pas"];
export const SLICE_DEFAULTS: Record<string, string[]> = { slots: ["day", "time"], trainers: ["trainer"], studios: ["location"] };

/**
 * The viewer's own minimum-group cutoff, appended to the slot and instructor queries.
 *
 * A repeated Session ID is one timetable session, so the cutoff counts distinct session
 * identities rather than summing the per-row session flag. It is off at 0: the metric
 * definitions carry no built-in sample gate, and any minimum is a view control the
 * operator chooses and the caption states.
 */
export function minimumSessionsClause(minimumSessions: number): string {
  const minimum = Math.max(0, Math.floor(Number(minimumSessions) || 0));
  return minimum > 0 ? ` HAVING COUNT(DISTINCT session_id)>=${minimum}` : "";
}
