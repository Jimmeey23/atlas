import { GitBranch, Crosshair, ShieldCheck, Activity, IndianRupee, Flag, Radar, ArrowUpRight, ArrowDownRight, Gavel, Users, CalendarClock, CircleDot } from "lucide-react";
import type { ReactNode } from "react";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import type { ChapterData, InsightCard, ReportModel } from "../../../report/model";
import { EditableText, useEdit } from "./editing";

/** Sentences as bullets; keeps decimals and ₹ amounts intact. */
export const sentences = (text?: string) => (text ?? "").split(/(?<=[.!?])\s+(?=[A-Z₹0-9“"(])/).map(s => s.trim()).filter(Boolean);

export function Bullets({ text, path, lead = false }: { text?: string; path: (string | number)[]; lead?: boolean }) {
  const edit = useEdit();
  if (edit?.editing) return <EditableText path={path} value={text} as="p" className="deck-prose" placeholder="Write the summary…" />;
  const parts = sentences(text);
  if (!parts.length) return null;
  return <ul className="deck-bullets" data-lead={lead}>{parts.map((s, i) => <li key={i}><CircleDot size={13} aria-hidden="true"/><span>{s}</span></li>)}</ul>;
}

/**
 * Verdict categories a leadership team acts on: why it moved, where, what held up,
 * whether it lasts, what it is worth, the decision and the signal to watch.
 */
export const VERDICT_FACETS: { key: keyof InsightCard; label: string; question: string; icon: typeof GitBranch }[] = [
  { key: "driver", label: "Root cause", question: "Why did it move?", icon: GitBranch },
  { key: "concentration", label: "Where it concentrates", question: "Which segments carry it?", icon: Crosshair },
  { key: "offset", label: "What held up", question: "The counter-signal", icon: ShieldCheck },
  { key: "trend", label: "Structural or one-off?", question: "Will it last?", icon: Activity },
  { key: "impact", label: "Value at stake", question: "What is it worth?", icon: IndianRupee },
  { key: "watch", label: "Watch next month", question: "Leading indicator", icon: Radar },
];

function Facet({ icon: Icon, label, question, children, kind }: { icon: typeof GitBranch; label: string; question: string; children: ReactNode; kind: string }) {
  return <section className="deck-facet" data-kind={kind}><header><span className="deck-facet-icon"><Icon size={15}/></span><div><b>{label}</b><small>{question}</small></div></header>{children}</section>;
}

/** The movers this verdict rests on, computed from the frozen figures. */
export function SignalStrip({ data, ids }: { data?: ChapterData; ids: string[] }) {
  if (!data) return null;
  const movers = ids.filter(id => data.total[id] != null && data.prior[id] != null)
    .map(id => ({ id, rel: Number(data.prior[id]) ? Number(data.total[id]) / Number(data.prior[id]) - 1 : 0 }))
    .sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel)).slice(0, 4);
  if (!movers.length) return null;
  return <div className="deck-signal-strip" aria-label="Largest month-on-month moves">{movers.map(({ id }) => {
    const up = Number(data.total[id]) >= Number(data.prior[id]);
    const good = up === (definition(id)?.higherIsBetter ?? true);
    return <span key={id} className="deck-signal" data-tone={good ? "up" : "down"}>{up ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}<b>{definition(id)?.label}</b>{fmt(id, data.total[id])}<em>{delta(id, data.total[id], data.prior[id])}</em></span>;
  })}</div>;
}

export function VerdictPanel({ model, tab, ids }: { model: ReportModel; tab: string; ids: string[] }) {
  const edit = useEdit();
  const narrative = model.narratives[tab];
  const cards = narrative?.cards ?? [];
  const index = Math.max(0, cards.findIndex(c => c.focus === "kpis"));
  const card = cards[index];
  if (!narrative || (!narrative.summary && !card)) return null;
  const base = ["narratives", tab, "cards", index];
  const facets = VERDICT_FACETS.filter(f => edit?.editing || card?.[f.key]);
  const decision = card?.action || card?.recommendation;
  return <section className="deck-verdict">
    <div className="deck-verdict-head">
      <span className="deck-eyebrow"><Gavel size={12}/>Chapter verdict</span>
      {card && <EditableText path={[...base, "headline"]} value={card.headline} as="h2" multiline={false} placeholder="Verdict headline" />}
      <SignalStrip data={model.chapters[tab]} ids={ids} />
    </div>
    <Bullets text={narrative.summary || card?.meaning} path={narrative.summary ? ["narratives", tab, "summary"] : [...base, "meaning"]} lead />
    {card && !!facets.length && <div className="deck-facets">{facets.map(f => <Facet key={f.key} icon={f.icon} label={f.label} question={f.question} kind={f.key}>
      <EditableText path={[...base, f.key]} value={card[f.key] as string | undefined} as="p" placeholder={f.question} />
    </Facet>)}</div>}
    {card && (decision || edit?.editing) && <div className="deck-decision">
      <span className="deck-facet-icon"><Flag size={15}/></span>
      <div><b>Decision for leadership</b><EditableText path={[...base, card.action ? "action" : "recommendation"]} value={decision} as="p" placeholder="The move leadership should make" />
        {(card.ownerArea || card.horizon) && <div className="r2-move-meta">{card.ownerArea && <span><Users size={12}/>{card.ownerArea}</span>}{card.horizon && <span><CalendarClock size={12}/>{card.horizon}</span>}</div>}</div>
    </div>}
  </section>;
}
