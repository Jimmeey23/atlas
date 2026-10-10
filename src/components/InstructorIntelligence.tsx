import { useEffect, useMemo, useState } from 'react';
import { analyse, type Analysis } from '../data/analytics';
import { metrics } from '../semantics/metrics';
import { fmt } from '../semantics/formats';
import { useStore } from '../state/store';
import { sourceStates } from '../data/loader';
import { Register } from './Register';
import { InstructorName } from './InstructorAvatar';
import { DropdownField } from './ui/DropdownField';
import { exportCSV } from './exports';
import type { Row } from '../data/duckdb';

const performance = ['sessions','attendance','avg_class_size_incl','fill_rate','draw_premium_pp','show_up_rate','empty_session_rate','revenue','revenue_per_session','rev_pas'];
// Rate-based cost estimates (estimated payroll, contribution, empty-session cost) are deliberately excluded:
// this tab reports recorded performance, not modelled pay.
const economics = ['payroll_revenue','payroll_revenue_per_session','new_handled','payroll_conversion','payroll_retention'];
const columns = [...performance, ...economics];
/** Payroll cards appended to the instructor tab's session KPI strip so the tab shows one combined set. */
export const instructorPayrollKpis = ['new_handled','payroll_conversion','payroll_retention'];

export function useInstructorPayroll(version: string | number, enabled: boolean) {
  const s = useStore();
  const [payroll, setPayroll] = useState<Analysis | null>(null);
  const payrollReady = enabled && sourceStates.payroll?.state === 'ready';
  useEffect(() => {
    let live = true; setPayroll(null);
    if (payrollReady) analyse(10,['trainer'],economics).then(a => { if(live) setPayroll(a); }).catch(() => {});
    return () => {live=false;};
  }, [version,s.filters,s.transient,s.compare,payrollReady]);
  return payroll;
}

