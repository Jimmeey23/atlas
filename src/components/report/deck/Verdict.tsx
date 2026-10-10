import { GitBranch, Crosshair, ShieldCheck, Activity, IndianRupee, Flag, Radar, ArrowUpRight, ArrowDownRight, Gavel, Users, CalendarClock, CircleDot } from "lucide-react";
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

const DIAGNOSIS: (keyof InsightCard)[] = ["driver", "concentration", "offset"];
/** A one-word durability label read from the AI's verdict, for the pill. */
export function durability(text: string) {
  const t = text.toLowerCase();
  return /one-?off|temporary|single month/.test(t) ? "One-off" : /season/.test(t) ? "Seasonal" : /revers/.test(t) ? "Reversing" : /persist|consecutive|sustained|for \d+ months|structural/.test(t) ? "Persistent" : /new\b|emerging|first/.test(t) ? "New" : "Mixed";
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
    </div>
    <Bullets text={narrative.summary || card?.meaning} path={narrative.summary ? ["narratives", tab, "summary"] : [...base, "meaning"]} lead />
    {card && !!facets.length && <div className="deck-diagnosis">
      {facets.some(f => DIAGNOSIS.includes(f.key)) && <section className="deck-diag-col" aria-label="Diagnosis">
        <h3 className="deck-diag-title"><GitBranch size={14}/>Diagnosis<small>Why it moved and where</small></h3>
        <ol className="deck-diag-chain">{facets.filter(f => DIAGNOSIS.includes(f.key)).map((f, i) => <li key={f.key} data-kind={f.key}>
          <span className="deck-diag-node"><f.icon size={14}/></span>
          <div><b>{f.label}<em>{String(i + 1).padStart(2, "0")}</em></b><EditableText path={[...base, f.key]} value={card[f.key] as string | undefined} as="p" placeholder={f.question} /></div>
        </li>)}</ol>
      </section>}
      <section className="deck-diag-col deck-outlook" aria-label="Outlook">
        <h3 className="deck-diag-title"><Activity size={14}/>Outlook<small>What it is worth and what to watch</small></h3>
        {(card.impact || edit?.editing) && <div className="deck-stake"><span><IndianRupee size={16}/>Value at stake</span><EditableText path={[...base, "impact"]} value={card.impact} as="p" placeholder="What is it worth?" /></div>}
        {(card.trend || edit?.editing) && <div className="deck-outlook-row"><header><Activity size={14}/><b>Structural or one-off?</b>{card.trend && <i className="deck-durability" data-kind={durability(card.trend)}>{durability(card.trend)}</i>}</header>
          <EditableText path={[...base, "trend"]} value={card.trend} as="p" placeholder="Will it last?" /></div>}
        {(card.watch || edit?.editing) && <div className="deck-outlook-row deck-watch"><header><Radar size={14}/><b>Watch next month</b></header>
          <EditableText path={[...base, "watch"]} value={card.watch} as="p" placeholder="Leading indicator and threshold" /></div>}
      </section>
    </div>}
    {card && (decision || edit?.editing) && <div className="deck-decision">
      <span className="deck-decision-icon"><Flag size={16}/></span>
      <div><b>Decision for leadership</b><EditableText path={[...base, card.action ? "action" : "recommendation"]} value={decision} as="p" placeholder="The move leadership should make" />
        {(card.ownerArea || card.horizon) && <div className="r2-move-meta">{card.ownerArea && <span><Users size={12}/>{card.ownerArea}</span>}{card.horizon && <span><CalendarClock size={12}/>{card.horizon}</span>}</div>}</div>
    </div>}
  </section>;
}
