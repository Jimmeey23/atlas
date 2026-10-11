/**
 * Synthetic snapshot for the report design preview (`npm run preview:report`) and for
 * local layout smoke checks. It is deliberately kept out of `src/`: the application
 * never contains demo records, and nothing here is imported by product code.
 */
/* ------------------------------------------------------------------ fixture ---
   One 14-month series per measure, all derived from the same four drivers, so the
   deck's arithmetic (attendance = sessions × class size, collections = attendance ×
   yield) holds together when a reader checks it by hand.                              */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export const MONTHS = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2025, 7 + i, 1)).toISOString().slice(0, 7));
export const STUDIO = "Kenkere House";
/** -1 is the selected month's predecessor, -13 the same month a year earlier. */
export const at = index => MONTHS.at(index);
const wave = (i, base, amplitude, drift = .012) => base * (1 + amplitude * Math.sin(i / 2.2) + drift * i);
/** Seasonality plus one soft month, so the deck has a real story to tell. */
const demand = i => i === 13 ? .865 : i === 12 ? .985 : 1;
const round = (value, places = 0) => { const f = 10 ** places; return Math.round(value * f) / f; };

function monthRow(i) {
  const sessions = Math.round(wave(i, 96, .06) * demand(i));
  const avgSize = wave(i, 9.2, .09);
  const attendance = Math.round(sessions * avgSize);
  const capacity = sessions * 25;
  const booked = Math.round(attendance / .885);
  const emptySessions = Math.max(0, Math.round(wave(i, 5.4, .5) + (i === 13 ? 2 : 0)));
  const lateRate = wave(i, .068, .22) + (i === 13 ? .012 : 0);
  const noShowRate = wave(i, .038, .2) + (i === 13 ? .006 : 0);
  const bookings = Math.round(booked * 1.14);
  const lateCancelled = Math.round(bookings * lateRate);
  const noShows = Math.round(bookings * noShowRate);
  const revenuePerSession = wave(i, 12400, .12);
  const gross = Math.round(demand(i) === 1 ? revenuePerSession * sessions : wave(i, 12400, .12) * 96 * demand(i));
  const vat = Math.round(gross - gross / 1.18);
  const net = gross - vat;
  const aov = wave(i, 3480, .08);
  const transactions = Math.round(gross / aov);
  const discountRate = wave(i, .108, .18);
  const newClients = Math.round(wave(i, 126, .14) * demand(i));
  const conversionRate = wave(i, .34, .1) - (i === 13 ? .03 : 0);
  const checkins = Math.round(wave(i, 845, .09) * demand(i));
  const memberships = Math.round(wave(i, 820, .05));
  return {
    month: MONTHS[i],
    sessions, capacity, booked, attendance, empty_sessions: emptySessions, unsold_seats: capacity - attendance,
    fill_rate: round(attendance / capacity, 4), booking_fill_rate: round(booked / capacity, 4),
    avg_class_size_incl: round(avgSize, 2), empty_session_rate: round(emptySessions / sessions, 4),
    late_cancel_rate: round(lateRate, 4), booking_late_rate: round(lateRate, 4),
    // Collections follow the visits, so revenue per visit stays inside a believable band.
    gross_revenue: gross, vat, net_revenue: net, transactions, units: Math.round(transactions * 1.06),
    aov: round(gross / transactions), buyers: Math.round(transactions * .62),
    discount_rate: round(discountRate, 4), discount_value: Math.round(gross * discountRate / (1 - discountRate)),
    membership_rev_share: round(wave(i, .615, .07), 4), revenue: gross,
    revenue_per_session: round(gross / sessions), rev_pas: round(gross / capacity), rev_pac: round(gross / attendance),
    arpu: round(gross / Math.round(transactions * .62)),
    new_clients: newClients, conversion_rate: round(conversionRate, 4), second_visit_rate: round(wave(i, .52, .07), 4),
    zero_return_rate: round(wave(i, .27, .16) + (i === 13 ? .05 : 0), 4), retention_rate: round(wave(i, .465, .09), 4),
    avg_ltv: Math.round(wave(i, 46000, .14)), avg_first_purchase: Math.round(wave(i, 6800, .1)),
    visits_post_trial: round(wave(i, 3.1, .1), 2), new_visits: Math.round(wave(i, 620, .16)),
    memberships_count: memberships, active_memberships: Math.round(wave(i, 788, .05)),
    utilisation: round(wave(i, .575, .1), 4), churn_rate: round(wave(i, .062, .28) + (i === 13 ? .018 : 0), 4),
    remaining_sessions: Math.round(wave(i, 2450, .11)), dormant_actives: Math.round(wave(i, 94, .22)),
    revenue_at_risk_30d: Math.round(wave(i, 430000, .16)),
    days_absent: Math.round(wave(i, 38, .18)),
    bookings, booking_late_cancelled: lateCancelled, booking_no_shows: noShows,
    booking_no_show_rate: round(noShowRate, 4), booking_attendance_rate: round(1 - noShowRate - .04, 4),
    booked_seats: booked, checkins, unique_attendees: Math.round(wave(i, 405, .08) * demand(i)),
    visits_per_member: round(wave(i, 2.6, .1), 2), teaching_hours: round(sessions * 1.05, 1),
    revenue_per_checkin: round(gross / checkins),
    draw_premium_pp: round(wave(i, 2.4, .5), 2),
  };
}
export const SERIES = MONTHS.map((_, i) => monthRow(i));
const rowAt = i => SERIES.at(i);
const pick = (row, ids) => Object.fromEntries(ids.map(id => [id, row[id] ?? null]));

