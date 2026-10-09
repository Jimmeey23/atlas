import { DropdownField } from "./ui/DropdownField";
import {useState} from 'react';
import {fmt} from '../semantics/formats';
import {acquisitionPeriodLabel} from '../data/acquisition';
import type {Evidence,KraData} from './KraPerformance';
import {KraEditDialog,type EditResult} from './KraEditDialog';
import type {TopicRecord} from './KraComparisons';

type Achievement={primary:string;secondary?:string};
const shortTargets:Record<string,string>={upskilling:'Performance marketing',churn:'Churn down 10% YoY',growth:'Hire & fully train systems executive',trials:'First-session rates up 10% YoY',training:'Empathy, listening & soft skills',stability:'Revenue dip below 10% MoM',revenue:'Revenue up 10% YoY'};
const change=(current:number|null,baseline:number|null)=>current!=null&&baseline!=null&&baseline>0?current/baseline-1:null;
const money=(value:number|null)=>value==null?'Source review needed':fmt('revenue',value);
const rate=(value:number|null)=>value==null?'No eligible cohort':fmt('conversion_rate',value);
const passed=(value:number|null,target:number)=>value==null?'Baseline needed':value>=target-1e-12?'On track':'Lagging';
function Movement({value,inverse=false,label}:{value:number|null;inverse?:boolean;label?:string}) {
  if(value==null)return <span className="kra-score-muted">{label??'—'}</span>;
  const favourable=inverse?value<=0:value>=0;
  return <span className={'kra-score-movement '+(favourable?'is-positive':'is-negative')}>{value>0?'+':''}{fmt('conversion_rate',value)}</span>;
}
function Value({value}:{value:Achievement}){return <div className="kra-score-value"><strong>{value.primary}</strong>{value.secondary&&<small>{value.secondary}</small>}</div>;}
const drillTargets:Record<string,string>={revenue:'revenue',stability:'revenue',churn:'churn',trials:'acquisition',growth:'interviews',training:'teamTraining'};
export function KraScorecard({data,onSaved,onDrill}:{data:KraData;onSaved:(result:EditResult)=>void;onDrill?:(kind:string,month:string)=>void}) {
  const currentMonth=data.monthly.find(row=>row.month===data.asOf.slice(0,7))?.month??data.monthly.filter(row=>row.state!=='Upcoming').at(-1)?.month??data.monthly[0].month;
  const [period,setPeriod]=useState('review'),[editing,setEditing]=useState<string|null>(null);
  const review=period==='review';
  const month=data.monthly.find(row=>row.month===period)??data.monthly.find(row=>row.month===currentMonth)??data.monthly[0];
  const current=data.comparisonPeriods.current,last=data.comparisonPeriods.lastYear,preceding=data.comparisonPeriods.precedingMatched;
  const records=(data.evidence.marketingTopics??{}) as Record<string,TopicRecord>;
  const evidence=(id:string)=>data.evidence[id] as Evidence|undefined;
  const selectedMonth=month.month;
  const cutoff=month.state!=='Month to date'?new Date(Date.UTC(Number(selectedMonth.slice(0,4)),Number(selectedMonth.slice(5,7)),0)).toISOString().slice(0,10):data.asOf;
  const range=(from:string,to:string)=>`${acquisitionPeriodLabel(from)} – ${acquisitionPeriodLabel(to)}`;
  const previousMonth=new Date(Date.UTC(Number(selectedMonth.slice(0,4)),Number(selectedMonth.slice(5,7))-2,1)).toISOString().slice(0,7);
  const previousMonthEnd=new Date(Date.UTC(Number(previousMonth.slice(0,4)),Number(previousMonth.slice(5,7)),0)).toISOString().slice(0,10);
  const previousEnd=month.state==='Completed month'?previousMonthEnd:previousMonth+'-'+String(Math.min(Number(cutoff.slice(8)),Number(previousMonthEnd.slice(8)))).padStart(2,'0');
  const dates=review?[range(current.from,current.to),range(last.from,last.to),range(preceding.from,preceding.to)]:[range(period+'-01',cutoff),range(String(Number(period.slice(0,4))-1)+period.slice(4)+'-01',String(Number(period.slice(0,4))-1)+cutoff.slice(4)),range(previousMonth+'-01',previousEnd)];
  const amounts=review?[current.revenue,last.revenue,preceding.revenue]:[month.revenue,month.baselineRevenue,month.previousRevenue];
  const acquisition=review?[current,last,preceding]:[month.acquisition,month.baselineAcquisition,month.previousAcquisition];
  const trials=review?[current,last,preceding]:[month.trials,month.baselineTrials,month.previousTrials];
  const churn=review?[current.churnRate,last.churnRate,preceding.churnRate]:[month.churn.rate??month.churn.observedRate,month.matchedBaselineChurn.observedRate,month.previousMatchedChurn.observedRate];
    const completedAt=(to:string)=>data.trainingTopics.filter(topic=>records[topic.id]?.status==='Completed'&&records[topic.id].date<=to).length;
  const reviewLabel=`${acquisitionPeriodLabel(current.from)} – ${acquisitionPeriodLabel(current.to)} · KRA to date`;
  const interviews=review?data.interviews:month.interviews;
  const teamTraining=review?data.teamTraining:month.teamTraining;
  const revenueGrowth=change(amounts[0],amounts[1]),revenuePrevious=change(amounts[0],amounts[2]);
  const scheduledGrowth=change(trials[0].scheduledRate,trials[1].scheduledRate),completedGrowth=change(trials[0].completedRate,trials[1].completedRate);
  const provisional=!review&&month.state!=='Completed month';
  const rows=data.definitions.map(definition=>{
    const saved=evidence(definition.id);
    let values:Achievement[]=[{primary:'Not recorded'},{primary:'Not recorded'},{primary:'Not recorded'}];
    let yoy:number|null=null,prior:number|null=null,state=saved?.status??'Not recorded',explanation=saved?.note||'Record completed milestones in Actions & supporting evidence below.';
    let secondGrowth:[number|null,number|null]|null=null;
    if(definition.id==='revenue'||definition.id==='stability'){
      values=amounts.map(value=>({primary:money(value),secondary:'Collected revenue'}));yoy=revenueGrowth;prior=revenuePrevious;
      state=definition.id==='revenue'?passed(yoy,.1):review?data.trajectories.stability:prior==null?'Baseline needed':prior>-.1+1e-12?'On track':'Lagging';
      const narrative=review?data.explanations[definition.id]:month.explanations.revenue;
      explanation=narrative?.finding??'Comparison follows recorded payment collections.';
      if(definition.id==='stability')explanation=review?'Monthly revenue dips are checked against the 10% limit. '+data.explanations.stability.finding:`${prior==null?'The preceding revenue baseline needs review.':prior>=0?'Collections grew against the preceding period.':`Collections retained ${fmt('conversion_rate',1+prior)} of the preceding period level.`} The target allows a dip below 10%.`;
    }else if(definition.id==='trials'){
      values=acquisition.map(value=>({primary:`${value.trials} trials · ${value.referrals} referrals`,secondary:'New sheet · Is New rows'}));
      yoy=change(acquisition[0].trials,acquisition[1].trials);prior=change(acquisition[0].trials,acquisition[2].trials);secondGrowth=[change(acquisition[0].referrals,acquisition[1].referrals),change(acquisition[0].referrals,acquisition[2].referrals)];
      state=scheduledGrowth==null||completedGrowth==null?'Baseline needed':scheduledGrowth>=.1-1e-12&&completedGrowth>=.1-1e-12?'On track':'Lagging';
      explanation=`Trials: Is New contains new. Referrals: Is New exactly New - Referral Class. Growth shows trial / referral row counts. The approved KRA status follows lead-to-first-session rates: ${rate(trials[0].scheduledRate)} scheduled / ${rate(trials[0].completedRate)} completed.`;
      if(!review&&(month.state!=='Completed month'||month.trialsTarget==null))explanation+=' Observation window remains open.';
    }else if(definition.id==='churn'){
      const cohorts=review?[current,last,preceding]:[month.churn,month.matchedBaselineChurn,month.previousMatchedChurn];
      values=churn.map((value,index)=>({primary:rate(value),secondary:`${cohorts[index].lapsed} / ${cohorts[index].due} membership records`}));yoy=change(churn[0],churn[1]);prior=change(churn[0],churn[2]);state=passed(yoy==null?null:-yoy,.1);
      explanation=review?data.explanations.churn.finding:`${month.churn.lapsed} recorded churns from ${month.churn.due} eligible expiry records. Zero-value, frozen and excluded membership names are out of the cohort; blank Churned Dates are never counted as churn. Lower is better.${month.churn.missingDates?` ${month.churn.missingDates} Lapsed-status records need a Churned Date review.`:''}`;
    }else if(definition.id==='upskilling'){
      const total=data.trainingTopics.length,periodCompleted=completedAt(review?data.asOf:cutoff);
      values=[{primary:`${periodCompleted} / ${total} topics`,secondary:'Manually marked complete'},{primary:'Not recorded'},{primary:'Not recorded'}];
      state=periodCompleted===total&&total>0?'Completed':periodCompleted>0?'In progress':'Not started';explanation=saved?.note||'Mark completed performance-marketing topics in the training checklist below.';
    }else if(definition.id==='growth'){
      const progress=saved?.checks.length??0;
      const levels=`L1 ${interviews.level1} · L2 ${interviews.level2} · L3 ${interviews.level3}`;
      values=[{primary:`${interviews.interviews} interviews · ${interviews.candidates} candidates`,secondary:interviews.upcoming?`${levels} · ${interviews.upcoming} scheduled ahead`:levels},
{primary:'Not recorded',secondary:'No prior-year interview record'},{primary:'Not recorded',secondary:'No preceding-period interview record'}];
      state=saved?.status??(interviews.interviews?'In progress':'Not started');
      explanation=`Systems Executive (Automation Analyst) interviews recorded on the calendar for this period: ${interviews.interviews} across ${interviews.candidates} candidates (${levels}${interviews.inPerson?`, ${interviews.inPerson} in person`:''}), ${Math.round(interviews.minutes/60*10)/10} interview hours${interviews.upcoming?`, with ${interviews.upcoming} further interview${interviews.upcoming>1?'s':''} already scheduled in the period`:''}. Hire and full training completion still require the dated milestone evidence below: ${progress} / 2 milestones recorded.`;
    }else if(definition.id==='training'){
      const progress=saved?.checks.length??0,hours=Math.round(teamTraining.minutes/60*10)/10;
      values=[{primary:`${teamTraining.sessions} sessions · ${hours} hours`,secondary:`${teamTraining.teamTraining} team · ${teamTraining.adminOperations} admin operations`},
        {primary:'Not recorded',secondary:'No prior-year session record'},{primary:'Not recorded',secondary:'No preceding-period session record'}];
      state=saved?.status??(teamTraining.sessions?'In progress':'Not started');
      explanation=`${teamTraining.sessions} team training sessions delivered in this period (${hours} hours, ${teamTraining.inPerson} in person)${teamTraining.lastSession?`, most recently on ${acquisitionPeriodLabel(teamTraining.lastSession)}`:''}. Empathy, active-listening and soft-skills milestones are tracked separately: ${progress} / 3 recorded.`;
    }else{
      const progress=saved?.checks.length??0,total=3;
      const withinPeriod=review||!saved?.date||saved.date<=cutoff;
      values[0]={primary:withinPeriod?`${progress} / ${total} milestones`:'Not recorded',secondary:withinPeriod?saved?.status??'Not started':'No dated evidence'};state=withinPeriod?saved?.status??'Not started':'Not recorded';
      if(!withinPeriod)explanation='The recorded milestone evidence is dated after this period.';
    }
    const pending=!review&&month.state==='Upcoming';
    if(pending){values=[{primary:'Upcoming'},{primary:'—'},{primary:'—'}];state='Upcoming';yoy=null;prior=null;secondGrowth=null;explanation='This review month has not started.';}
    const source={current:values[0].primary,lastYear:values[1].primary,preceding:values[2].primary,status:state,explanation};
    const edit=data.scorecardEdits[period+'/'+definition.id];
    if(definition.targetEdited&&!edit?.status){state='Review needed';explanation+=' Target was edited; set the status against your revised target.';}
    const manual=!!edit&&[edit.current,edit.lastYear,edit.preceding,edit.yoy,edit.previousGrowth,edit.status,edit.explanation].some(value=>value!=null);
    if(edit){
      [edit.current,edit.lastYear,edit.preceding].forEach((value,index)=>{if(value!=null)values[index]={primary:value,secondary:'Manually entered'};});
      if(edit.current!=null||edit.lastYear!=null){yoy=null;secondGrowth=null;}
      if(edit.current!=null||edit.preceding!=null){prior=null;secondGrowth=null;}
      if(edit.current!=null||edit.lastYear!=null||edit.preceding!=null)state='Review needed';
      if(edit.yoy!=null){yoy=edit.yoy;secondGrowth=null;}if(edit.previousGrowth!=null){prior=edit.previousGrowth;secondGrowth=null;}
      if(edit.status!=null)state=edit.status;if(edit.explanation!=null)explanation=edit.explanation;
    }
    return {definition,values,yoy,prior,state,explanation,secondGrowth,source,edit,manual,provisional:!manual&&!pending&&definition.kind==='data'&&(provisional||definition.id==='churn'&&!review&&!month.churn.final||definition.id==='trials'&&!review&&month.trialsTarget==null)};
  });
  const edited=rows.find(row=>row.definition.id===editing);
  const totalWeight=data.definitions.reduce((sum,definition)=>sum+definition.weight,0);
  const onTrack=rows.filter(row=>row.state==='On track'||row.state==='Completed').length;
  return <section className="kra-panel kra-scorecard" aria-label="KRA performance scorecard">
    <header><div><h3>KRA performance</h3><p>One view of achievement, change and progress.</p></div><label className="kra-period-control">Period<DropdownField aria-label="Scorecard period" value={period} onChange={event=>setPeriod(event.target.value)}><option value="review">{reviewLabel}</option>{data.monthly.map(row=><option key={row.month} value={row.month}>{acquisitionPeriodLabel(row.month)}{row.state==='Month to date'?' · MTD':''}</option>)}</DropdownField></label></header>
    <div className="kra-score-periods"><span><i/> {review?'KRA period to date':month.state==='Month to date'?'Selected month · to date':'Selected month'} <strong>{dates[0]}</strong></span><span>Same period last year <strong>{dates[1]}</strong></span><span>Preceding period · matched length <strong>{dates[2]}</strong></span></div>
    <div className="table-scroll"><table className="kra-score-table"><colgroup><col className="kra-col-name"/><col className="kra-col-current"/><col className="kra-col-history"/><col className="kra-col-change"/><col className="kra-col-history"/><col className="kra-col-change"/><col className="kra-col-status"/><col className="kra-col-explanation"/></colgroup><thead><tr>{['KRA',review?'KRA period to date':month.state==='Month to date'?'Selected month · MTD achievement':'Selected month achievement',review?'Same period last year':'Same month last year · MTD','Growth / degrowth',review?'Preceding period · matched':'Previous month · MTD','Growth / degrowth','Status','Explanation'].map((label,index)=><th key={index}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.definition.id}>
      <td><strong>{row.definition.area}</strong><span className="kra-score-weight">{row.definition.weight}% weight</span><small title={row.definition.target}>{row.definition.manual?row.definition.target:shortTargets[row.definition.id]}</small><div className="kra-row-actions"><button className="kra-edit-row" onClick={()=>setEditing(row.definition.id)}>Edit / notes</button>{onDrill&&drillTargets[row.definition.id]&&<button className="kra-edit-row kra-drill-row" onClick={()=>onDrill(drillTargets[row.definition.id],period)}>View records</button>}</div>{(row.manual||row.definition.manual)&&<span className="kra-manual-tag">Manual edit</span>}</td>
      <td><Value value={row.values[0]}/></td><td><Value value={row.values[1]}/></td>
      <td><Movement value={row.yoy} inverse={row.definition.id==='churn'}/>{row.secondGrowth&&<small className="kra-score-second"><Movement value={row.secondGrowth[0]}/></small>}</td>
      <td><Value value={row.values[2]}/></td><td><Movement value={row.prior} inverse={row.definition.id==='churn'}/>{row.secondGrowth&&<small className="kra-score-second"><Movement value={row.secondGrowth[1]}/></small>}</td>
      <td><span className={'kra-status-pill '+(row.state==='On track'||row.state==='Completed'?'is-positive':row.state==='Lagging'?'is-negative':'is-neutral')}>{row.state}</span>{row.provisional&&<small className="kra-score-provisional">Provisional</small>}</td>
      <td className="kra-score-explanation">{row.explanation}{row.edit?.note&&<div className="kra-saved-note"><strong>Note</strong>{row.edit.note}</div>}{row.edit?.annotation&&<div className="kra-saved-note"><strong>Annotation</strong>{row.edit.annotation}</div>}{row.definition.id==='churn'&&<a className="kra-churn-source" href={data.churnSource.url} target="_blank" rel="noreferrer">Source: Lapsed · Churned Date</a>}{evidence(row.definition.id)?.note&&row.definition.kind==='data'&&<details><summary>Actions recorded</summary><p>{evidence(row.definition.id)?.note}</p></details>}</td>
    </tr>)}</tbody><tfoot><tr><td>Total · {totalWeight}% weight</td><td>{money(amounts[0])}<small>Source revenue total</small></td><td>{money(amounts[1])}<small>Source revenue total</small></td><td><Movement value={revenueGrowth}/></td><td>{money(amounts[2])}<small>Source revenue total</small></td><td><Movement value={revenuePrevious}/></td><td>{onTrack} / 7 on track</td><td>Rates use their own cohort totals. Final review remains open.</td></tr></tfoot></table></div>
    <p className="kra-score-note">Comparisons use matching elapsed days and observation windows. Historical training milestones require recorded evidence. Saved edits are labelled; source totals remain source-backed.</p>
    {!!data.scorecardHistory.length&&<details className="kra-edit-history"><summary>Saved changes · {data.scorecardHistory.length} revisions</summary><button className="button" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({definitions:data.definitions,edits:data.scorecardEdits,history:data.scorecardHistory},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='jimmeey-kra-saved-edits.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Download saved edits</button>{[...data.scorecardHistory].reverse().map(entry=><article key={entry.id}><strong>{entry.info.area} · {entry.key.split('/')[0]==='review'?'Review to date':acquisitionPeriodLabel(entry.key.split('/')[0])}</strong><time>{new Date(entry.updatedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</time><p>{entry.after.note||entry.after.annotation||'KRA information or figures updated.'}</p><details><summary>View revision</summary><dl className="kra-revision-fields">{([['current','Current achievement'],['lastYear','Last-year achievement'],['preceding','Preceding achievement'],['yoy','Growth vs last year'],['previousGrowth','Growth vs preceding'],['status','Status'],['explanation','Explanation'],['note','Notes'],['annotation','Annotations']] as const).filter(([key])=>entry.before?.[key]!==entry.after[key]).map(([key,label])=><div key={key}><dt>{label}</dt><dd><span>{entry.before?.[key]==null?'Source value':key==='yoy'||key==='previousGrowth'?fmt('conversion_rate',entry.before[key]):String(entry.before[key])}</span><strong>→</strong><span>{entry.after[key]==null?'Source value':key==='yoy'||key==='previousGrowth'?fmt('conversion_rate',entry.after[key]):String(entry.after[key])}</span></dd></div>)}</dl></details></article>)}</details>}
    {edited&&<KraEditDialog key={period+'/'+editing} period={period} definition={edited.definition} saved={edited.edit} source={edited.source} onSaved={onSaved} onClose={()=>setEditing(null)}/>}
  </section>;
}
