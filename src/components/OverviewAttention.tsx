import { ArrowUpRight, CircleAlert, Clock3, Sparkles, Users, TrendingUp, Database } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Insight } from '../insights/rules';
import type { Row } from '../data/duckdb';
import { fmt } from '../semantics/formats';
import { tabs, useStore } from '../state/store';
import { Register } from './Register';

const tones = {
  critical: { label: 'Priority', color: 'var(--neg)', Icon: CircleAlert },
  attention: { label: 'Review', color: 'var(--risk)', Icon: Clock3 },
  opportunity: { label: 'Opportunity', color: 'var(--growth)', Icon: TrendingUp },
  context: { label: 'In focus', color: 'var(--attendance)', Icon: Sparkles },
};
const fallback = [
  {id:'empty_sessions',tab:2,title:'Sessions without attendance',detail:'Review the contributing slots before repeating the timetable. Counts include only recorded sessions in this scope.'},
  {id:'fill_rate',tab:2,title:'Capacity being used',detail:'Weighted attended seats divided by recorded capacity. Inspect low-fill slots alongside demand and timing.'},
  {id:'conversion_rate',tab:5,title:'Newcomers becoming members',detail:'Recorded converted trials divided by all newcomer trials in this cohort. Review non-converters and their stated barriers.'},
  {id:'complimentary_visits',tab:1,title:'Complimentary visits',detail:'Recorded visit counts from Sessions.Complimentary. Review the complimentary mix alongside paid attendance and yield.'},
];
export function OverviewAttention({signals,total}:{signals:Insight[];total:Row}) {
  const set = useStore(s=>s.set);
  const selected = signals.filter((item,index,all)=>all.slice(0,index).filter(prior=>prior.rule===item.rule).length<2).slice(0,6);
  const items = selected.length ? selected.map(item=>({id:item.rule+item.entity,title:item.title,entity:item.entity,detail:item.template,severity:item.severity,n:item.n,tab:item.tab,filters:item.linkFilters,value:''})) : fallback.filter(item=>total[item.id]!=null).map(item=>({...item,entity:tabs[item.tab],severity:'context' as const,n:null,filters:[],value:fmt(item.id,total[item.id])}));
  return <Register index="04" title="Worth your attention" subtitle="Source-backed decisions across demand, sales and member retention">
    <div className="overview-attention">
      <div className="attention-summary"><span><span className="attention-live-dot"/>Your next decisions</span><span>{items.length} {selected.length ? 'evidence-backed signals' : 'source measures'}</span></div>
      <div className="attention-grid">{items.map(item=>{
        const tone=tones[item.severity];
        const Icon = /response|time|slot/i.test(item.title) ? Clock3 : /member|visit|return/i.test(item.title) ? Users : tone.Icon;
        return <article className="attention-card" key={item.id} style={{'--attention-tone':tone.color} as CSSProperties}>
          <div className="attention-card-top"><span className="attention-symbol"><Icon size={17} strokeWidth={1.8}/></span><span className="attention-priority">{tone.label}</span></div>
          <span className="attention-entity" title={item.entity}>{item.entity}</span>
          <h3>{item.title}</h3>{item.value&&<strong className="attention-value">{item.value}</strong>}
          <p>{item.detail}</p>
          <footer><span className="attention-source"><Database size={12}/>{item.n==null ? 'Source-derived' : `${item.n.toLocaleString('en-IN')} records`}</span><button onClick={()=>set({tab:item.tab,transient:item.filters})} aria-label={`Review evidence: ${item.title} · ${item.entity}`}>Review <ArrowUpRight size={14}/></button></footer>
        </article>;
      })}</div>
      {!items.length&&<p className="small">Source measures will appear when this scope has available data.</p>}
    </div>
  </Register>;
}
