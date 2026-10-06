import {recordedChurn} from './kra-churn.mjs';
// Role outcomes are company-wide; only exact name matches are personally attributed.
const finite = value => value != null && Number.isFinite(Number(value));
const sum = (rows,key) => {const known=rows.filter(row=>finite(row[key]));return known.length?known.reduce((total,row)=>total+Number(row[key]),0):null;};
const ratio = (a,b) => a!=null && b>0 ? a/b : null;
const atLeast = (value,target) => value >= target-1e-12;
const change = (value,baseline) => value!=null && baseline>0 ? value/baseline-1 : null;
const compact = row => Object.fromEntries(['source_row','member','member_id','lead_id','email','phone','date','location','product','category','sale_id','associate','source','revenue','status','start_date','end_date','renewed','churned_date','churn_included','session_limit','completed','scheduled','completed','identity_basis','stage'].map(key=>[key,row[key]??null]));
const person = value => String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
const emailKey = value => {const email=person(value);return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&!/^noemail\+/i.test(email)?email:'';};
const datePlus = (date,days) => new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const monthOffset = (month,offset) => new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-1+offset,1)).toISOString().slice(0,7);
const endOfMonth = month => datePlus(monthOffset(month,1)+'-01',-1);
export const kraDefinitions = [
  {id:'upskilling',area:'Professional Upskilling',target:'Performance Marketing',weight:10,kind:'evidence'},
  {id:'churn',area:'Reducing Churn',target:'10% relative reduction in churn versus the same period last year; monitor MoM movement',weight:15,kind:'data'},
  {id:'growth',area:'Team Growth',target:'Hire and fully train the systems executive',weight:15,kind:'evidence'},
  {id:'trials',area:'Trials and Referrals',target:'10% YoY increase in lead-to-first-class scheduled and completed outcomes',weight:15,kind:'data'},
  {id:'training',area:'Team Training',target:'Empathy, active listening and soft skills training',weight:10,kind:'evidence'},
  {id:'stability',area:'Stabilize Revenue',target:'Less than a 10% month-on-month revenue dip',weight:15,kind:'data'},
  {id:'revenue',area:'Revenue Growth',target:'10% YoY increase in overall revenue',weight:20,kind:'data'},
];
export function kraPerformance(sources,asOf,{imports=false}={}) {
  const get=key=>sources[key]?.rows??[];
  const sales=get('sales').filter(row=>!row.voided&&(row.status==='succeeded'||row.status==null)&&(imports||!row.imported)&&row.date&&row.date<=asOf);
  const leads=get('leads').filter(row=>row.date&&row.date<=asOf);
  const bookings=get('bookings').filter(row=>row.date);
  const byId=new Map(),byEmail=new Map();
  bookings.forEach(row=>{if(row.member_id){if(!byId.has(row.member_id))byId.set(row.member_id,[]);byId.get(row.member_id).push(row);}const email=emailKey(row.email);if(email){if(!byEmail.has(email))byEmail.set(email,[]);byEmail.get(email).push(row);}});
  const seenLeads=new Set();
  const leadFacts=leads.filter(row=>{if(row.lead_id){if(seenLeads.has(row.lead_id))return false;seenLeads.add(row.lead_id);}return true;}).map(row=>{
    const idRows=byId.get(row.member_id)??[], emailRows=byEmail.get(emailKey(row.email))??[];
    const emailIdentities=new Set(emailRows.map(booking=>booking.member_id).filter(Boolean));
    const linked=new Set(idRows.length?idRows:emailIdentities.size>1?[]:emailRows);
    const identity_basis=idRows.length?'Member ID':emailIdentities.size>1?'Ambiguous email':emailRows.length?'Valid email':'Unmatched';
    const eligible=[...linked].filter(b=>!b.cancelled&&!b.late_cancelled&&!b.no_show&&(imports||!b.imported));
    const firstScheduled=eligible.sort((a,b)=>a.date.localeCompare(b.date))[0];
    const scheduled=firstScheduled&&firstScheduled.date>=row.date?firstScheduled:null;
    const firstCompleted=eligible.filter(b=>b.attended===true&&b.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date))[0];
    const completed=firstCompleted&&firstCompleted.date>=row.date?firstCompleted:null;
    return {...row,identity_basis,scheduled:scheduled?.date??null,completed:completed?.date??null};
  });
  function revenue(month,cutoff=endOfMonth(month)) {const records=sales.filter(row=>row.date>=month+'-01'&&row.date<=cutoff);return records.length?sum(records,'revenue'):null;}
  const salesCoverage=get('sales').filter(row=>row.date).map(row=>row.date).sort();
  const revenueCovered=month=>salesCoverage.length&&salesCoverage[0]<=month+'-01'&&salesCoverage.at(-1)>=endOfMonth(month);
  function churn(month,observationAsOf=asOf) {
    const result=recordedChurn(get('lapsed'),month+'-01',endOfMonth(month),observationAsOf);
    return {...result,rows:result.rows.map(compact)};
  }
  function lead(month,observationEnd,createdThrough=endOfMonth(month)) {
    const rows=leadFacts.filter(row=>row.date.slice(0,7)===month&&row.date<=createdThrough);
    // Equal elapsed observation windows prevent older cohorts receiving extra time to convert.
    const shown=rows.map(row=>({...row,scheduled:row.scheduled&&row.scheduled<=observationEnd?row.scheduled:null,completed:row.completed&&row.completed<=observationEnd?row.completed:null}));
    return {rows:shown.map(compact),leads:shown.length,identified:shown.filter(row=>row.member_id||emailKey(row.email)).length,scheduled:shown.filter(row=>row.scheduled).length,completed:shown.filter(row=>row.completed).length,scheduledRate:ratio(shown.filter(row=>row.scheduled).length,shown.length),completedRate:ratio(shown.filter(row=>row.completed).length,shown.length)};
  }
  const bookingDates=bookings.map(row=>row.date).sort();
  const months=Array.from({length:6},(_,i)=>'2026-'+String(i+6).padStart(2,'0'));
  const monthly=months.map(month=>{
    const future=month+'-01'>asOf,closed=endOfMonth(month)<asOf,baseline=monthOffset(month,-12),previous=monthOffset(month,-1);
    const cutoff=future?null:closed?endOfMonth(month):asOf;
    const revenueValue=cutoff?revenue(month,cutoff):null;
    const baselineCutoff=cutoff?baseline+cutoff.slice(7):null;
    const prevCutoff=closed?endOfMonth(previous):cutoff?previous+'-'+String(Math.min(Number(cutoff.slice(8)),Number(endOfMonth(previous).slice(8)))).padStart(2,'0'):null;
    const baselineRevenue=baselineCutoff?revenue(baseline,baselineCutoff):null,previousRevenue=prevCutoff?revenue(previous,prevCutoff):null;
    const revenueYoY=change(revenueValue,baselineRevenue),revenueMoM=change(revenueValue,previousRevenue);
    const currentChurn=churn(month),baselineChurn=churn(baseline,baselineCutoff??asOf),previousChurn=churn(previous,prevCutoff??asOf);
    const precedingMonth=monthOffset(month,-6),precedingCutoff=cutoff?(closed?endOfMonth(precedingMonth):precedingMonth+cutoff.slice(7)):null;
    const precedingRevenue=precedingCutoff?revenue(precedingMonth,precedingCutoff):null;
    const matchedChurnDate=baselineCutoff;
    const precedingChurnDate=precedingCutoff;
    const matchedBaselineChurn=matchedChurnDate?churn(baseline,matchedChurnDate):churn(baseline);
    const previousMatchedChurn=churn(previous,prevCutoff??asOf);
    const precedingChurn=precedingChurnDate?churn(precedingMonth,precedingChurnDate):churn(precedingMonth);
    const churnReduction=currentChurn.rate!=null&&baselineChurn.rate>0?1-currentChurn.rate/baselineChurn.rate:null;
    const elapsed=cutoff?Math.min(30,Math.max(0,(Date.parse(asOf)-Date.parse(endOfMonth(month)))/86400000)):0;
    const observationEnd=cutoff?datePlus(cutoff,elapsed):asOf;
    const baselineObservation=cutoff?datePlus(baselineCutoff,elapsed):asOf;
    const trial=cutoff?lead(month,observationEnd,cutoff):{rows:[],leads:0,identified:0,scheduled:0,completed:0,scheduledRate:null,completedRate:null};
    const baselineTrial=cutoff?lead(baseline,baselineObservation,baselineCutoff):{leads:0,scheduled:0,completed:0,scheduledRate:null,completedRate:null};
    const previousTrials=cutoff?lead(previous,datePlus(prevCutoff,elapsed),prevCutoff):{leads:0,scheduled:0,completed:0,scheduledRate:null,completedRate:null};
    const precedingTrials=cutoff?lead(precedingMonth,datePlus(precedingCutoff,elapsed),precedingCutoff):{leads:0,scheduled:0,completed:0,scheduledRate:null,completedRate:null};
    const scheduledGrowth=change(trial.scheduledRate,baselineTrial.scheduledRate),completedGrowth=change(trial.completedRate,baselineTrial.completedRate);
    const trialCoverage=bookingDates.length&&bookingDates[0]<=baseline+'-01'&&bookingDates.at(-1)>=observationEnd;
    const revenueReady=closed&&revenueCovered(month)&&revenueCovered(baseline),stabilityReady=closed&&revenueCovered(month)&&revenueCovered(previous);
    return {month,state:future?'Upcoming':closed?'Completed month':'Month to date',revenue:revenueValue,baselineRevenue,previousRevenue,revenueYoY,revenueMoM,revenueTarget:revenueReady&&revenueYoY!=null?atLeast(revenueYoY,.10):null,stabilityTarget:stabilityReady&&revenueMoM!=null?revenueMoM>-.10+1e-12:null,
      churn:currentChurn,baselineChurn,matchedBaselineChurn,previousChurn,previousMatchedChurn,previousTrials,precedingChurn,churnReduction,observedChurnReduction:currentChurn.observedRate!=null&&matchedBaselineChurn.observedRate>0?1-currentChurn.observedRate/matchedBaselineChurn.observedRate:null,precedingRevenue,precedingRevenueGrowth:change(revenueValue,precedingRevenue),precedingTrials,churnTarget:closed&&churnReduction!=null?atLeast(churnReduction,.10):null,
      trials:trial,baselineTrials:baselineTrial,scheduledGrowth,completedGrowth,trialsTarget:closed&&trialCoverage&&elapsed>=30&&scheduledGrowth!=null&&completedGrowth!=null?atLeast(scheduledGrowth,.10)&&atLeast(completedGrowth,.10):null,observationEnd:cutoff?observationEnd:null,
      sales:cutoff?sales.filter(row=>row.date>=month+'-01'&&row.date<=cutoff).map(compact):[]};
  });
  const breakdown=new Map();
  sales.filter(row=>row.date>='2026-06-01'&&row.date<='2026-11-30').forEach(row=>{const key=row.location??'Unspecified';if(!breakdown.has(key))breakdown.set(key,[]);breakdown.get(key).push(row);});
  const direct=sales.filter(row=>person(row.associate)==='jimmeey gondaa'&&row.date>='2026-06-01'&&row.date<='2026-11-30');
  const assessments=Object.fromEntries([['churn','churnTarget'],['trials','trialsTarget'],['stability','stabilityTarget'],['revenue','revenueTarget']].map(([key,field])=>{const assessed=monthly.filter(row=>row[field]!=null);return [key,{assessed:assessed.length,met:assessed.filter(row=>row[field]).length,months:6}];}));
  const comparisonEnd=asOf<'2026-11-30'?asOf:'2026-11-30';
  const elapsedDays=Math.max(0,(Date.parse(comparisonEnd)-Date.parse('2026-06-01'))/86400000);
  const periodObservationLag=Math.min(30,Math.max(0,(Date.parse(asOf)-Date.parse(comparisonEnd))/86400000));
  function periodSummary(from,to,lag=periodObservationLag) {
    const payments=sales.filter(row=>row.date>=from&&row.date<=to);
    const known=payments.filter(row=>finite(row.revenue));
    const prospects=leadFacts.filter(row=>row.date>=from&&row.date<=to);
    const observationEnd=datePlus(to,lag);
    const scheduled=prospects.filter(row=>row.scheduled&&row.scheduled<=observationEnd&&row.scheduled<=datePlus(endOfMonth(row.date.slice(0,7)),30)).length;
    const completed=prospects.filter(row=>row.completed&&row.completed<=observationEnd&&row.completed<=datePlus(endOfMonth(row.date.slice(0,7)),30)).length;
    const churnSummary=recordedChurn(get('lapsed'),from,to,to);
    return {from,to,revenue:sum(known,'revenue'),saleItems:payments.length,knownSales:new Set(payments.map(row=>row.sale_id).filter(Boolean)).size,knownItems:known.length,averageItemValue:known.length?sum(known,'revenue')/known.length:null,members:new Set(payments.map(row=>row.member_id).filter(Boolean)).size,
      leads:prospects.length,scheduled,completed,scheduledRate:ratio(scheduled,prospects.length),completedRate:ratio(completed,prospects.length),
      due:churnSummary.due,matureDue:churnSummary.due,lapsed:churnSummary.lapsed,renewed:churnSummary.renewed,unrecorded:churnSummary.unrecorded,missingDates:churnSummary.missingDates,churnRate:churnSummary.rate,grace:0};
  }
  const comparisonPeriods={
    current:periodSummary('2026-06-01',comparisonEnd),
    lastYear:periodSummary('2025-06-01','2025'+comparisonEnd.slice(4)),
    precedingMatched:periodSummary('2025-12-01',datePlus('2025-12-01',elapsedDays)),
    precedingFull:periodSummary('2025-12-01','2026-05-31',30),
  };
  function revenueExplanation(current,base,area) {
    if(current.revenue==null||base.revenue==null)return {finding:'Source coverage needs reconciliation before a growth conclusion can be made.',basis:'Coverage limit',action:'Refresh the reporting sources and reconcile missing payment periods.'};
    const delta=current.revenue-base.revenue, growth=change(current.revenue,base.revenue);
    const volume=base.averageItemValue!=null?(current.knownItems-base.knownItems)*base.averageItemValue:null;
    const mix=current.averageItemValue!=null&&base.averageItemValue!=null?current.knownItems*(current.averageItemValue-base.averageItemValue):null;
    return {finding:delta>=0?`Collections increased by ₹${Math.round(delta).toLocaleString('en-IN')}${growth!=null?' ('+(growth*100).toFixed(1)+'%)':''}, providing a stronger revenue base.`:`Collections retained ${base.revenue>0?(current.revenue/base.revenue*100).toFixed(1):'—'}% of the comparison period, with a ₹${Math.round(-delta).toLocaleString('en-IN')} shortfall to address.`,
      basis:volume==null?'No comparable paid-item values.':`Arithmetic bridge: ₹${Math.round(volume).toLocaleString('en-IN')} from paid-item volume and ₹${Math.round(mix).toLocaleString('en-IN')} from average item value/mix. This explains the movement numerically; it does not establish a causal diagnosis.`,
      action:area==='stability'?'Review studio-level collection gaps, renewal follow-ups and weekly payment pacing; log actions underway below.':'Prioritise high-converting lead cohorts, renewal outreach and paid-item mix; test offers against contribution margins. Suggested steps require an owner and recorded execution.'};
  }
  const explanations={
    revenue:revenueExplanation(comparisonPeriods.current,comparisonPeriods.lastYear,'revenue'),
    stability:revenueExplanation(comparisonPeriods.current,comparisonPeriods.precedingMatched,'stability'),
    trials:{finding:`The KRA period produced ${comparisonPeriods.current.scheduled} scheduled and ${comparisonPeriods.current.completed} completed first-class outcomes from ${comparisonPeriods.current.leads} leads.`,basis:`Same-period LY: ${comparisonPeriods.lastYear.leads} leads, ${comparisonPeriods.lastYear.scheduled} scheduled and ${comparisonPeriods.lastYear.completed} completed. Volume and conversion rates are separated so a lead-volume change does not hide funnel progress.`,action:'Review unmatched identities and lead-to-booking drop-offs, prioritise prompt follow-up and reminder experiments. Record actual actions underway rather than assuming execution.'},
    churn:{finding:`${comparisonPeriods.current.lapsed} membership records have a Churned Date out of ${comparisonPeriods.current.due} expiry records in this period. ${comparisonPeriods.current.unrecorded} have no recorded churn by the cutoff.`,basis:'Churn = records with Churned Date on or before the period cutoff / all Lapsed-sheet records with End Date within the period. All membership types are included; blank Churned Dates are never inferred from expiry. These are membership-record counts, not unique-member counts.',action:'Prioritise members with recorded churn for reactivation, distinguish trial exits from ongoing-membership exits, and reconcile Lapsed-status rows missing a Churned Date. Suggested actions are separate from logged execution.'},
  };
  monthly.forEach(row=>{
    if(row.state==='Upcoming'){row.explanations={};return;}
    const known=row.sales.filter(item=>finite(item.revenue));
    const base=sales.filter(item=>item.date>=monthOffset(row.month,-12)+'-01'&&item.date<=monthOffset(row.month,-12)+(row.state==='Completed month'?endOfMonth(row.month):asOf).slice(7)&&finite(item.revenue));
    row.explanations={
      revenue:revenueExplanation({revenue:row.revenue,knownItems:known.length,averageItemValue:known.length?row.revenue/known.length:null},{revenue:row.baselineRevenue,knownItems:base.length,averageItemValue:base.length?row.baselineRevenue/base.length:null},'revenue'),
      churn:{finding:`${row.churn.lapsed} recorded churns across ${row.churn.due} membership expiry records; ${row.churn.unrecorded} have no recorded churn by the cutoff.`,basis:'Lapsed sheet · Churned Date / End Date expiry cohort. All membership types included; no assumed 30-day churn rule. Historical comparisons use the current source snapshot and matching date cutoffs.',action:explanations.churn.action},
      trials:{finding:`${row.trials.scheduled} leads reached a scheduled first class and ${row.trials.completed} completed one, from ${row.trials.leads} leads. Last year’s matched cohort produced ${row.baselineTrials.scheduled} scheduled and ${row.baselineTrials.completed} completed outcomes from ${row.baselineTrials.leads} leads.`,basis:'Separate lead-volume movement from scheduling and completion rates; check unmatched identities before attributing changes to team execution.',action:explanations.trials.action},
    };
  });
  const trajectories={
    revenue:change(comparisonPeriods.current.revenue,comparisonPeriods.lastYear.revenue)==null?'Baseline review needed':change(comparisonPeriods.current.revenue,comparisonPeriods.lastYear.revenue)>=.10-1e-12?'On track':'Lagging',
    stability:monthly.some(row=>row.stabilityTarget!=null)?monthly.filter(row=>row.stabilityTarget!=null).every(row=>row.stabilityTarget)?'On track':'Lagging':'Observation in progress',
    trials:change(comparisonPeriods.current.scheduledRate,comparisonPeriods.lastYear.scheduledRate)==null||change(comparisonPeriods.current.completedRate,comparisonPeriods.lastYear.completedRate)==null?'Baseline review needed':change(comparisonPeriods.current.scheduledRate,comparisonPeriods.lastYear.scheduledRate)>=.10-1e-12&&change(comparisonPeriods.current.completedRate,comparisonPeriods.lastYear.completedRate)>=.10-1e-12?'On track':'Lagging',
    churn:comparisonPeriods.current.churnRate!=null&&comparisonPeriods.lastYear.churnRate>0?(comparisonPeriods.current.churnRate<=comparisonPeriods.lastYear.churnRate*.9+1e-12?'On track':'Lagging'):'Observation in progress',
  };
  return {person:'Jimmeey Gondaa',churnSource:{title:'Lapsed',url:'https://docs.google.com/spreadsheets/d/1x-0iFgnYmEqt-b2MfAgHVx5CErcX5NtZYB9p5Rh6f1I/edit#gid=0',basis:'Recorded Churned Date / membership expiry records'},role:'Head of Systems, Sales & Client Servicing · Physique 57 India',period:{from:'2026-06-01',to:'2026-11-30'},asOf,definitions:kraDefinitions,monthly,assessments,comparisonPeriods,explanations,trajectories,
    studioSales:[...breakdown].map(([location,rows])=>({location,revenue:sum(rows,'revenue'),saleItems:rows.length,knownSales:new Set(rows.map(row=>row.sale_id).filter(Boolean)).size,members:new Set(rows.map(row=>row.member_id).filter(Boolean)).size})),
    directSales:{items:direct.length,revenue:sum(direct,'revenue'),scope:'Exact Sold By match: Jimmeey Gondaa. Organisation results are leadership outcomes, not personally closed sales.'},
    sources:Object.entries(sources).map(([key,value])=>({key,status:value.status,fetchedAt:value.fetchedAt,stale:value.stale,error:value.error??null,rows:value.rows?.length??0,from:(value.rows??[]).map(row=>row.date).filter(Boolean).sort()[0]??null,to:(value.rows??[]).map(row=>row.date).filter(Boolean).sort().at(-1)??null})),
    methodology:[
      'Review period is June–November 2026, as explicitly supplied; the pasted Oct–March heading is not used. Global dashboard filters do not change this organisation-wide review.',
      'Revenue sums Payment Value on successful/non-voided sales, matching the existing Revenue workspace. Imports are excluded by default. Source gaps are identified for reconciliation; no zeros or forecasts are invented.',
      'Completed-month revenue assessments need source records spanning the month and its comparison. This is a coverage check, not proof of upstream completeness. Month-to-date comparisons use matching elapsed calendar days.',
      'KRA churn uses only Lapsed in spreadsheet 1x-0iFgnYmEqt-b2MfAgHVx5CErcX5NtZYB9p5Rh6f1I: recorded Churned Date on or before cutoff / all membership records with End Date in the selected period. All statuses and membership types, including free/trial products, remain in the denominator. Each source row is a membership record; this is not active-base member churn. Blank Churned Date never implies churn; no paid-only filter or 30-day inference is applied.',
      'Trials uses the lead creation-month cohort linked by member ID, with a valid unambiguous email fallback, to the earliest recorded non-cancelled, non-no-show scheduled and completed sessions. Sessions preceding lead creation receive no first-class credit. Scheduled and attended/completed first-class rates are compared YoY with up to 30 post-month observation days matched across years. A 10% target means relative rate growth; counts are also shown. Referral-specific targets were not supplied.',
      'Trial assessments require 30 post-month observation days; missing or ambiguous identifiers or booking coverage can understate results. Dates represent recorded sessions; a historical booking creation timestamp is unavailable.',
      'Zero comparison denominators are labelled explicitly. Future months are pending; open observation windows show observed values and provisional trajectories. No overall score is asserted for an unfinished review period.',
      'Performance Marketing upskilling, hiring/onboarding and soft-skills training require dated evidence. Logged progress is self-reported; it does not certify completion or create an approved KRA score.',
    ]};
}
