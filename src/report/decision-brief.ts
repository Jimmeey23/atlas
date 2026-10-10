import type { DecisionBrief, DecisionTopic, InsightCard } from './model';

export const DECISION_SECTIONS: Record<DecisionTopic, [string,string,string]> = {
  attendance:['Where Is Demand Weakening?','Which Members & Slots Are Affected?','Attendance Recovery Potential'],
  conversion:['Where Is Conversion Breaking?','Which Leads Are Slipping?','Conversion Uplift Potential'],
  retention:["What's Driving Attrition?",'Which Members Are at Risk?','Win-Back Opportunity'],
  revenue:['Where Is Revenue Leaking?',"What's Driving the Shortfall?",'Revenue Recovery Potential'],
  growth:["What's Driving Growth?",'Where Is Momentum Strongest?','Opportunity to Scale'],
  instructor:["What's Behind the Variation?",'Which Classes Are Affected?','Coaching & Optimisation Opportunities'],
  general:['Root Cause to Investigate','Who & What Is Affected','Recovery Opportunity'],
};
export const DECISION_KINDS = {performance_anomaly:'Performance anomaly',growth_opportunity:'Growth opportunity',retention_risk:'Retention risk',decision:'Decision brief',early_warning:'Early warning'};
/** Saved pre-brief narratives remain usable; malformed optional data cannot break an export. */
export function decisionBrief(card: InsightCard): DecisionBrief | undefined {
  const b=card.decisionBrief;
  if (!b || !Object.hasOwn(DECISION_SECTIONS,b.topic) || !Object.hasOwn(DECISION_KINDS,b.kind)
    || !['diagnosis','affected','opportunity','review','success'].every(key=>typeof b[key as keyof DecisionBrief]==='string')
    || !Array.isArray(b.steps) || b.steps.length>3 || b.steps.some(s=>!s || typeof s.label!=='string'||typeof s.detail!=='string')
    || !Array.isArray(b.stats) || b.stats.length>3 || b.stats.some(s=>!s || !['confirmed','estimated','hypothesis'].includes(s.status)||[s.label,s.value,s.basis].some(v=>typeof v!=='string'))) return undefined;
  return b;
}
export function decisionTopic(card:InsightCard, chapterId:string):DecisionTopic {
  const brief=decisionBrief(card);if(brief)return brief.topic;
  if(card.lens==='win')return 'growth';
  if(['renewals','lapsed'].includes(chapterId))return 'retention';
  if(['conversion-funnel','leads','website-marketing'].includes(chapterId))return 'conversion';
  if(chapterId==='revenue-performance')return 'revenue';
  if(['instructors','instructor-outcomes'].includes(chapterId))return 'instructor';
  if(['sessions','formats','community-attendance','recurring'].includes(chapterId))return 'attendance';
  return 'general';
}
