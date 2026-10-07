import {
  referenceGroupings,
  referenceMetadataSQL,
  referenceMetricsSQL,
} from "./class-intelligence-reference";
import type { Row } from "./duckdb";
import { metrics, metricSQL, type QueryContext } from "../semantics/metrics";

export const operationMetrics = [
  "sessions",
  "capacity",
  "booked",
  "attendance",
  "paid_attendance",
  "avg_class_size_incl",
  "avg_class_size_excl",
  "fill_rate",
  "booking_fill_rate",
  "show_up_rate",
  "revenue",
  "revenue_per_session",
  "rev_pac",
  "rev_pas",
  "empty_sessions",
  "empty_session_rate",
  "late_cancel_rate",
  "no_show_rate",
  "non_paid_rate",
  "unsold_seats",
  "attendance_cv",
];
export const operationViews = {
  ...referenceGroupings,
  classes: { label: "Unique classes", fields: ["location", "format"] },
  recurring: {
    label: "Recurring sessions",
    fields: ["location", "format", "day", "time"],
  },
  sessions: {
    label: "Individual sessions",
    fields: [
      "session_id",
      "date",
      "location",
      "format",
      "day",
      "time",
      "trainer",
      "source_row",
    ],
  },
  formats: { label: "Formats", fields: ["format_group"] },
  instructors: { label: "Instructors", fields: ["trainer"] },
  days: { label: "Days", fields: ["day"] },
  times: { label: "Times", fields: ["time"] },
  faceoff: {
    label: "Instructor face-off",
    fields: ["location", "format", "day", "time", "trainer"],
  },
  specialty: {
    label: "Instructor specialisation",
    fields: ["location", "format_group", "trainer"],
  },
  studios: { label: "Studios", fields: ["location"] },
  studioFormat: {
    label: "Studio × format",
    fields: ["location", "format_group"],
  },
  studioInstructor: {
    label: "Studio × instructor",
    fields: ["location", "trainer"],
  },
  studioDay: { label: "Studio × weekday", fields: ["location", "day"] },
  studioTime: { label: "Studio × time", fields: ["location", "time"] },
  studioDayTime: {
    label: "Studio × weekday × time",
    fields: ["location", "day", "time"],
  },
  classInstructor: {
    label: "Class × instructor",
    fields: ["format", "trainer"],
  },
  classDay: { label: "Class × weekday", fields: ["format", "day"] },
  classTime: { label: "Class × time", fields: ["format", "time"] },
  classDayTime: {
    label: "Class × weekday × time",
    fields: ["format", "day", "time"],
  },
  classStudioInstructor: {
    label: "Class × studio × instructor",
    fields: ["format", "location", "trainer"],
  },
  formatInstructor: {
    label: "Format × instructor",
    fields: ["format_group", "trainer"],
  },
  formatDay: { label: "Format × weekday", fields: ["format_group", "day"] },
  formatTime: { label: "Format × time", fields: ["format_group", "time"] },
  formatDayTime: {
    label: "Format × weekday × time",
    fields: ["format_group", "day", "time"],
  },
  instructorDay: { label: "Instructor × weekday", fields: ["trainer", "day"] },
  instructorTime: { label: "Instructor × time", fields: ["trainer", "time"] },
  instructorDayTime: {
    label: "Instructor × weekday × time",
    fields: ["trainer", "day", "time"],
  },
  instructorClassDay: {
    label: "Instructor × class × weekday",
    fields: ["trainer", "format", "day"],
  },
  instructorStudioDay: {
    label: "Instructor × studio × weekday",
    fields: ["trainer", "location", "day"],
  },
  instructorStudioTime: {
    label: "Instructor × studio × time",
    fields: ["trainer", "location", "time"],
  },
  dayTime: { label: "Weekday × time", fields: ["day", "time"] },
  monthlyClasses: { label: "Month × class", fields: ["month", "format"] },
  monthlyStudios: { label: "Month × studio", fields: ["month", "location"] },
  monthlyInstructors: {
    label: "Month × instructor",
    fields: ["month", "trainer"],
  },
  monthlyFormats: {
    label: "Month × format",
    fields: ["month", "format_group"],
  },
  sessionTypes: {
    label: "Session type × studio",
    fields: ["session_type", "location"],
  },
  custom: { label: "Custom grouping", fields: ["location", "format"] },
};
export type OperationView = keyof typeof operationViews;
export const identity = (row: Row, fields: string[]) =>
  JSON.stringify(fields.map((f) => row[f] ?? null));