const GROUPS = {
  category: ["Memberships", "Class packs", "Personal training", "Retail"],
  product: ["Barre 57 Unlimited", "PowerCycle 12-pack", "Barre 8-pack", "Intro offer", "Retail & apparel"],
  payment_method: ["UPI", "Card", "Netbanking", "Cash"],
  associate: ["Priya Nair", "Rahul Menon", "Sneha Iyer", "Vikram Rao"],
  entry_type: ["Intro offer", "Trial class", "Referral guest", "Walk-in"],
  source: ["Walk-in", "Instagram", "Referral", "Website", "Google"],
  trainer: ["Asha Menon", "Rohan Pillai", "Meera Krishnan", "Kabir Shah", "Divya Suresh", "Nikhil Verma"],
  format_group: ["Barre 57", "PowerCycle", "Strength Lab"],
  format: ["Barre 57 Foundations", "Barre 57 Open", "PowerCycle 45", "Strength Lab 60"],
  time: ["06:30", "07:45", "09:30", "18:30", "19:45"],
  day: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  status: ["Active", "Grace", "Expiring", "Frozen"],
  location: ["Kenkere House", "Indiranagar"],
};

/** Rows are deterministic functions of the group name, so a criterion switch re-ranks real rows. */
const seed = text => [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 9973, 7);
/** How a measure combines, taken from the metric registry so a rate is never added to a total. */
const registry = require("../src/semantics/registry.json");
const AGGREGATION = Object.fromEntries(registry.map(metric => [metric.id, metric.aggregation]));
const FORMAT = Object.fromEntries(registry.map(metric => [metric.id, metric.format]));
const kind = column => {
  const now = rowAt(-1)[column];
  if (AGGREGATION[column] === "sum") return "additive";
  if (AGGREGATION[column]) return FORMAT[column] === "percent" || FORMAT[column] === "ratio" ? "share" : "rate";
  return typeof now === "number" && now <= 1.2 ? "share" : "additive";
};
const additive = column => kind(column) === "additive";
const clampShare = value => Math.min(.98, Math.max(.02, value));
/** Deterministic per-row variation, so a breakdown is not made of rows that all moved identically. */
const jitter = (name, key, spread) => 1 + spread * (((seed(name + key) % 200) - 100) / 100);

function groupRows(names, columns, id) {
  return names.map(name => {
    const weight = .55 + (seed(name) % 90) / 100;           // 0.55 … 1.45
    const wobble = ((seed(name + id) % 21) - 10) / 100;     // ±10%
    return {
      g: name, n: Math.round(42 + seed(name) % 180),
      ...Object.fromEntries(columns.map(column => {
        const base = rowAt(-1)[column];
        if (base == null) return [column, null];
        if (additive(column)) return [column, Math.round(base * weight * (1 + wobble))];
        const value = base * (1 + wobble);
        return [column, kind(column) === "share" ? round(clampShare(value), 4) : Math.round(value)];
      })),
    };
  });
}

function groupTable({ id, field, fields, title, columns, compare, minimum, names, limit = 10 }) {
  const rows = groupRows(names, columns, id ?? field).sort((a, b) => Number(b[compare]) - Number(a[compare])).slice(0, limit);
  /* Additive measures are scaled so the rows partition the chapter's own total: a breakdown that
     does not add up to the figure above it makes every share and contribution on the page wrong. */
  for (const column of columns) if (additive(column)) {
    const chapter = rowAt(-1)[column], sum = rows.reduce((total, row) => total + (typeof row[column] === "number" ? row[column] : 0), 0);
    if (typeof chapter === "number" && chapter > 0 && sum > 0) for (const row of rows) if (typeof row[column] === "number") row[column] = Math.round(row[column] * chapter / sum);
  }
  const total = {};
  for (const column of ["n", ...columns]) {
    const values = rows.map(row => row[column]).filter(value => typeof value === "number");
    /* A rate's total is the chapter's own figure, so the table header and the metric card agree. */
    total[column] = !values.length ? null : additive(column) ? values.reduce((a, b) => a + b, 0)
      : typeof rowAt(-1)[column] === "number" ? round(rowAt(-1)[column], kind(column) === "share" ? 4 : 2)
      : round(values.reduce((a, b) => a + b, 0) / values.length, 4);
  }
  /* Each row moves by its own amount, but the additive moves are rescaled so the rows still add up
     to the chapter's own month-on-month and year-on-year comparison. */
  const shape = (mode, spread) => {
    const column = compare;
    const sum = rows.reduce((total, row) => total + (typeof row[column] === "number" ? row[column] : 0), 0);
    const target = rowAt(mode)[column] ?? rowAt(-1)[column];
    const weighted = rows.reduce((total, row) => total + (typeof row[column] === "number" ? row[column] * jitter(row.g, `${mode}${id ?? field}`, spread) : 0), 0);
    const k = additive(column) && weighted > 0 && typeof target === "number" && sum > 0 ? target / weighted : 1;
    return Object.fromEntries(rows.map(row => [row.g, Object.fromEntries(columns.map(c => {
      const base = row[c];
      if (typeof base !== "number") return [c, null];
      const moved = base * jitter(row.g, `${mode}${id ?? field}${c}`, spread);
      if (additive(c)) return [c, Math.round(moved * k)];
      const now = rowAt(-1)[c], then = rowAt(mode)[c] ?? now;
      const value = moved * (now ? then / now : 1);
      return [c, kind(c) === "share" ? round(clampShare(value), 4) : Math.round(value)];
    }))]));
  };
  return {
    id, field, fields, title, compare, minimum,
    deck: "Selected-month results. Rankings use eligible samples; comparisons refer to the same group in the previous month and previous year.",
    columns, rows, total,
    prior: shape(-2, .22), priorYear: shape(-13, .26),
    omitted: 0, eligible: rows,
    diagnostics: [`${rows.length} eligible groups shown. Samples below the threshold are excluded from rankings.`],
  };
}

