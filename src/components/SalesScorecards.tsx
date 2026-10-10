import { useEffect, useState } from 'react';
import { query, quote, type Row } from '../data/duckdb';
import { where } from '../data/analytics';
import { salesScorecardFactsSQL, salesScorecardAggregate, salesScorecardDefaults, salesScorecardDims, salesScorecardSelect, salesScorecardTerms } from '../data/sales-scorecards';
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
const monetary = new Set(['gross_revenue','net_revenue','discount_value']);
const labels: Record<string,string> = { purchase_count:'Purchases',transactions:'Sales',buyers:'Members',gross_revenue:'Collections',net_revenue:'Net collections',discount_value:'Discount value',discount_rate:'Discount rate',discount_penetration:'Discounted sale share',discounted_lines:'Discounted lines',payment_lines:'Payment lines' };
const columns = ['transactions','buyers','gross_revenue','net_revenue','discount_value','discount_rate'];
type Kind = 'discounts'|'upgrades'|'annual'|'private';
const specs: {kind:Kind;index:string;title:string;description:string}[] = [
  {kind:'discounts',index:'S1',title:'Discounts scorecard',description:'Item discounts × quantity. Discount rate = discounts / (collections + discounts); sale share uses distinct sale IDs.'},
  {kind:'upgrades',index:'S2',title:'Membership upgrade scorecard',description:'Observed moves to a longer unlimited plan or larger class package than the preceding paid purchase of the same type. History includes earlier dates; same-day plan changes are excluded. Counts cover the first payment date of each observed upgrade.'},
  {kind:'annual',index:'S3',title:'Annual member purchase tracker',description:'Annual, yearly, 12-month and 1-year products. Purchases follow payment dates and the active filters.'},
  {kind:'private',index:'S4',title:'Private member purchase tracker',description:'Private products and the Privates category, by community member and purchase month.'},
];
function text(id:string,value:unknown) { return fmt(monetary.has(id)?'gross_revenue':id.includes('rate')||id==='discount_penetration'?'discount_rate':'transactions',value); }
export function SalesScorecards({version,onDrill}:{version:number;onDrill:(entry:TreeRow)=>void}) {
  const filters=useStore(s=>s.filters),transient=useStore(s=>s.transient);
  const [rows,setRows]=useState<Record<Kind,Row[]>>({discounts:[],upgrades:[],annual:[],private:[]});
  const [totals,setTotals]=useState<Record<string,Row>>({});
  const [error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [searches,setSearches]=useState<Record<string,string>>({}),[pages,setPages]=useState<Record<string,number>>({});
  const facts=salesScorecardFactsSQL(where(filters,'sales',transient),filters.imports);
  // Each scorecard's rows can be regrouped by any populated Sales column; defaults match the original layout.
  const grouping={discounts:usePersistentGroups('sales-scorecard:discounts',[...salesScorecardDefaults.discounts]),upgrades:usePersistentGroups('sales-scorecard:upgrades',[...salesScorecardDefaults.upgrades]),annual:usePersistentGroups('sales-scorecard:annual',[...salesScorecardDefaults.annual]),private:usePersistentGroups('sales-scorecard:private',[...salesScorecardDefaults.private])};
  const dimsOf=(kind:Kind)=>{const d=salesScorecardDims(grouping[kind][0]);return d.length?d:[...salesScorecardDefaults[kind]];};
  const fieldKey=specs.map(spec=>dimsOf(spec.kind).join()).join('|');
  const registry=useGroupFields('sales',['discount_code','previous_product',...specs.flatMap(spec=>dimsOf(spec.kind))]);
  const fieldsFor=(kind:Kind)=>registry.filter(f=>f.field!=='member_id'&&(f.field!=='previous_product'||kind==='upgrades')).map(f=>({...f,label:headings[f.field]??f.label}));
  useEffect(()=>{
    let active=true;setLoading(true);setError('');setPages({});
    const conditions:Record<Kind,string>={discounts:'TRUE',upgrades:'is_upgrade',annual:'is_annual',private:'is_private'};
    Promise.all(specs.map(async spec=>{
      const [groups,total]=await Promise.all([
        query(`WITH facts AS (${facts}) SELECT ${salesScorecardSelect(dimsOf(spec.kind))},${salesScorecardAggregate} FROM facts WHERE ${conditions[spec.kind]} GROUP BY ALL ORDER BY gross_revenue DESC NULLS LAST`),
        query(`WITH facts AS (${facts}) SELECT ${salesScorecardAggregate} FROM facts WHERE ${conditions[spec.kind]}`),
      ]);return {kind:spec.kind,groups,total:total[0]};
    })).then(data=>{if(active){setRows(Object.fromEntries(data.map(d=>[d.kind,d.groups])) as Record<Kind,Row[]>);setTotals(Object.fromEntries(data.map(d=>[d.kind,d.total])));}}).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[filters,transient,version,fieldKey]); // eslint-disable-line react-hooks/exhaustive-deps
  function drill(kind:Kind,row:Row|null,id:string) {
    const terms=[kind==='upgrades'?'is_upgrade':kind==='annual'?'is_annual':kind==='private'?'is_private':'TRUE'];
    if(row) terms.push(...salesScorecardTerms(dimsOf(kind),row,quote));
    if(id==='discount_value'||id==='discounted_lines'||id==='discount_penetration') terms.push('discount>0');
    onDrill({id:`sales-${kind}-${id}`,label:`${specs.find(s=>s.kind===kind)!.title} · ${labels[id]}`,source:'sales',filters,metrics:['transactions','buyers','gross_revenue','net_revenue','discount_value','discount_rate'],path:[],predicate:`source_row IN (SELECT source_row FROM (${facts}) WHERE ${terms.join(' AND ')})`,values:row||totals[kind]||{},children:[]});
  }
  return <>{specs.map(spec=>{
    const dims=dimsOf(spec.kind),[,setDims]=grouping[spec.kind],initial=[...salesScorecardDefaults[spec.kind]];
    const ids=spec.kind==='discounts'?[...columns,'discounted_lines','discount_penetration']:spec.kind==='upgrades'?['purchase_count',...columns]:columns;
    const search=searches[spec.kind]||'';
    const matching=rows[spec.kind].filter(row=>!search||dims.some(d=>String(row[d]??'').toLowerCase().includes(search.toLowerCase())));
    const page=Math.min(pages[spec.kind]||0,Math.max(0,Math.ceil(matching.length/25)-1));
    return <Register key={spec.kind} index={spec.index} title={spec.title} subtitle={spec.description} actions={<button className="button" disabled={loading||!matching.length} onClick={()=>exportCSV(spec.kind+'-scorecard',matching)}><Download size={12}/>Export CSV</button>}>
      <GroupByPicker name={spec.title} value={dims} fields={fieldsFor(spec.kind)} defaults={initial} onChange={next=>{setDims(next.length?next:initial);setPages({...pages,[spec.kind]:0});}}/>
      {error?<p role="alert">{error}</p>:loading?<p role="status">Loading sales records…</p>:<>
        <div className="sales-summary-strip" aria-label={`${spec.title} full scope summary`}>
          {['gross_revenue','transactions','buyers',spec.kind==='discounts'?'discount_value':'net_revenue'].map(id=><button key={id} className="sales-summary-stat" onClick={()=>drill(spec.kind,null,id)}><span>{labels[id]}<ArrowUpRight size={12}/></span><strong>{text(id,totals[spec.kind]?.[id])}</strong><small>Full active scope</small></button>)}
        </div>
        <div className="acq-toolbar sales-table-toolbar"><label className="acq-search"><Search size={14}/><input aria-label={`Search ${spec.title}`} placeholder={spec.kind==='discounts'?'Search discount codes…':spec.kind==='upgrades'?'Search plans…':'Search members or products…'} value={search} onChange={e=>{setSearches({...searches,[spec.kind]:e.target.value});setPages({...pages,[spec.kind]:0});}}/></label><span className="sales-group-count">{matching.length.toLocaleString('en-IN')} groups</span></div>
        <div className="intelligence-table sales-scorecard-table" tabIndex={0} role="region" aria-label={`${spec.title}. Scroll for all columns.`}><table><thead><tr>{dims.map(d=><th scope="col" className="sales-dimension" key={d}>{headings[d]??groupLabel(d)}</th>)}{ids.map(id=><th scope="col" data-metric={id} key={id}>{labels[id]}</th>)}</tr></thead><tbody>{matching.slice(page*25,(page+1)*25).map((row,i)=><tr key={i}>{dims.map(d=><td className="sales-dimension" key={d}><button className={`scorecard-cell${d==='discount_code'?' sales-code':''}`} title={String(row[d]??'—')} onClick={()=>drill(spec.kind,row,'transactions')}>{row[d]??'—'}</button></td>)}{ids.map(id=><td data-metric={id} key={id}><button className="scorecard-cell" onClick={()=>drill(spec.kind,row,id)}>{text(id,row[id])}</button></td>)}</tr>)}</tbody><tfoot><tr><th scope="row" colSpan={dims.length}>Full scope total</th>{ids.map(id=><td data-metric={id} key={id}><button className="scorecard-cell" onClick={()=>drill(spec.kind,null,id)}>{text(id,totals[spec.kind]?.[id])}</button></td>)}</tr></tfoot></table></div>
        {!matching.length&&<p>{spec.kind==='upgrades'?'No observed upgrades match this scope. Comparable earlier purchases are required.':'No purchases match this scope.'}</p>}
        <div className="acq-pagination"><span>{matching.length} groups · page {page+1} of {Math.max(1,Math.ceil(matching.length/25))} · totals cover all active filters</span><div><button disabled={!page} onClick={()=>setPages({...pages,[spec.kind]:page-1})}>Previous</button><button disabled={(page+1)*25>=matching.length} onClick={()=>setPages({...pages,[spec.kind]:page+1})}>Next</button></div></div>
        {spec.kind==='discounts'&&<p className="small">Discount amounts are present on {Number(totals.discounts?.discount_known||0).toLocaleString('en-IN')} of {Number(totals.discounts?.payment_lines||0).toLocaleString('en-IN')} payment lines. Missing discounts remain unavailable.</p>}
      </>}
    </Register>;
  })}</>;
}
