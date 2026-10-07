import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Globe2, Megaphone } from 'lucide-react';
import { workspaceIcons } from '../data/workspaceCopy';
import { blueprints } from '../data/blueprints';
import { health, query, type Row } from '../data/duckdb';
import { ensureSource, usable, sourceStates } from '../data/loader';
import { overviewModules, overviewSQL, type OverviewModule } from '../data/overview';
import { fmt } from '../semantics/formats';
import { metrics } from '../semantics/metrics';
import { tabs, useStore } from '../state/store';
import { listReports, type SavedReport } from '../report/storage';
import { Register } from './Register';
import './OverviewModules.css';

function moduleStyle(tab: number): CSSProperties {
  return { '--module-accent': `var(--${blueprints[tab].domain})` } as CSSProperties;
}

function ModuleHeading({tab, title, onOpen, kind}: {tab:number;title:string;onOpen:()=>void;kind?:string}) {
  const Icon = kind === 'website' ? Globe2 : kind === 'meta' ? Megaphone : workspaceIcons[tab];
  return <header className="overview-module-header">
    <div className="overview-module-heading"><span className="overview-module-icon" aria-hidden="true"><Icon size={17} strokeWidth={1.7}/></span><h3>{title}</h3></div>
    <button className="button overview-module-open" onClick={onOpen} aria-label={`Open ${title}`}>Open <ArrowUpRight size={13} aria-hidden="true"/></button>
  </header>;
}

function ModuleSnapshot({ module: m }: { module: OverviewModule }) {
  const filters = useStore(s=>s.filters);
  const transient = useStore(s=>s.transient);
  const rate = useStore(s=>s.rate);
  const set = useStore(s=>s.set);
  const sourceVersion = `${health[m.source]?.fetchedAt || "unavailable"}:${sourceStates[m.source]?.state === "error" ? "error" : ""}`;
  const [attempt,setAttempt] = useState(0);
  const [result,setResult] = useState<{total?:Row;rows:Row[];error:string;loading:boolean}>({rows:[],error:'',loading:true});
  useEffect(()=>{
    let active = true;
    setResult({rows:[],error:'',loading:true});
    const load = async () => {
      if (!usable(m.source)) await ensureSource(m.source);
      if (!usable(m.source)) throw new Error(sourceStates[m.source]?.error || 'Source unavailable');
      if (m.source === 'payroll' && !usable('new')) await ensureSource('new');
    };
    load().then(async()=>{
      const sql = overviewSQL(m,filters,transient);
      const [total,rows] = await Promise.all([query(sql.total),query(sql.rows)]);
      if(active) setResult({total:total[0],rows,error:'',loading:false});
    }).catch(error=>{if(active) setResult({rows:[],error:String(error),loading:false});});
    return ()=>{active=false;};
  },[m,filters,transient,rate,sourceVersion,attempt]);
  return <article className="overview-module" data-module={m.key} style={moduleStyle(m.tab)}>
    <ModuleHeading tab={m.tab} title={m.title || tabs[m.tab]} kind={m.key} onOpen={()=>set({tab:m.tab===10?3:[2,7,9].includes(m.tab)?1:m.tab,view:m.view||''})}/>
    <p className="overview-module-note">{m.note}{m.tab === 10 ? ` Estimated cost = sessions × ₹${rate.toLocaleString("en-IN")} per session; not actual payroll paid.` : ""}</p>
    {result.loading ? <p className="overview-module-state" role="status">Loading summary…</p> : result.error ? <div className="overview-module-state" role="alert"><p>Summary unavailable: {result.error}</p><button className="button" onClick={()=>setAttempt(v=>v+1)}>Retry summary</button></div> : !Number(result.total?.n) ? <p className="overview-module-state" role="status">No source records match this scope.</p> : <>
      <dl className="overview-module-metrics">{m.ids.map(id=><div key={id}><dt>{metrics[id].label}</dt><dd>{fmt(id,result.total?.[id])}</dd></div>)}</dl>
      <div className="overview-table-label"><span>{m.groupLabel} breakdown</span><small>Top {result.rows.length} by {metrics[m.ids[0]].label.toLowerCase()}</small></div><div className="table-scroll monthly-table overview-module-scroll"><table className="overview-table" aria-label={`${m.title || tabs[m.tab]} · ${m.groupLabel} breakdown`}><thead><tr><th scope="col"><span>{m.groupLabel}</span></th>{m.ids.map(id=><th scope="col" key={id}><span title={metrics[id].label}>{metrics[id].label}</span></th>)}</tr></thead><tbody>{result.rows.map((r,index)=><tr key={String(r.label)}><th scope="row"><span className="overview-row-label"><span className="overview-row-rank" aria-hidden="true">{String(index+1).padStart(2,"0")}</span><span className="overview-row-name" title={String(r.label)}>{r.label}</span></span></th>{m.ids.map(id=><td key={id}>{fmt(id,r[id])}</td>)}</tr>)}</tbody></table></div>
    </>}
  </article>;
}

