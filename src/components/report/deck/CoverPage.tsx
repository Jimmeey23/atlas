import { ArrowDownRight, ArrowRight, ArrowRightCircle, ArrowUpRight, BookOpen, Coins, Database, Flag, Minus, ShieldAlert, Sparkles, TrendingUp, TriangleAlert } from "lucide-react";
import logo from "../../../assets/report/logo.png";
import hero from "../../../assets/report/method.jpg";
import { HEADLINE } from "../Glance";
import { lensOf, Spark, tone } from "../Insight";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import { briefingOf, verdictCard } from "../../../report/brief";
import { EXECUTIVE, chapterMetrics, type DeckTab } from "../../../report/deck";
import type { Finding } from "../../../report/findings";
import type { ChapterData, InsightCard, ReportModel } from "../../../report/model";
import { builtLabel, monthLabel } from "../../../report/period";
import { DecisionPanel } from "./Briefing";
import { Emphasis, FillGrid, Marquee } from "./Layout";

const rank = { high: 0, medium: 1, low: 2 } as const;
type Pick = { card: InsightCard; tab: DeckTab };

/** Lead measures for an area's tile: the scorecard's headline pair, then the chapter's own. */
const headlineIds = (tab: DeckTab, data: ChapterData) => [...(HEADLINE[tab.id] ?? []), ...(tab.spec?.metrics ?? [])]
  .filter((id, i, all) => all.indexOf(id) === i && definition(id) && data.total[id] != null).slice(0, 2);

function Move({ id, data }: { id: string; data: ChapterData }) {
  const t = tone(id, data.total[id], data.prior[id]);
  const Arrow = t === "flat" ? Minus : Number(data.total[id]) >= Number(data.prior[id]) ? ArrowUpRight : ArrowDownRight;
  return <span className="dk-tick" data-tone={t}><b>{definition(id)?.label}</b>{fmt(id, data.total[id])}<i><Arrow size={12}/>{delta(id, data.total[id], data.prior[id])}</i></span>;
}

/**
 * The opening page: who and when, the month in one line, every area's scorecard
 * and the calls to make. Sections without data collapse rather than leave holes.
 */
