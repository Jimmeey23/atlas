import {Fragment,useEffect,useMemo,useState} from 'react';
import {ChevronDown,ChevronRight,Users} from 'lucide-react';
import {query,quote,type Row} from '../data/duckdb';
import {where,today} from '../data/analytics';
import {acquisitionAggregate,acquisitionFactsSQL,acquisitionDimensions,acquisitionMeasures} from '../data/acquisition';
import type {AcquisitionDrillRequest} from '../data/acquisition-reference';
import {useStore} from '../state/store';
import {fmt} from '../semantics/formats';
import {AcquisitionTableShell} from './AcquisitionTableShell';

const typeSQL="COALESCE(entry_type,'Unspecified')";
const membershipSQL=acquisitionDimensions.find(d=>d.key==='membership')!.sql;
const experienceSQL=acquisitionDimensions.find(d=>d.key==='experience')!.sql;
const metricGroups:Record<string,string[]>={
  outcomes:['cohort_rows','unique_members','newcomers','converted_members','retained_members','conversion_rate','retention_rate','converted_30','retained_30','second_visit_rate'],
  value:['avg_ltv','total_ltv','avg_spend','first_purchase','post_trial_ltv','purchases_post'],
  timing:['conversion_span','median_span','visits_post','source_visits','mature_30','conversion_30_rate','retention_30_rate','converted_same_month','retained_same_month','conversion_same_month_rate','retention_same_month_rate'],
};
function display(key:string,value:unknown){
  const measure=acquisitionMeasures.find(m=>m[0]===key)!;
  return value==null?'—':measure[2]==='decimal'?Number(value).toFixed(1):fmt(measure[2]==='currency'?'avg_ltv':measure[2]==='percent'?'conversion_rate':measure[2]==='days'?'avg_conversion_span':'new_clients',value);
}
export function AcquisitionClientTypes({version,onDrill}:{version:number;onDrill:(request:AcquisitionDrillRequest)=>void}) {
  const filters=useStore(s=>s.filters),transient=useStore(s=>s.transient);
  const scope=where(filters,'new',transient);
  const [rows,setRows]=useState<Row[]>([]),[allTypes,setAllTypes]=useState<string[]>([]),[selected,setSelected]=useState<string[]|null>(null),[expanded,setExpanded]=useState<string[]>([]),[metricGroup,setMetricGroup]=useState('outcomes'),[metric,setMetric]=useState('all'),[search,setSearch]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[sort,setSort]=useState({key:'cohort_rows',desc:true});
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    const selection=selected==null?'':selected.length?`WHERE type_label IN (${selected.map(quote).join(',')})`:'WHERE FALSE';
    const sql=`WITH facts AS (${acquisitionFactsSQL(scope,today())}), labelled AS (SELECT *,${typeSQL} AS type_label,${membershipSQL} AS membership_label,${experienceSQL} AS experience_label FROM facts) SELECT type_label,membership_label,experience_label,GROUPING(type_label) AS is_total,GROUPING(membership_label) AS is_type,GROUPING(experience_label) AS is_membership,${acquisitionAggregate} FROM labelled ${selection} GROUP BY GROUPING SETS ((type_label),(type_label,membership_label),(type_label,membership_label,experience_label),())`;
    Promise.all([query(sql),query(`SELECT DISTINCT ${typeSQL} AS label FROM new ORDER BY label`)]).then(([data,types])=>{if(active){setRows(data);setAllTypes(types.map(row=>String(row.label)));setLoading(false);}}).catch(error=>{if(active){setError(String(error));setLoading(false);}});
    return()=>{active=false;};
  },[scope,version,selected]);
  const measures=acquisitionMeasures.filter(m=>metric!=='all'?m[0]===metric:metricGroup==='all'||metricGroups[metricGroup].includes(m[0]));
  const parentMap=useMemo(()=>new Map(rows.filter(row=>!row.is_total&&row.is_type).map(row=>[String(row.type_label),row])),[rows]);
  const parents=allTypes.filter(value=>(selected==null||selected.includes(value))&&value.toLowerCase().includes(search.toLowerCase())).map(value=>parentMap.get(value)??{type_label:value,cohort_rows:0,unique_members:0,newcomers:0,converted_members:0,retained_members:0,is_type:1,is_membership:1}).sort((a,b)=>{const av=a[sort.key],bv=b[sort.key];const d=typeof av==='number'&&typeof bv==='number'?av-bv:String(av??'').localeCompare(String(bv??''));return sort.desc?-d:d;});
  const total=rows.find(row=>row.is_total);
  const memberships=useMemo(()=>{const map=new Map<string,Row[]>();rows.filter(row=>!row.is_total&&!row.is_type&&row.is_membership).forEach(row=>{const key=String(row.type_label);if(!map.has(key))map.set(key,[]);map.get(key)!.push(row);});return map;},[rows]);
  const experiences=useMemo(()=>{const map=new Map<string,Row[]>();rows.filter(row=>!row.is_total&&!row.is_type&&!row.is_membership).forEach(row=>{const key=JSON.stringify([row.type_label,row.membership_label]);if(!map.has(key))map.set(key,[]);map.get(key)!.push(row);});return map;},[rows]);
  const id=(row:Row)=>JSON.stringify([row.type_label,row.is_type?null:row.membership_label]);
  function toggle(key:string){setExpanded(values=>values.includes(key)?values.filter(value=>value!==key):[...values,key]);}
  function drill(row:Row,key?:string){
    const parts:string[]=[];
    if(!row.is_total){parts.push(`${typeSQL}=${quote(String(row.type_label))}`);if(!row.is_type)parts.push(`${membershipSQL}=${quote(String(row.membership_label))}`);if(!row.is_membership)parts.push(`${experienceSQL}=${quote(String(row.experience_label))}`);}
    else if(selected!=null)parts.push(selected.length?`${typeSQL} IN (${selected.map(quote).join(',')})`:'FALSE');
    onDrill({title:`By client type · ${row.is_total?'Selected types · total':[row.type_label,!row.is_type&&row.membership_label,!row.is_membership&&row.experience_label].filter(Boolean).join(' · ')}`,scope,predicate:parts.join(' AND '),metric:key});
  }
  function cells(row:Row){return measures.map(m=><td key={m[0]}><button className="acq-cell-button" title={`Inspect ${m[1]}`} onClick={()=>drill(row,m[0])}>{display(m[0],row[m[0]])}</button></td>);}
  return <AcquisitionTableShell title="By client type · detailed acquisition outcomes" icon={Users} count={parents.length} description="Every unique Is New value in the New sheet. Expand client type → membership used → first-visit experience. Zero-record types remain visible within the selected scope." onSearch={setSearch}
    actions={<><details className="acq-value-selection"><summary>Client types <span>{selected==null?'All values':selected.length+' selected'}</span><ChevronDown size={13}/></summary><div className="acq-value-menu"><div className="acq-value-actions"><button onClick={()=>setSelected(null)}>Select all</button><button onClick={()=>setSelected([])}>Clear selection</button></div><div className="acq-value-options">{allTypes.map(value=><label key={value}><input type="checkbox" checked={selected==null||selected.includes(value)} onChange={event=>setSelected(event.target.checked?[...(selected??allTypes),value]:(selected??allTypes).filter(item=>item!==value))}/>{value}</label>)}</div></div></details>
      <button className="button" onClick={()=>setExpanded(parents.map(id))}>Expand all types</button><button className="button" onClick={()=>setExpanded([])}>Collapse all</button><button className="button" onClick={()=>drill({is_total:1})}>Inspect selected members</button><button className="button" onClick={()=>drill({is_total:1},'converted_members')}>Converted members</button><button className="button" onClick={()=>drill({is_total:1},'retained_members')}>Retained members</button>
      <label className="acq-control">Metric<select aria-label="Client type metric" value={metric} onChange={event=>setMetric(event.target.value)}><option value="all">Metric group</option>{acquisitionMeasures.map(m=><option key={m[0]} value={m[0]}>{m[1]}</option>)}</select></label></>}
    metricBar={<div className="acq-metric-tabs">{[['outcomes','Cohort & outcomes'],['value','LTV & purchases'],['timing','Timing & first-month outcomes'],['all','All metrics']].map(([key,label])=><button key={key} aria-pressed={metricGroup===key&&metric==='all'} onClick={()=>{setMetricGroup(key);setMetric('all');}}>{label}</button>)}</div>}
    footer={<><span>{allTypes.length} unique source values · {parents.length} displayed · totals recompute from selected types, independently of search. Click metric cells for their exact member-level contributors.</span><span>New-client denominators use New labels. Repeat, staff/family and blank labels remain included as their own source types; Money Credits-only purchases are excluded from converted counts.</span></>}>
    {error?<p role="alert">{error}</p>:loading?<p role="status" className="acq-empty">Loading client types and source hierarchy…</p>:<div className="acq-table-scroll"><table className="acq-table acq-client-types"><thead><tr><th className="acq-sticky"><button onClick={()=>setSort({key:'type_label',desc:sort.key==='type_label'?!sort.desc:false})}>Client type / membership / experience</button></th><th className="acq-dimension">Member actions</th>{measures.map(m=><th key={m[0]} aria-sort={sort.key===m[0]?sort.desc?'descending':'ascending':'none'}><button onClick={()=>setSort({key:m[0],desc:sort.key===m[0]?!sort.desc:true})}>{m[1]}</button></th>)}</tr></thead><tbody>{parents.map(parent=><Fragment key={String(parent.type_label)}><tr className="acq-entry-row"><th scope="row" className="acq-sticky"><button className="acq-expand" aria-expanded={expanded.includes(id(parent))} onClick={()=>toggle(id(parent))}>{expanded.includes(id(parent))?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<span>{parent.type_label}</span></button></th><td className="acq-dimension"><div className="acq-row-actions"><button onClick={()=>drill(parent)}>Members</button><button onClick={()=>drill(parent,'converted_members')}>Converted</button><button onClick={()=>drill(parent,'retained_members')}>Retained</button></div></td>{cells(parent)}</tr>
      {expanded.includes(id(parent))&&(memberships.get(String(parent.type_label))??[]).map(member=><Fragment key={id(member)}><tr className="acq-detail-row"><th scope="row" className="acq-sticky"><button className="acq-expand acq-child-indent" aria-expanded={expanded.includes(id(member))} onClick={()=>toggle(id(member))}>{expanded.includes(id(member))?<ChevronDown size={12}/>:<ChevronRight size={12}/>}<span>{member.membership_label}</span></button></th><td className="acq-dimension"><button className="acq-cell-button" onClick={()=>drill(member)}>View members</button></td>{cells(member)}</tr>
        {expanded.includes(id(member))&&(experiences.get(id(member))??[]).map(experience=><tr className="acq-detail-row acq-experience-row" key={String(experience.experience_label)}><th scope="row" className="acq-sticky"><span className="acq-detail-label">{experience.experience_label}</span></th><td className="acq-dimension"><button className="acq-cell-button" onClick={()=>drill(experience)}>View members</button></td>{cells(experience)}</tr>)}</Fragment>)}</Fragment>)}</tbody><tfoot><tr><th className="acq-sticky"><button className="acq-cell-button" onClick={()=>drill({is_total:1})}>Selected types · total</button></th><td>All source records</td>{cells(total??{cohort_rows:0,unique_members:0,newcomers:0,converted_members:0,retained_members:0,is_total:1})}</tr></tfoot></table></div>}
  </AcquisitionTableShell>;
}
