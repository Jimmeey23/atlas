import {useState} from 'react';
import {fmt} from '../semantics/formats';
import {acquisitionPeriodLabel} from '../data/acquisition';
export type EntryType={value:string;rows:number;trial:boolean;referral:boolean};
export type Period={trials:number;referrals:number;trialsOnly:number;overlap:number;newRows:number;entryTypes:EntryType[];from:string;to:string;revenue:number|null;saleItems:number;knownSales:number;knownItems:number;averageItemValue:number|null;members:number;leads:number;scheduled:number;completed:number;scheduledRate:number|null;completedRate:number|null;due:number;matureDue:number;renewed:number;unrecorded:number;missingDates:number;lapsed:number;churnRate:number|null;grace:number};
export type Explanation={finding:string;basis:string;action:string};
export type Topic={id:string;category:string;title:string};
export type TopicRecord={status:string;note:string;date:string;basis?:string};
export type ChurnMaturity={settleDays:number;boundary:string;settled:{due:number;lapsed:number;rate:number|null};settling:{due:number;lapsed:number;rate:number|null};gap:number|null};
export function KraPeriodComparisons({periods,trajectories,explanations,maturity}:{periods:Record<string,Period>;trajectories:Record<string,string>;explanations:Record<string,Explanation>;maturity:ChurnMaturity}) {
  const rows:[keyof Period,string,string,string][]=[
    ['revenue','Revenue collected','currency','revenue'],['saleItems','Paid item lines','count','revenue'],['averageItemValue','Average payment-item value','currency','revenue'],['members','Identified paying members','count','revenue'],
    ['leads','Lead cohort','count','trials'],['scheduled','First class scheduled','count','trials'],['completed','First class completed','count','trials'],['scheduledRate','Lead → scheduled rate','percent','trials'],['completedRate','Lead → completed rate','percent','trials'],
    ['trials','Trial rows (Is New contains new)','count','trials'],['referrals','Referral rows (Is New = New - Referral Class)','count','trials'],['overlap','Rows counted as both trial and referral','count','trials'],['trialsOnly','Trial rows that are not referrals','count','trials'],
    ['due','Eligible membership expiries','count','churn'],['lapsed','Recorded churns','count','churn'],['churnRate','Churn rate','percent','churn'],
  ];
  function display(value:unknown,type:string){return value==null?type==='percent'?'No eligible denominator':'Source reconciliation required':fmt(type==='currency'?'revenue':type==='percent'?'conversion_rate':'new_clients',value);}
  function Delta({value,previous,inverse}:{value:unknown;previous:unknown;inverse?:boolean}) {
    if(value==null||previous==null)return <span className="kra-score-muted">Source reconciliation</span>;
    if(Number(previous)===0)return <span className="kra-score-muted">{Number(value)===0?'No movement (both 0)':'New baseline'}</span>;
    const movement=Number(value)/Number(previous)-1, favourable=inverse?movement<=0:movement>=0;
    return <span className={'kra-score-movement '+(favourable?'is-positive':'is-negative')}>{movement>0?'+':''}{fmt('conversion_rate',movement)}</span>;
  }
  const mtd=periods.current,lastYear=periods.lastYear,previous=periods.precedingMatched;
  return <section className="kra-panel kra-compare">
    <header><div><h3>KRA period comparison</h3><p className="small">{acquisitionPeriodLabel(mtd.from)} – {acquisitionPeriodLabel(mtd.to)} against the identical calendar window last year and the preceding period of equal elapsed length. Not a single-month view.</p></div></header>
    <div className="kra-comparison-ranges">{[['current','KRA period to date'],['lastYear','Same period last year'],['precedingMatched','Preceding period · matched length'],['ytd','Year to date']].map(([key,label])=><div key={key}><strong>{label}</strong><span>{acquisitionPeriodLabel(periods[key].from)} – {acquisitionPeriodLabel(periods[key].to)}</span><b>{fmt('revenue',periods[key].revenue)}</b></div>)}</div>
    <div className="table-scroll"><table className="kra-compare-table"><thead><tr>{['Metric','KRA period to date','Same period last year','Vs last year','Preceding period · matched','Vs preceding period','Trajectory'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(([key,label,type,area])=><tr key={key}><td>{label}</td><td className="kra-compare-lead">{display(mtd[key],type)}</td><td>{display(lastYear[key],type)}</td><td><Delta value={mtd[key]} previous={lastYear[key]} inverse={area==='churn'}/></td><td>{display(previous[key],type)}</td><td><Delta value={mtd[key]} previous={previous[key]} inverse={area==='churn'}/></td><td><span className={'kra-trajectory '+(trajectories[area]==='On track'?'positive':'attention')}>{trajectories[area]}</span></td></tr>)}</tbody><tfoot><tr><td>Matched window</td><td colSpan={6}>Equal elapsed length on every column · rates use their own denominators · no future revenue included</td></tr></tfoot></table></div>
    <div className="table-scroll"><table className="kra-compare-table"><thead><tr>{['Year-to-date churn','1 Jan – as of','Same window last year','Change vs LY','Reduction vs LY','Trajectory'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>
      <tr><td>Eligible membership expiries</td><td className="kra-compare-lead">{display(periods.ytd.due,'count')}</td><td>{display(periods.ytdLastYear.due,'count')}</td><td><Delta value={periods.ytd.due} previous={periods.ytdLastYear.due}/></td><td>—</td><td rowSpan={3}><span className={'kra-trajectory '+(trajectories.churnYtd==='On track'?'positive':'attention')}>{trajectories.churnYtd}</span></td></tr>
      <tr><td>Recorded churns</td><td className="kra-compare-lead">{display(periods.ytd.lapsed,'count')}</td><td>{display(periods.ytdLastYear.lapsed,'count')}</td><td><Delta value={periods.ytd.lapsed} previous={periods.ytdLastYear.lapsed} inverse/></td><td>—</td></tr>
      <tr><td>Churn rate</td><td className="kra-compare-lead">{display(periods.ytd.churnRate,'percent')}</td><td>{display(periods.ytdLastYear.churnRate,'percent')}</td><td><Delta value={periods.ytd.churnRate} previous={periods.ytdLastYear.churnRate} inverse/></td><td>{periods.ytd.churnRate==null||!periods.ytdLastYear.churnRate?'No eligible denominator':fmt('conversion_rate',1-Number(periods.ytd.churnRate)/Number(periods.ytdLastYear.churnRate))}</td></tr>
    </tbody><tfoot><tr><td>YTD window</td><td colSpan={5}>{acquisitionPeriodLabel(periods.ytd.from)} – {acquisitionPeriodLabel(periods.ytd.to)} vs {acquisitionPeriodLabel(periods.ytdLastYear.from)} – {acquisitionPeriodLabel(periods.ytdLastYear.to)} · zero-value, frozen and excluded membership names removed from both sides</td></tr></tfoot></table></div>
    <div className="kra-churn-maturity"><h4>Churn settles as cohorts mature</h4><div>{[['Settled cohorts · '+maturity.settleDays+'+ days observed',maturity.settled],['Still settling · expired since '+acquisitionPeriodLabel(maturity.boundary),maturity.settling]].map(([label,bucket])=>{const value=bucket as ChurnMaturity['settled'];return <article key={String(label)}><strong>{String(label)}</strong><b>{value.rate==null?'No eligible denominator':fmt('conversion_rate',value.rate)}</b><span>{value.lapsed} churned of {value.due} eligible expiries</span></article>;})}</div><p className="small">Renewals and reactivations are written back weeks after an expiry, so the newest cohorts always read highest and the rate falls as they settle. The settled figure is the fairer read of retention already delivered; the headline rate above stays conservative and is never adjusted or forecast.</p></div>
    <div className="kra-explanation-grid">{Object.entries(explanations).map(([key,explanation])=><article key={key}><h4>{key==='stability'?'Revenue stability':key==='revenue'?'Revenue growth':key==='churn'?'Churn reduction':'Trials & referrals'}</h4><strong className={'kra-trajectory '+(trajectories[key]==='On track'?'positive':'attention')}>{trajectories[key]}</strong><p>{explanation.finding}</p><p className="small">{explanation.basis}</p><p><b>Suggested next steps: </b>{explanation.action}</p></article>)}</div>
  </section>;
}
export function MarketingCurriculum({topics,records,onSaved}:{topics:Topic[];records:Record<string,TopicRecord>;onSaved:(id:string,record:TopicRecord)=>void}) {
  const [filter,setFilter]=useState('Pending'),[busy,setBusy]=useState(''),[error,setError]=useState(''),[selected,setSelected]=useState<string[]>([]);
  const isCompleted=(id:string)=>records[id]?.status==='Completed';
  const completed=topics.filter(topic=>isCompleted(topic.id)).length;
  const visible=topics.filter(topic=>filter==='All'||(filter==='Completed'?isCompleted(topic.id):!isCompleted(topic.id)));
  const chosen=selected.filter(id=>visible.some(topic=>topic.id===id));
  const allChosen=!!visible.length&&chosen.length===visible.length;
  async function update(id:string,status:string){setBusy(id);setError('');try{const response=await fetch('/api/kra/training/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,note:records[id]?.note??''})});const result=await response.json();if(!response.ok)throw Error(result.error);onSaved(id,result);}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy('');}}
  // One queued write for the whole selection, so a bulk change cannot leave topics half-applied.
  async function updateMany(ids:string[],status:string){
    if(!ids.length)return;setBusy('bulk');setError('');
    try{
      const response=await fetch('/api/kra/training',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids,status})});
      const result=await response.json();if(!response.ok)throw Error(result.error);
      Object.entries(result as Record<string,TopicRecord>).forEach(([id,record])=>onSaved(id,record));
      setSelected([]);
    }catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy('');}
  }
  const toggle=(id:string)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
  return <section className="kra-panel"><header><h3>Performance marketing training · topic checklist</h3><strong>{completed} / {topics.length} completed · {topics.length?Math.round(completed/topics.length*100):0}%</strong></header>
    <p className="small">Mark your completed topics manually. Progress is saved with the date you report it; nothing is pre-marked.</p>
    <div className="acq-metric-tabs kra-topic-toggle">{[['Completed',completed],['Pending',topics.length-completed],['All',topics.length]].map(([value,count])=><button key={String(value)} aria-pressed={filter===value} onClick={()=>setFilter(String(value))}>{value}<span className="kra-topic-count">{count}</span></button>)}</div>
    <div className="kra-bulk-bar">
      <label><input type="checkbox" aria-label="Select all visible topics" checked={allChosen} ref={node=>{if(node)node.indeterminate=!!chosen.length&&!allChosen;}} onChange={event=>setSelected(event.target.checked?visible.map(topic=>topic.id):[])}/> Select all visible</label>
      <span className="kra-bulk-count">{chosen.length} selected of {visible.length} shown</span>
      <div className="kra-bulk-actions">{['Completed','In progress','Not started'].map(status=><button key={status} className="button" disabled={!chosen.length||busy==='bulk'} onClick={()=>void updateMany(chosen,status)}>{busy==='bulk'?'Saving…':'Mark '+status.toLowerCase()}</button>)}
        <button className="button" disabled={!visible.length||busy==='bulk'} onClick={()=>void updateMany(visible.map(topic=>topic.id),'Completed')}>Mark all {filter==='All'?'topics':filter.toLowerCase()} completed</button>
        <button className="button" disabled={!chosen.length} onClick={()=>setSelected([])}>Clear selection</button>
      </div>
    </div>
    {error&&<p role="alert">{error}</p>}<div className="table-scroll"><table className="kra-topic-table"><thead><tr>{['','Topic','Category','Progress','Reported date','Action'].map((label,index)=><th key={index}>{label}</th>)}</tr></thead><tbody>{visible.map(topic=><tr key={topic.id} className={chosen.includes(topic.id)?'kra-selected':''}><td><input type="checkbox" aria-label={'Select '+topic.title} checked={chosen.includes(topic.id)} onChange={()=>toggle(topic.id)}/></td><td className="kra-wrap">{topic.title}</td><td>{topic.category}</td><td>{records[topic.id]?.status??'Not started'}</td><td>{records[topic.id]?.date?acquisitionPeriodLabel(records[topic.id].date):'Not yet reported'}</td><td><select aria-label={'Progress for '+topic.title} disabled={busy===topic.id||busy==='bulk'} value={records[topic.id]?.status??'Not started'} onChange={event=>void update(topic.id,event.target.value)}>{['Not started','In progress','Completed'].map(value=><option key={value}>{value}</option>)}</select></td></tr>)}</tbody><tfoot><tr><td/><td>Total training topics</td><td>{topics.length}</td><td>{completed} completed</td><td colSpan={2}>Manually reported progress · upskilling weight 10%</td></tr></tfoot></table>{!visible.length&&<p className="muted">No topics in this view.</p>}</div>
  </section>;
}
