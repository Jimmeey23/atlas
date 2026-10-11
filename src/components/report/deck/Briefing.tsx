import { CalendarClock, Crosshair, Database, Flag, Gauge, IndianRupee, Scale, ShieldAlert, ShieldCheck, Sparkles, Target, Telescope, Users } from "lucide-react";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import { briefingOf, decisionMetrics, decisionOf, driverBridge, extremes, readingLines, verdictCard, yearPosition, type DriverBridge } from "../../../report/brief";
import type { ChapterBriefing, InsightCard, ReportModel } from "../../../report/model";
import { monthLabel } from "../../../report/period";
import { EditableText, useEdit } from "./editing";
import { useRecordDrilldown } from "./RecordDrilldown";
import { Emphasis } from "./Layout";

const tone = (id: string, value: unknown, prior: unknown) => value == null || prior == null || Number(value) === Number(prior) ? "flat" : (Number(value) > Number(prior)) === (definition(id)?.higherIsBetter ?? true) ? "up" : "down";

/** Contribution of every row in the chapter's main breakdown, biggest move first. */
function Bridge({ bridge }: { bridge: DriverBridge }) {
  const v = (value: number) => `${value > 0 ? "+" : "−"}${fmt(bridge.metric, Math.abs(value))}`;
  return <section className="dk-bridge" aria-label={`What moved ${definition(bridge.metric)?.label ?? bridge.metric}`}>
    <div className="dk-bridge-head">
      <span className="deck-eyebrow"><Gauge size={12}/>What moved the number</span>
      <span className="dk-bridge-net"><span>{definition(bridge.metric)?.label} net movement</span><b data-tone={bridge.net >= 0 ? "up" : "down"}>{v(bridge.net)}</b><span>on last month</span></span>
    </div>
    <div className="dk-bridge-rows">
      {bridge.rows.map(row => <div className="dk-bridge-row" key={row.name}>
        <b title={row.name}>{row.name}</b>
        <span className="dk-bridge-bar"><i data-sign={row.change < 0 ? "negative" : "positive"} style={{ width: `${Math.max(2, row.share * 100)}%`, [row.change < 0 ? "right" : "left"]: 0 } as never}/></span>
        <em data-tone={row.change > 0 ? "up" : "down"}>{v(row.change)}</em>
      </div>)}
      {bridge.rest && <div className="dk-bridge-row" data-rest="true">
        <b>{bridge.rest.count} smaller {bridge.rest.count === 1 ? "row" : "rows"}</b>
        <span className="dk-bridge-bar"><i data-sign={bridge.rest.change < 0 ? "negative" : "positive"} style={{ width: `${Math.max(2, Math.abs(bridge.rest.change) / (bridge.peak || 1) * 100)}%`, [bridge.rest.change < 0 ? "right" : "left"]: 0 } as never}/></span>
        <em data-tone={bridge.rest.change > 0 ? "up" : "down"}>{v(bridge.rest.change)}</em>
      </div>}
    </div>
    <p className="dk-bridge-note">{definition(bridge.metric)?.label} by {bridge.rows[0]?.name && /\(/.test(bridge.rows[0].name) ? "group" : "row"} of the chapter breakdown, largest move first. The rows partition the total, so they add up to the net figure above — arithmetic on recorded figures, not attribution.</p>
  </section>;
}

/** The chapter's reading: the verdict, the sentences that add to it, and the judgements beside it. */
export function BriefingPanel({ model, chapter, ids }: { model: ReportModel; chapter: string; ids: string[] }) {
  const edit = useEdit();
  const narrative = model.narratives[chapter];
  if (!narrative) return null;
  const b = briefingOf(model, chapter, ids);
  const v = verdictCard(model, chapter);
  const data = model.chapters[chapter];
  const path = (key: string) => ["narratives", chapter, "briefing", key];
  const lines = readingLines(b, v?.headline);
  const bridge = driverBridge(data, ids);
  const lead = ids.find(id => data?.total[id] != null);
  const position = lead && data ? yearPosition(lead, data, model.scope.month) : null;
  const spread = lead && data ? extremes(lead, data) : null;
  type Judgement = { key: keyof ChapterBriefing | "position"; label: string; icon: typeof Crosshair; band?: "critical" | "watch" | "held"; text: string; editable?: boolean };
  const judgements: Judgement[] = [
    b.whereItSits && { key: "whereItSits", label: "Where it sits", icon: Crosshair, band: "watch" as const, text: b.whereItSits, editable: true },
    position && spread && lead && { key: "position", label: "Against the year", icon: Gauge, text: `${definition(lead)?.label} is ${ordinal(position.rank)} of the ${position.of} recorded months in ${model.scope.month.slice(0, 4)}; the fourteen-month range runs ${fmt(lead, spread.lo.v)} (${monthLabel(spread.lo.month).split(" ")[0]}) to ${fmt(lead, spread.hi.v)} (${monthLabel(spread.hi.month).split(" ")[0]}).` },
    b.whatHeldUp && { key: "whatHeldUp", label: "What held up", icon: ShieldCheck, band: "held" as const, text: b.whatHeldUp, editable: true },
    b.outlook && { key: "outlook", label: "Durability", icon: Telescope, band: "watch" as const, text: b.outlook, editable: true },
  ].filter(Boolean) as Judgement[];
  return <section className="dk-brief" aria-label="The reading">
    <div className="dk-brief-head">
      <div className="dk-brief-kicker"><span className="deck-eyebrow">The reading</span>
        {!b.written && <span className="dk-chip" title="Assembled from the verdict card and frozen figures; regenerate the analysis for the full briefing.">From the verdict</span>}</div>
      {v && <EditableText path={["narratives", chapter, "cards", Math.max(0, narrative.cards.findIndex(c => c.focus === "kpis")), "headline"]} value={v.headline} as="h2" multiline={false} placeholder="Verdict headline" />}
    </div>
    <div className="dk-reading">{lines.map(line => <p key={line}><Emphasis text={line}/></p>)}</div>
    {!!judgements.length && <dl className="dk-judgements">{judgements.map(j => <div key={j.key} data-band={j.band}>
      <dt><j.icon size={12}/>{j.label}</dt>
      <dd>{j.editable ? <EditableText path={path(String(j.key))} value={j.text} as="span" placeholder={j.label} /> : j.text}</dd>
    </div>)}</dl>}
    {bridge && <Bridge bridge={bridge}/>}
  </section>;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/**
 * The action centre: what leadership is being asked to do, in priority order, each
 * item carrying its owner, the figures it rests on and the measure that will show
 * whether it worked. The written decision leads; the highest-priority findings that
 * carry a move fill the queue behind it.
 */
export function ActionCentre({ model, chapter, ids }: { model: ReportModel; chapter: string; ids: string[] }) {
  const edit = useEdit();
  const drill = useRecordDrilldown();
  const d = decisionOf(model, chapter);
  const narrative = model.narratives[chapter];
  const cards = (narrative?.cards ?? []).filter((card): card is InsightCard => card.focus !== "kpis" && !!card.action && (card.priority ?? "medium") !== "low");
  const figures = decisionMetrics(model, chapter, ids);
  const data = model.chapters[chapter];
  const priorityLabel = ["Immediate", "Investigate", "Monitor"];
  type Item = { priority: number; title: string; why: string; owner?: string; horizon?: string; impact?: string; measure?: string; risk?: string; figures: string[]; written: boolean; card?: InsightCard };
  const items: Item[] = [
    d && { priority: 1, title: d.call, why: d.rationale, owner: d.owner, horizon: d.horizon, impact: d.expectedImpact, measure: d.successMeasure, risk: d.risks, figures, written: d.written },
    ...cards.slice(0, 2).map((card, i) => ({
      priority: i + 2, title: card.action, why: card.meaning || card.recommendation || "", owner: card.ownerArea, horizon: card.horizon,
      impact: card.impact, measure: card.watch, risk: card.offset, figures: (card.metrics ?? []).filter(id => data?.total[id] != null).slice(0, 3), written: false, card,
    })),
  ].filter((item): item is NonNullable<typeof item> => !!item) as Item[];
  if (!items.length && !edit?.editing) return null;
  const path = (key: string) => ["narratives", chapter, "decision", key];
  return <section className="dk-decision" aria-label="Action centre">
    <header>
      <span className="dk-decision-badge"><Flag size={14}/>Action centre</span>
      <span className="dk-decision-meta">
        <span><Target size={12}/>{items.length} priorit{items.length === 1 ? "y" : "ies"}</span>
        {d?.owner && <span><Users size={12}/>{d.owner}</span>}
        {d?.horizon && <span><CalendarClock size={12}/>{d.horizon}</span>}
        {!d?.written && <span title="Built from the verdict card; regenerate the analysis for the full decision case."><Sparkles size={12}/>From the verdict</span>}
      </span>
    </header>
    <div className="dk-actions">
      {items.map(item => <article className="dk-action" key={`${item.priority}-${item.title}`} data-priority={item.priority}>
        <span className="dk-action-pri"><b>P{item.priority}</b><small>{priorityLabel[item.priority - 1]}</small></span>
        <div className="dk-action-main">
          <h4>{item.priority === 1 && edit?.editing ? <EditableText path={path("call")} value={item.title} as="span" multiline={false} placeholder="The action"/> : <Emphasis text={item.title}/>}</h4>
          {item.why && <p>{item.priority === 1 && edit?.editing ? <EditableText path={path("rationale")} value={item.why} as="span" placeholder="Why this call"/> : <Emphasis text={item.why}/>}</p>}
          {(item.owner || item.horizon) && <span className="dk-action-owner">
            {item.owner && <span><Users size={12}/>{item.owner}</span>}
            {item.horizon && <span><CalendarClock size={12}/>{item.horizon}</span>}
            {item.card?.lens && <span><Flag size={12}/>{item.card.lens.replace("_", " ")}</span>}
          </span>}
          {!!item.figures.length && <div className="dk-action-evidence" aria-label="Figures behind this action">
            {item.figures.map(id => data && <button type="button" key={id} onClick={() => drill?.({ metric: id, chapterId: chapter })} title={`Open ${definition(id)?.label ?? id} source records`}>
              <span>{definition(id)?.label ?? id}</span>
              <strong>{fmt(id, data.total[id])}</strong>
              <em data-tone={tone(id, data.total[id], data.prior[id])}>{delta(id, data.total[id], data.prior[id])} MoM · {delta(id, data.total[id], data.priorYear[id])} YoY</em>
              <i aria-hidden="true"><Database size={11}/>Records</i>
            </button>)}
          </div>}
        </div>
        <div className="dk-action-side">
          <dl>
            {item.impact && <div><dt><IndianRupee size={11}/>Expected outcome</dt><dd>{item.impact}</dd></div>}
            {item.measure && <div><dt><Target size={11}/>How we will know</dt><dd>{item.measure}</dd></div>}
            {item.risk && <div><dt><ShieldAlert size={11}/>Guardrail</dt><dd>{item.risk}</dd></div>}
            {item.priority === 1 && d?.alternative && <div><dt><Scale size={11}/>Alternative considered</dt><dd>{d.alternative}</dd></div>}
          </dl>
        </div>
      </article>)}
    </div>
    {d?.successMeasure && <p className="dk-outlook-goal"><Target size={14}/>Measured by: <b>{d.successMeasure}</b></p>}
    {data && <p className="dk-bridge-note">Every figure above is a frozen report figure, and each one opens its source records. Owners are teams; horizons are review windows, not commitments.</p>}
  </section>;
}

/** Kept for the presenter's speaker notes and older saved reports. */
export const DecisionPanel = ActionCentre;
