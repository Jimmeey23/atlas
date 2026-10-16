import { useEffect, useState } from 'react';
import { ensureSource } from '../data/loader';
import { query, quote, type Row } from '../data/duckdb';
import { where, today } from '../data/analytics';
import { salesScorecardQuery, salesScorecardFactsSQL, salesScorecardDefaults, salesScorecardDims, salesScorecardTerms } from '../data/sales-scorecards';
import { GroupByPicker, usePersistentGroups } from './ui/GroupByPicker';
import { useGroupFields } from '../data/group-registry';
import { groupLabel } from '../data/group-fields';
import { useStore } from '../state/store';
import { fmt } from '../semantics/formats';
import { Register } from './Register';
import { exportCSV } from './exports';
import type { TreeRow } from './NestedTable';
import { ArrowUpRight, Download, Search } from 'lucide-react';
const headings: Record<string,string> = { discount_code:'Discount code',previous_product:'Previous plan',month:'Purchase month',member:'Community member',product:'Purchased product' };
const monetary = new Set(['gross_revenue','net_revenue','discount_value','arpu','aov']);
const labels: Record<string,string> = { month:'Purchase month',mom_growth:'Collections MoM change',arpu:'Revenue / unique member',aov:'Average order value',purchase_frequency:'Purchases / member',product_breadth:'Products sold',top_product:'Top product · sales',bottom_product:'Bottom product · sales',purchase_count:'Purchases',transactions:'Sales',buyers:'Members',gross_revenue:'Collections',net_revenue:'Net collections',discount_value:'Discount value',discount_rate:'Discount rate',discount_penetration:'Discounted sale share',discounted_lines:'Discounted lines',payment_lines:'Payment lines' };
const columns = ['transactions','buyers','gross_revenue','net_revenue','discount_value','discount_rate','arpu','aov','purchase_frequency','product_breadth','top_product','bottom_product'];
type Kind = 'people'|'people_month'|'discounts'|'upgrades'|'annual'|'private';
const specs: {kind:Kind;index:string;title:string;description:string}[] = [
  {kind:'people',index:'S5',title:'Salesperson performance scorecard',description:'Collections, member value, purchase frequency and product mix by salesperson.'},
  {kind:'people_month',index:'S6',title:'Salesperson month-on-month scorecard',description:'One row per salesperson and purchase month. Active date filters apply; compare monthly collections and member value. MoM change requires the preceding calendar month inside the filtered scope; missing or zero baselines remain unavailable.'},
  {kind:'discounts',index:'S1',title:'Discounts scorecard',description:'Item discounts × quantity. Discount rate = discounts / (collections + discounts); sale share uses distinct sale IDs.'},
  {kind:'upgrades',index:'S2',title:'Membership upgrade scorecard',description:'Observed moves to a longer unlimited plan or larger class package than the preceding paid purchase of the same type. History includes earlier dates; same-day plan changes are excluded. Counts cover the first payment date of each observed upgrade.'},
  {kind:'annual',index:'S3',title:'Annual member purchase tracker',description:'Annual, yearly, 12-month and 1-year products. Purchases follow payment dates and the active filters.'},
  {kind:'private',index:'S4',title:'Private member purchase tracker',description:'Private products and the Privates category, by community member and purchase month.'},
];
function text(id:string,value:unknown) { if(id==='mom_growth') return fmt('discount_rate',value); if(id.endsWith('_product')) return String(value??'—'); if(id==='purchase_frequency') return fmt(id,value); return fmt(monetary.has(id)?'gross_revenue':id.includes('rate')||id==='discount_penetration'?'discount_rate':'transactions',value); }
export function SalesScorecards({version,onDrill}:{version:number;onDrill:(entry:TreeRow)=>void}) {
  const filters=useStore(s=>s.filters),transient=useStore(s=>s.transient);
  const [rows,setRows]=useState<Record<Kind,Row[]>>({people:[],people_month:[],discounts:[],upgrades:[],annual:[],private:[]});
  const [activeCounts,setActiveCounts]=useState<Row>({});
  const [sort,setSort]=useState('gross_revenue'),[minimum,setMinimum]=useState(1),[pageSize,setPageSize]=useState(25);
  const [totals,setTotals]=useState<Record<string,Row>>({});
  const [error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [searches,setSearches]=useState<Record<string,string>>({}),[pages,setPages]=useState<Record<string,number>>({});
  const facts=salesScorecardFactsSQL(where(filters,'sales',transient),filters.imports);
  // Each scorecard's rows can be regrouped by any populated Sales column; defaults match the original layout.
  const grouping={people:usePersistentGroups('sales-scorecard:people',['associate']),people_month:usePersistentGroups('sales-scorecard:people-month',['associate','month']),discounts:usePersistentGroups('sales-scorecard:discounts',[...salesScorecardDefaults.discounts]),upgrades:usePersistentGroups('sales-scorecard:upgrades',[...salesScorecardDefaults.upgrades]),annual:usePersistentGroups('sales-scorecard:annual',[...salesScorecardDefaults.annual]),private:usePersistentGroups('sales-scorecard:private',[...salesScorecardDefaults.private])};
  const dimsOf=(kind:Kind)=>{const d=salesScorecardDims(grouping[kind][0]);return d.length?d:[...salesScorecardDefaults[kind]];};
  const fieldKey=specs.map(spec=>dimsOf(spec.kind).join()).join('|');
  const registry=useGroupFields('sales',['discount_code','previous_product',...specs.flatMap(spec=>dimsOf(spec.kind))]);
  const fieldsFor=(kind:Kind)=>registry.filter(f=>f.field!=='member_id'&&(f.field!=='previous_product'||kind==='upgrades')).map(f=>({...f,label:headings[f.field]??f.label}));
  useEffect(()=>{
    let active=true;setLoading(true);setError('');setPages({});
    const conditions:Record<Kind,string>={people:'TRUE',people_month:'TRUE',discounts:'discount>0',upgrades:'is_upgrade',annual:'is_annual',private:'is_private'};
    Promise.all(specs.map(async spec=>{
      const [groups,total]=await Promise.all([
        query(salesScorecardQuery(facts,conditions[spec.kind],dimsOf(spec.kind))),
        query(salesScorecardQuery(facts,conditions[spec.kind],[])),
      ]);return {kind:spec.kind,groups,total:total[0]};
    })).then(data=>{if(active){setRows(Object.fromEntries(data.map(d=>[d.kind,d.groups])) as Record<Kind,Row[]>);setTotals(Object.fromEntries(data.map(d=>[d.kind,d.total])));}}).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[filters,transient,version,fieldKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    let live=true;
    setActiveCounts({});
    ensureSource('lapsed').then(()=>{
    const scope=where({...filters,from:'',to:''},'lapsed',transient);
    return query(`SELECT COUNT(DISTINCT member_id) FILTER(WHERE regexp_matches(lower(COALESCE(product,'')),'annual|yearly|12 month|1 year')) AS annual,COUNT(DISTINCT member_id) FILTER(WHERE lower(COALESCE(category,''))='privates' OR regexp_matches(lower(COALESCE(product,'')),'private')) AS private FROM lapsed${scope}${scope?' AND ':' WHERE '}member_id IS NOT NULL AND revenue>0 AND start_date<='${today()}' AND end_date>='${today()}' AND lower(COALESCE(status,'')) NOT IN ('lapsed','not activated','frozen','cancelled','canceled','expired','inactive','voided') AND (remaining IS NULL OR remaining>0 OR session_limit IS NULL OR session_limit<=0)`);})
      .then(r=>{if(live)setActiveCounts(r[0]||{});}).catch(()=>{if(live)setActiveCounts({});});
    return()=>{live=false;};
  },[filters,transient,version]);
  function drill(kind:Kind,row:Row|null,id:string) {
    const terms=[kind==='upgrades'?'is_upgrade':kind==='annual'?'is_annual':kind==='private'?'is_private':kind==='discounts'?'discount>0':'TRUE'];
    if(row) terms.push(...salesScorecardTerms(dimsOf(kind),row,quote));
    if((id==='top_product'||id==='bottom_product')&&(row||totals[kind])?.[id]!=null) terms.push(`product=${quote(String((row||totals[kind])[id]))}`);
    if(id==='discount_value'||id==='discounted_lines'||id==='discount_penetration') terms.push('discount>0');
    onDrill({id:`sales-${kind}-${id}`,label:`${specs.find(s=>s.kind===kind)!.title} · ${labels[id]}`,source:'sales',filters,metrics:['transactions','buyers','gross_revenue','net_revenue','discount_value','discount_rate'],path:[],predicate:`source_row IN (SELECT source_row FROM (${facts}) WHERE ${terms.join(' AND ')})`,values:row||totals[kind]||{},children:[]});
  }
  return <>{specs.map(spec=>{
    const dims=dimsOf(spec.kind),[,setDims]=grouping[spec.kind],initial=[...salesScorecardDefaults[spec.kind]];
    const baseIds=spec.kind==='discounts'?[...columns,'discounted_lines','discount_penetration']:spec.kind==='upgrades'?['purchase_count',...columns]:columns;
    const ids=spec.kind==='people_month'&&dims.includes('month')?[...baseIds,'mom_growth']:baseIds;
    const search=searches[spec.kind]||'';
    const matching=rows[spec.kind].filter(row=>Number(row.transactions)>=minimum&&(!search||dims.some(d=>String(row[d]??'').toLowerCase().includes(search.toLowerCase())))).sort((a,b)=>sort==='month'?String(b.month??'').localeCompare(String(a.month??'')):Number(b[sort]??0)-Number(a[sort]??0));
    const page=Math.min(pages[spec.kind]||0,Math.max(0,Math.ceil(matching.length/pageSize)-1));
    return <Register key={spec.kind} index={spec.index} title={spec.title} subtitle={spec.description} actions={<button className="button" disabled={loading||!matching.length} onClick={()=>exportCSV(spec.kind+'-scorecard',matching)}><Download size={12}/>Export CSV</button>}>
      {(spec.kind==='annual'||spec.kind==='private')&&<div className="tracker-active"><span>Currently active {spec.kind} community members</span><strong>{fmt('buyers',activeCounts[spec.kind])}</strong><small>As of {today()} IST · distinct members with paid, dated, non-frozen access and available sessions where limited. Purchase-date filters excluded; other applicable filters retained. Source snapshot, not live availability.</small></div>}
      <div className="sales-ranking-controls"><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}>{['gross_revenue','transactions','buyers','arpu','purchase_frequency','month'].map(id=><option key={id} value={id}>{labels[id]}</option>)}</select></label><label>Minimum sales<input type="number" min="1" value={minimum} onChange={e=>setMinimum(Math.max(1,Number(e.target.value)))}/></label><label>Rows per page<select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPages({});}}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select></label></div>
      <GroupByPicker name={spec.title} value={dims} fields={fieldsFor(spec.kind)} defaults={initial} onChange={next=>{setDims(next.length?next:initial);setPages({...pages,[spec.kind]:0});}}/>
      {error?<p role="alert">{error}</p>:loading?<p role="status">Loading sales records…</p>:<>
        <p className="small">Purchases / member = distinct sales with a known member ID ÷ unique members. Product ranks use distinct sales per product; ties sort alphabetically. Revenue / member includes all scoped collections.</p><div className="sales-summary-strip" aria-label={`${spec.title} full scope summary`}>
          {['gross_revenue','transactions','buyers',spec.kind==='discounts'?'discount_value':'net_revenue'].map(id=><button key={id} className="sales-summary-stat" onClick={()=>drill(spec.kind,null,id)}><span>{labels[id]}<ArrowUpRight size={12}/></span><strong>{text(id,totals[spec.kind]?.[id])}</strong><small>Full active scope</small></button>)}
        </div>
        <div className="acq-toolbar sales-table-toolbar"><label className="acq-search"><Search size={14}/><input aria-label={`Search ${spec.title}`} placeholder={spec.kind==='discounts'?'Search discount codes…':spec.kind==='upgrades'?'Search plans…':'Search members or products…'} value={search} onChange={e=>{setSearches({...searches,[spec.kind]:e.target.value});setPages({...pages,[spec.kind]:0});}}/></label><span className="sales-group-count">{matching.length.toLocaleString('en-IN')} groups</span></div>
        <div className="intelligence-table sales-scorecard-table" tabIndex={0} role="region" aria-label={`${spec.title}. Scroll for all columns.`}><table><thead><tr>{dims.map(d=><th scope="col" className="sales-dimension" key={d}>{headings[d]??groupLabel(d)}</th>)}{ids.map(id=><th scope="col" data-metric={id} key={id}>{labels[id]}</th>)}</tr></thead><tbody>{matching.slice(page*pageSize,(page+1)*pageSize).map((row,i)=><tr key={i}>{dims.map(d=><td className="sales-dimension" key={d}><button className={`scorecard-cell${d==='discount_code'?' sales-code':''}`} title={String(row[d]??'—')} onClick={()=>drill(spec.kind,row,'transactions')}>{row[d]??'—'}</button></td>)}{ids.map(id=><td data-metric={id} key={id}><button className="scorecard-cell" onClick={()=>drill(spec.kind,row,id)}>{text(id,row[id])}</button></td>)}</tr>)}</tbody><tfoot><tr><th scope="row" colSpan={dims.length}>Full scope total</th>{ids.map(id=><td data-metric={id} key={id}><button className="scorecard-cell" onClick={()=>drill(spec.kind,null,id)}>{text(id,totals[spec.kind]?.[id])}</button></td>)}</tr></tfoot></table></div>
        {!matching.length&&<p>{spec.kind==='upgrades'?'No observed upgrades match this scope. Comparable earlier purchases are required.':'No purchases match this scope.'}</p>}
        <div className="acq-pagination"><span>{matching.length} groups · page {page+1} of {Math.max(1,Math.ceil(matching.length/pageSize))} · totals cover all active filters</span><div><button disabled={!page} onClick={()=>setPages({...pages,[spec.kind]:page-1})}>Previous</button><button disabled={(page+1)*pageSize>=matching.length} onClick={()=>setPages({...pages,[spec.kind]:page+1})}>Next</button></div></div>
        {spec.kind==='discounts'&&<p className="small">Discount amounts are present on {Number(totals.discounts?.discount_known||0).toLocaleString('en-IN')} of {Number(totals.discounts?.payment_lines||0).toLocaleString('en-IN')} payment lines. Missing discounts remain unavailable.</p>}
      </>}
    </Register>;
  })}</>;
}
