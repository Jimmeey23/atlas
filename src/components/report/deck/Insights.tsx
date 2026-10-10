import { useState } from "react";
import { TrendingUp, TriangleAlert, GitBranch, Lightbulb, Radar, ArrowRightCircle, Plus, Trash2, ListFilter } from "lucide-react";
import { InsightBlock, lensOf, lensLabel } from "../Insight";
import { reportOptions } from "../../../report/options";
import { INSIGHT_LENSES, type InsightCard, type InsightLens, type ReportModel } from "../../../report/model";
import { EditableText, useEdit } from "./editing";
import { VERDICT_FACETS } from "./Verdict";

const LENS_ICON: Record<InsightLens, typeof TrendingUp> = { win: TrendingUp, risk: TriangleAlert, driver: GitBranch, opportunity: Lightbulb, watch: Radar, next_step: ArrowRightCircle };

function InsightEditor({ card, path, onRemove }: { card: InsightCard; path: (string | number)[]; onRemove: () => void }) {
  const edit = useEdit()!;
  return <article className="deck-insight-edit" data-lens={lensOf(card)}>
    <header>
      <select aria-label="Insight lens" value={lensOf(card)} onChange={e => edit.set([...path, "lens"], e.target.value)}>{INSIGHT_LENSES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
      <select aria-label="Priority" value={card.priority ?? "medium"} onChange={e => edit.set([...path, "priority"], e.target.value)}>{["high", "medium", "low"].map(p => <option key={p} value={p}>{p} priority</option>)}</select>
      <button className="icon-button" aria-label="Delete insight" title="Delete insight" onClick={onRemove}><Trash2 size={14}/></button>
    </header>
    <EditableText path={[...path, "headline"]} value={card.headline} as="h3" multiline={false} placeholder="Headline" />
    <EditableText path={[...path, "meaning"]} value={card.meaning} as="p" placeholder="Why it matters" />
    <div className="deck-facets">{VERDICT_FACETS.map(f => <section className="deck-facet" key={f.key}><header><span className="deck-facet-icon"><f.icon size={14}/></span><div><b>{f.label}</b></div></header>
      <EditableText path={[...path, f.key]} value={card[f.key] as string | undefined} as="p" placeholder={f.question} /></section>)}</div>
    <section className="deck-facet"><header><span className="deck-facet-icon"><ArrowRightCircle size={14}/></span><div><b>Recommended move</b></div></header><EditableText path={[...path, "action"]} value={card.action} as="p" placeholder="The move" /></section>
    <section className="deck-facet"><header><div><b>Evidence</b></div></header><EditableText path={[...path, "evidence"]} value={card.evidence} as="p" placeholder="Exact figures" /></section>
  </article>;
}

/** Insight cards with a lens filter; admins in edit mode rewrite, add or delete them. */
export function InsightsSection({ model, tab, plan = false }: { model: ReportModel; tab: string; plan?: boolean }) {
  const edit = useEdit();
  const [lens, setLens] = useState<InsightLens | "all">("all");
  const options = reportOptions(model.customization);
  const cards = model.narratives[tab]?.cards ?? [];
  const verdictIndex = cards.findIndex(c => c.focus === "kpis");
  const indexed = cards.map((card, index) => ({ card, index })).filter(({ index }) => index !== verdictIndex || cards.length === 1);
  const lenses = [...new Set(indexed.map(({ card }) => lensOf(card)))];
  const shown = indexed.filter(({ card }) => lens === "all" || lensOf(card) === lens);
  const path = (i: number) => ["narratives", tab, "cards", i];
  if (edit?.editing) return <div className="deck-insights">
    {indexed.map(({ card, index }) => <InsightEditor key={index} card={card} path={path(index)} onRemove={() => edit.set(["narratives", tab, "cards"], cards.filter((_, i) => i !== index))}/>)}
    <button className="button deck-add" onClick={() => edit.set(["narratives", tab, "cards"], [...cards, { headline: "New insight", meaning: "", evidence: "", action: "", lens: plan ? "next_step" : "driver", focus: "cross", priority: "medium", confidence: "medium" } satisfies InsightCard])}><Plus size={14}/>Add insight</button>
  </div>;
  if (!indexed.length) return <p className="empty-state">No written insights for this chapter. The verdict and evidence tabs carry the figures.</p>;
  return <div className="deck-insights">
    {lenses.length > 1 && <div className="deck-lens-filter" role="group" aria-label="Filter insights by lens">
      <ListFilter size={14}/>
      <button aria-pressed={lens === "all"} onClick={() => setLens("all")}>All <b>{indexed.length}</b></button>
      {lenses.map(id => { const Icon = LENS_ICON[id]; return <button key={id} data-lens={id} aria-pressed={lens === id} onClick={() => setLens(id)}><Icon size={13}/>{lensLabel(id)} <b>{indexed.filter(({ card }) => lensOf(card) === id).length}</b></button>; })}
    </div>}
    <div className="r2-insights">{shown.map(({ card, index }, i) => <InsightBlock key={index} card={card} model={model} chapterId={tab} index={i} plan={plan} targets={model.customization?.targets}
      inlineEvidence={options.showInlineEvidence && options.showCharts} confidence={options.showConfidence} />)}</div>
  </div>;
}
