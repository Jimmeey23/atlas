import type { Row } from "./duckdb";

// The complete grouping catalogue from class-intelligence's Rankings.tsx.
export const referenceGroupings = {
  ClassDayTimeLocation: {
    label: "Class + Day + Time + Location (Recommended)",
    fields: ["reference_class", "day", "time", "location"],
  },
  ClassDayTimeLocationTrainer: {
    label: "Class + Day + Time + Location + Trainer",
    fields: ["reference_class", "day", "time", "location", "trainer"],
  },
  LocationClass: {
    label: "Location → Class",
    fields: ["location", "reference_class"],
  },
  ClassDay: { label: "Class → Day", fields: ["reference_class", "day"] },
  ClassTime: { label: "Class → Time", fields: ["reference_class", "time"] },
  ClassDayTrainer: {
    label: "Class + Day + Trainer",
    fields: ["reference_class", "day", "trainer"],
  },
  ClassTrainer: {
    label: "Class + Trainer",
    fields: ["reference_class", "trainer"],
  },
  DayTimeLocation: {
    label: "Day + Time + Location",
    fields: ["day", "time", "location"],
  },
  DayTime: { label: "Day + Time", fields: ["day", "time"] },
  TrainerLocation: {
    label: "Trainer + Location",
    fields: ["trainer", "location"],
  },
  DayLocation: { label: "Day + Location", fields: ["day", "location"] },
  TimeLocation: { label: "Time + Location", fields: ["time", "location"] },
  ClassType: {
    label: "Class + Type",
    fields: ["reference_class", "class_type"],
  },
  TypeLocation: {
    label: "Type + Location",
    fields: ["class_type", "location"],
  },
  TrainerDay: { label: "Trainer + Day", fields: ["trainer", "day"] },
  ClassLocation: {
    label: "Class + Location",
    fields: ["reference_class", "location"],
  },
  TrainerTime: { label: "Trainer + Time", fields: ["trainer", "time"] },
  AMSessions: {
    label: "AM Sessions (Before 12pm)",
    fields: ["reference_class", "day", "time", "location"],
  },
  PMSessions: {
    label: "PM Sessions (12pm+)",
    fields: ["reference_class", "day", "time", "location"],
  },
  MorningClasses: {
    label: "Morning Classes (6am–12pm)",
    fields: ["reference_class", "day", "time", "location"],
  },
  EveningClasses: {
    label: "Evening Classes (5pm–9pm)",
    fields: ["reference_class", "day", "time", "location"],
  },
  Weekday: {
    label: "Weekday (Mon–Fri)",
    fields: ["reference_class", "day", "time", "location"],
  },
  Weekend: {
    label: "Weekend (Sat–Sun)",
    fields: ["reference_class", "day", "time", "location"],
  },
  Class: { label: "Class Only", fields: ["reference_class"] },
  Type: { label: "Class Type", fields: ["class_type"] },
  Trainer: { label: "Trainer Only", fields: ["trainer"] },
  Location: { label: "Location Only", fields: ["location"] },
  Day: { label: "Day of Week Only", fields: ["day"] },
  Date: { label: "Date Only", fields: ["date"] },
  Time: { label: "Time Only", fields: ["time"] },
  SessionName: { label: "Session Name", fields: ["session_name"] },
};
const hour = "TRY_CAST(split_part(time,':',1) AS INTEGER)";
export function referencePredicate(key: string) {
  const days = "lower(substr(day,1,3))";
  return (
    {
      AMSessions: `${hour} BETWEEN 0 AND 11`,
      PMSessions: `${hour} BETWEEN 12 AND 23`,
      MorningClasses: `${hour}>=6 AND ${hour}<12`,
      EveningClasses: `${hour}>=17 AND ${hour}<21`,
      Weekday: `${days} IN ('mon','tue','wed','thu','fri')`,
      Weekend: `${days} IN ('sat','sun')`,
    } as Record<string, string>
  )[key];
}
export const sessionDetailFields = [
  "source_row",
  "session_id",
  "session_name",
  "reference_class",
  "class_type",
  "date",
  "location",
  "trainer",
  "format",
  "format_group",
  "day",
  "time",
];
export const detailColumns = [
  "trainer",
  "formats",
  "location",
  "format",
  "class_type",
  "date",
  "day",
  "time",
];
export const referenceColumnLabels: Record<string, string> = {
  expand: "",
  rank: "Rank",
  label: "Group",
  trainer: "Trainer",
  formats: "Formats",
  location: "Location",
  format: "Class",
  class_type: "Type",
  date: "Date",
  day: "Day",
  time: "Time",
  sessions: "Classes",
  attendance: "Check-ins",
  avg_class_size_incl: "Class Avg",
  avg_class_size_excl: "Avg (No Empty)",
  fill_rate: "Fill Rate",
  reference_waitlist_rate: "Waitlist %",
  late_cancel_rate: "Cancel Rate",
  revenue: "Revenue",
  rev_pac: "Rev/Check-in",
  reference_revenue_per_booking: "Rev/Booking",
  reference_cancellation_value: "Rev Lost",
  reference_weighted_average: "Weighted Util%",
  reference_consistency: "Consistency",
  reference_composite: "Composite Score",
  empty_sessions: "Empty",
  capacity: "Capacity",
  booked: "Booked",
  reference_late_cancelled: "Late Cancel",
  reference_waitlisted: "Waitlist",
  actions: "Actions",
};
export const referencePresets: Record<string, string[]> = {
  "All Metrics (Default)": [
    "trainer",
    "formats",
    "location",
    "format",
    "class_type",
    "date",
    "day",
    "time",
    "sessions",
    "attendance",
    "avg_class_size_incl",
    "avg_class_size_excl",
    "fill_rate",
    "reference_waitlist_rate",
    "late_cancel_rate",
    "revenue",
    "rev_pac",
    "reference_revenue_per_booking",
    "reference_cancellation_value",
    "reference_weighted_average",
    "reference_consistency",
    "empty_sessions",
    "capacity",
    "booked",
  ],
  "Performance Focus": [
    "sessions",
    "attendance",
    "avg_class_size_incl",
    "fill_rate",
    "reference_consistency",
  ],
  "Revenue Analysis": [
    "trainer",
    "location",
    "sessions",
    "attendance",
    "revenue",
    "rev_pac",
  ],
  "Attendance Overview": [
    "day",
    "time",
    "sessions",
    "attendance",
    "avg_class_size_incl",
    "capacity",
    "fill_rate",
    "empty_sessions",
  ],
  "Capacity Planning": [
    "format",
    "location",
    "day",
    "time",
    "capacity",
    "attendance",
    "fill_rate",
    "reference_waitlisted",
  ],
  "Cancellation Analysis": [
    "format",
    "trainer",
    "sessions",
    "booked",
    "reference_late_cancelled",
    "late_cancel_rate",
  ],
  "Consistency Tracking": [
    "format",
    "day",
    "time",
    "sessions",
    "avg_class_size_incl",
    "reference_consistency",
    "empty_sessions",
  ],
};
export function referenceMetadataSQL(fields: string[]) {
  return [
    "trainer",
    "location",
    "format",
    "class_type",
    "date",
    "day",
    "time",
    "session_name",
    "reference_class",
    "format_group",
  ]
    .filter((f) => !fields.includes(f))
    .map(
      (f) =>
        `CASE WHEN COUNT("${f}")=0 THEN NULL WHEN COUNT(DISTINCT "${f}")=1 AND COUNT("${f}")=COUNT(*) THEN MIN("${f}") ELSE 'Multiple Values' END AS "${f}"`,
    )
    .concat("string_agg(DISTINCT format, ' , ' ORDER BY format) AS formats")
    .join(",");
}
export const referenceMetricsSQL = `SUM(waitlisted) AS reference_waitlisted,SUM(waitlisted)/NULLIF(SUM(capacity),0) AS reference_waitlist_rate,SUM(late_cancelled) AS reference_late_cancelled,SUM(revenue)/NULLIF(SUM(booked),0) AS reference_revenue_per_booking,SUM(late_cancelled)*SUM(revenue)/NULLIF(SUM(booked),0) AS reference_cancellation_value,SUM(checked_in)/NULLIF(SUM(capacity),0) AS reference_weighted_average,CASE WHEN COUNT(checked_in)>1 THEN CASE WHEN AVG(checked_in)=0 THEN 0 ELSE greatest(0,1-STDDEV_POP(checked_in)/NULLIF(AVG(checked_in),0)) END END AS reference_consistency,CASE WHEN SUM(checked_in) IS NOT NULL AND SUM(capacity)>0 AND SUM(sessions)>0 THEN ROUND(least(SUM(checked_in)/SUM(sessions)*5,100)*0.4+least(SUM(checked_in)/SUM(capacity)*100,100)*0.35+least(SUM(sessions)*2,100)*0.25,2) END AS reference_composite`;
export function referenceGroupLabel(row: Row, fields: string[]) {
  return fields.map((f) => row[f] ?? "Unspecified").join(" | ");
}

export function referenceGroupPredicate(row: Row, fields: string[]) {
  return fields
    .map((f) =>
      row[f] == null
        ? `"${f}" IS NULL`
        : `"${f}"='${String(row[f]).replaceAll("'", "''")}'`,
    )
    .join(" AND ");
}
export const isDetailColumn = (id: string) => detailColumns.includes(id);
