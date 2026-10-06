// Literal, case-insensitive contains rules supplied by the user; count source rows.
export function acquisitionCounts(rows,from,to,includeRows=true) {
  const cohort=rows.filter(row=>row.date&&row.date>=from&&row.date<=to);
  const trials=cohort.filter(row=>String(row.entry_type??'').toLowerCase().includes('new'));
  const referrals=cohort.filter(row=>String(row.entry_type??'').toLowerCase().includes('referrals'));
  const trialSet=new Set(trials),referralSet=new Set(referrals);
  return {trials:trials.length,referrals:referrals.length,rows:includeRows?cohort.filter(row=>trialSet.has(row)||referralSet.has(row)).map(row=>({...Object.fromEntries(['source_row','member','member_id','email','phone','date','entry_type','location','product','trainer','conversion','retention','ltv','first_purchase','conversion_days'].map(key=>[key,row[key]??null])),trial_included:trialSet.has(row),referral_included:referralSet.has(row)})):[]};
}