export function CoverPage({ model, tabs, ranked, onNavigate }: { model: ReportModel; tabs: DeckTab[]; ranked: Finding[]; onNavigate: (tab: string) => void }) {
  const c = model.customization;
  const period = monthLabel(model.scope.month);
  const areas = tabs.filter(t => t.id !== "overview" && t.spec && !t.spec.derived && model.chapters[t.id]?.n);
  const exec = model.narratives[EXECUTIVE];
  const execData = model.chapters[EXECUTIVE];
  const execSpec = tabs[0]?.spec;
  const execIds = execSpec ? chapterMetrics(execSpec, execData) : [];
  const verdict = exec ? verdictCard(model, EXECUTIVE) : undefined;
  const brief = exec ? briefingOf(model, EXECUTIVE, execIds) : null;
  const picks = (lenses: string[], from: DeckTab[]): Pick[] => from.flatMap(tab => (model.narratives[tab.id]?.cards ?? []).filter(card => card.focus !== "kpis").map(card => ({ card, tab })))
    .filter(p => lenses.includes(lensOf(p.card))).sort((a, b) => rank[a.card.priority ?? "medium"] - rank[b.card.priority ?? "medium"]);
  const wins = picks(["win", "opportunity"], areas).slice(0, 3);
  const risks = picks(["risk", "watch"], areas).slice(0, 3);
  const recs = tabs.find(t => t.id === "recommendations");
  const moves = recs ? picks(["next_step"], [recs]).slice(0, 3) : [];
  const fallback = (t: "opportunity" | "risk") => ranked.filter(f => f.tone === t).slice(0, 3);
  const title = c?.title && !/^monthly performance (report|review)$/i.test(c.title) ? c.title : `${model.scope.studio} monthly review`;
  const facts = [["Studio", model.scope.studio], ["Period", period], ["Prepared for", c?.preparedFor], ["Prepared by", c?.preparedBy], ["Built", builtLabel(model.builtAt)],
    ["Analysis", `${Object.values(model.narratives).filter(n => n.generated).length}/${Object.keys(model.narratives).length} chapters AI-written`]].filter(([, v]) => v) as [string, string][];

  // Every area's lead measure, for the ticker.
  const ticker = areas.flatMap(tab => { const data = model.chapters[tab.id]; return headlineIds(tab, data).filter(id => data.prior[id] != null).map(id => ({ tab, id, data })); });
  const heroStats = execIds.filter(id => execData?.prior[id] != null).slice(0, 4);
  const headlines = areas.map(tab => ({ tab, v: verdictCard(model, tab.id) })).filter(x => x.v);

  const list = (items: Pick[], kind: "wins" | "risks" | "moves", findings: Finding[] = []) => <ol className="dk-cover-list" data-kind={kind}>
    {items.map((p, i) => <li key={i}><button type="button" onClick={() => onNavigate(p.tab.id)}><b>{kind === "moves" ? p.card.action || p.card.headline : p.card.headline}</b>
      <span>{p.tab.label}{p.card.impact ? ` · ${p.card.impact}` : kind === "moves" && p.card.ownerArea ? ` · ${p.card.ownerArea}` : ""}</span></button></li>)}
    {!items.length && findings.map((f, i) => <li key={`f${i}`}><button type="button" onClick={() => onNavigate(f.chapter)}><b>{f.text.split(". ")[0]}</b><span>{tabs.find(t => t.id === f.chapter)?.label ?? f.chapter}</span></button></li>)}
  </ol>;
  const columns = [
    { key: "wins", title: "What’s working", icon: TrendingUp, items: wins, findings: wins.length ? [] : fallback("opportunity") },
    { key: "risks", title: "Needs attention", icon: TriangleAlert, items: risks, findings: risks.length ? [] : fallback("risk") },
    { key: "moves", title: "Decisions requested", icon: ArrowRightCircle, items: moves, findings: [] as Finding[] },
  ].filter(col => col.items.length || col.findings.length);

  const tiles = areas.flatMap(tab => {
    const data = model.chapters[tab.id];
    const ids = headlineIds(tab, data);
    if (!ids.length) return [];
    const tones = ids.map(id => tone(id, data.total[id], data.prior[id]));
    const status = tones.every(t => t === "up") ? "good" : tones.every(t => t === "down") ? "bad" : "mixed";
    const v = verdictCard(model, tab.id);
    return [<button type="button" key={tab.id} className="dk-score" data-status={status} onClick={() => onNavigate(tab.id)}>
      <span className="dk-score-head"><b>{tab.label}</b><i aria-label={`Overall ${status}`}/><ArrowRight size={14} className="dk-score-go"/></span>
      <span className="dk-score-metrics">{ids.map(id => <span key={id}>
        <small>{definition(id)?.label}</small><strong>{fmt(id, data.total[id])}</strong>
        <em data-tone={tone(id, data.total[id], data.prior[id])}>{delta(id, data.total[id], data.prior[id])} MoM</em>
        <em data-tone={tone(id, data.total[id], data.priorYear[id])}>{delta(id, data.total[id], data.priorYear[id])} YoY</em>
      </span>)}</span>
      <Spark id={ids[0]} history={data.history.slice(-12)} width={220} height={30} />
      {v && <span className="dk-score-verdict">{v.headline}</span>}
    </button>];
  });
  // Derived tiles complete the last row instead of leaving it ragged.
  const records = Object.values(model.chapters).reduce((s, d) => s + (d?.n ?? 0), 0);
  const stake = [verdict, ...areas.map(t => verdictCard(model, t.id))].find(v => v?.impact)?.impact;
  const fillers = [
    stake && <div key="stake" className="dk-score dk-score-filler" data-kind="stake"><span className="dk-score-head"><Coins size={15}/><b>Value at stake</b></span><p><Emphasis text={stake}/></p></div>,
    moves[0] && <button type="button" key="moves" className="dk-score dk-score-filler" data-kind="moves" onClick={() => onNavigate("recommendations")}><span className="dk-score-head"><Flag size={15}/><b>{moves.length} decision{moves.length === 1 ? "" : "s"} requested</b><ArrowRight size={14} className="dk-score-go"/></span><p>{moves[0].card.action || moves[0].card.headline}</p></button>,
    risks[0] && <button type="button" key="risk" className="dk-score dk-score-filler" data-kind="risk" onClick={() => onNavigate(risks[0].tab.id)}><span className="dk-score-head"><ShieldAlert size={15}/><b>Biggest risk · {risks[0].tab.label}</b><ArrowRight size={14} className="dk-score-go"/></span><p>{risks[0].card.headline}</p></button>,
    wins[0] && <button type="button" key="win" className="dk-score dk-score-filler" data-kind="win" onClick={() => onNavigate(wins[0].tab.id)}><span className="dk-score-head"><Sparkles size={15}/><b>Strongest signal · {wins[0].tab.label}</b><ArrowRight size={14} className="dk-score-go"/></span><p>{wins[0].card.headline}</p></button>,
    <div key="data" className="dk-score dk-score-filler" data-kind="data"><span className="dk-score-head"><Database size={15}/><b>Behind this review</b></span><p><Emphasis text={`${records.toLocaleString("en-IN")} source records across ${areas.length} areas, frozen ${builtLabel(model.builtAt)}.`}/></p></div>,
  ].filter(Boolean);

  return <div className="dk-cover">
    <header className="dk-cover-hero">
      <div className="dk-cover-copy">
        <span className="dk-cover-brand"><img src={logo} alt="Physique 57"/>Senior management review</span>
        <h1>{title}</h1>
        <p className="dk-cover-period">{period}</p>
        <p className="dk-cover-sub">{c?.subtitle || "Commercial performance, the community journey and the decisions for the month ahead."}</p>
        <dl className="dk-cover-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </div>
      <figure className="dk-cover-image"><img src={hero} alt="Physique 57 Method photography"/>
        <span className="dk-cover-stamp"><Database size={12}/>Frozen snapshot · {period}</span>
        {heroStats[0] && execData && <figcaption><span>Headline measure</span><strong>{fmt(heroStats[0], execData.total[heroStats[0]])}</strong><small>{definition(heroStats[0])?.label} · {delta(heroStats[0], execData.total[heroStats[0]], execData.prior[heroStats[0]])} MoM · {records.toLocaleString("en-IN")} source records behind this review</small></figcaption>}
      </figure>
    </header>

    {ticker.length > 2 && <Marquee label="Lead measures across every area" speed={Math.max(30, ticker.length * 5)}>
      {ticker.map(({ tab, id, data }) => <span key={`${tab.id}-${id}`} className="dk-tick-wrap"><small>{tab.label}</small><Move id={id} data={data}/></span>)}
    </Marquee>}

    {(verdict || brief?.takeaways.length) && <section className="dk-impact" aria-label="The month in one line">
      <div className="dk-impact-head">
        <span className="dk-impact-kicker"><span className="dk-pulse" aria-hidden="true"/>The month in one line · {period}</span>
        {verdict && <h2><Emphasis text={verdict.headline}/></h2>}
        {brief?.soWhat && <p className="dk-impact-so"><Emphasis text={brief.soWhat}/></p>}
      </div>
      {!!heroStats.length && execData && <dl className="dk-impact-stats">{heroStats.map(id => {
        const t = tone(id, execData.total[id], execData.prior[id]);
        return <div key={id} data-tone={t}><dt>{definition(id)?.label}</dt><dd><strong>{fmt(id, execData.total[id])}</strong><span>{delta(id, execData.total[id], execData.prior[id])} vs last month</span></dd></div>;
      })}</dl>}
      {!!brief?.takeaways.length && <ol className="dk-takeaways dk-takeaways-flow">{brief.takeaways.slice(0, 4).map((t, i) => <li key={i}><span>{String(i + 1).padStart(2, "0")}</span><p><Emphasis text={t}/></p></li>)}</ol>}
      {headlines.length > 2 && <Marquee label="Every area's verdict" reverse speed={Math.max(40, headlines.length * 9)}>
        {headlines.map(({ tab, v }) => <button type="button" key={tab.id} className="dk-headline-chip" onClick={() => onNavigate(tab.id)}><b>{tab.label}</b>{v!.headline}</button>)}
      </Marquee>}
    </section>}

    {!!tiles.length && <section aria-label="Scorecard">
      <div className="dk-section-head"><span className="deck-eyebrow">Scorecard</span><h3>Every area at a glance</h3><small>Select an area to open it</small></div>
      <FillGrid className="dk-scorecard" items={tiles} fillers={fillers as JSX.Element[]} min={250} max={4} />
    </section>}

    {!!areas.length && <section className="dk-index" aria-label="Report contents">
      <div className="dk-section-head"><span className="deck-eyebrow"><BookOpen size={12}/>Contents</span><h3>The document, chapter by chapter</h3><small>{areas.length + 1} areas · each one carries its verdict, the evidence behind it and a decision</small></div>
      <div className="dk-index-grid">{areas.map((area, i) => {
        const data = model.chapters[area.id];
        const ids = headlineIds(area, data);
        const tones = ids.map(id => tone(id, data.total[id], data.prior[id]));
        const status = tones.length ? (tones.every(t => t === "up") ? "good" : tones.every(t => t === "down") ? "bad" : "mixed") : "mixed";
        const v = verdictCard(model, area.id);
        const lead = ids[0];
        return <button type="button" key={area.id} className="dk-index-card" data-status={status} onClick={() => onNavigate(area.id)}>
          <span className="dk-index-no">{String(i + 2).padStart(2, "0")}</span>
          <span className="dk-index-body"><b>{area.label}</b><small>{v?.headline || area.spec?.title || "Open the chapter"}</small></span>
          {lead && data && <span className="dk-index-foot"><em>{definition(lead)?.label} {fmt(lead, data.total[lead])}</em><span data-tone={tone(lead, data.total[lead], data.prior[lead])}>{delta(lead, data.total[lead], data.prior[lead])} MoM</span><ArrowRight size={13}/></span>}
        </button>;
      })}</div>
    </section>}

    {!!columns.length && <section className="dk-cover-columns" aria-label="What to act on">
      {columns.map(col => <div key={col.key} data-kind={col.key}><h3><col.icon size={15}/>{col.title}</h3>{list(col.items, col.key as "wins", col.findings)}</div>)}
    </section>}

    {exec && <DecisionPanel model={model} chapter={EXECUTIVE} ids={execIds} />}
  </div>;
}
