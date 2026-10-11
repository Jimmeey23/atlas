import { useEffect, useRef, useState } from "react";
import { TrendingUp, TriangleAlert, GitBranch, Lightbulb, Radar, ArrowRightCircle, Crosshair, IndianRupee, ShieldCheck, Users, CalendarClock, ChevronRight, ChevronLeft, ChartNoAxesColumn, Eye, Activity, Database } from "lucide-react";
import { EvidenceBlock } from "../ReportEvidence";
import { InsightDrilldown } from "../InsightDrilldown";
import { FocusTrend, lensLabel, lensOf, metricSource, Spark } from "../Insight";
import { useRecordDrilldown } from "./RecordDrilldown";
import { chapters } from "../../../report/chapters";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import type { ChapterData, InsightCard, InsightLens, ReportModel } from "../../../report/model";
import { durability } from "./Verdict";

const LENS_ICON: Record<InsightLens, typeof TrendingUp> = { win: TrendingUp, risk: TriangleAlert, driver: GitBranch, opportunity: Lightbulb, watch: Radar, next_step: ArrowRightCircle };
const tone = (id: string, value: unknown, prior: unknown) => value == null || prior == null || Number(value) === Number(prior) ? "flat" : (Number(value) > Number(prior)) === (definition(id)?.higherIsBetter ?? true) ? "up" : "down";
/** What kind of claim this is, said plainly, so a reader knows how much weight to give it. */
const CLAIM: Record<string, string> = { high: "Verified in the data", medium: "Inferred from the drivers", low: "Hypothesis to test" };

/**
 * A discovery, read as five answers in order: what was found, what the evidence is,
 * why it matters commercially, what the diagnosis is, and what to do next. The
 * argument sits in the main column; the figures it rests on sit beside it.
 */
