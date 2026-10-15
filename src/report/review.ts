import { definition, reportFmt, reportDelta } from './definitions';
import type { ChapterData, ReportModel } from './model';
import { chapters } from './chapters';

/** Every governed headline/history metric remains available, including unavailable values. */
export function reviewMetricIds(chapter: string, data?: ChapterData): string[] {
  const spec = chapters.find(c => c.id === chapter);
  return [...new Set([...(spec?.metrics ?? []), ...(spec?.history ?? []), ...Object.keys(data?.total ?? {})])]
    .filter(id => !!definition(id));
}
export function reviewRows(chapter: string, data: ChapterData) {
  const available = (v: unknown) => v != null && v !== '' && Number.isFinite(Number(v)) ? v : null;
  return reviewMetricIds(chapter, data).map(id => {
    const current = data.n > 0 ? available(data.total[id]) : null;
    const prior = available(data.prior[id]), year = available(data.priorYear[id]);
    const ytd = Number(data.yearToDate?.n) > 0 ? available(data.yearToDate?.[id]) : null;
    const priorYtd = Number(data.priorYearToDate?.n) > 0 ? available(data.priorYearToDate?.[id]) : null;
    return { id, label: definition(id)!.label, current, prior, year, ytd, priorYtd,
      values: [reportFmt(id, current), reportFmt(id, prior), reportFmt(id, year), current == null || prior == null ? '—' : reportDelta(id, current, prior), current == null || year == null ? '—' : reportDelta(id, current, year), reportFmt(id, ytd), ytd == null || priorYtd == null ? '—' : reportDelta(id, ytd, priorYtd)] };
  });
}
export function sourceBasis(model: ReportModel, chapter: string) {
  const spec = chapters.find(c => c.id === chapter);
  return model.sourceRecords?.[spec?.source ?? ''] ? 'Frozen source snapshot' : 'Live source records · may differ from this report';
}
