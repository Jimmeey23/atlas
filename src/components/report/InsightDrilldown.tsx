import { useId, useRef, useState } from 'react';
import { ChevronDown, Database, ArrowUpRight, X } from 'lucide-react';
import type { ChapterData, GroupTable, ReportModel } from '../../report/model';
import { reportAnalyticsLink } from '../../report/drilldown';
import { chapters } from '../../report/chapters';
import { definition, reportFmt as fmt, reportDelta as delta } from '../../report/definitions';
import { MonthlyHistory } from './kit';
import { EvidenceBlock } from './ReportEvidence';

export function InsightDrilldown({ model, chapterId, headline, metrics, table, children, modal = false }: {
  model: ReportModel; chapterId: string; headline: string;
  metrics: {id:string;data:ChapterData}[]; table?: GroupTable; modal?: boolean; children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { dialog.current?.close(); setExpanded(false); trigger.current?.focus(); };
  const detail = useRef<HTMLDetailsElement>(null);
  const detailId = useId();
  const [expanded, setExpanded] = useState(false);
  const own = model.chapters[chapterId];
  const sources = [...new Set([...(own ? [own] : []), ...metrics.map(m => m.data)])];
  const breakdowns = table ? [table] : sources.flatMap(data => data.groups.filter(g => metrics.some(m => g.columns.includes(m.id))));
  const unique = [...new Set(breakdowns)];
  const liveLink = reportAnalyticsLink(model, chapterId, location.origin);
  const label = (id:string) => definition(id)?.label ?? id;
  const detailContent = <details id={detailId} className="r-insight-drilldown" open={modal ? true : undefined} ref={detail} onToggle={e => { if (!modal) setExpanded(e.currentTarget.open); }}>
      <summary><Database size={15}/><span>Explore underlying data & analytics<small>{metrics.length} measures · {unique.length} stored breakdowns</small></span><ChevronDown size={16}/></summary>
      <div className="r-drilldown-body">
        <p className="r-note">{model.scope.studio} · {model.scope.month} · Frozen at {new Date(model.builtAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}. These are the saved report’s aggregated figures. Individual source records and omitted ranking rows are not stored in this snapshot.</p>
        {liveLink && <a className="r-live-analytics" href={liveLink} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={16}/><span>Open full source analytics<small>Same studio and month · current data may differ from this saved snapshot</small></span></a>}
        {!!metrics.length && <div className="r-table-wrap"><table className="r-table"><caption>Measures behind this insight</caption><thead><tr><th>Measure</th><th>Selected month</th><th>Previous month</th><th>MoM change</th><th>Same month last year</th><th>YoY change</th></tr></thead><tbody>{metrics.map(({id,data}) => <tr key={id}><th scope="row">{label(id)}</th><td>{fmt(id,data.total[id])}</td><td>{fmt(id,data.prior[id])}</td><td>{delta(id,data.total[id],data.prior[id])}</td><td>{fmt(id,data.priorYear[id])}</td><td>{delta(id,data.total[id],data.priorYear[id])}</td></tr>)}</tbody></table></div>}
        {sources.map(data => { const ids = metrics.filter(m => m.data === data).map(m => m.id); return ids.length && data.history.length ? <MonthlyHistory key={data.id} data={data} ids={ids} title={chapters.find(c => c.id === data.id)?.nav || 'Insight'} initialPeriods={14}/> : null; })}
        {unique.map((group,i) => <EvidenceBlock key={`${group.id || group.field}-${i}`} table={group} initialView="table" full/>)}
        {!metrics.length && !unique.length && <p className="r-empty">This saved insight has no linked metric or breakdown. The chapter’s source notes below explain its evidence coverage.</p>}
        {sources.map(data => <div key={data.id} className="r-drilldown-source"><b>{chapters.find(c => c.id === data.id)?.source || data.id} · {data.n.toLocaleString('en-IN')} contributing records</b>{data.notes?.map((note,i) => <p key={i}>{note}</p>)}</div>)}
        <p className="r-note">Changes use the previous month and the same month last year. Missing data remains unavailable. Ranking totals may include groups excluded from the displayed ranking. A correlation does not establish a cause.</p>
      </div>
    </details>;
  return <>
    <h3><button ref={trigger} type="button" className="r-insight-title" data-insight-toggle aria-expanded={expanded} aria-controls={detailId} onClick={() => { if (modal) { dialog.current?.showModal(); setExpanded(true); return; } if (detail.current) { detail.current.open = !detail.current.open; if (detail.current.open) detail.current.scrollIntoView({block:'nearest'}); } }} aria-label={`Explore data: ${headline}`}>{children}<ArrowUpRight size={16} aria-hidden="true"/></button></h3>
    {modal ? <dialog ref={dialog} className="deck-record-dialog" onCancel={close} aria-label={`Evidence: ${headline}`} data-export="omit"><header><h2>{headline}</h2><button className="icon-button" aria-label="Close insight evidence" onClick={close}><X size={18}/></button></header>{detailContent}</dialog> : detailContent}
  </>;
}