export function InstructorIntelligence({ version }: { version: string | number }) {
  const s = useStore();
  const [session, setSession] = useState<Analysis | null>(null);
  const [payroll, setPayroll] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [payrollError, setPayrollError] = useState('');
  const [busy, setBusy] = useState(true);
  const [view, setView] = useState<'instructors' | 'monthly'>('instructors');
  const [sort, setSort] = useState('revenue_per_session');
  const [ascending, setAscending] = useState(false);
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(columns);
  const payrollReady = sourceStates.payroll?.state === 'ready';
  useEffect(() => {
    let live = true; setBusy(true); setError(''); setPayrollError(''); setSession(null); setPayroll(null);
    const tasks = [analyse(3,['trainer'],performance).then(a => { if(live) setSession(a); }).catch(e => {if(live) setError(String(e));})];
    if (payrollReady) tasks.push(analyse(10,['trainer'],economics).then(a => {if(live) setPayroll(a);}).catch(e => {if(live) setPayrollError(String(e));}));
    void Promise.all(tasks).finally(() => {if(live) setBusy(false);});
    return () => {live=false;};
  }, [version,s.filters,s.transient,s.compare,payrollReady]);
  const rows = useMemo(() => {
    const combined = new Map<string, Row>();
    for (const [analysis, ids] of [[session, performance],[payroll,economics]] as const) {
      for (const row of analysis?.groups ?? []) {
        if(Number(row.level)!==0) continue;
        const name = String(row.g0 ?? 'Unspecified');
        combined.set(name, {...combined.get(name), instructor:name, ...Object.fromEntries(ids.map(id => [id,row[id] ?? null]))});
      }
    }
    return [...combined.values()].filter(r => String(r.instructor).toLowerCase().includes(search.toLowerCase())).sort((a,b) => {
      if(a[sort] == null) return b[sort] == null ? 0 : 1;
      if(b[sort] == null) return -1;
      return (Number(a[sort])-Number(b[sort]))*(ascending?1:-1);
    });
  },[session,payroll,sort,ascending,search]);
  const owner = (id: string) => economics.includes(id) ? payroll : session;
  const monthlyRows = [...new Set([...(session?.trend ?? []),...(payroll?.trend ?? [])].map(r=>String(r.month)))].sort().reverse().map(month => ({month,...Object.fromEntries(columns.map(id=>[id,owner(id)?.trend.find(r=>String(r.month)===month)?.[id] ?? null]))}));
  return <Register index="I1" title="Instructor performance" subtitle="One instructor scorecard across studio demand, revenue and community outcomes" actions={<button className="button" disabled={!rows.length || busy} onClick={() => exportCSV('instructor-consolidated', (view === 'monthly' ? monthlyRows : rows).map((r: Row) => ({[view === 'monthly' ? 'Month' : 'Instructor']:view === 'monthly' ? r.month : r.instructor,...Object.fromEntries(visible.map(id=>[metrics[id].label,r[id] ?? null]))})))}>Export CSV</button>}>
    <div className="segmented" style={{marginBottom:16}}><button className={view==='instructors'?'active':''} onClick={()=>setView('instructors')}>Instructor comparison</button><button className={view==='monthly'?'active':''} onClick={()=>setView('monthly')}>Monthly comparison</button></div>
    <div className="report-controls"><label><span className="small">Find instructor</span><input aria-label="Find instructor" disabled={view==='monthly'} value={search} onChange={e => setSearch(e.target.value)}/></label><label><span className="small">Rank by</span><DropdownField aria-label="Rank instructors by" value={sort} onChange={e=>setSort(e.target.value)}>{columns.map(id=><option value={id} key={id}>{metrics[id].label}</option>)}</DropdownField></label><button className="button" onClick={()=>setAscending(v=>!v)}>{ascending?'Lowest first':'Highest first'}</button></div>
    <details className="format-full-scorecard"><summary>Customise comparison metrics</summary><div className="instructor-metric-options">{columns.map(id=><label key={id}><input type="checkbox" checked={visible.includes(id)} onChange={e=>setVisible(v=>e.target.checked ? columns.filter(c=>c===id || v.includes(c)) : v.filter(c=>c!==id))}/>{metrics[id].label}</label>)}</div></details>
    <p className="small">Class performance is measured per session; payroll-reported revenue and newcomer conversion/retention are measured per payroll month. Source populations differ; missing values are unavailable. Use complete months for payroll comparisons.</p>
    {busy && <p role="status">Building consolidated instructor scorecard…</p>}{error && <p role="alert">{error}</p>}{payrollError && <p role="alert">Payroll metrics unavailable: {payrollError}</p>}{!payrollReady && <p role="status">Payroll-reported outcomes are loading or unavailable; class performance remains available.</p>}
    {view === 'instructors' ? <div className="table-scroll"><table className="worklist-table"><thead><tr><th>Instructor</th>{visible.map(id=><th key={id}>{metrics[id].label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={String(row.instructor)}><th scope="row"><InstructorName name={String(row.instructor)}/></th>{visible.map(id=><td key={id}>{fmt(id,row[id])}</td>)}</tr>)}</tbody><tfoot><tr><th>All instructors</th>{visible.map(id=><td key={id}>{fmt(id,owner(id)?.total[id])}</td>)}</tr></tfoot></table></div> : <div className="table-scroll"><table className="worklist-table"><thead><tr><th>Month</th>{visible.map(id=><th key={id}>{metrics[id].label}</th>)}</tr></thead><tbody>{monthlyRows.map(row=><tr key={row.month}><th scope="row">{row.month}</th>{visible.map(id=><td key={id}>{fmt(id,(row as Row)[id])}</td>)}</tr>)}</tbody></table><p className="small">Trailing completed months; the selected instructors and other non-date filters apply.</p></div>}
    {!busy && !rows.length && <p className="empty-state">No instructor records match this scope.</p>}
  </Register>;
}
