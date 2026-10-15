import { TrendingUp, TriangleAlert, GitBranch, Lightbulb, Radar, ArrowRightCircle, ShieldCheck, Users, CalendarClock, ChevronRight, ChevronLeft, Database } from 'lucide-react';
import { InsightDrilldown } from '../InsightDrilldown';
import { lensLabel, lensOf, metricSource } from '../Insight';
import { useRecordDrilldown } from './RecordDrilldown';
import { chapters } from '../../../report/chapters';
import { definition, reportFmt as fmt, reportDelta as delta } from '../../../report/definitions';
import type { ChapterData, InsightCard, InsightLens, ReportModel } from '../../../report/model';
import { EvidenceVisual } from './EvidenceVisual';
import { ReportProse } from './ReportProse';

const LENS_ICON: Record<InsightLens, typeof TrendingUp> = { win: TrendingUp, risk: TriangleAlert, driver: GitBranch, opportunity: Lightbulb, watch: Radar, next_step: ArrowRightCircle };

/** One argument and its corresponding evidence share the same panel and reading order. */
export function DeckInsightCard({ card, model, chapterId, index, total, plan = false, confidence = true, exporting = false, onStep }: { card: InsightCard; model: ReportModel; chapterId: string; index: number; total?: number; plan?: boolean; confidence?: boolean; exporting?: boolean; onStep?: (step: number) => void }) {
  const drill = useRecordDrilldown();
  const lens = lensOf(card), Icon = LENS_ICON[lens];
  const table = model.chapters[chapterId]?.groups.find(g => (g.id ?? g.field) === card.focus);
  const cited = (card.metrics?.length ? card.metrics : [table?.compare, ...(chapters.find(c => c.id === chapterId)?.metrics ?? [])].filter((id): id is string => !!id).slice(0, 2))
    .map(id => ({ id, data: metricSource(model, chapterId, id) })).filter((m): m is { id: string; data: ChapterData } => !!m.data && m.data.total[m.id] != null).slice(0, 3);
  const evidenceData = cited[0]?.data ?? model.chapters[chapterId];
  const showCharts = model.customization?.showCharts !== false;
  const points = [
    { label: plan ? 'Why this move' : 'Observed drivers', text: card.driver || card.reasoning },
    { label: 'Where it concentrates', text: card.concentration },
    { label: 'Conditional value at stake', text: card.impact },
    { label: 'Trend & durability', text: card.trend },
    { label: 'Counter-evidence', text: card.offset },
  ].filter(point => point.text);
  return <article className="deck-insight rp-finding" data-lens={lens} data-priority={card.priority ?? 'medium'}>
    <header className="deck-insight-top"><span className="rp-finding-number">{String(index + 1).padStart(2, '0')}</span><span className="deck-insight-lens"><Icon size={14}/>{lensLabel(lens)}</span>
      <span className="rp-finding-meta">{card.priority && <b>{card.priority} priority</b>}{confidence && card.confidence && <span>{card.confidence} confidence</span>}{total && <span>{index + 1} / {total}</span>}</span>
      {onStep && <span className="dk-stepper"><button type="button" className="icon-button" aria-label="Previous insight" disabled={index === 0} onClick={() => onStep(-1)}><ChevronLeft size={15}/></button><button type="button" className="icon-button" aria-label="Next insight" disabled={!!total && index >= total - 1} onClick={() => onStep(1)}><ChevronRight size={15}/></button></span>}
    </header>
    <div className="deck-insight-body rp-evidence-pair">
      <div className="deck-insight-claim"><div className="deck-claim-content">
        <div className="deck-insight-headline">{exporting ? <h3>{card.headline}</h3> : <InsightDrilldown modal model={model} chapterId={chapterId} headline={card.headline} metrics={cited} table={table}>{card.headline}</InsightDrilldown>}</div>
        <ReportProse text={card.meaning}/>
        {card.monthContext && <section className="cr-insight-context"><h4>Selected-month context</h4><ReportProse text={card.monthContext}/></section>}
        {card.yearContext && <section className="cr-insight-context"><h4>Year & comparison context</h4><ReportProse text={card.yearContext}/></section>}
        {!!points.length && <ul className="rp-insight-points">{points.map(point => <li key={point.label}><b>{point.label}</b><ReportProse text={point.text}/></li>)}</ul>}
        {card.reasoning && card.reasoning !== card.driver && card.driver && <ReportProse text={card.reasoning}/>}
        {(card.action || card.recommendation) && <section className="rp-recommendation"><span className="deck-eyebrow"><ArrowRightCircle size={14}/>Proposed recommendation</span><ReportProse text={card.action}/>{card.recommendation !== card.action && <ReportProse text={card.recommendation}/>}<div className="rp-action-meta">{card.ownerArea && <span><Users size={13}/>{card.ownerArea}</span>}{card.horizon && <span><CalendarClock size={13}/>{card.horizon}</span>}</div>{card.watch && <p className="rp-watch"><b>Review measure</b>{card.watch}</p>}</section>}
        {!card.action && !card.recommendation && card.watch && <p className="rp-watch"><b>Watch next</b>{card.watch}</p>}
      </div></div>
      {(cited.length > 0 || table || card.evidence) && <aside className="deck-insight-proof" aria-label="Evidence">
        <div className="rp-evidence-citation"><span className="deck-eyebrow"><ShieldCheck size={13}/>Evidence for this finding</span><ReportProse text={card.evidence}/><small>{model.scope.month} · frozen report figures{chapters.find(c => c.id === evidenceData?.id)?.network ? ' · network scope' : ` · ${model.scope.studio}`}</small></div>
        {(table || cited.length > 0) && <EvidenceVisual data={evidenceData} table={table} metrics={cited.map(c => c.id)} month={model.scope.month} highlights={card.highlight} exporting={exporting} showCharts={showCharts}/>}
        {!!cited.length && <div className="rp-cited-metrics"><table><thead><tr><th>{table ? "Chapter context" : "Supporting measure"}</th><th>{table ? "Chapter aggregate" : "Selected month"}</th><th>MoM</th><th>YoY</th></tr></thead><tbody>{cited.map(({ id, data }) => <tr key={id}><th scope="row">{definition(id)?.label}</th><td>{fmt(id, data.total[id])}</td><td>{delta(id, data.total[id], data.prior[id])}</td><td>{delta(id, data.total[id], data.priorYear[id])}</td></tr>)}</tbody></table>{table && <p className="rp-context-note">Chapter aggregates cover the full scope. The chart and exact-value table above show the cited breakdown groups.</p>}</div>}
        {cited[0] && drill && !exporting && <button type="button" className="deck-proof-toggle rp-source-button" data-export="omit" onClick={() => drill({ metric: cited[0].id, chapterId, table, group: card.highlight?.[0] })}><Database size={13}/>Explore source records</button>}
        {!!cited.length && <details className="deck-proof-definitions"><summary>Definitions & source coverage</summary>{cited.map(({ id, data }) => <p key={id}><b>{definition(id)?.label}</b> · {definition(id)?.description}<br/>{data.n.toLocaleString('en-IN')} contributing records · {data.history.length} months. {data.notes?.join(' ')}</p>)}</details>}
      </aside>}
    </div>
  </article>;
}
