import { useState } from "react";
import { TrendingUp, TriangleAlert, GitBranch, Lightbulb, Radar, ArrowRightCircle, Crosshair, IndianRupee, ShieldCheck, Users, CalendarClock, ChevronRight, ChartNoAxesColumn, Eye, Activity } from "lucide-react";
import { InsightDrilldown } from "../InsightDrilldown";
import { FocusBars, FocusTrend, lensLabel, lensOf, metricSource } from "../Insight";
import { chapters } from "../../../report/chapters";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import type { ChapterData, InsightCard, InsightLens, ReportModel } from "../../../report/model";
import { durability } from "./Verdict";

const LENS_ICON: Record<InsightLens, typeof TrendingUp> = { win: TrendingUp, risk: TriangleAlert, driver: GitBranch, opportunity: Lightbulb, watch: Radar, next_step: ArrowRightCircle };
const tone = (id: string, value: unknown, prior: unknown) => value == null || prior == null || Number(value) === Number(prior) ? "flat" : (Number(value) > Number(prior)) === (definition(id)?.higherIsBetter ?? true) ? "up" : "down";

/**
 * An insight read top to bottom as an argument: the claim, the causal chain
 * (cause → where → worth), the move, and the proof beside it.
 */
export function DeckInsightCard({ card, model, chapterId, index, plan = false, confidence = true }: { card: InsightCard; model: ReportModel; chapterId: string; index: number; plan?: boolean; confidence?: boolean }) {
  const [chart, setChart] = useState(false);
  const lens = lensOf(card);
  const Icon = LENS_ICON[lens];
  const table = model.chapters[chapterId]?.groups.find(g => (g.id ?? g.field) === card.focus);
  const cited = (card.metrics?.length ? card.metrics : [table?.compare, ...(chapters.find(c => c.id === chapterId)?.metrics ?? [])].filter((id): id is string => !!id).slice(0, 2))
    .map(id => ({ id, data: metricSource(model, chapterId, id) })).filter((m): m is { id: string; data: ChapterData } => !!m.data && m.data.total[m.id] != null).slice(0, 3);
  const cause = card.driver || card.reasoning;
  const chain = [
    cause && { key: "cause", icon: GitBranch, label: plan ? "Why this move" : "Cause", text: plan && card.recommendation ? card.recommendation : cause },
    card.concentration && { key: "where", icon: Crosshair, label: "Where", text: card.concentration },
    card.impact && { key: "worth", icon: IndianRupee, label: "Worth", text: card.impact },
  ].filter(Boolean) as { key: string; icon: typeof GitBranch; label: string; text: string }[];
  const levels = { high: 3, medium: 2, low: 1 } as const;
  return <article className="deck-insight" data-lens={lens} data-priority={card.priority ?? "medium"}>
    <header className="deck-insight-top">
      <span className="deck-insight-lens"><Icon size={14}/>{lensLabel(lens)}</span>
      {card.priority && <span className="deck-insight-priority" data-priority={card.priority}>{card.priority} priority</span>}
      {confidence && card.confidence && <span className="deck-insight-confidence" title={`${card.confidence} confidence`} aria-label={`${card.confidence} confidence`}>
        {[1, 2, 3].map(n => <i key={n} data-on={n <= levels[card.confidence!]} />)}<small>{card.confidence} confidence</small></span>}
      <span className="deck-insight-no">{String(index + 1).padStart(2, "0")}</span>
    </header>
    <div className="deck-insight-body">
      <div className="deck-insight-claim">
        <div className="deck-insight-headline"><InsightDrilldown model={model} chapterId={chapterId} headline={card.headline} metrics={cited} table={table}>{card.headline}</InsightDrilldown></div>
        {card.meaning && <p className="deck-insight-meaning">{card.meaning}</p>}
        {!!chain.length && <ol className="deck-chain">{chain.map((step, i) => <li key={step.key} data-step={step.key}>
          <span className="deck-chain-label"><step.icon size={12}/>{step.label}</span><p>{step.text}</p>
          {i < chain.length - 1 && <ChevronRight className="deck-chain-arrow" size={16} aria-hidden="true"/>}
        </li>)}</ol>}
        {(card.action || (plan && card.recommendation)) && <div className="deck-insight-move">
          <ArrowRightCircle size={18}/>
          <div><b>{plan ? "The move" : "Recommended move"}</b><p>{card.action || card.recommendation}</p>
            {(card.ownerArea || card.horizon) && <span className="deck-insight-owner">{card.ownerArea && <span><Users size={12}/>{card.ownerArea}</span>}{card.horizon && <span><CalendarClock size={12}/>{card.horizon}</span>}</span>}</div>
        </div>}
        {(card.offset || card.trend || card.watch) && <footer className="deck-insight-foot">
          {card.trend && !plan && <span title={card.trend}><Activity size={12}/>{durability(card.trend)}</span>}
          {card.offset && <span title={card.offset}><ShieldCheck size={12}/>Held up: {card.offset}</span>}
          {card.watch && <span title={card.watch}><Eye size={12}/>Watch: {card.watch}</span>}
        </footer>}
      </div>
      {(cited.length > 0 || table || card.evidence) && <aside className="deck-insight-proof" aria-label="Evidence">
        <span className="deck-eyebrow">Proof</span>
        {card.evidence && <p className="deck-insight-evidence">{card.evidence}</p>}
        {cited.map(({ id, data }) => <div className="deck-proof-metric" key={id} data-tone={tone(id, data.total[id], data.prior[id])}>
          <span>{definition(id)?.label ?? id}</span><strong>{fmt(id, data.total[id])}</strong>
          <em>MoM {delta(id, data.total[id], data.prior[id])}</em><em>YoY {delta(id, data.total[id], data.priorYear[id])}</em>
        </div>)}
        {(table || cited[0]) && <button type="button" className="deck-proof-toggle" aria-expanded={chart} onClick={() => setChart(c => !c)}><ChartNoAxesColumn size={13}/>{chart ? "Hide chart" : table ? `Show ${table.title.toLowerCase()}` : "Show trend"}</button>}
        {chart && (table ? <FocusBars table={table} highlight={card.highlight} metric={card.metrics?.find(id => table.columns.includes(id))} /> : cited[0] && <FocusTrend id={cited[0].id} history={cited[0].data.history.slice(-14)} />)}
      </aside>}
    </div>
  </article>;
}
