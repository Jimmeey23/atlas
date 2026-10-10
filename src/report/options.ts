import { INSIGHT_LENSES, type ReportCustomization } from './model';
export const FOCUS_OPTIONS = [
  {id:'commercial',label:'Revenue quality & product mix'}, {id:'demand',label:'Demand, fill & timetable'},
  {id:'community',label:'Newcomers & member continuity'}, {id:'people',label:'Instructor performance & economics'},
  {id:'marketing',label:'Acquisition & marketing efficiency'},
] as const;
export function reportOptions(c?: ReportCustomization) {
  return { surface:c?.surface ?? 'paper', density:c?.density ?? 'compact', layout:c?.layout ?? 'adaptive', evidenceView:c?.evidenceView ?? 'auto',
    historyMonths:c?.historyMonths ?? 12, showCover:c?.showCover ?? true, showDefinitions:c?.showDefinitions ?? false,
    showConfidence:c?.showConfidence ?? true, showSources:c?.showSources ?? true, showAppendix:c?.showAppendix ?? true,
    showCharts:c?.showCharts ?? true, accent:c?.accent ?? 'navy', focusAreas:c?.focusAreas ?? [],
    lenses:c?.lenses?.length ? c.lenses : INSIGHT_LENSES.map(l=>l.id), insightsPerChapter:c?.insightsPerChapter ?? (c?.detail === 'Concise' ? 4 : 6),
    includeActions:c?.includeActions ?? true, quantifyImpact:c?.quantifyImpact ?? true, comparisonFocus:c?.comparisonFocus ?? 'balanced',
    typography:c?.typography ?? 'modern', cardStyle:c?.cardStyle ?? 'bordered', confidentiality:c?.confidentiality ?? 'Internal · management review',
    showGlance:c?.showGlance ?? true, showContents:c?.showContents ?? true, showInlineEvidence:c?.showInlineEvidence ?? true,
    showActionPlan:c?.showActionPlan ?? true, pageBreaks:c?.pageBreaks ?? false };
}