/** One chapter: the frozen month, its two comparisons and fourteen months of history. */
function chapter(id, metricIds, groups = [], n = 1200) {
  const selected = rowAt(-1), prior = rowAt(-2), priorYear = rowAt(-13);
  return {
    id, n,
    total: pick(selected, metricIds), prior: pick(prior, metricIds), priorYear: pick(priorYear, metricIds),
    yearToDate: pick(selected, metricIds), priorYearToDate: pick(priorYear, metricIds),
    groups, history: SERIES.map(row => ({ month: row.month, ...pick(row, metricIds) })),
    notes: ["Source snapshots are frozen at report build; live figures may have moved since."],
  };
}

export const FIXTURE_CHAPTERS = {
  "executive-summary": chapter("executive-summary", ["attendance", "fill_rate", "avg_class_size_incl", "sessions", "gross_revenue", "conversion_rate"], [], 4820),
  "revenue-performance": chapter("revenue-performance", ["gross_revenue", "net_revenue", "transactions", "aov", "buyers", "discount_rate", "membership_rev_share", "units"], [
    groupTable({ field: "category", title: "Sales by category", columns: ["gross_revenue", "transactions", "aov", "discount_rate"], compare: "gross_revenue", minimum: "At least one recorded sale", names: GROUPS.category }),
    groupTable({ field: "product", title: "Sales by product", columns: ["gross_revenue", "transactions", "aov", "units"], compare: "gross_revenue", minimum: "At least one recorded sale", names: GROUPS.product }),
    groupTable({ field: "payment_method", title: "Payment mix", columns: ["gross_revenue", "transactions", "aov"], compare: "gross_revenue", minimum: "At least one recorded sale", names: GROUPS.payment_method }),
    groupTable({ field: "associate", title: "Sales by associate", columns: ["gross_revenue", "transactions", "aov", "discount_rate"], compare: "gross_revenue", minimum: "At least five recorded sales", names: GROUPS.associate }),
  ], 1640),
  "conversion-funnel": chapter("conversion-funnel", ["new_clients", "conversion_rate", "retention_rate", "zero_return_rate", "avg_ltv", "avg_first_purchase", "visits_post_trial", "new_visits"], [
    groupTable({ field: "entry_type", title: "Conversion and retention by client type", columns: ["new_clients", "conversion_rate", "retention_rate", "avg_ltv"], compare: "conversion_rate", minimum: "At least 10 newcomers", names: GROUPS.entry_type }),
    groupTable({ field: "source", title: "Newcomer acquisition by source", columns: ["new_clients", "conversion_rate", "retention_rate", "avg_ltv"], compare: "conversion_rate", minimum: "At least 10 newcomers", names: GROUPS.source }),
    groupTable({ field: "trainer", title: "First-session instructor outcomes", columns: ["new_clients", "conversion_rate", "retention_rate", "avg_ltv"], compare: "conversion_rate", minimum: "At least 5 newcomers", names: GROUPS.trainer }),
  ], 1120),
  lapsed: chapter("lapsed", ["memberships_count", "utilisation", "churn_rate", "remaining_sessions", "active_memberships", "dormant_actives", "revenue_at_risk_30d", "days_absent"], [
    groupTable({ field: "product", title: "Member health by membership", columns: ["memberships_count", "utilisation", "remaining_sessions", "days_absent"], compare: "utilisation", minimum: "At least 10 memberships", names: GROUPS.product }),
    groupTable({ field: "status", title: "Membership status and usage", columns: ["memberships_count", "utilisation", "days_absent"], compare: "memberships_count", minimum: "At least 10 memberships", names: GROUPS.status }),
  ], 860),
  instructors: chapter("instructors", ["sessions", "attendance", "avg_class_size_incl", "fill_rate", "revenue_per_session", "draw_premium_pp"], [
    groupTable({ field: "trainer", title: "Instructor performance scorecards", columns: ["sessions", "attendance", "avg_class_size_incl", "fill_rate", "revenue_per_session", "draw_premium_pp"], compare: "fill_rate", minimum: "At least five sessions", names: GROUPS.trainer, limit: 20 }),
    groupTable({ id: "trainer-fill", field: "trainer", title: "Top and bottom instructors by fill rate", columns: ["sessions", "attendance", "avg_class_size_incl", "fill_rate"], compare: "fill_rate", minimum: "At least five sessions", names: GROUPS.trainer }),
    groupTable({ id: "trainer-size", field: "trainer", title: "Top and bottom instructors by class average", columns: ["sessions", "attendance", "avg_class_size_incl", "fill_rate"], compare: "avg_class_size_incl", minimum: "At least five sessions", names: GROUPS.trainer }),
    groupTable({ id: "trainer-yield", field: "trainer", title: "Top and bottom instructors by revenue per session", columns: ["sessions", "revenue_per_session", "fill_rate"], compare: "revenue_per_session", minimum: "At least five sessions", names: GROUPS.trainer }),
  ], 640),
  formats: chapter("formats", ["sessions", "attendance", "avg_class_size_incl", "fill_rate", "revenue_per_session", "late_cancel_rate"], [
    groupTable({ field: "format_group", title: "Format comparison with MoM and YoY", columns: ["sessions", "attendance", "avg_class_size_incl", "fill_rate", "revenue_per_session"], compare: "fill_rate", minimum: "At least three sessions", names: GROUPS.format_group }),
    groupTable({ field: "format", title: "Format metrics by class", columns: ["sessions", "attendance", "avg_class_size_incl", "fill_rate", "revenue_per_session"], compare: "fill_rate", minimum: "At least three sessions", names: GROUPS.format }),
    groupTable({ id: "format-trainer", field: "format_group", fields: ["format_group", "trainer"], title: "Format and instructor combinations", columns: ["sessions", "attendance", "fill_rate", "revenue_per_session"], compare: "fill_rate", minimum: "At least five sessions", names: GROUPS.format.flatMap(f => GROUPS.trainer.slice(0, 3).map(t => `${f} · ${t}`)), limit: 12 }),
    groupTable({ id: "format-time", field: "format_group", fields: ["format_group", "time"], title: "Format metrics by time", columns: ["sessions", "attendance", "fill_rate", "avg_class_size_incl"], compare: "fill_rate", minimum: "At least five sessions", names: GROUPS.format_group.flatMap(f => GROUPS.time.slice(0, 4).map(t => `${f} · ${t}`)), limit: 12 }),
  ], 980),
  sessions: chapter("sessions", ["sessions", "capacity", "booked", "attendance", "fill_rate", "empty_session_rate", "late_cancel_rate", "unsold_seats"], [
    groupTable({ field: "format", title: "Best and worst performing scheduled classes", columns: ["sessions", "attendance", "avg_class_size_incl", "fill_rate", "revenue_per_session"], compare: "fill_rate", minimum: "At least five sessions", names: GROUPS.format }),
    groupTable({ field: "time", title: "Best and worst class times", columns: ["sessions", "attendance", "fill_rate", "revenue_per_session"], compare: "fill_rate", minimum: "At least five sessions", names: GROUPS.time }),
    groupTable({ field: "day", title: "Day-of-week demand", columns: ["sessions", "attendance", "fill_rate", "empty_session_rate"], compare: "fill_rate", minimum: "At least five sessions", names: GROUPS.day }),
    groupTable({ id: "schedule-trainer", field: "trainer", title: "Schedule performance by instructor", columns: ["sessions", "attendance", "fill_rate", "revenue_per_session"], compare: "fill_rate", minimum: "At least three sessions", names: GROUPS.trainer }),
    groupTable({ id: "slot-combinations", field: "format", fields: ["format", "trainer", "day", "time"], title: "Best class, instructor, day and time combinations", columns: ["sessions", "attendance", "fill_rate", "empty_session_rate"], compare: "fill_rate", minimum: "At least five sessions", names: GROUPS.format.flatMap(f => GROUPS.day.slice(0, 4).map(d => `${f} · ${d}`)), limit: 10 }),
  ], 1344),
  "late-cancellations": chapter("late-cancellations", ["bookings", "booking_late_cancelled", "booking_late_rate", "booking_no_shows", "booking_no_show_rate", "booking_attendance_rate"], [
    groupTable({ field: "product", title: "Late cancellations by membership", columns: ["bookings", "booking_late_cancelled", "booking_late_rate"], compare: "booking_late_cancelled", minimum: "At least 20 bookings", names: GROUPS.product }),
    groupTable({ field: "format", title: "Late cancellations by class type", columns: ["bookings", "booking_late_cancelled", "booking_late_rate"], compare: "booking_late_cancelled", minimum: "At least 20 bookings", names: GROUPS.format }),
    groupTable({ field: "trainer", title: "Late cancellations by instructor", columns: ["bookings", "booking_late_cancelled", "booking_late_rate"], compare: "booking_late_cancelled", minimum: "At least 20 bookings", names: GROUPS.trainer }),
    groupTable({ field: "location", title: "Late cancellations by location", columns: ["bookings", "booking_late_cancelled", "booking_late_rate"], compare: "booking_late_cancelled", minimum: "At least 20 bookings", names: GROUPS.location }),
  ], 2610),
};