export function rankOperations(
  rows: Row[],
  metric: string,
  minimum: number,
  count: number,
) {
  const eligible = rows
    .filter(
      (r) =>
        Number(r.sessions) >= minimum &&
        r[metric] != null &&
        Number.isFinite(Number(r[metric])),
    )
    .sort(
      (a, b) =>
        (Number(b[metric]) - Number(a[metric])) *
          (metrics[metric]?.higherIsBetter === false ? -1 : 1) ||
        String(a.entity).localeCompare(String(b.entity)),
    );
  const top = eligible.slice(
    0,
    Math.min(count, Math.ceil(eligible.length / 2)),
  );
  const seen = new Set(top.map((r) => String(r.entity)));
  return {
    top,
    bottom: [...eligible]
      .reverse()
      .filter((r) => !seen.has(String(r.entity)))
      .slice(0, count),
    eligible,
  };
}
export function comparableInstructors(rows: Row[], fields: string[]) {
  const groups = new Map<string, Set<string>>();
  rows.forEach((r) => {
    const key = identity(r, fields);
    const group = groups.get(key) || new Set<string>();
    if (r.trainer) group.add(String(r.trainer));
    groups.set(key, group);
  });
  return rows.filter(
    (r) => r.trainer && (groups.get(identity(r, fields))?.size || 0) > 1,
  );
}
export interface ScheduleChange {
  id: string;
  kind: string;
  before: Row | null;
  after: Row | null;
  period: string;
  evidence: string;
}
const slot = ["location", "format", "day", "time"];
export function scheduleChanges(rows: Row[]): ScheduleChange[] {
  const months = [...new Set(rows.map((r) => String(r.month)))].sort();
  const changes: ScheduleChange[] = [];
  for (let i = 1; i < months.length; i++) {
    const previous = months[i - 1],
      current = months[i];
    const next = new Date(`${previous}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    if (next.toISOString().slice(0, 7) !== current) continue;
    const a = new Map(
      rows
        .filter((r) => r.month === previous)
        .map((r) => [identity(r, slot), r]),
    );
    const b = new Map(
      rows
        .filter((r) => r.month === current)
        .map((r) => [identity(r, slot), r]),
    );
    const removed = [...a].filter(([k]) => !b.has(k)).map(([, r]) => r);
    const added = [...b].filter(([k]) => !a.has(k)).map(([, r]) => r);
    const matched = new Set<Row>();
    for (const [key, before] of a) {
      const after = b.get(key);
      if (!after) continue;
      const kinds = [];
      if (before.instructor_roster !== after.instructor_roster)
        kinds.push("Instructor roster");
      if (
        before.capacity_per_session != null &&
        after.capacity_per_session != null &&
        Number(before.capacity_per_session) !==
          Number(after.capacity_per_session)
      )
        kinds.push("Capacity");
      if (kinds.length)
        changes.push({
          id: key + current,
          kind: kinds.join(" + "),
          before,
          after,
          period: current,
          evidence:
            "Same class, studio, day and time; monthly observed roster / average capacity changed.",
        });
    }
    for (const before of removed) {
      const candidates = added.filter(
        (after) =>
          after.location === before.location &&
          after.format === before.format &&
          ["day", "time"].filter((f) => after[f] !== before[f]).length === 1,
      );
      const after = candidates.length === 1 ? candidates[0] : null;
      const reverse = after
        ? removed.filter(
            (r) =>
              r.location === after.location &&
              r.format === after.format &&
              ["day", "time"].filter((f) => r[f] !== after[f]).length === 1,
          )
        : [];
      if (after && reverse.length === 1) {
        matched.add(after);
        changes.push({
          id: identity(before, slot) + current,
          kind:
            "Possible " + (before.day !== after.day ? "day" : "time") + " move",
          before,
          after,
          period: current,
          evidence:
            "Unique one-dimension match across adjacent months; move is inferred, not confirmed.",
        });
      } else
        changes.push({
          id: identity(before, slot) + current,
          kind: "No longer observed",
          before,
          after: null,
          period: current,
          evidence:
            "Absent in the following month; cancellation, closure or discontinuation cannot be confirmed.",
        });
    }
    added
      .filter((r) => !matched.has(r))
      .forEach((after) =>
        changes.push({
          id: identity(after, slot) + current,
          kind: "Newly observed",
          before: null,
          after,
          period: current,
          evidence:
            "First observed relative to the preceding month in the selected scope.",
        }),
      );
  }
  return changes.reverse();
}

export const hostedPredicate =
  "NOT regexp_matches(lower(COALESCE(session_type,'') || ' ' || COALESCE(format,'')), 'hosted|partnership|influencer')";
export function operationsSQL(
  facts: string,
  fields: string[],
  ctx: QueryContext,
) {
  const group = fields.map((f) => `"${f}"`).join(",");
  return `SELECT ${group},${metricSQL(operationMetrics, ctx)},${referenceMetricsSQL}${referenceMetadataSQL(fields) ? "," + referenceMetadataSQL(fields) : ""},COUNT(*) AS n FROM ${facts} GROUP BY ${group}`;
}
export function operationsMonthlySQL(facts: string, ctx: QueryContext) {
  return `SELECT month,location,format,day,time,string_agg(DISTINCT trainer,' / ' ORDER BY trainer) AS instructor_roster,SUM(capacity)/NULLIF(SUM(sessions),0) AS capacity_per_session,${metricSQL(operationMetrics, ctx)} FROM ${facts} WHERE month IS NOT NULL AND day IS NOT NULL AND time IS NOT NULL GROUP BY month,location,format,day,time`;
}

export const operationDimensions = {
  location: "Studio",
  format: "Class",
  format_group: "Format",
  trainer: "Instructor",
  day: "Weekday",
  time: "Time",
  month: "Month",
  session_type: "Session type",
  session_name: "Session name",
  reference_class: "Class",
  class_type: "Type",
  date: "Date",
};

export function resolveOperationGroups(view: OperationView, custom: string[]) {
  if (view !== "custom") return operationViews[view].fields;
  const valid = [...new Set(custom)]
    .filter((f) => f in operationDimensions)
    .slice(0, 5);
  return valid.length ? valid : ["location", "format"];
}

export function communityOperationsSQL(
  facts: string,
  fields: string[],
  ids: string[],
  ctx: QueryContext,
) {
  const group = fields.map((f) => `"${f}"`).join(",");
  const aggregate = ids.length ? metricSQL(ids, ctx) + "," : "";
  return {
    rows: `SELECT ${fields.map((f, i) => `"${f}" AS g${i}`).join(",")},GROUPING_ID(${group}) AS level,${aggregate}COUNT(*) AS n FROM ${facts} GROUP BY ROLLUP(${group}) HAVING GROUPING_ID(${group}) <> ${2 ** fields.length - 1}`,
    total: `SELECT ${aggregate}COUNT(*) AS n FROM ${facts}`,
  };
}

/** Include the calendar month before the selected start for an observed schedule baseline. */
export function scheduleWindow<T extends { from: string; to: string }>(
  filters: T,
): T {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.from)) return filters;
  const start = new Date(filters.from.slice(0, 7) + "-01T00:00:00Z");
  start.setUTCMonth(start.getUTCMonth() - 1);
  return { ...filters, from: start.toISOString().slice(0, 10) };
}
