import { Activity, ArrowDownRight, ArrowUpRight, CalendarClock, Crosshair, Flag, GitBranch, Minus, Scale, ShieldAlert, ShieldCheck, Sparkles, Target, Telescope, Coins, Users, ScrollText } from "lucide-react";
import { Spark } from "../Insight";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import { briefingOf, decisionMetrics, decisionOf, verdictCard } from "../../../report/brief";
import type { ChapterBriefing, ReportModel } from "../../../report/model";
import { EditableText, useEdit } from "./editing";
import { Emphasis, Marquee } from "./Layout";
import { useRecordDrilldown } from "./RecordDrilldown";

const tone = (id: string, value: unknown, prior: unknown) => value == null || prior == null || Number(value) === Number(prior) ? "flat" : (Number(value) > Number(prior)) === (definition(id)?.higherIsBetter ?? true) ? "up" : "down";

/** Each briefing field answers one question; "why" gets the widest tile because that is where challenge comes. */
const FIELDS: { key: Exclude<keyof ChapterBriefing, "takeaways">; label: string; question: string; icon: typeof Activity; wide?: boolean }[] = [
  { key: "whatChanged", label: "What changed", question: "Size and direction of the move", icon: Activity },
  { key: "whyItMoved", label: "Why it moved", question: "Decomposition and leading hypothesis", icon: GitBranch, wide: true },
  { key: "whereItSits", label: "Where it sits", question: "Segments carrying the movement", icon: Crosshair },
  { key: "whatHeldUp", label: "What held up", question: "The counter-signal", icon: ShieldCheck },
  { key: "outlook", label: "Outlook", question: "Durability and next month", icon: Telescope },
  { key: "soWhat", label: "So what", question: "Consequence if nothing changes", icon: Target },
];

/** The chapter's first page: headline verdict, numbered takeaways and six questions answered. */
export function BriefingPanel({ model, chapter, ids }: { model: ReportModel; chapter: string; ids: string[] }) {
  const edit = useEdit();
  const narrative = model.narratives[chapter];
  if (!narrative) return null;
  const b = briefingOf(model, chapter, ids);
  const cards = narrative.cards;
  const vIndex = Math.max(0, cards.findIndex(c => c.focus === "kpis"));
  const v = verdictCard(model, chapter);
  const path = (key: string) => ["narratives", chapter, "briefing", key];
  const fields = FIELDS.filter(f => edit?.editing || b[f.key]);
  // The breakdown rows that moved most, as a running strip of signals.
  const signals = (model.chapters[chapter]?.groups ?? []).flatMap(g => {
    const a = g.analysis;
    if (!a?.metric) return [];
    return [...(a.gainers ?? []).slice(0, 2), ...(a.decliners ?? []).slice(0, 2)].filter(m => m.change).map(m => ({ key: `${g.id ?? g.field}-${m.g}`, g: m.g, metric: a.metric!, change: m.change, up: (m.change > 0) === (definition(a.metric!)?.higherIsBetter ?? true) }));
  }).filter((x, i, all) => all.findIndex(y => y.key === x.key) === i).slice(0, 12);
  return <section className="dk-brief" aria-label="Chapter briefing">
    {signals.length >= 3 && <Marquee label="Largest movements in this chapter's breakdowns" speed={Math.max(28, signals.length * 5)}>
      {signals.map(x => <span key={x.key} className="dk-tick" data-tone={x.up ? "up" : "down"}><b>{x.g}</b>{x.change > 0 ? "+" : "−"}{fmt(x.metric, Math.abs(x.change))}<i>{definition(x.metric)?.label.toLowerCase()} vs last month</i></span>)}
    </Marquee>}
    <header className="dk-brief-head">
      <div className="dk-brief-kicker"><span className="deck-eyebrow"><ScrollText size={12}/>Chapter briefing</span>
        {!b.written && <span className="dk-chip" title="Assembled from the verdict card and frozen figures; regenerate the analysis for the full briefing.">From the verdict</span>}</div>
      {v && <EditableText path={["narratives", chapter, "cards", vIndex, "headline"]} value={v.headline} as="h2" multiline={false} placeholder="Verdict headline" />}
    </header>
    {!!b.takeaways.length && <ol className="dk-takeaways dk-takeaways-flow">{b.takeaways.map((t, i) => <li key={i}><span>{String(i + 1).padStart(2, "0")}</span><p><Emphasis text={t}/></p></li>)}</ol>}
    {!!fields.length && <div className="dk-brief-grid">{fields.map(f => <article key={f.key} className="dk-brief-tile" data-wide={f.wide || undefined} data-key={f.key}>
      <header><f.icon size={14}/><b>{f.label}</b><small>{f.question}</small></header>
      <EditableText path={path(f.key)} value={b[f.key]} as="p" placeholder={f.question} />
    </article>)}</div>}
  </section>;
}

