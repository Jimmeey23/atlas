import type { GroupTable, ReportModel } from './model';
import { chapters, type ChapterSpec } from './chapters';
import { definition } from './definitions';
import { metricTable } from '../semantics/catalogue';
import { homeChapter } from './ownership';

export interface RecordSelection { chapterId?: string; month?: string; metric?: string; table?: GroupTable; group?: string }
const synthesis = new Set(['executive-summary', 'recommendations', 'predictions']);
export function resolveRecordSelection(model: ReportModel, selection: RecordSelection, fallback: string): RecordSelection {
  if (selection.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(selection.month)) throw new Error('The selected evidence period is invalid.');
  const supports = (spec: ChapterSpec) => !synthesis.has(spec.id) && !spec.derived && (!selection.metric || [...spec.metrics, ...spec.history, ...spec.groups.flatMap(group => group.columns)].includes(selection.metric) || (spec.source === metricTable(selection.metric) && !spec.renewal));
  const tableOwner = selection.table ? chapters.find(spec => model.chapters[spec.id]?.groups.includes(selection.table!)) : undefined;
  const requested = chapters.find(spec => spec.id === (selection.chapterId ?? fallback));
  const candidates = chapters.filter(spec => supports(spec));
  const spec = tableOwner && supports(tableOwner) && (!selection.metric || selection.table!.columns.includes(selection.metric)) ? tableOwner
    : requested && supports(requested) ? requested
    : candidates.find(spec => spec.id === homeChapter(spec).id && (model.chapters[spec.id] || model.sourceRecords?.[spec.source]))
      ?? candidates.find(spec => model.chapters[spec.id]) ?? candidates[0];
  if (!spec || (selection.metric && !definition(selection.metric))) throw new Error('No governed source is linked to this metric.');
  const compatibleTable = selection.table && (!tableOwner || tableOwner.source === spec.source) && (!selection.metric || selection.table.columns.includes(selection.metric)) ? selection.table : undefined;
  if (selection.group != null && !compatibleTable) throw new Error('This group does not belong to the selected metric source. Select a metric from the same table.');
  return { ...selection, chapterId: spec.id, table: compatibleTable, group: compatibleTable ? selection.group : undefined };
}

/** Open the current analytics workspace at the report's studio and period. */
export function reportAnalyticsLink(model: ReportModel, chapterId: string, origin: string) {
  const spec = chapters.find(chapter => chapter.id === chapterId);
  const sourceTabs: Record<string, number> = {sales:4, new:5, leads:8, lapsed:6, payroll:3, sessions:1, recurring:1, bookings:12, checkins:1, meta:8};
  const tab = chapterId === 'instructors' ? 3 : chapterId === 'formats' ? 14 : spec?.derived ? 0 : sourceTabs[spec?.source ?? ''];
  if (tab == null) return undefined;
  const [year,month] = model.scope.month.split('-').map(Number);
  const to = new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  const url = new URL('/',origin);
  url.searchParams.set('tab',String(tab));
  url.searchParams.set('f',JSON.stringify({from:`${model.scope.month}-01`,to,location:spec?.network ? [] : [model.scope.studio]}));
  url.searchParams.set('compare','month');
  if (spec?.website || spec?.source === 'meta') url.searchParams.set('view','performance-marketing');
  return url.href;
}
