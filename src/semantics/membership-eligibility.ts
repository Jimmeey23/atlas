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

/**
 * Flags each member's most recent paid, unrestricted membership when it lapsed (has a
 * Churned Date and is not Frozen). Lapsed members count only these rows, so a member who
 * later bought another paid membership is not counted as lapsed.
 */
export const latestLapseSQL = (table = "lapsed") => `UPDATE "${table}" SET latest_lapse = (r.rank = 1 AND "${table}".churned_date IS NOT NULL AND lower(COALESCE("${table}".status,''))<>'frozen')
FROM (SELECT row_id, ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY TRY_CAST(start_date AS DATE) DESC NULLS LAST, TRY_CAST(end_date AS DATE) DESC NULLS LAST, row_id DESC) AS rank
  FROM "${table}" WHERE member_id IS NOT NULL AND ${paidMembershipSQL}) r
WHERE "${table}".row_id = r.row_id`;
