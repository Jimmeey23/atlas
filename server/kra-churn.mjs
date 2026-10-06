// Same expiry-cohort denominator as the application's recorded Lapsed churn metric.
// Blank Churned Date is not evidence of churn, regardless of expired access/status.
export function recordedChurn(rows,from,to,asOf) {
  const cutoff=to<asOf?to:asOf;
  const cohort=rows.filter(row=>row.end_date&&row.end_date>=from&&row.end_date<=cutoff);
  const churned=cohort.filter(row=>row.churned_date&&row.churned_date<=cutoff);
  const renewed=cohort.filter(row=>String(row.status??'').trim().toLowerCase()==='renewed'&&!row.churned_date);
  const missingDates=cohort.filter(row=>String(row.status??'').trim().toLowerCase()==='lapsed'&&!row.churned_date).length;
  const renewedSet=new Set(renewed),churnedSet=new Set(churned);
  const rate=cohort.length?churned.length/cohort.length:null;
  return {rows:cohort.map(row=>({...row,renewed:renewedSet.has(row),churn_included:churnedSet.has(row)})),due:cohort.length,renewed:renewed.length,lapsed:churned.length,grace:0,unrecorded:cohort.length-churned.length,missingDates,rate,observedRate:rate,final:to<asOf};
}
