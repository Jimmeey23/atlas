// Literal, case-insensitive rules supplied by the user; count source rows.
// Trials are Is New containing 'new'; referrals are Is New exactly 'New - Referral Class'.
// A referral value also contains 'new', so referral rows are counted as trials too: `overlap`
// reports that intersection and `entryTypes` exposes every distinct Is New value behind the counts.
const REFERRAL_VALUE='new - referral class';
export function acquisitionCounts(rows,from,to,includeRows=true) {
  const cohort=rows.filter(row=>row.date&&row.date>=from&&row.date<=to);
  const isTrial=row=>String(row.entry_type??'').toLowerCase().includes('new');
  const isReferral=row=>String(row.entry_type??'').trim().toLowerCase()===REFERRAL_VALUE;
  const trials=cohort.filter(isTrial),referrals=cohort.filter(isReferral);
  const trialSet=new Set(trials),referralSet=new Set(referrals);
  const values=new Map();
  cohort.forEach(row=>{
    const value=String(row.entry_type??'').trim()||'(blank)';
    const entry=values.get(value)??{value,rows:0,trial:isTrial(row),referral:isReferral(row)};
    entry.rows++;values.set(value,entry);
  });
  return {
    trials:trials.length,referrals:referrals.length,
    overlap:trials.filter(row=>referralSet.has(row)).length,
    trialsOnly:trials.filter(row=>!referralSet.has(row)).length,
    cohortRows:cohort.length,
    entryTypes:[...values.values()].sort((a,b)=>b.rows-a.rows),
    rows:includeRows?cohort.filter(row=>trialSet.has(row)||referralSet.has(row)).map(row=>({...Object.fromEntries(['source_row','member','member_id','email','phone','date','entry_type','location','product','trainer','conversion','retention','ltv','first_purchase','conversion_days'].map(key=>[key,row[key]??null])),trial_included:trialSet.has(row),referral_included:referralSet.has(row)})):[],
  };
}
