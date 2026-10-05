import type { Row } from "./duckdb";
export type Worklist =
  "renewal" | "attendance" | "newcomer" | "unused" | "concerns";
export const worklistLabels: Record<Worklist, string> = {
  renewal: "Renewals due",
  attendance: "Attendance gaps",
  newcomer: "Second-session return",
  unused: "Unused access",
  concerns: "Member concerns",
};
export interface Followup {
  owner: string;
  status: string;
  nextDate: string;
  preference: string;
  note: string;
  memberVoice: string;
  observation: string;
  updatedAt?: string;
  history?: Followup[];
  closedReasons?: string[];
}
export const blankFollowup: Followup = {
  owner: "",
  status: "Not started",
  nextDate: "",
  preference: "",
  note: "",
  memberVoice: "",
  observation: "",
};
export function episodeKey(row: Row, kind: Worklist): string {
  const context =
    kind === "attendance"
      ? [row.last_visit]
      : kind === "newcomer"
        ? [row.first_visit]
        : kind === "concerns"
          ? []
          : [row.product, row.start_date, row.end_date];
  return JSON.stringify([kind, row.member_id, ...context]);
}
export function followupFor(
  record: Followup | undefined,
  row: Row,
  kind: Worklist,
): Followup {
  if (!record) return blankFollowup;
  if (record.status !== "Closed") return record;
  if (record.closedReasons?.length) {
    if (record.closedReasons.includes(episodeKey(row, kind))) return record;
  } else {
    const stamp =
      record.updatedAt && Number.isFinite(Date.parse(record.updatedAt))
        ? new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(record.updatedAt))
        : "";
    const event =
      kind === "attendance"
        ? row.last_visit
        : kind === "newcomer"
          ? row.first_visit
          : kind === "concerns"
            ? null
            : row.start_date;
    if (!stamp || !event || String(event) <= stamp) return record;
  }
  return {
    ...blankFollowup,
    owner: record.owner,
    preference: record.preference,
    history: record.history,
  };
}
export const daysBetween = (a: unknown, b: unknown) => {
  if (!a || !b) return null;
  const value =
    (Date.parse(String(a).slice(0, 10) + "T00:00:00Z") -
      Date.parse(String(b).slice(0, 10) + "T00:00:00Z")) /
    86400000;
  return Number.isFinite(value) ? value : null;
};
export function reasons(
  row: Row,
  asOf: string,
  horizon = 30,
  gapDays = 14,
): Partial<Record<Worklist, string>> {
  const result: Partial<Record<Worklist, string>> = {};
  const expiry = daysBetween(row.end_date, asOf),
    gap = daysBetween(asOf, row.last_visit),
    age = daysBetween(asOf, row.first_visit);
  const active = ["active", "new", "not activated"].includes(
    String(row.status).toLowerCase(),
  );
  const current =
    active &&
    row.start_date != null &&
    String(row.start_date) <= asOf &&
    expiry != null &&
    expiry >= 0;
  const ongoing =
    Number(row.membership_amount) > 0 &&
    (Number(row.session_limit) > 1 ||
      /membership|unlimited|u\/l|pack/i.test(String(row.product))) &&
    !/complimentary|free|intro|newcomer/i.test(String(row.product));
  if (current && ongoing && expiry! <= horizon)
    result.renewal = `Access ends ${row.end_date} · ${expiry} days remaining`;
  if (
    current &&
    Number(row.remaining) > 0 &&
    Number(row.session_limit) > 0 &&
    Number(row.remaining) <= Number(row.session_limit)
  )
    result.unused = `${row.remaining} of ${row.session_limit} sessions remain · ends ${row.end_date}`;
  const benchmark = row.typical_gap == null ? null : Number(row.typical_gap),
    threshold = Math.max(
      gapDays,
      benchmark == null ? gapDays : Math.ceil(benchmark * 2),
    );
  if (
    (current || String(row.lifecycle).toLowerCase() === "active") &&
    String(row.status).toLowerCase() !== "frozen" &&
    gap != null &&
    gap >= threshold &&
    gap <= 180
  )
    result.attendance = `Last attended ${row.last_visit} · ${gap} days ago${benchmark != null ? ` · usual gap ${benchmark.toFixed(1)} days` : ` · ${gapDays}-day rule (insufficient history for a personal benchmark)`}`;
  if (
    row.is_new === 1 &&
    age != null &&
    age >= 7 &&
    age <= 30 &&
    row.visits_post != null &&
    Number(row.visits_post) === 0 &&
    (!row.last_visit || String(row.last_visit) <= String(row.first_visit))
  )
    result.newcomer = `First session ${row.first_visit} · ${age} days ago · no recorded return`;
  return result;
}
// Join only stable Member IDs. Latest membership per member is a conservative
// representative, prioritising current paid ongoing access; other concurrent entitlements are available in the source drill.
export function retentionSQL(
  asOf: string,
  locationSQL: string,
  followupIds: string[],
) {
  const safeDate = asOf.replace(/[^0-9-]/g, "");
  const tracked = followupIds.length
    ? ` OR member_id IN (${followupIds.map((id) => `'${id.replaceAll("'", "''")}'`).join(",")})`
    : "";
  return `WITH visits AS (
    SELECT DISTINCT member_id,date FROM checkins WHERE attended AND member_id IS NOT NULL AND date<='${safeDate}'
  ), gaps AS (
    SELECT *,date_diff('day',TRY_CAST(LAG(date) OVER(PARTITION BY member_id ORDER BY date) AS DATE),TRY_CAST(date AS DATE)) AS gap FROM visits
  ), attendance AS (
    SELECT member_id,MAX(date) AS last_visit,COUNT(*) AS attended_visits,
      CASE WHEN COUNT(gap) FILTER(WHERE gap>0 AND TRY_CAST(date AS DATE)>='${safeDate}'::DATE-INTERVAL 180 DAY)>=3 THEN MEDIAN(gap) FILTER(WHERE gap>0 AND TRY_CAST(date AS DATE)>='${safeDate}'::DATE-INTERVAL 180 DAY) END AS typical_gap
    FROM gaps GROUP BY member_id
  ), memberships AS (
    SELECT * FROM lapsed WHERE member_id IS NOT NULL QUALIFY ROW_NUMBER() OVER(PARTITION BY member_id ORDER BY CASE WHEN status IN ('Active','New','Not Activated') AND start_date<='${safeDate}' AND end_date>='${safeDate}' AND revenue>0 AND (session_limit>1 OR regexp_matches(lower(product),'membership|unlimited|u/l|pack')) AND NOT regexp_matches(lower(product),'complimentary|free|intro|newcomer') THEN 0 ELSE 1 END,date DESC NULLS LAST,end_date DESC NULLS LAST,source_row DESC)=1
  ), people AS (
    SELECT * FROM new WHERE member_id IS NOT NULL AND NOT imported QUALIFY ROW_NUMBER() OVER(PARTITION BY member_id ORDER BY date DESC NULLS LAST,source_row DESC)=1
  ), base AS (
    SELECT COALESCE(m.member_id,p.member_id) AS member_id,COALESCE(m.member,p.member) AS member,
      COALESCE(m.email,p.email) AS email,COALESCE(m.phone,p.phone) AS phone,COALESCE(m.location,p.location) AS location,
      m.product,m.status,m.start_date,m.end_date,m.remaining,m.session_limit,m.revenue AS membership_amount,
      p.lifecycle,p.first_visit,p.visits_post,CASE WHEN p.is_new THEN 1 ELSE 0 END AS is_new,
      a.last_visit,a.typical_gap,a.attended_visits,m.source_row AS membership_row,p.source_row AS newcomer_row,m.source_snapshot AS membership_snapshot,p.source_snapshot AS newcomer_snapshot
    FROM memberships m FULL OUTER JOIN people p USING(member_id) LEFT JOIN attendance a ON a.member_id=COALESCE(m.member_id,p.member_id)
  ) SELECT * FROM base WHERE (${locationSQL}) AND (status IN ('Active','New','Not Activated') OR lifecycle='Active' OR TRY_CAST(first_visit AS DATE)>='${safeDate}'::DATE-INTERVAL 30 DAY ${tracked}) ORDER BY end_date NULLS LAST,member`;
}