/* --------------------------------------------------------------- narratives ---
   Written the way the narrative engine writes them: one verdict card per chapter,
   then findings that answer a different leadership question each.                     */
const verdict = (headline, extra = {}) => ({
  headline, focus: "kpis", lens: "driver", priority: "high", confidence: "medium",
  meaning: "September at Kenkere House softened against a strong August: visits fell while the timetable held, so utilisation slipped rather than supply.",
  evidence: "Attendance 747 against 880 in August; fill rate 63.0% against 70.7%.",
  action: "Rebalance the Saturday Barre slots and re-open two trial places per class for October.",
  driver: "Volume loss concentrated in Barre under one instructor (−84 visits) and in Saturday mornings (−104).",
  concentration: "Barre and Saturday morning slots carry about 70% of the decline.",
  offset: "PowerCycle held its fill rate at 72% and evening class sizes rose, so the loss is slot-specific.",
  trend: "A new reversal after gains from March to July; year to date is still 6% ahead of last year.",
  impact: "Indicative ≈₹3.7L a month if Saturday Barre recovers August levels (524 visits × ₹714 a visit).",
  watch: "Saturday Barre fill above 70% by the October review.",
  ownerArea: "Studio operations", horizon: "Next 30 days", ...extra,
});
const card = (headline, focus, lens, extra = {}) => ({ headline, focus, lens, priority: "medium", confidence: "medium", meaning: "", evidence: "", action: "", ...extra });

