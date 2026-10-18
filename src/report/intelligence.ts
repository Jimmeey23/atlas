import { eligibleIntervention } from "../data/retention";
import type { Row } from '../data/duckdb';
import { monthBounds, shiftMonth } from './period';
export type EvidenceTable = { title: string; columns: string[]; rows: (string | number | null)[][]; note: string };
export interface OperationalIntelligence { asOf: string; tables: EvidenceTable[]; unavailable: string[] }
const num = (r: Row, key: string) => r[key] == null || !Number.isFinite(Number(r[key])) ? null : Number(r[key]);
const sum = (rows: Row[], key: string) => rows.some(r => num(r,key) != null) ? rows.reduce((s,r) => s + (num(r,key) ?? 0),0) : null;
const sessionCount = (rows: Row[]) => new Set(rows.filter(r => r.session_id != null).map(r => String(r.session_id))).size;
const divide = (a: number | null, b: number | null) => a == null || b == null || b <= 0 ? null : a/b;
const day = (date: unknown) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date) ? Date.parse(date.slice(0,10)+'T00:00:00Z') / 86400000 : NaN;
const identity = (r: Row) => r.member_id ? String(r.member_id) : null;
const distinct = (rows: Row[]) => [...new Map(rows.filter(identity).map(r => [identity(r),r])).values()];
const attended = (r: Row) => (Number(r.attended) === 1 || Number(r.checked_in) === 1) && !r.cancelled && !r.no_show && !r.late_cancelled;
const paid = (r: Row) => eligibleIntervention({...r,membership_amount:r.revenue ?? r.amount_paid}) && !r.refunded && !r.voided;
export function wilson(success: number, n: number): [number,number] | null {
  if (!n) return null;
  const z=1.96,p=success/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return [Math.max(0,c-h),Math.min(1,c+h)];
}
const ci = (s: number,n: number) => wilson(s,n)?.map(v => `${(v*100).toFixed(1)}%`).join('–') ?? 'Unavailable';
const funnel = (r: Row) => /hosted|partnership/i.test(String(r.entry_type)+' '+String(r.session_type)) ? 'Hosted' : /referr/i.test(String(r.source)) ? 'Referral' : /trial|intro|newcomer/i.test(String(r.entry_type)+' '+String(r.category)) ? 'Trial' : /paid|drop.?in|single/i.test(String(r.entry_type)) ? 'Paid first visit' : 'Unknown';
const inMonth = (r: Row, month: string) => String(r.date ?? '').slice(0,7) === month;
/** Input rows are studio-scoped, frozen together, and never read live by the reader. */
export function operationalIntelligence(sources: Record<string,Row[]>, month: string, asOf: string): OperationalIntelligence {
  const tables: EvidenceTable[] = [], unavailable: string[] = [];
  const add = (title: string,columns: string[],rows: EvidenceTable['rows'],note: string) => tables.push({title,columns,rows,note});
  const end = Math.min(day(monthBounds(month).to),day(asOf));
  const observed = (key: string) => (sources[key] ?? []).filter(r => !Number.isFinite(day(r.date)) || day(r.date)<=day(asOf));
  const newcomers = observed('new'), visits = observed('checkins'), sales = observed('sales'), memberships = observed('lapsed'), sessions = observed('sessions'), payroll = observed('payroll'), leads = observed('leads');
  const monthly = (rows: Row[],m=month) => rows.filter(r => inMonth(r,m));
  const visitsByMember=new Map<string,Row[]>();
  for(const visit of visits){const id=identity(visit);if(id&&attended(visit)){const records=visitsByMember.get(id)??[];records.push(visit);visitsByMember.set(id,records);}}

  if (newcomers.length) {
    const rows: EvidenceTable['rows'] = [];
    for (let offset=-12;offset<=0;offset++) {
      const m=shiftMonth(month,offset);
      for (const channel of ['Hosted','Trial','Referral','Paid first visit','Unknown']) {
        const cohort=distinct(newcomers.filter(r => String(r.first_visit ?? r.date).slice(0,7)===m && funnel(r)===channel));
        if (!cohort.length) continue;
        const cells: (string|number|null)[]=[m,channel,cohort.length];
        for (const window of [7,30,60]) {
          // The whole creation cohort must have its complete follow-up window.
          if (day(monthBounds(m).to)+window > day(asOf)) { cells.push('Maturing','Maturing'); continue; }
          const converted=cohort.filter(r => {const elapsed=day(r.first_purchase_date)-day(r.first_visit ?? r.date);return elapsed>=0 && elapsed<=window && Number(r.post_trial_purchases)>0;}).length;
          const knownPurchaseDates=cohort.every(r => r.post_trial_purchases!=null && (Number(r.post_trial_purchases)===0 || Number.isFinite(day(r.first_purchase_date))));
          const retained=cohort.filter(r => (visitsByMember.get(identity(r)??'')??[]).some(v => day(v.date)>day(r.first_visit ?? r.date)+Math.max(0,window-7) && day(v.date)<=day(r.first_visit ?? r.date)+window)).length;
          cells.push(knownPurchaseDates ? `${(converted/cohort.length*100).toFixed(1)}% (${ci(converted,cohort.length)})` : 'Purchase dates incomplete', visits.length ? `${(retained/cohort.length*100).toFixed(1)}% (${ci(retained,cohort.length)})` : 'Visit history unavailable');
        }
        rows.push(cells);
      }
    }
    add('Fixed-window cohort triangle',['Cohort','Funnel','Members','D7 converted · 95% CI','D7 retained · 95% CI','D30 converted · 95% CI','D30 retained · 95% CI','D60 converted · 95% CI','D60 retained · 95% CI'],rows,'Conversion = first recorded post-trial purchase within Dn. Retention = an attended return visit in the final seven days of Dn; independent of purchase. Entire month must mature. Read the reported confidence interval and observation count alongside each rate. Coverage of purchase and attendance history must be verified before interpreting a zero.');
  } else unavailable.push('Cohorts: newcomer history unavailable.');
  if (leads.length) {
    
    // Use the recorded lead ID where available; source rows are not person-deduplicated by name.
    const raw=monthly(leads), booked=raw.filter(r => !/not |cancel|no.?show/i.test(String(r.trial_status)) && /book|schedul|complet|attend/i.test(String(r.trial_status))), done=booked.filter(r => /complet|attend/i.test(String(r.trial_status))), converted=done.filter(r => Number(r.converted)>0 || (!/not |unconverted/i.test(String(r.stage)) && /converted|won/i.test(String(r.stage))));
    add('Leads funnel',['Source','Lead records','Booked or later','Attended or later','Converted after attendance'],[...new Set(raw.map(r=>String(r.source ?? 'Unknown')))].map(source=>[source,raw.filter(r=>String(r.source??'Unknown')===source).length,booked.filter(r=>String(r.source??'Unknown')===source).length,done.filter(r=>String(r.source??'Unknown')===source).length,converted.filter(r=>String(r.source??'Unknown')===source).length]),'Creation-month lead records; inferred from current recorded trial status, not timestamped stage transitions. Conversion without evidence of attendance is excluded from the final step. Stable lead ID and transition dates are required for a true historical funnel.');

  } else unavailable.push('Leads source has no verified rows.');
  const eligible=memberships.filter(r=>identity(r) && paid(r) && Number.isFinite(day(r.start_date)) && Number.isFinite(day(r.end_date)));
  if (eligible.length) {
    const start=day(monthBounds(month).from), byMember=new Map<string,Row[]>();
    for (const r of eligible) {const id=identity(r)!;byMember.set(id,[...(byMember.get(id)??[]),r]);}
    const active=(rows:Row[],date:number)=>rows.some(r=>day(r.start_date)<=date && day(r.end_date)>=date);
    let opening=0,added=0,churned=0,reactivated=0,closing=0;
    const risk: EvidenceTable['rows']=[],bands=[0,0,0,0];
    for (const [id,rows] of byMember) {
      const o=active(rows,start-1), c=active(rows,end);opening+=+o;closing+=+c;
      if(o&&!c)churned++;
      if(!o&&c) {if(rows.some(r=>day(r.end_date)<start))reactivated++;else added++;}
      if(c) {
        const seen=(visitsByMember.get(id)??[]).filter(v=>day(v.date)<=end), count=seen.filter(v=>day(v.date)>=start).length;
        bands[count===0?0:count<=3?1:count<=7?2:3]++;
        const dates=seen.map(v=>day(v.date)).filter(Number.isFinite), last=dates.length?Math.max(...dates):null;
        if(last!=null && end-last>=14)risk.push([id,end-last,count]);
      }
    }
    add('Member-base bridge',['Opening active','New to observed base','Churned','Reactivated','Closing active','Monthly logo churn'],[[opening,added,churned,reactivated,closing,divide(churned,opening)]],'Opening + new − churned + reactivated = closing. Unique paid member IDs with access spanning each boundary; expired access counts even without a recorded churn date. New/reactivated classification depends on complete historical membership coverage.');
    const baseHistory:EvidenceTable['rows']=[];
    for(let offset=-12;offset<=0;offset++){
      const m=shiftMonth(month,offset),begin=day(monthBounds(m).from),finish=Math.min(day(monthBounds(m).to),day(asOf));
      let open=0,close=0,lost=0,newly=0,returned=0;
      for(const rows of byMember.values()){
        const o=active(rows,begin-1),c=active(rows,finish);open+=+o;close+=+c;if(o&&!c)lost++;
        if(!o&&c){if(rows.some(r=>day(r.end_date)<begin))returned++;else newly++;}
      }
      baseHistory.push([m,open,newly,lost,returned,close,divide(lost,open)]);
    }
    add('Whole paid-base continuity · monthly',['Month','Opening','New to observed base','Churned','Reactivated','Closing','Logo churn rate'],baseHistory,'Monthly access-boundary bridge, not an expiry-cohort denominator. The identity reconciles each month. Historical membership completeness is required; zero observed access does not certify that the source covers the entire historical base.');
    add('Visit-frequency bands',['Visits in month','Closing active members'],['0','1–3','4–7','8+'].map((b,i)=>[b,visits.length?bands[i]:null]),'Monthly attendance among the closing paid base; unavailable when attendance source is missing.');
    add('At-risk paid members · one definition',['Member ID','Days since attended visit','Visits in month'],risk.sort((a,b)=>Number(b[1])-Number(a[1])),'Active paid access at month end and no attended visit for at least 14 days. Complimentary, zero-value, intro and 2-for-1 access excluded. Missing visit history is unknown, never classified as zero visits.');
  } else unavailable.push('Historical paid membership intervals are unavailable; whole-base churn cannot be inferred from renewal cohorts.');
  if (sales.length) {
    const valid=sales.filter(r=>!r.voided && (r.status==null || r.status==='succeeded')), current=monthly(valid), previous=monthly(valid,shiftMonth(month,-1));
    const amount=sum(current,'revenue'), prior=sum(previous,'revenue');
    const ranked=current.filter(r=>num(r,'revenue')!=null).sort((a,b)=>Number(b.revenue)-Number(a.revenue));
    const recurring=(rows:Row[])=>rows.filter(r=>/recurring|subscription|autopay/i.test(String(r.purchase_type)));
    const lump=(r:Row)=>/private|annual/i.test(String(r.product)+' '+String(r.category));
    add('Revenue quality',['Collected','Explicit recurring collections','Other / unclassified collections','MoM all','MoM excluding annual/private','Top 1 row share','Top 5 rows share','Top 10 rows share'],[[amount,sum(recurring(current),'revenue'),amount==null?null:amount-(sum(recurring(current),'revenue')??0),divide(amount,prior)==null?null:amount!/prior!-1,divide(sum(current.filter(r=>!lump(r)),'revenue'),sum(previous.filter(r=>!lump(r)),'revenue'))==null?null:sum(current.filter(r=>!lump(r)),'revenue')!/sum(previous.filter(r=>!lump(r)),'revenue')!-1,...[1,5,10].map(n=>divide(sum(ranked.slice(0,n),'revenue'),amount))]],'Successful, non-voided payment lines follow the cash collection contract; refund adjustments require their own ledger. Recurring requires explicit subscription/recurring/autopay tagging. Annual/private exclusion is a disclosed sensitivity, not a statistical outlier detector. Concentration is at source payment-row grain; do not call rows unique transactions until sale IDs are reconciled.');
    add('Discount depth',['Band','Payment rows','Collected'],['0%','0–10%','10–20%','20%+','Unknown'].map(b=>{const rs=current.filter(r=>{const d=divide(num(r,'discount'),(num(r,'revenue')??0)+(num(r,'discount')??0));return (d==null?'Unknown':d===0?'0%':d<=.1?'0–10%':d<=.2?'10–20%':'20%+')===b;});return [b,rs.length,sum(rs,'revenue')];}),'Discount / (payment + discount). Unknown discount is not treated as zero.');
    const transactionValues=(rows:Row[]) => {
      if(!rows.length || rows.some(r=>!r.sale_id || num(r,'revenue')==null))return null;
      const values=new Map<string,number>();
      for(const r of rows){const key=`${String(r.date).slice(0,7)}|${r.sale_id}`;values.set(key,(values.get(key)??0)+Number(r.revenue));}
      return [...values.values()].sort((a,b)=>b-a);
    };
    const tx=transactionValues(current), prevTx=transactionValues(previous);
    const historical=valid.filter(r=>String(r.date).slice(0,7)<month && String(r.date).slice(0,7)>=shiftMonth(month,-12));
    const baseline=transactionValues(historical)?.sort((a,b)=>a-b);
    const quantile=(a:number[],p:number)=>{const i=(a.length-1)*p,lo=Math.floor(i);return a[lo]+(a[Math.ceil(i)]-a[lo])*(i-lo);};
    const threshold=baseline && baseline.length>0 ? quantile(baseline,.75)+3*(quantile(baseline,.75)-quantile(baseline,.25)) : null;
    const trimmed=(values:number[]|null)=>values && threshold!=null ? values.filter(v=>v<=threshold).reduce((s,v)=>s+v,0) : null;
    const adjusted=divide(trimmed(tx),trimmed(prevTx));
    add('Transaction concentration & outlier sensitivity',['Verified sale IDs','Top 1 share','Top 5 share','Top 10 share','Historical extreme-value threshold','MoM excluding extreme transactions'],[[tx?.length??null,...[1,5,10].map(n=>tx?divide(tx.slice(0,n).reduce((a,b)=>a+b,0),amount):null),threshold,adjusted==null?null:adjusted-1]],'Payment lines aggregate by stable sale ID within each period. Missing IDs make the transaction analysis unavailable. Extreme value = prior 12-month Q3 + 3×IQR, using all available verified historical transactions; the same threshold is applied to both comparison months. Sensitivity is not an assertion that large sales are invalid.');
    const earned=sum(monthly(sessions),'revenue'),net=sum(current,'net'),gst=sum(current,'vat');
    add('Collections, earned and GST controls',['Collected gross','Session-attributed earned proxy','Gross less earned proxy','Recorded GST','Gross − catalogue net − GST check','Opening deferred','Closing deferred'],[[amount,earned,amount!=null&&earned!=null?amount-earned:null,gst,amount!=null&&net!=null&&gst!=null?amount-net-gst:null,null,null]],'GST maps to the recorded tax field; no assumed tax rate. Catalogue net prices may have different quantity/payment grain; the residual is a reconciliation control, not a tax-rate calculation. Session-attributed revenue is not an accounting recognition ledger. The cash/earned gap is not deferred revenue. Opening deferred + net collections − earned − refunds/adjustments = closing deferred requires finance ledger evidence.');
  }
  const currentSessions=monthly(sessions), currentPayroll=monthly(payroll);
  if (currentSessions.length) {
    const costs=new Map<string,number>();
    for (const trainer of new Set(currentPayroll.filter(r=>r.trainer).map(r=>String(r.trainer)))) {
      const rs=currentPayroll.filter(r=>String(r.trainer)===trainer),cost=divide(sum(rs,'revenue'),sum(rs,'sessions'));if(cost!=null)costs.set(trainer,cost);
    }
    const grouped=new Map<string,Row[]>();
    for(const r of currentSessions){const key=[r.format,r.day,r.time].join(' · ');grouped.set(key,[...(grouped.get(key)??[]),r]);}
    const slots=[...grouped].map(([slot,rs])=>{
      const known=rs.every(r=>r.session_id!=null&&costs.has(String(r.trainer))), cost=known?[...new Map(rs.map(r=>[String(r.session_id),r])).values()].reduce((s,r)=>s+costs.get(String(r.trainer))!,0):null;
      const revenue=sum(rs,'revenue'),count=sessionCount(rs),contribution=cost!=null&&revenue!=null?revenue-cost:null;
      return [slot,count,divide(sum(rs,'checked_in'),sum(rs,'capacity')),divide(cost,count),contribution,divide(contribution,count),null,rs.length] as (string|number|null)[];
    }).sort((a,b)=>a[4]==null?1:b[4]==null?-1:Number(b[4])-Number(a[4]));
    add('Slot contribution ranking',['Format · day · time','Sessions','Fill','Instructor cost / session','Contribution before other costs','Contribution / session','Full break-even size','Source records'],slots,'Monthly instructor payroll / paid sessions allocated by instructor; missing session IDs or instructor payroll matches mean unavailable. Contribution excludes rent and other costs. Real break-even requires marginal paid-visitor yield and all incremental costs; no average-revenue-per-visit shortcut. Co-taught sessions need a verified instructor join.');
    add('Normalised demand',['Month','Operating days','Attendance / operating day','Attendance / session'],[month,shiftMonth(month,-1),shiftMonth(month,-12)].map(m=>{const rs=monthly(sessions,m),days=new Set(rs.map(r=>String(r.date).slice(0,10))).size;return [m,days||null,divide(sum(rs,'checked_in'),days),divide(sum(rs,'checked_in'),sessionCount(rs))];}),'Operating day = a day with a supplied session. Selected month, prior month and same month last year use the same denominator rules. Festival adjustment needs a verified studio closure/festival calendar; these are exposure-normalised comparisons, not a seasonality model.');
    add('Format capacity and network benchmark',['Format','Actual capacity / session','Studio fill','Other studios fill','Approved target','Marginal seat opportunity'],[...new Set(currentSessions.map(r=>String(r.format)))].map(format=>{const rs=currentSessions.filter(r=>String(r.format)===format);const others=(sources.networkSessions??[]).filter(r=>inMonth(r,month)&&String(r.format)===format);return [format,divide(sum(rs,'capacity'),sessionCount(rs)),divide(sum(rs,'checked_in'),sum(rs,'capacity')),divide(sum(others,'checked_in'),sum(others,'capacity')),null,null];}),'Uses observed format capacities, never a shared cycle/mat capacity. Targets require approval by format. Opportunity remains unavailable until paid class-pack/drop-in marginal yield can be joined to visits; unlimited-member extra visits have no incremental collections.');
  }
  const hygiene: EvidenceTable['rows']=[];
  for(let i=-12;i<=0;i++){
    const m=shiftMonth(month,i),rs=monthly(sales,m),ns=newcomers.filter(r=>String(r.first_visit??r.date).slice(0,7)===m),vs=monthly(visits,m),ms=distinct(memberships.filter(r=>paid(r) && String(r.end_date).slice(0,7)===m));
    const unattributed=rs.filter(r=>!r.associate||/unspecified|admin admin/i.test(String(r.associate)));
    hygiene.push([m,rs.length?sum(unattributed,'revenue')??0:null,rs.length?divide(unattributed.length,rs.length):null,ns.length?divide(ns.filter(r=>!r.source||/unknown|unspecified/i.test(String(r.source))).length,ns.length):null,vs.some(r=>r.no_show!=null)?vs.filter(r=>Number(r.no_show)===1).length:null,vs.some(r=>r.late_cancelled!=null)?vs.filter(r=>Number(r.late_cancelled)===1).length:null,ms.length?ms.filter(r=>!r.churned_date&&!/renew|frozen/i.test(String(r.status))).length:null]);
  }
  add('Data hygiene · monthly trend',['Month','Unattributed collections','Unattributed share','Unknown newcomer source share','Explicit no-shows','Late cancels','Expiry decisions needing reconciliation'],hygiene,'Unattributed includes missing, Unspecified and Admin Admin associates. No-show and late-cancel flags are reported separately; a near-zero no-show count is a mapping check, not evidence of perfect attendance. Renewal gaps are unresolved source decisions, not confirmed churn.');
  unavailable.push('Finance: recognition/deferred ledger and verified GST treatment are required for a full reconciliation.','Opportunity: approved format targets and marginal class-pack/drop-in visitor yield are required.','Seasonality: verified festival and closure calendar is required; calendar-day adjustment alone is not a seasonality model.','Action review: prior action IDs, deadlines and measured outcomes are required; do not invent last month’s results.');
  return {asOf,tables,unavailable};
}
