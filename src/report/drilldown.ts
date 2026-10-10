import { chapters } from './chapters';
import type { ReportModel } from './model';

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