export const FIXTURE_NARRATIVES = {
  "executive-summary": {
    generated: true,
    summary: "September is the weakest month of 2026 by volume and utilisation. Collections held, but visits fell 15.1% and the loss sits in a handful of named slots.",
    briefing: {
      takeaways: ["Attendance 747 visits, down 15.1% on August and the lowest month of 2026", "Fill rate 63.0%, down 7.7pp, while sessions held at 96", "Barre lost 84 visits; Saturday mornings carry 70% of the drop", "Collections held at ₹14.5L as average order value rose 4%"],
      whatChanged: "Visits fell 133 to 747 while supply held at 96 sessions, so fill slipped 7.7pp to 63.0%. Against September last year attendance is 4% lower; year to date it is still 6% ahead.",
      whyItMoved: "Volume, not rate: Barre lost 84 visits and Strength Lab 51, while PowerCycle was flat. Repeat visits per member fell from 3.1 to 2.6. Leading hypothesis: an instructor change on Saturday Barre reduced repeat bookings — check week-by-week bookings for those slots.",
      whereItSits: "Barre (−84) and Saturday 09:30–11:00 (−104) carry 70% of the decline; weekday evenings are broadly flat.",
      whatHeldUp: "PowerCycle fill held at 72% and evening average class size rose, so the demand loss is slot-specific rather than studio-wide.",
      outlook: "New reversal after gains from March to July. The three-month pace implies about 830 visits in October; last year's seasonality implies about 790.",
      soWhat: "If Saturday Barre stays at this level the studio forgoes roughly 524 visits a month — indicatively ₹3.7L at ₹714 a visit.",
    },
    decision: {
      call: "Rotate the Saturday 09:30–11:00 Barre instructors and re-open two trial places per class for October",
      rationale: "The decline is concentrated in a few Saturday slots rather than across the timetable, so a targeted schedule change addresses most of the loss without disturbing the slots that held up. Doing nothing leaves the largest single gap in the month unaddressed.",
      evidence: ["Saturday 09:30–11:00 attendance −104 visits against August", "Barre −84 visits; PowerCycle +2", "Fill rate 63.0% against 70.7% in August", "Repeat visits per member 2.6 against 3.1"],
      expectedImpact: "Indicative ≈₹3.7L a month if Saturday Barre recovers August levels (524 visits × ₹714 average revenue per visit).",
      successMeasure: "Saturday Barre fill above 70% at the October review.",
      risks: "Instructor rotation can unsettle loyal regulars; keep the most-booked instructor on one of the two slots as a guardrail.",
      alternative: "Cutting Saturday capacity would lift fill on paper but lose revenue; the evidence points to demand, not oversupply.",
      owner: "Studio operations", horizon: "Next 30 days",
    },
    cards: [verdict("September is the weakest month of 2026 by volume and utilisation"), card("Collections held at ₹14.5L despite lower visits", "cross", "win", { priority: "high", confidence: "high", meaning: "Average order value absorbed the volume loss, so cash did not follow demand down.", evidence: "₹14.5L against ₹14.2L in August, average order value ₹3,562 against ₹3,420.", action: "Protect renewal pricing through October; do not discount to rebuild volume.", driver: "Average order value rose 4.1% as members moved from class packs to larger membership purchases.", concentration: "Memberships added ₹1.9L while retail and class packs gave up ₹2.2L.", impact: "≈₹0.3L a month of collected value held.", trend: "Persistent for three months", offset: "Personal training held at its August level.", watch: "Transaction count back above 420." }), card("Trial conversion slipped to 31% from 34%", "cross", "watch", { meaning: "Fewer newcomers converted, which will show up in membership revenue in about six weeks.", evidence: "Conversion rate 31.0% against 34.4% in August.", action: "Front desk follow-up within 48 hours for every September trial.", watch: "October conversion back above 33%." })],
  },
  "revenue-performance": {
    generated: true,
    summary: "Collections were steady while average order value rose 4%: fewer transactions at a higher value each. Membership revenue share held above 60%.",
    briefing: {
      takeaways: ["Gross collections ₹14.5L, down 1.8% on August but 3% ahead of last September", "Average order value ₹3,562, up 4.1% month on month", "Memberships carry 61.5% of collections, the highest share of the year", "Discounting steady at 10.9% of gross value"],
      whatChanged: "Gross collections fell 1.8% to ₹14.5L on 4.1% fewer transactions, while average order value rose 4.1%.",
      whyItMoved: "Mix, not price: retail and class packs gave up volume, memberships and personal training took a larger share of a smaller basket count.",
      whereItSits: "Memberships (£8.9L) and personal training carry the month; retail is 12% below its August level.",
      whatHeldUp: "Average order value rose for the third consecutive month as the intro offer was replaced by larger packs at full price.",
      outlook: "Collections should hold if order value stays above ₹3,500; a further fall in transaction count would pull the month below last year.",
      soWhat: "The revenue base is defended by price and mix rather than volume, which is the more fragile of the two.",
    },
    cards: [verdict("Collections held at ₹14.5L as average order value absorbed the volume loss", { lens: "win", priority: "high", confidence: "high" }), card("Memberships are 61.5% of collections, the year's high", "category", "opportunity", { metrics: ["membership_rev_share", "gross_revenue"], highlight: ["Memberships"], meaning: "Recurring revenue is carrying the month, which makes renewal protectable value.", evidence: "₹8.9L of ₹14.5L; membership share up 2.4pp on August.", action: "Prioritise renewal conversations in the last two weeks of October.", impact: "≈₹8.9L a month of recurring base." }), card("Retail fell 12% and is now the smallest category", "product", "risk", { metrics: ["gross_revenue", "transactions"], highlight: ["Retail & apparel"], meaning: "Retail is small and shrinking; it is no longer worth shelf space in a February review.", evidence: "₹1.2L against ₹1.4L in August.", action: "Decide in October whether to keep or exit retail." })],
  },
  "conversion-funnel": {
    generated: true,
    summary: "Fewer newcomers started in September and fewer of them converted. Trial follow-up and retention after the first purchase are where October can recover the year.",
    briefing: {
      takeaways: ["126 newcomers, 14% fewer than August and the lowest count since February", "Trial conversion 31.0%, down 3.4pp month on month", "Second-visit rate 51%, the first leading indicator to move", "Referral guests convert 12pp above walk-ins"],
      whatChanged: "Newcomer count fell 14% to 126 and conversion fell 3.4pp to 31.0%, so converted newcomers dropped about a quarter.",
      whyItMoved: "Two effects, not one: fewer introductions from Instagram, and a 3pp fall in conversion inside every entry type. Referral guests and intro-offer visitors convert differently, and referrals held their rate.",
      whereItSits: "Instagram-sourced newcomers carry 60% of the fall in introductions; walk-ins held at 21 conversions.",
      whatHeldUp: "Referral guests converted at 43% and returned for a second visit at 61%, the strongest channel in the month.",
      outlook: "With the current pace, October converts about 40 newcomers — below the September level unless follow-up recovers.",
      soWhat: "A 3pp lift in conversion is worth about 4 members a month, the cheapest volume available to the studio.",
    },
    decision: {
      call: "Add a 48-hour follow-up call for every September trial and re-weight October spend towards referral",
      rationale: "Conversion fell inside every channel, so the gap is in follow-up rather than in the mix. Referral is already the strongest converter and costs nothing to weight up, while Instagram introductions need a paid fix.",
      evidence: ["Trial conversion 31.0% against 34.4% in August", "Referral guests convert at 43%, walk-ins at 31%", "Second-visit rate 51% against 55% in August"],
      expectedImpact: "Indicative 4–6 additional members a month at a 3pp conversion lift.",
      successMeasure: "October conversion at or above 33%, referral share above 25%.",
      risks: "Extra calling load on the front desk; cap it at trial visitors only.",
      alternative: "Discounting the intro offer would lift volume but suppresses order value, which is currently the studio's strongest lever.",
      owner: "Sales & front desk", horizon: "Next 30 days",
    },
    cards: [verdict("Fewer newcomers converted as introductions fell 14%", { lens: "risk" }), card("Referral guests convert 12pp above walk-ins", "source", "opportunity", { metrics: ["conversion_rate", "new_clients"], highlight: ["Referral"], meaning: "The cheapest channel is also the best converter, which is unusual and worth exploiting.", evidence: "43% against 31% overall.", action: "Ask October members for one referral at the front desk.", impact: "≈4 members a month at referral rates." }), card("Second-visit rate moved first, at 51%", "entry_type", "watch", { metrics: ["second_visit_rate"], meaning: "A leading indicator turning before conversion does; it usually precedes a revenue effect by six weeks.", evidence: "51% against 55% in August.", watch: "October second visits above 53%." })],
  },
  lapsed: {
    generated: true,
    summary: "Utilisation slipped 4pp as dormant memberships grew. The exposure is concentrated in unused balances rather than in active members leaving.",
    briefing: {
      takeaways: ["Membership utilisation 55.6%, down 4.1pp month on month", "96 dormant memberships, the highest count of the year", "₹4.4L of revenue expires within 30 days", "Churn 7.2% against 6.4%, driven by members not renewing after grace"],
      whatChanged: "Utilisation fell 4.1pp to 55.6% while the active base held at 787 memberships, so the loss is in frequency, not membership count.",
      whyItMoved: "Members attended 2.4 times a month against 2.6 in August; the fall is largest among members with more than 12 sessions remaining.",
      whereItSits: "Unlimited memberships hold 60% of dormant usage; grace memberships convert back at only 38%.",
      whatHeldUp: "Active memberships held at 787 and new joins broadly replaced lapses, so the base is stable even as usage falls.",
      outlook: "Without intervention, dormant balances imply about ₹4.4L of unused value and a further 0.5pp of churn in October.",
      soWhat: "Recovering one visit a month across dormant members is worth about ₹1.1L of attendance-attributed revenue.",
    },
    cards: [verdict("Utilisation slipped to 55.6% as dormant memberships reached their year high", { lens: "risk" }), card("Grace memberships return at only 38%", "status", "opportunity", { metrics: ["utilisation", "churn_rate"], highlight: ["Grace"], meaning: "The grace window is the last chance to recover a member before the balance is written off.", evidence: "38% of grace memberships renewed against 54% for expiring memberships.", action: "Call every membership entering grace within 48 hours.", impact: "≈₹1.1L a month of attendance value." }), card("₹4.4L expires within 30 days", "kpis", "watch", { metrics: ["revenue_at_risk_30d"], meaning: "This is the exposure the renewal workstream has to work against in October.", evidence: "₹4.4L across 168 memberships.", watch: "Renewal rate above 60% in October." })],
  },
  instructors: {
    generated: true,
    summary: "Class sizes held for most instructors; the month's loss sits with three instructors whose Saturday slots fell together.",
    briefing: {
      takeaways: ["Studio average class size 9.1 against 9.6 in August", "Six of eleven instructors held or improved fill", "Saturday Barre slots are 14pp below their August fill", "Revenue per session ₹12,340, down 3% on August"],
      whatChanged: "Average class size fell 5% to 9.1 and fill rate 7.7pp, while the session count held at 96.",
      whyItMoved: "Three instructors teaching Saturday Barre lost 84 visits between them; every other instructor was within 3% of August.",
      whereItSits: "Asha Menon, Rohan Pillai and Meera Krishnan carry 70% of the studio's measured decline.",
      whatHeldUp: "Kabir Shah and Divya Suresh improved fill in evening PowerCycle, which is why the format's fill rate held at 72%.",
      outlook: "If the Saturday slots return to August levels the studio average returns to about 9.6 within one month.",
      soWhat: "The instructor picture is good news with a local exception, which is why this is a scheduling decision rather than a performance one.",
    },
    cards: [verdict("Class sizes held for most instructors; the loss is concentrated in Saturday Barre", { lens: "driver" }), card("Kabir Shah and Divya Suresh improved evening fill", "trainer", "win", { metrics: ["fill_rate", "avg_class_size_incl"], highlight: ["Kabir Shah", "Divya Suresh"], meaning: "Evening PowerCycle absorbed demand as mornings softened, which is re-allocatable capacity.", evidence: "Fill 74% and 76% against 70% in August.", action: "Add one powercycle slot on Tuesday and Thursday evenings in October." }), card("Three instructors lost 84 visits between them", "trainer", "risk", { metrics: ["attendance"], highlight: ["Asha Menon", "Rohan Pillai", "Meera Krishnan"], meaning: "The loss is smaller than it looks once the slots are separated from the people.", evidence: "−84 visits across three instructors, all on Saturday mornings.", action: "Rotate the Saturday 09:30 slot before judging the ranking." })],
  },
  formats: {
    generated: true,
    summary: "Barre 57 carries the month's loss; PowerCycle held its fill and Strength Lab is thin but stable.",
    briefing: {
      takeaways: ["Barre 57 fill 61%, down 9pp on August", "PowerCycle fill 72%, unchanged", "Strength Lab 55% on 14 sessions — a signal, not a verdict", "Evening slots outperform mornings by 12pp across every format"],
      whatChanged: "Barre 57 lost 84 visits and 9pp of fill; PowerCycle added 2 visits; Strength Lab lost 51 visits on a thin sample.",
      whyItMoved: "Format mix shifted towards PowerCycle in the evenings; Barre's morning demand softened at the same time.",
      whereItSits: "Barre and Saturday mornings carry 70% of the studio-wide decline.",
      whatHeldUp: "PowerCycle held both fill and yield, so this is not a studio-wide demand problem.",
      outlook: "Rotating the Saturday Barre slots should recover about half the format's loss by November.",
      soWhat: "The format profile is unchanged; the loss is a timetable problem inside Barre.",
    },
    cards: [verdict("Barre 57 lost 84 visits while PowerCycle held its fill rate", { lens: "driver" }), card("Evenings outperform mornings by 12pp", "format-time", "opportunity", { metrics: ["fill_rate"], meaning: "Evening demand is the studio's most reliable capacity signal.", evidence: "74% evening fill against 62% in the morning.", action: "Shift one morning Barre class to 19:45 for a four-week trial." }), card("Strength Lab reads on 14 sessions", "format", "watch", { metrics: ["fill_rate", "sessions"], highlight: ["Strength Lab 60"], meaning: "Too thin to rank; treat the 55% fill as a signal to watch, not a result to act on.", evidence: "14 sessions, 55% fill.", watch: "At least 20 sessions in October before judging." })],
  },
  sessions: {
    generated: true,
    summary: "Demand fell while supply held: fill slipped to 63% across 96 sessions, with the loss in named slots rather than across the timetable.",
    briefing: {
      takeaways: ["Attendance 747, down 15.1% on August and the lowest month of 2026", "Fill rate 63.0%, down 7.7pp as sessions held at 96", "Barre lost 84 visits; Saturday mornings carry 70% of the drop", "PowerCycle held fill at 72% with evening class sizes up"],
      whatChanged: "Visits fell 133 to 747 while supply held at 96 sessions, so fill slipped 7.7pp to 63.0%. Against September last year attendance is 4% lower; year to date it is still 6% ahead.",
      whyItMoved: "Volume, not rate: Barre lost 84 visits and Strength Lab 51, while PowerCycle was flat. Repeat visits per member fell from 3.1 to 2.6. Leading hypothesis: an instructor change on Saturday Barre reduced repeat bookings — check week-by-week bookings for those slots.",
      whereItSits: "Barre (−84) and Saturday 09:30–11:00 (−104) carry 70% of the decline; weekday evenings are broadly flat.",
      whatHeldUp: "PowerCycle fill held at 72% and evening average class size rose, so demand loss is slot-specific rather than studio-wide.",
      outlook: "New reversal after gains March–July. The three-month pace implies about 830 visits in October; last year's seasonality implies about 790.",
      soWhat: "If Saturday Barre stays at this level the studio forgoes roughly 524 visits a month, indicatively ₹3.7L at ₹714 per visit.",
    },
    decision: {
      call: "Rotate the Saturday 09:30–11:00 Barre instructors and re-open two trial places per class for October",
      rationale: "The decline is concentrated in a few Saturday slots rather than across the timetable, so a targeted schedule change addresses most of the loss without disrupting slots that held up.",
      evidence: ["Saturday 09:30–11:00 attendance −104 visits against August", "Barre −84 visits; PowerCycle +2", "Fill rate 63.0% against 70.7% in August", "Repeat visits per member 2.6 against 3.1"],
      expectedImpact: "Indicative ≈₹3.7L a month if Saturday Barre recovers August levels (524 visits × ₹714 average revenue per visit).",
      successMeasure: "Saturday Barre fill above 70% by the October review.",
      risks: "Instructor rotation can unsettle loyal regulars; keep the most-booked instructor on one of the two slots.",
      alternative: "Cutting Saturday capacity would lift fill on paper but lose revenue; the evidence points to demand, not oversupply.",
      owner: "Studio operations", horizon: "Next 30 days",
    },
    performers: {
      leaders: "PowerCycle leads on fill at 72%, ten points above Barre, and held its level against August.",
      laggards: "Strength Lab trails at 55% fill on fewer sessions; its sample is thin, so treat it as a signal.",
      pattern: "The gap is about Saturday morning Barre, not format quality overall.",
    },
    questions: [{ q: "Is this seasonal?", a: "Partly: September dipped last year too, but by 4%, not 15%." }, { q: "Did we lose members or visits?", a: "Visits: the active member count is flat; frequency fell." }],
    cards: [verdict("Attendance down 15.1% month on month as Barre and Saturday slots slipped"), card("Barre attendance fell 84 visits", "format", "risk", { metrics: ["attendance"], highlight: ["Barre 57"], meaning: "Barre carries most of the decline; the rest of the timetable is close to August.", evidence: "420 against 504 visits.", action: "Rebalance Saturday Barre slots from October.", priority: "high", driver: "Repeat visits per member fell from 3.1 to 2.6 in Barre; first visits were flat.", concentration: "Saturday 09:30 and 11:00 carry 104 of the 133 lost visits.", impact: "Indicative ≈₹2.6L a month at ₹714 a visit.", trend: "New reversal after four months of gains", offset: "PowerCycle added 2 visits and held its fill rate.", watch: "Saturday Barre fill above 70%." }), card("PowerCycle held its fill rate", "format", "win", { metrics: ["fill_rate"], highlight: ["PowerCycle"], meaning: "Evening demand is resilient even in a soft month.", evidence: "72% against 71%.", priority: "low", confidence: "high" })],
  },
  "late-cancellations": {
    generated: true,
    summary: "Late cancellations rose to 6.8% of bookings as Saturday attendance fell; the pattern is the same slots the schedule chapter lost.",
    briefing: {
      takeaways: ["168 late cancellations, up 22% on August", "Late-cancel rate 6.8% against 5.9%", "Saturday sessions carry 44% of late cancellations", "No-shows steady at 3.9% of bookings"],
      whatChanged: "Late cancellations rose to 168 from 138 in August, moving the rate to 6.8% of bookings.",
      whyItMoved: "Cancellations rose fastest in Barre on Saturdays, the same slots where attendance fell — consistent with a membership-frequency effect rather than a booking-rule change.",
      whereItSits: "Saturday Barre carries 44% of late cancellations; weekday evening PowerCycle is stable.",
      whatHeldUp: "No-show rate held at 3.9%, so the change is about members releasing places, not about them disappearing.",
      outlook: "Freed places could be re-sold if the front desk works the waitlist within the 12-hour window.",
      soWhat: "Each recovered place is worth about ₹714 of revenue and one full seat in a soft month.",
    },
    cards: [verdict("Late cancellations rose to 6.8% of bookings, concentrated in Saturday Barre", { lens: "risk" }), card("Freed Saturday places are re-sold by nobody", "format", "opportunity", { metrics: ["booking_late_rate"], highlight: ["Barre 57 Open"], meaning: "The waitlist is not being worked, so released places are lost seats.", evidence: "74 places released on Saturdays, 12 re-booked.", action: "Work the Saturday waitlist at the 12-hour mark." }), card("No-show rate held at 3.9%", "kpis", "win", { metrics: ["booking_no_show_rate"], meaning: "Members are cancelling rather than vanishing, which keeps demand visible.", evidence: "3.9% against 3.8%.", priority: "low" })],
  },
  recommendations: {
    generated: true,
    summary: "Three moves for October, in priority order, each with the evidence that justifies it and the signal that would show it worked.",
    decision: {
      call: "Call every dormant member with a class-pack offer before 15 October, then review whether the offer or the pricing is the constraint",
      rationale: "Dormant balances are the largest recoverable value in the month, and a call costs a fraction of acquiring the same member. The offer is deliberately narrow: it targets members who have already paid and stopped attending, without discounting the price of new memberships.",
      evidence: ["96 dormant memberships, the year's high", "524 visits of recoverable frequency", "₹4.4L of balance expires within 30 days", "Members on the offer return at 38% against 54% for expiring memberships"],
      expectedImpact: "Indicative ≈₹1.1L a month if one extra visit a month is recovered across dormant members; overlaps with the pricing move below.",
      successMeasure: "Reactivations above 20% of called members by the October review.",
      risks: "Calling load falls on the front desk in the same fortnight as renewals; cap the list at dormant members only, and script the call so pricing is not discounted by word of mouth.",
      alternative: "Discounting new memberships would bring volume back faster, but it spends the order value that is currently holding collections up.",
      owner: "Sales & front desk", horizon: "Immediate",
    },
    cards: [
      { headline: "Win back dormant members", focus: "kpis", lens: "next_step", priority: "high", confidence: "high", meaning: "The largest recoverable value in the month.", evidence: "524 visits of recoverable frequency; 96 dormant memberships.", action: "Call every dormant member with a class-pack offer before 15 October.", recommendation: "Cheaper than acquisition at the current cost per member.", ownerArea: "Sales & front desk", horizon: "Immediate", impact: "≈₹1.1L a month", watch: "Reactivations above 20%." },
      { headline: "Fix Saturday Barre", focus: "cross", lens: "next_step", priority: "high", meaning: "The decline is concentrated enough for a single scheduling change to address.", evidence: "−104 visits on Saturdays, 70% of the studio decline.", action: "Rotate the 09:30–11:00 Barre instructors and re-open two trial places per class.", recommendation: "Targets the drop directly without disturbing slots that held.", ownerArea: "Instructor management", horizon: "Next 30 days", impact: "≈₹3.7L a month", watch: "Saturday fill above 70%." },
      { headline: "Do not discount to rebuild volume", focus: "cross", lens: "next_step", priority: "medium", meaning: "Order value is the studio's strongest defence this month; discounting would spend it.", evidence: "Average order value ₹3,562, up 4.1%.", action: "Hold pricing through October and protect renewal conversations instead.", ownerArea: "Commercial", horizon: "Through October", watch: "Discount rate below 11%." },
    ],
  },
  predictions: {
    generated: true,
    summary: "Scenarios, not forecasts: two conditional paths for October, with the assumptions made visible and the signal that would tell us which one is happening.",
    cards: [card("October lands between 780 and 850 visits", "kpis", "watch", { meaning: "The gap between the two paths is the Saturday decision, not the market.", evidence: "Three-month pace 830; last year's seasonality 790.", watch: "Friday-to-Saturday booking ratio in the first week of October." })],
  },
};

export const FIXTURE = {
  scope: { studio: STUDIO, month: MONTHS.at(-1) },
  builtAt: "2026-10-11T06:30:00.000Z",
  figuresHash: "design-preview-fixture",
  schemaVersion: 6,
  customization: {
    title: "Monthly performance report", subtitle: "Commercial performance, the community journey and the decisions for the month ahead.",
    preparedFor: "Leadership team", preparedBy: "Studio operations", audience: "Studio leadership", tone: "Professional", detail: "Comprehensive", instructions: "",
    chapterIds: ["executive-summary", "revenue-performance", "conversion-funnel", "formats", "sessions", "instructors", "lapsed", "late-cancellations", "recommendations", "predictions"],
    theme: "light", showCharts: true,
  },
  chapters: FIXTURE_CHAPTERS,
  narratives: FIXTURE_NARRATIVES,
  sources: [{ key: "sessions", title: "Sessions", status: "Fixture source", stale: false, fetchedAt: Date.parse("2026-10-11T06:30:00Z") }],
};