export function DeckInsightCard({ card, model, chapterId, index, total, plan = false, confidence = true, onStep }: { card: InsightCard; model: ReportModel; chapterId: string; index: number; total?: number; plan?: boolean; confidence?: boolean; onStep?: (step: number) => void }) {
  const drill = useRecordDrilldown();
  const claim = useRef<HTMLDivElement>(null);
  const [claimHeight, setClaimHeight] = useState(0);
  useEffect(() => { const el = claim.current; if (!el) return; const observer = new ResizeObserver(([entry]) => setClaimHeight(entry.contentRect.height)); observer.observe(el); return () => observer.disconnect(); }, []);
  const [chart, setChart] = useState(false);
  const lens = lensOf(card);
  const Icon = LENS_ICON[lens];
  const table = model.chapters[chapterId]?.groups.find(g => (g.id ?? g.field) === card.focus);
  const cited = (card.metrics?.length ? card.metrics : [table?.compare, ...(chapters.find(c => c.id === chapterId)?.metrics ?? [])].filter((id): id is string => !!id).slice(0, 2))
    .map(id => ({ id, data: metricSource(model, chapterId, id) })).filter((m): m is { id: string; data: ChapterData } => !!m.data && m.data.total[m.id] != null).slice(0, 3);
  const fullVisual = claimHeight < 520 || !!(table && table.columns.length > 4);
  const visual = chart && <div className="deck-proof-visual" data-full={fullVisual}>{table ? <EvidenceBlock table={table} full initialView="chart"/> : cited[0] && <FocusTrend id={cited[0].id} history={cited[0].data.history.slice(-14)} />}</div>;
  const cause = card.driver || card.reasoning;
  /* The anatomy of the argument: what it means, what caused it, where it sits, what it is worth. */
  const anatomy = [
    card.meaning && { key: "meaning", icon: Lightbulb, label: "What it means", text: card.meaning },
    cause && { key: "cause", icon: GitBranch, label: card.confidence === "low" ? "Hypothesis" : "Diagnosis", text: cause },
    card.concentration && { key: "where", icon: Crosshair, label: "Where it sits", text: card.concentration },
    card.impact && { key: "worth", icon: IndianRupee, label: "Commercial significance", text: card.impact },
    (card.watch || card.trend) && { key: "watch", icon: Eye, label: "What to watch", text: [card.trend, card.watch].filter(Boolean).join(" ") },
    card.offset && { key: "held", icon: ShieldCheck, label: "Counter-signal", text: card.offset },
  ].filter(Boolean) as { key: string; icon: typeof GitBranch; label: string; text: string }[];
  const levels = { high: 3, medium: 2, low: 1 } as const;
  return <article className="deck-insight" data-lens={lens} data-priority={card.priority ?? "medium"}>
    <header className="deck-insight-top">
      <span className="deck-insight-lens"><Icon size={14}/>{lensLabel(lens)}</span>
      {(card.priority || (confidence && card.confidence)) && <span className="deck-insight-rating" data-priority={card.priority}
        title={[card.priority && `${card.priority} priority`, confidence && card.confidence && `${card.confidence} confidence`].filter(Boolean).join(" · ")}>
        {card.priority && <b>{card.priority} priority</b>}
        {confidence && card.confidence && <span className="deck-insight-confidence" aria-label={`${card.confidence} confidence`}>{[1, 2, 3].map(n => <i key={n} data-on={n <= levels[card.confidence!]} />)}</span>}
        {confidence && card.confidence && <span className="dk-chip">{CLAIM[card.confidence]}</span>}
      </span>}
      <span className="deck-insight-no">{String(index + 1).padStart(2, "0")}{total ? <small> of {String(total).padStart(2, "0")}</small> : null}</span>
      {onStep && <span className="dk-stepper"><button type="button" className="icon-button" aria-label="Previous insight" disabled={index === 0} onClick={() => onStep(-1)}><ChevronLeft size={15}/></button>
        <button type="button" className="icon-button" aria-label="Next insight" disabled={!!total && index >= total - 1} onClick={() => onStep(1)}><ChevronRight size={15}/></button></span>}
    </header>
    <div className="deck-insight-body">
      <div className="deck-insight-claim"><div ref={claim} className="deck-claim-content">
        <div className="deck-insight-headline"><InsightDrilldown modal model={model} chapterId={chapterId} headline={card.headline} metrics={cited} table={table}>{card.headline}</InsightDrilldown></div>
        {!!anatomy.length && <ol className="deck-chain">{anatomy.map(step => <li key={step.key} data-step={step.key}>
          <span className="deck-chain-label"><step.icon size={12}/>{step.label}</span><p>{step.text}</p>
        </li>)}</ol>}
        {card.action && <div className="deck-insight-move">
          <ArrowRightCircle size={18}/>
          <div><b>{plan ? "The move" : "Recommended move"}</b><p>{card.action}</p>
            {(card.ownerArea || card.horizon) && <span className="deck-insight-owner">{card.ownerArea && <span><Users size={12}/>{card.ownerArea}</span>}{card.horizon && <span><CalendarClock size={12}/>{card.horizon}</span>}</span>}
          </div>
        </div>}
        {card.trend && !plan && <footer className="deck-insight-foot">
          <span title={card.trend}><Activity size={12}/>{durability(card.trend)}</span>
        </footer>}
      </div></div>
      {(cited.length > 0 || table || card.evidence) && <aside className="deck-insight-proof" aria-label="Evidence">
        <span className="deck-eyebrow"><ShieldCheck size={13}/>Evidence</span><small className="deck-proof-source">{model.scope.studio} · {model.scope.month} · saved report</small>
        {card.evidence && <p className="deck-insight-evidence">{card.evidence}</p>}
        {cited.map(({ id, data }) => <div className="deck-proof-metric" key={id} data-tone={tone(id, data.total[id], data.prior[id])}>
          <span>{definition(id)?.label ?? id}</span><strong>{fmt(id, data.total[id])}</strong>
          <Spark id={id} history={data.history.slice(-12)} width={120} height={24} />
          <small>Previous month {fmt(id, data.prior[id])} · Last year {fmt(id, data.priorYear[id])}</small><em>MoM {delta(id, data.total[id], data.prior[id])} · YoY {delta(id, data.total[id], data.priorYear[id])}</em>
        </div>)}
        <div className="dk-proof-actions">
        {cited[0] && drill && <button type="button" className="deck-proof-toggle" onClick={() => drill({ metric: cited[0].id, chapterId: chapterId, table, group: card.highlight?.[0] })}><Database size={13}/>Explore records</button>}
        {(table || cited[0]) && <button type="button" className="deck-proof-toggle" aria-expanded={chart} onClick={() => setChart(c => !c)}><ChartNoAxesColumn size={13}/>{chart ? "Hide chart" : table ? `Show ${table.title.toLowerCase()}` : "Show trend"}</button>}
        </div>
        {!!cited.length && <details className="deck-proof-definitions"><summary>Definitions & source coverage</summary>{cited.map(({ id, data }) => <p key={id}><b>{definition(id)?.label}</b> · {definition(id)?.description}<br/>{data.n.toLocaleString('en-IN')} contributing records · {data.history.length} months. {data.notes?.join(' ')}</p>)}</details>}
        {!fullVisual && visual}
      </aside>}
      {fullVisual && visual}
    </div>
  </article>;
}
