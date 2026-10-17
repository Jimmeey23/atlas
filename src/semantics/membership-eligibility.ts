import { today } from "../data/periods";
import { EXCLUDED_MEMBERSHIP_PATTERNS, EXCLUDED_MEMBERSHIP_TERMS } from "../../server/kra-churn.mjs";

const sqlString = (s: string) => `'${s.replaceAll("'", "''")}'`;
const name = "lower(COALESCE(product,''))";

/**
 * A paid membership whose name is not on the business's restricted list — the same
 * rules the KRA churn measure uses (server/kra-churn.mjs). Frozen is handled by callers:
 * a frozen membership still counts as a member's latest membership, but never as lapsed.
 */
export const paidMembershipSQL = [
  "COALESCE(amount_paid,0)>0",
  ...EXCLUDED_MEMBERSHIP_TERMS.map((term) => `NOT contains(${name},${sqlString(term)})`),
  ...EXCLUDED_MEMBERSHIP_PATTERNS.map((pattern) => `NOT regexp_matches(${name},${sqlString(pattern.source)})`),
].join(" AND ");

/** Days after the Churned Date before a Lapsed membership counts as lapsed; until then it is in grace. */
export const LAPSE_GRACE_DAYS = 30;
const recordedStatus = (alias = "") => `lower(trim(COALESCE(${alias}status,'')))`;
/** Status is Lapsed and the Churned Date (End Date when blank) is at least 30 days before the as-of date. */
export const confirmedLapseSQL = (asOf: string, alias = "") =>
  `${recordedStatus(alias)}='lapsed' AND TRY_CAST(COALESCE(${alias}churned_date,${alias}end_date) AS DATE)<=DATE '${asOf}'-INTERVAL ${LAPSE_GRACE_DAYS} DAY`;

/**
 * Flags each member's most recent paid, unrestricted membership when its recorded Status is
 * Lapsed at least 30 days past the Churned Date (so Frozen, Not Activated, Active, New, Renewed
 * and still-in-grace memberships are not lapses). Lapsed members count only these rows, so a
 * member who later bought another paid membership is not counted as lapsed.
 * Depends on the as-of date: re-run whenever the table loads or is restored.
 */
export const latestLapseSQL = (table = "lapsed", asOf = today()) => `UPDATE "${table}" SET latest_lapse = (r.rank = 1 AND ${confirmedLapseSQL(asOf, `"${table}".`)})
FROM (SELECT row_id, ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY TRY_CAST(start_date AS DATE) DESC NULLS LAST, TRY_CAST(end_date AS DATE) DESC NULLS LAST, row_id DESC) AS rank
  FROM "${table}" WHERE member_id IS NOT NULL AND ${paidMembershipSQL}) r
WHERE "${table}".row_id = r.row_id`;
