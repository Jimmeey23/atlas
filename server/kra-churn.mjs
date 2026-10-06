// Same expiry-cohort denominator as the application's recorded Lapsed churn metric.
// Blank Churned Date is not evidence of churn, regardless of expired access/status.
// Eligibility rules supplied by the business: paid memberships only, frozen records out,
// and non-membership / trial-style products excluded by literal name match.
export const EXCLUDED_MEMBERSHIP_TERMS=['intro','2 for 1','studio single class','private','credit','copper & cloves single class','copper + cloves single class'];
// Matched on word boundaries so a product merely containing the letters is not excluded.
export const EXCLUDED_MEMBERSHIP_PATTERNS=[/\btest\b/];
export function eligibleMembership(row) {
  if(!(Number(row.revenue)>0))return false;
  if(String(row.status??'').trim().toLowerCase()==='frozen')return false;
  const product=String(row.product??'').toLowerCase();
  if(EXCLUDED_MEMBERSHIP_PATTERNS.some(pattern=>pattern.test(product)))return false;
  return !EXCLUDED_MEMBERSHIP_TERMS.some(term=>product.includes(term));
}
export function recordedChurn(rows,from,to,asOf) {
  const cutoff=to<asOf?to:asOf;
  const cohort=rows.filter(row=>row.end_date&&row.end_date>=from&&row.end_date<=cutoff&&eligibleMembership(row));
  const churned=cohort.filter(row=>row.churned_date&&row.churned_date<=cutoff);
  const renewed=cohort.filter(row=>String(row.status??'').trim().toLowerCase()==='renewed'&&!row.churned_date);
  const missingDates=cohort.filter(row=>String(row.status??'').trim().toLowerCase()==='lapsed'&&!row.churned_date).length;
  const renewedSet=new Set(renewed),churnedSet=new Set(churned);
  const rate=cohort.length?churned.length/cohort.length:null;
  return {rows:cohort.map(row=>({...row,renewed:renewedSet.has(row),churn_included:churnedSet.has(row)})),due:cohort.length,renewed:renewed.length,lapsed:churned.length,grace:0,unrecorded:cohort.length-churned.length,missingDates,rate,observedRate:rate,final:to<asOf};
}

// Recorded churn keeps settling after an expiry: late renewals and reactivations land weeks later,
// so the newest cohorts always read high. Splitting the period by observation age shows the settled rate.
export function churnMaturity(rows,from,to,asOf,settleDays=60) {
  const boundary=new Date(Date.parse(asOf+'T00:00:00Z')-settleDays*86400000).toISOString().slice(0,10);
  const settled=recordedChurn(rows.filter(row=>row.end_date&&row.end_date<=boundary),from,to,asOf);
  const settling=recordedChurn(rows.filter(row=>row.end_date&&row.end_date>boundary),from,to,asOf);
  return {settleDays,boundary,
    settled:{due:settled.due,lapsed:settled.lapsed,rate:settled.rate},
    settling:{due:settling.due,lapsed:settling.lapsed,rate:settling.rate},
    gap:settled.rate!=null&&settling.rate!=null?settling.rate-settled.rate:null};
}
