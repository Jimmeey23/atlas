import type { ChapterData } from './model';
import { reportFmt } from './definitions';
/** Algebraic decomposition, not a causal attribution. Uses the engine's aggregates. */
export function diagnosticFacts(data: ChapterData): string[] {
  const t=data.total,p=data.prior;
  const known=(ids:string[])=>ids.every(id=>t[id]!=null&&p[id]!=null&&Number.isFinite(Number(t[id]))&&Number.isFinite(Number(p[id])));
  const facts:string[]=[];
  if(known(['gross_revenue','transactions','aov'])&&Number(p.transactions)>0&&Number(t.transactions)>0){
    const volume=(Number(t.transactions)-Number(p.transactions))*Number(p.aov);
    const value=Number(t.transactions)*(Number(t.aov)-Number(p.aov));
    facts.push(`Gross collection bridge: total change ${reportFmt('gross_revenue',Number(t.gross_revenue)-Number(p.gross_revenue))}; transaction-volume component at prior AOV ${reportFmt('gross_revenue',volume)}; AOV component at current transaction count ${reportFmt('gross_revenue',value)}. These reconcile arithmetically; mix, pricing and purchase frequency cannot be separated without further evidence. Distinct transaction counts do not equal sale-line counts.`);
  }
  if(t.missing_sale_ids!=null) facts.push(`Sale ID coverage: ${Number(t.missing_sale_ids)} of ${Number(t.n)} sale lines have no sale ID; ${Number(t.missing_member_ids ?? 0)} have no member ID. Missing IDs limit distinct transaction or buyer counts only to the extent quantified here; do not infer widespread missing data.`);
  if(known(['attendance','sessions','avg_class_size_incl'])){
    const schedule=(Number(t.sessions)-Number(p.sessions))*Number(p.avg_class_size_incl);
    const demand=Number(t.sessions)*(Number(t.avg_class_size_incl)-Number(p.avg_class_size_incl));
    facts.push(`Attendance bridge: total change ${reportFmt('attendance',Number(t.attendance)-Number(p.attendance))}; session-volume component at prior average ${schedule.toFixed(1)} visits; class-size component at current sessions ${demand.toFixed(1)} visits. This is a decomposition of attendance, not evidence that instructors caused the change.`);
  }
  if(known(['new_clients','conversion_rate'])){
    facts.push(`Converted-cohort bridge (unrounded arithmetic): newcomer-volume component ${( (Number(t.new_clients)-Number(p.new_clients))*Number(p.conversion_rate)).toFixed(1)} outcomes; conversion-rate component ${(Number(t.new_clients)*(Number(t.conversion_rate)-Number(p.conversion_rate))).toFixed(1)} outcomes. Both cohorts are observed to the latest source date; recent outcomes may mature.`);
  }
  if(t.renewal_rate!=null) facts.push('Renewal outcomes use the dashboard paid-expiry cohort: due = renewed + lapsed + frozen. Lapses are recorded Churned Dates on a member’s most recent membership; recent cohorts may still change as late renewals are recorded. Renewals completed are observed outcomes of the expiry cohort, not a count of payment transactions during the report month.');
  return facts;
}