/** A frozen figure the decision rests on; clicking opens its source records. */
function EvidenceFigure({ id, model, chapter }: { id: string; model: ReportModel; chapter: string }) {
  const data = model.chapters[chapter];
  const drill = useRecordDrilldown();
  if (!data) return null;
  const value = data.total[id];
  const t = tone(id, value, data.prior[id]);
  const Arrow = t === "flat" ? Minus : Number(value) >= Number(data.prior[id]) ? ArrowUpRight : ArrowDownRight;
  return <button type="button" className="dk-figure" data-tone={t} onClick={() => drill?.({ metric: id, chapterId: chapter })} title={`Open ${definition(id)?.label} source records`}>
    <span className="dk-figure-label">{definition(id)?.label ?? id}</span>
    <strong>{fmt(id, value)}</strong>
    <span className="dk-figure-delta"><Arrow size={12}/>{delta(id, value, data.prior[id])} <small>MoM</small><em>{delta(id, value, data.priorYear[id])} <small>YoY</small></em></span>
    <Spark id={id} history={data.history.slice(-12)} width={140} height={26} />
  </button>;
}

/** The decision a chapter asks of leadership, argued: the call, the case, the figures and the trade-offs. */
export function DecisionPanel({ model, chapter, ids }: { model: ReportModel; chapter: string; ids: string[] }) {
  const edit = useEdit();
  const d = decisionOf(model, chapter);
  if (!d && !edit?.editing) return null;
  const path = (key: string) => ["narratives", chapter, "decision", key];
  const figures = decisionMetrics(model, chapter, ids);
  const facts = [
    { key: "expectedImpact", label: "Expected impact", icon: Coins },
    { key: "successMeasure", label: "Success measure", icon: Target },
    { key: "risks", label: "Risks & guardrail", icon: ShieldAlert },
    { key: "alternative", label: "Alternative considered", icon: Scale },
  ] as const;
  return <section className="dk-decision" aria-label="Decision for leadership">
    <header>
      <span className="dk-decision-badge"><Flag size={14}/>Decision for leadership</span>
      <span className="dk-decision-meta">{d?.owner && <span><Users size={12}/>{d.owner}</span>}{d?.horizon && <span><CalendarClock size={12}/>{d.horizon}</span>}{d && !d.written && <span title="Built from the verdict card; regenerate for the full decision case."><Sparkles size={12}/>From the verdict</span>}</span>
    </header>
    <EditableText path={path("call")} value={d?.call} as="p" className="dk-decision-call" multiline={false} placeholder="The decision leadership should take" />
    <div className="dk-decision-body">
      <div className="dk-decision-case">
        {(d?.rationale || edit?.editing) && <><h4>Why this call</h4><EditableText path={path("rationale")} value={d?.rationale} as="p" placeholder="Why the evidence supports it" /></>}
        {!!d?.evidence.length && <><h4>What the data says</h4><ul>{d.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></>}
      </div>
      {!!figures.length && <div className="dk-decision-figures" aria-label="Figures behind the decision">{figures.map(id => <EvidenceFigure key={id} id={id} model={model} chapter={chapter} />)}</div>}
    </div>
    <dl className="dk-decision-facts">{facts.filter(f => edit?.editing || d?.[f.key]).map(f => <div key={f.key}>
      <dt><f.icon size={13}/>{f.label}</dt><dd><EditableText path={path(f.key)} value={d?.[f.key]} as="span" placeholder={f.label} /></dd>
    </div>)}</dl>
  </section>;
}
