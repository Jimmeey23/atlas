import {buildCSV} from '../data/export-format';
import {definition} from './definitions';
import type {ReportModel} from './model';
/** Report exports carry the report scope and source versions, independent of dashboard filters. */
export function exportReportCSV(name:string,rows:Record<string,unknown>[],model?:ReportModel,month=model?.scope.month){
 const csv=buildCSV(rows,{scope:model?`${model.scope.studio} · ${month}`:name,generatedAt:new Date().toISOString(),filters:model?{studio:model.scope.studio,month}: {},sources:model?.sources?.map(s=>({name:s.title,fetchedAt:s.fetchedAt})),definitions:Object.fromEntries([...new Set(rows.flatMap(r=>Object.keys(r)))].filter(k=>definition(k)).map(k=>[k,definition(k)!.description])),rowCount:rows.length});
 const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
