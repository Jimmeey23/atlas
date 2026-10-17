// Same expiry-cohort denominator and Status rules as the dashboard's renewal cohort.
// Churn = recorded Status is Lapsed and the Churned Date (End Date when blank) is at least
// 30 days before the snapshot date and on or before the observation date (asOf), so matched
// historical comparisons only count churn dated by their cutoff. Status is a current snapshot,
// so the 30-day grace is measured from the snapshot date; other Lapsed records are in grace.
// Eligibility rules supplied by the business: paid memberships only, Frozen and Not Activated
// records out, and non-membership / trial-style products excluded by literal name match.
// Active and New memberships have not reached a renewal decision.
export const EXCLUDED_MEMBERSHIP_TERMS=['intro','2 for 1','studio single class','private','credit','copper & cloves single class','copper + cloves single class'];
// Matched on word boundaries so a product merely containing the letters is not excluded.
export const EXCLUDED_MEMBERSHIP_PATTERNS=[/\btest\b/];
export const LAPSE_GRACE_DAYS=30;
export const recordedStatus=row=>String(row.status??'').trim().toLowerCase();
export function eligibleMembership(row) {
  if(!(Number(row.amount_paid??row.revenue)>0))return false;
  if(['frozen','not activated'].includes(recordedStatus(row)))return false;
  const product=String(row.product??'').toLowerCase();
  if(EXCLUDED_MEMBERSHIP_PATTERNS.some(pattern=>pattern.test(product)))return false;
  return !EXCLUDED_MEMBERSHIP_TERMS.some(term=>product.includes(term));
}
const DUE=new Set(['lapsed','renewed']);
export function recordedChurn(rows,from,to,asOf,snapshot=asOf) {
  const cutoff=to<asOf?to:asOf;
  const graceEnd=new Date(Date.parse(snapshot+'T00:00:00Z')-LAPSE_GRACE_DAYS*86400000).toISOString().slice(0,10);
  const churnedBy=graceEnd<asOf?graceEnd:asOf;
  const cohort=rows.filter(row=>row.end_date&&row.end_date>=from&&row.end_date<=cutoff&&eligibleMembership(row)&&DUE.has(recordedStatus(row)));
  const outcome=row=>recordedStatus(row)==='renewed'?'renewed':String(row.churned_date??row.end_date)<=churnedBy?'lapsed':'grace';
  const count=state=>cohort.filter(row=>outcome(row)===state).length;
  const lapsed=count('lapsed'),rate=cohort.length?lapsed/cohort.length:null;
  return {rows:cohort.map(row=>({...row,renewed:outcome(row)==='renewed',churn_included:outcome(row)==='lapsed'})),due:cohort.length,renewed:count('renewed'),lapsed,grace:count('grace'),unrecorded:cohort.length-lapsed,missingDates:0,rate,observedRate:rate,final:to<asOf};
}

// Churn keeps settling after an expiry: late renewals and reactivations land weeks later,
// so the newest cohorts always read high. Splitting the period by observation age shows the settled rate.
export function churnMaturity(rows,from,to,asOf,settleDays=60) {
  const boundary=new Date(Date.parse(asOf+'T00:00:00Z')-settleDays*86400000).toISOString().slice(0,10);
  const settled=recordedChurn(rows.filter(row=>row.end_date&&row.end_date<=boundary),from,to,asOf,asOf);
  const settling=recordedChurn(rows.filter(row=>row.end_date&&row.end_date>boundary),from,to,asOf);
  return {settleDays,boundary,
    settled:{due:settled.due,lapsed:settled.lapsed,rate:settled.rate},
    settling:{due:settling.due,lapsed:settling.lapsed,rate:settling.rate},
    gap:settled.rate!=null&&settling.rate!=null?settling.rate-settled.rate:null};
}
