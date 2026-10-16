import { useMemo, useState } from 'react';
import { ChartColumn, ChartLine, Database, Download, Maximize2, RotateCcw, Search, Table2, ZoomIn, ZoomOut, Trash2 } from 'lucide-react';
import type { ReportEvidenceBlock, ReportModel } from '../../../report/model';
import { reportFmt, definition } from '../../../report/definitions';
import { formatField } from '../../../semantics/formats';
import { exportReportCSV } from '../../../report/csv';
import { useRecordDrilldown } from './RecordDrilldown';
import { axisStyle, chartPalette, tooltipStyle, useChart } from './useChart';
import { EditableText, useEdit, Slot } from './editing';
const readable=(field:string)=>definition(field)?.label || field.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());
export function ReportEvidence({ block, path, chapterId, model }: {block:ReportEvidenceBlock;path:(string|number)[];chapterId:string;model:ReportModel}) {
 const edit=useEdit(),drill=useRecordDrilldown();
 const [query,setQuery]=useState(''),[sort,setSort]=useState<{field:string;descending:boolean}|null>(null),[preview,setPreview]=useState(false),[metric,setMetric]=useState(block.metricId || ''),[type,setType]=useState(block.chartType || 'bar'),[zoom,setZoom]=useState(100);
 const columns=block.columns ?? Object.keys(block.rows?.[0] ?? {});
 const numeric=columns.filter(c=>c!=='n' && block.rows?.some(r=>typeof r[c]==='number' || definition(c) && r[c]!=null));
 const selected=numeric.includes(metric)?metric:numeric[0];
 const rows=useMemo(()=>{
  const rs=(block.rows ?? []).filter(r=>!query || columns.some(c=>String(r[c] ?? '').toLowerCase().includes(query.toLowerCase())));
  return sort?[...rs].sort((a,b)=>{const x=a[sort.field],y=b[sort.field];return (sort.descending?-1:1)*(typeof x==='number' && typeof y==='number'?x-y:String(x ?? '').localeCompare(String(y ?? ''),undefined,{numeric:true}));}):rs;
 },[block.rows,query,sort]);
 const labelField=columns.find(c=>c==='g'||c==='month') || columns.find(c=>!numeric.includes(c)) || columns[0];
 function records(row?:Record<string,unknown>){if(!drill || !block.dataChapterId)return;const month=row?.month && /^\d{4}-\d{2}$/.test(String(row.month))?String(row.month):model.scope.month;drill({chapterId:block.dataChapterId,month,metric:selected, ...(block.groupField && block.groupField!=='month' && row ? {group:String(row[labelField]),table:model.chapters[block.dataChapterId]?.groups.find(group=>(group.id ?? group.field)===block.groupField) ?? model.chapters[block.dataChapterId]?.groups.find(group=>group.field===block.groupField)}:{})});}
 const {ref,chart}=useChart(()=>{
  if(block.kind!=='chart'||!selected)return null;const palette=chartPalette(),axis=axisStyle();
  return {color:[palette.accent],grid:{left:12,right:24,top:22,bottom:40,containLabel:true},tooltip:{trigger:'axis',...tooltipStyle(),valueFormatter:(v:unknown)=>definition(selected)?reportFmt(selected,v):String(v)},xAxis:{type:'category',data:rows.map(r=>String(r[labelField])),...axis,axisLabel:{...axis.axisLabel,fontSize:12,rotate:rows.length>8?25:0,hideOverlap:true}},yAxis:{type:'value',...axis,axisLabel:{...axis.axisLabel,fontSize:12,formatter:(v:number)=>definition(selected)?reportFmt(selected,v):v.toLocaleString('en-IN')}},dataZoom:[{type:'inside',start:0,end:zoom},{type:'slider',start:0,end:zoom,height:18,bottom:0,borderColor:palette.hairline,textStyle:{color:palette.text2}}],series:[{name:readable(selected),type:type==='bar'?'bar':'line',data:rows.map(r=>r[selected]==null?null:Number(r[selected])),smooth:false,barMaxWidth:36,itemStyle:{borderRadius:[5,5,0,0]},areaStyle:type==='area'?{opacity:.1}:undefined,emphasis:{focus:'series'}}]} as never;
 },[block.kind,selected,type,zoom,JSON.stringify(rows)],p=>records(rows[p.dataIndex]));
 const table=<div className="table-scroll source-native-table"><table><thead><tr>{columns.map(c=><th key={c}><button className="deck-sort" onClick={()=>setSort(s=>({field:c,descending:s?.field===c?!s.descending:true}))}>{c==='g'?block.groupField ? readable(block.groupField):'Group':readable(c)} {sort?.field===c?(sort.descending?'↓':'↑'):''}</button></th>)}{block.dataChapterId && <th>Evidence</th>}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{columns.map(c=><td key={c} data-num={numeric.includes(c)}><span contentEditable={!!edit?.editing} suppressContentEditableWarning onBlur={e=>{if(!edit?.editing)return;const ri=block.rows!.indexOf(row);const raw=e.currentTarget.textContent ?? '';const value=typeof row[c]==='number'?Number(raw.replace(/[₹,%\s]/g,''))/(definition(c)?.format==='percent'?100:1):raw;if(typeof value==='number'&&!Number.isFinite(value))return;edit.set([...path,'rows',ri,c],value);}}>{definition(c)?reportFmt(c,row[c]):formatField(c,row[c])}</span></td>)}{block.dataChapterId && <td><button className="deck-group-drill" onClick={()=>records(row)} aria-label={`Source records for ${row[labelField]}`}>Records ↗</button></td>}</tr>)}</tbody></table></div>;
 return <section className={`source-block ${block.kind==='chart'?'chart-surface':''}`} data-element-id={block.id}>
  <header className="source-block-head"><EditableText path={[...path,'title']} value={block.title} as="h3"/>{edit?.editing && <button className="icon-button" title="Delete this element" aria-label={`Delete ${block.title}`} onClick={()=>{const sectionPath=path.slice(0,-1);edit.set(sectionPath,(sectionPath.reduce<any>((o,k)=>o?.[k],edit.model) as ReportEvidenceBlock[]).filter(b=>b.id!==block.id));}}><Trash2 size={14}/></button>}</header>
  <Slot id={`${chapterId}:insights:${block.id}`} tab={chapterId} section="insights" kind={block.kind==='chart'?'trends':block.kind==='table'?'evidence':'insights'} describe={block.title} onRecord={label=>records(label?rows.find(r=>String(r[labelField])===label):undefined)}>
   {block.kind==='text'?<EditableText path={[...path,'text']} value={block.text} as="p" className="source-block-prose"/>:<>
    <div className="source-evidence-controls" data-export="omit">
     {block.kind==='chart' && <><select aria-label={`Measure for ${block.title}`} value={selected} onChange={e=>setMetric(e.target.value)}>{numeric.map(c=><option key={c} value={c}>{readable(c)}</option>)}</select><button className="button" aria-pressed={type==='bar'} onClick={()=>setType('bar')}><ChartColumn size={14}/>Bars</button><button className="button" aria-pressed={type==='line'} onClick={()=>setType('line')}><ChartLine size={14}/>Line</button><button className="icon-button" aria-label={`Zoom in ${block.title}`} onClick={()=>setZoom(z=>Math.max(10,z-20))}><ZoomIn size={14}/></button><button className="icon-button" aria-label={`Zoom out ${block.title}`} onClick={()=>setZoom(z=>Math.min(100,z+20))}><ZoomOut size={14}/></button><button className="icon-button" aria-label={`Reset ${block.title}`} onClick={()=>{setZoom(100);setSort(null);setQuery('');chart.current?.dispatchAction({type:'restore'});}}><RotateCcw size={14}/></button><button className="button" aria-expanded={preview} onClick={()=>setPreview(v=>!v)}><Table2 size={14}/>Data</button></>}
     {block.kind==='table' && <label><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search this table" aria-label={`Search ${block.title}`}/></label>}
     <button className="button" onClick={()=>exportReportCSV(block.id,rows,model)}><Download size={14}/>CSV</button>
     <button className="icon-button" aria-label={`Expand ${block.title}`} onClick={e=>void e.currentTarget.closest('section')?.requestFullscreen?.().catch(()=>{})}><Maximize2 size={14}/></button>
     {block.dataChapterId && <button className="button" onClick={()=>records()}><Database size={14}/>Source records</button>}
    </div>
    {block.kind==='chart' && <div className="chart source-interactive-chart" ref={ref} role="img" aria-label={`${block.title}. Hover for values; select a mark for source records.`}/>}
    {(block.kind==='table'||preview) && table}
    {!rows.length && <p className="empty-state">No matching rows.</p>}
   </>}
  </Slot>
  <EditableText path={[...path,'description']} value={block.description} as="p" className="source-evidence-caption"/>
 </section>;
}
