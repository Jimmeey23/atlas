import {useRef,useState} from 'react';
import * as echarts from 'echarts';
import {Download,Maximize2,RotateCcw,Table2,ZoomIn,ZoomOut} from 'lucide-react';
import type {ReportModel} from '../../../report/model';
import {exportReportCSV} from '../../../report/csv';
export function ReportChartControls({title,rows,model}:{title:string;rows:Record<string,unknown>[];model?:ReportModel}){
 const ref=useRef<HTMLDivElement>(null),[table,setTable]=useState(false),[zoom,setZoom]=useState(100);
 function instance(){const dom=ref.current?.closest('.chart-surface')?.querySelector('.chart');return dom?echarts.getInstanceByDom(dom as HTMLElement):null;}
 function change(delta:number){const value=Math.max(10,Math.min(100,zoom+delta));setZoom(value);instance()?.setOption({dataZoom:[{type:'inside',start:0,end:value},{type:'slider',start:0,end:value}]});}
 const columns=Object.keys(rows[0] ?? {});
 return <div ref={ref} className="chart-controls"><div className="chart-control-buttons"><button aria-label={`Zoom in ${title}`} onClick={()=>change(-20)}><ZoomIn size={14}/></button><button aria-label={`Zoom out ${title}`} onClick={()=>change(20)}><ZoomOut size={14}/></button><button aria-label={`Reset ${title}`} onClick={()=>{setZoom(100);instance()?.dispatchAction({type:'restore'});}}><RotateCcw size={14}/></button><button aria-label={`Data table for ${title}`} onClick={()=>setTable(t=>!t)}><Table2 size={14}/></button><button aria-label={`Export data for ${title}`} onClick={()=>exportReportCSV(title,rows,model)}><Download size={14}/></button><button aria-label={`Expand ${title}`} onClick={()=>void (ref.current?.closest('.chart-surface') as HTMLElement)?.requestFullscreen?.().catch(()=>{})}><Maximize2 size={14}/></button></div>{table && <div className="table-scroll"><table><thead><tr>{columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{columns.map(c=><td key={c}>{String(r[c] ?? '—')}</td>)}</tr>)}</tbody></table></div>}</div>;
}