function WorkspaceSummaries({version}:{version:number}) {
  const set = useStore(s=>s.set);
  const [reports,setReports] = useState<SavedReport[] | null>(null);
  const [reportError,setReportError] = useState('');
  const [ai,setAI] = useState<{openai:boolean;supabase:boolean}|null>(null);
  const [aiError,setAIError] = useState('');
  useEffect(()=>{
    const controller = new AbortController();
    listReports(controller.signal).then(r=>{setReports(r);setReportError('');}).catch(e=>{if(!controller.signal.aborted)setReportError(String(e));});
    fetch('/api/intelligence/status',{signal:controller.signal}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error||'Status unavailable');return body;}).then(s=>{setAI(s);setAIError('');}).catch(e=>{if(!controller.signal.aborted)setAIError(String(e));});
    return ()=>controller.abort();
  },[]);
  const sources = Object.entries(health);
  return <div className="overview-module-grid overview-workspaces" data-version={version}>
    <article className="overview-module" data-module="15" style={moduleStyle(15)}><ModuleHeading tab={15} title="Monthly report" onOpen={()=>set({tab:15,view:''})}/><p className="overview-module-note">Saved report history across studios and periods; independent of overview filters.</p>{reportError?<p role="alert">Report history unavailable: {reportError}</p>:reports===null?<p role="status">Loading report history…</p>:<><div className="overview-workspace-stat"><strong>{reports.length}</strong><span>Saved reports</span></div>{reports.length?<ul className="overview-report-list">{[...reports].sort((a,b)=>b.savedAt.localeCompare(a.savedAt)).slice(0,3).map(r=><li key={r.id}><span>{r.scope.studio} · {r.scope.month}</span><small>Saved {new Date(r.savedAt).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})}</small></li>)}</ul>:<p>No saved reports yet.</p>}</>}</article>
    <article className="overview-module" data-module="13" style={moduleStyle(13)}><ModuleHeading tab={13} title="AI workspace" onOpen={()=>set({tab:13,view:''})}/><p className="overview-module-note">Current connections for querying evidence and saving team intelligence.</p>{aiError?<p role="alert">Connection status unavailable: {aiError}</p>:!ai?<p role="status">Checking connections…</p>:<dl className="overview-connection-list"><div><dt>GPT analysis</dt><dd><span className="overview-status" data-tone={ai.openai?'good':'attention'}>{ai.openai?'Connected':'Requires configuration'}</span></dd></div><div><dt>Workspace storage</dt><dd><span className="overview-status" data-tone={ai.supabase?'good':'attention'}>{ai.supabase?'Connected':'Requires configuration'}</span></dd></div></dl>}</article>
    <article className="overview-module" data-module="11" style={moduleStyle(11)}><ModuleHeading tab={11} title="Data quality" onOpen={()=>set({tab:11,view:''})}/><p className="overview-module-note">Loaded source health across the app; independent of business filters.</p><div className="overview-health-stats"><div className="overview-workspace-stat"><strong>{sources.filter(([,h])=>h.fetchedAt&&h.status!=='error').length}</strong><span>Sources available</span></div><div className="overview-workspace-stat"><strong>{fmt("records",sources.reduce((n,[,h])=>n+h.defects.length,0))}</strong><span>Recorded defects</span></div></div><div className="table-scroll monthly-table overview-module-scroll"><table className="overview-table" aria-label="Loaded source health"><thead><tr><th scope="col">Source</th><th scope="col">Records</th><th scope="col">Defects</th><th scope="col">Status</th></tr></thead><tbody>{sources.map(([key,h])=><tr key={key}><th scope="row"><span className="overview-row-name overview-source-name">{key}</span></th><td>{h.fetchedAt?fmt('records',h.recordsCount):'—'}</td><td>{fmt("records",h.defects.length)}</td><td><span className="overview-status" data-tone={h.status==="error"?"error":h.status==="warning"?"attention":"good"}>{h.status==="ok"?"Ready":h.status==="warning"?"Review":h.status==="error"?"Unavailable":h.status}</span></td></tr>)}</tbody></table></div></article>
  </div>;
}

export function OverviewModules({version}:{version:number}) {
  return <Register index="07" title="Across the business" subtitle="A summary and breakdown from every business module · selected filters apply where the source supports them">
    <nav className="overview-module-nav" aria-label="Overview module shortcuts">{overviewModules.map(m=><a style={moduleStyle(m.tab)} key={m.key} href={`#overview-module-${m.key}`}>{m.title||tabs[m.tab]}</a>)}<a href="#overview-workspaces">Reporting, AI & data quality</a></nav>
    <div className="overview-module-grid">{overviewModules.map(m=><div id={`overview-module-${m.key}`} key={m.key}><ModuleSnapshot module={m}/></div>)}</div>
    <div id="overview-workspaces"><WorkspaceSummaries version={version}/></div>
  </Register>;
}
