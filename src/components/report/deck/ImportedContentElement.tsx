import {useState} from 'react';
import type {ReportEvidenceBlock} from '../../../report/model';
import {useChart, chartPalette, tooltipStyle} from './useChart';

/** Raw uploaded values retain their own labels and units, without governed metric formatting. */
export function ImportedContentElement({block}:{block:ReportEvidenceBlock}) {
  const [data,setData] = useState(false);
  const columns = block.columns ?? [], rows = block.rows ?? [];
  const numeric = columns.filter(c=>rows.some(r=>typeof r[c]==='number'));
  const label = columns.find(c=>!numeric.includes(c)) ?? columns[0];
  const metric = block.metricId && numeric.includes(block.metricId) ? block.metricId : numeric[0];
  const display = (v:unknown) => v == null ? 'Unavailable' : typeof v === 'number' ? v.toLocaleString('en-IN',{maximumFractionDigits:6}) : String(v);
  const {ref} = useChart(()=> {
    const palette = chartPalette();
    if (block.kind === 'heatmap') {
      const values = rows.flatMap((r,y)=>numeric.flatMap((c,x)=>typeof r[c]==='number'?[[x,y,r[c]]]:[]));
      const measured = values.map(v=>Number(v[2]));
      return {tooltip:{...tooltipStyle(),renderMode:'richText',formatter:(p:any)=>`${String(rows[p.value[1]][label])} · ${numeric[p.value[0]]}: ${display(p.value[2])}`},grid:{left:100,right:30,bottom:75,top:25},xAxis:{type:'category',data:numeric},yAxis:{type:'category',data:rows.map(r=>String(r[label]))},visualMap:{min:Math.min(...measured),max:Math.max(...measured),calculable:true,orient:'horizontal',left:'center',bottom:0,inRange:{color:['#eff6ff','#2563eb']}},series:[{type:'heatmap',data:values,label:{show:true}}]} as any;
    }
    if (block.kind !== 'chart') return null;
    return {color:palette.series,tooltip:{trigger:'axis',...tooltipStyle(),renderMode:'richText'},legend:{bottom:0},grid:{left:65,right:20,bottom:65,top:20},xAxis:{type:'category',data:rows.map(r=>String(r[label]))},yAxis:{type:'value'},series:numeric.map(c=>({name:c,type:block.chartType==='bar'?'bar':'line',areaStyle:block.chartType==='area'?{}:undefined,data:rows.map(r=>r[c])}))} as any;
  },[JSON.stringify(block)]);
  return <section className="source-block p57-imported-content" data-element-id={block.id}>
    <h3>{block.title}</h3>
    {block.kind==='text' && <p className="source-block-prose">{block.text}</p>}
    {block.kind==='metric' && <div className="p57-imported-metric"><span>{metric}</span><strong>{display(rows[0]?.[metric])}</strong></div>}
    {['chart','heatmap'].includes(block.kind) && <><div className="chart source-interactive-chart" ref={ref} role="img" aria-label={block.title}/><button className="button" data-export="omit" aria-expanded={data} onClick={()=>setData(v=>!v)}>View data</button></>}
    {(block.kind==='table'||data) && <div className="table-scroll source-native-table"><table><thead><tr>{columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{columns.map(c=><td key={c}>{display(row[c])}</td>)}</tr>)}</tbody></table></div>}
    <p className="source-evidence-caption">{block.description}</p>
    <details className="p57-imported-source"><summary>Uploaded evidence · {block.attachment?.name}</summary><p>Imported {block.attachment?.importedAt.slice(0,10)} · Separate from frozen studio datasets</p><pre>{block.attachment?.excerpt}</pre></details>
  </section>;
}
