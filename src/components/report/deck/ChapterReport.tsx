import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Database, Minus } from "lucide-react";
import { EvidenceBlock } from "../ReportEvidence";
import { FocusTrend, lensLabel, lensOf, metricSource } from "../Insight";
import { InsightDrilldown } from "../InsightDrilldown";
import { chapters, type ChapterSpec } from "../../../report/chapters";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import { briefingOf, decisionOf, extremes, verdictCard, yearPosition } from "../../../report/brief";
import { chapterMetrics, type DeckSection, type DeckTab } from "../../../report/deck";
import { builtLabel, monthLabel, monthShort, shiftMonth } from "../../../report/period";
import type { ChapterBriefing, ChapterData, InsightCard, ReportModel } from "../../../report/model";
import { EditableText, Slot, useEdit } from "./editing";
import { Emphasis } from "./Layout";
import { Performers } from "./Performers";
import { KeyTables } from "./KeyTables";
import { Outlook } from "./Outlook";
import { ReportMoMTable, TrendChartPanel } from "./ReportTrends";
import { DataExplorer } from "./DataExplorer";
import { useRecordDrilldown } from "./RecordDrilldown";

const label = (id: string) => definition(id)?.label ?? id;
const tone = (id: string, value: unknown, prior: unknown) => value == null || prior == null || Number(value) === Number(prior) ? "flat" : (Number(value) > Number(prior)) === (definition(id)?.higherIsBetter ?? true) ? "up" : "down";
const slug = (text: string) => text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
const firstSentence = (text: string) => (text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text).trim();

/** Report prose: figures read as emphasis, and the same paragraph becomes editable for admins. */
function Prose({ path, value, placeholder, className }: { path: (string | number)[]; value?: string; placeholder: string; className?: string }) {
  const edit = useEdit();
  if (edit?.editing) return <EditableText path={path} value={value} as="p" className={className} placeholder={placeholder} />;
  return value?.trim() ? <p className={className}><Emphasis text={value} /></p> : null;
}

/** A frozen figure with its month and year comparisons, as the stat row and KPI strip print it. */
function Figure({ id, data, compact = false }: { id: string; data: ChapterData; compact?: boolean }) {
  const drill = useRecordDrilldown();
  const t = tone(id, data.total[id], data.prior[id]);
  const Arrow = t === "flat" ? Minus : Number(data.total[id]) >= Number(data.prior[id]) ? ArrowUpRight : ArrowDownRight;
  const month = monthShort(String(data.history.at(-2)?.month ?? "")) || "last month";
  return <button type="button" className="cr-figure" data-tone={t} onClick={() => drill?.({ metric: id, chapterId: data.id })} title={`Open ${label(id)} source records`}>
    <span className="cr-figure-label">{label(id)}</span>
    <strong className="cr-figure-value">{fmt(id, data.total[id])}</strong>
    <span className="cr-figure-delta">
      {data.prior[id] != null && <span data-tone={t}><Arrow size={12} />{delta(id, data.total[id], data.prior[id])} vs {month}</span>}
      {!compact && data.priorYear[id] != null && <span>{delta(id, data.total[id], data.priorYear[id])} on last year</span>}
    </span>
  </button>;
}

const BRIEF: { key: Exclude<keyof ChapterBriefing, "takeaways" | "soWhat">; lead: string }[] = [
  { key: "whatChanged", lead: "What changed." },
  { key: "whyItMoved", lead: "Why it moved." },
  { key: "whereItSits", lead: "Where it concentrates." },
  { key: "whatHeldUp", lead: "What held up." },
  { key: "outlook", lead: "What to watch." },
];

interface Part { id: string; title: string; sub?: string; subPath?: (string | number)[]; subNode?: ReactNode; section: DeckSection; kind: "metrics" | "verdict" | "insights" | "trends" | "evidence" | "plan"; node: ReactNode }

/** The section's title in the contents and above its subheading: the written one, else the breakdown it rests on. */
function sectionTitle(card: InsightCard, data?: ChapterData) {
  if (card.section?.trim()) return card.section.trim();
  const table = data?.groups.find(g => (g.id ?? g.field) === card.focus);
  return table?.title ?? lensLabel(lensOf(card));
}

/** The figures a finding rests on: the ids it cites, else its breakdown's comparison measure. */
function citedFor(model: ReportModel, chapter: string, card: InsightCard) {
  const table = model.chapters[chapter]?.groups.find(g => (g.id ?? g.field) === card.focus);
  const cited = (card.metrics?.length ? card.metrics : [table?.compare].filter((id): id is string => !!id))
    .map(id => ({ id, data: metricSource(model, chapter, id) })).filter((m): m is { id: string; data: ChapterData } => !!m.data && m.data.total[m.id] != null).slice(0, 4);
  return { table, cited };
}

/** One finding written up as a report section: the argument in prose, the figures it rests on, the chart and the evidence behind a fold. */
function FindingSection({ model, chapter, card, index }: { model: ReportModel; chapter: string; card: InsightCard; index: number }) {
  const drill = useRecordDrilldown();
  const { table, cited } = citedFor(model, chapter, card);
  const path = (key: string) => ["narratives", chapter, "cards", index, key];
  return <>
    <Prose path={path("meaning")} value={card.meaning} placeholder="Why it matters" />
    {cited.length > 1 && <div className="cr-stat">{cited.map(m => <Figure key={m.id} id={m.id} data={m.data} compact />)}</div>}
    <Prose path={path("driver")} value={card.driver || card.reasoning} placeholder="What drove it" />
    <Prose path={path("concentration")} value={card.concentration} placeholder="Where it concentrates" />
    {table ? <div className="cr-chart cr-chart-evidence"><EvidenceBlock table={table} full initialView="chart" /></div>
      : cited[0] && <figure className="cr-chart"><figcaption>{label(cited[0].id)}, month by month</figcaption><FocusTrend id={cited[0].id} history={cited[0].data.history.slice(-14)} />
        {card.trend && <div className="cr-cnote"><Emphasis text={card.trend} /></div>}</figure>}
    <Prose path={path("offset")} value={card.offset} placeholder="What held up" />
    {(card.impact || card.trend && table) && <aside className="cr-call" data-tone={lensOf(card) === "risk" ? "risk" : lensOf(card) === "win" ? "win" : undefined}>
      {card.impact && <><h4>What is at stake</h4><Prose path={path("impact")} value={card.impact} placeholder="Value at stake" /></>}
      {card.trend && table && <><h4>Structural or one-off?</h4><p><Emphasis text={card.trend} /></p></>}
    </aside>}
    {(card.evidence || cited.length > 0) && <details className="cr-ev">
      <summary><span className="cr-evi" aria-hidden="true" />Evidence behind this finding</summary>
      <div className="cr-evb">
        <Prose path={path("evidence")} value={card.evidence} placeholder="Exact figures" />
        {!!cited.length && <table className="cr-table"><thead><tr><th>Measure</th><th>{monthLabel(model.scope.month)}</th><th>Previous month</th><th>Same month last year</th><th>MoM</th><th>YoY</th></tr></thead>
          <tbody>{cited.map(({ id, data: d }) => <tr key={id}><td>{label(id)}</td><td>{fmt(id, d.total[id])}</td><td>{fmt(id, d.prior[id])}</td><td>{fmt(id, d.priorYear[id])}</td><td data-tone={tone(id, d.total[id], d.prior[id])}>{delta(id, d.total[id], d.prior[id])}</td><td data-tone={tone(id, d.total[id], d.priorYear[id])}>{delta(id, d.total[id], d.priorYear[id])}</td></tr>)}</tbody></table>}
        {!!cited.length && <p className="cr-fine">{cited.map(({ id }) => `${label(id)}: ${definition(id)?.description ?? ""}`).join(" ")} Confidence: {card.confidence ?? "not stated"}.</p>}
        {cited[0] && drill && <button type="button" className="button" onClick={() => drill({ metric: cited[0].id, chapterId: chapter, table, group: card.highlight?.[0] })}><Database size={13} />Explore the source records</button>}
      </div>
    </details>}
  </>;
}

/** Recommendations as the attached reports print them: numbered, owned, with the reasoning and the expected impact. */
function Recommendations({ model, chapter, items }: { model: ReportModel; chapter: string; items: { card: InsightCard; index: number }[] }) {
  const recs = chapter === "recommendations";
  const path = (i: number, key: string) => ["narratives", chapter, "cards", i, key];
  return <div className="cr-recs">{items.map(({ card, index }, n) => {
    const title = recs ? card.headline : firstSentence(card.action || card.headline);
    const owner = [card.ownerArea, card.horizon].filter(Boolean).join(" · ");
    return <div className="cr-rec" key={index}>
      <span className="cr-rn">{String(n + 1).padStart(2, "0")}</span>
      <div className="cr-rb">
        <h3>{title}</h3>
        {owner && <div className="cr-ro">{owner}{card.priority === "high" ? " · High priority" : ""}</div>}
        {(recs ? card.action : card.action && card.action.trim() !== title) && <div className="cr-rec-field"><span className="cr-lbl">The move</span><Prose path={path(index, "action")} value={card.action} placeholder="The move" /></div>}
        <div className="cr-rec-field"><span className="cr-lbl">Reasoning</span><Prose path={path(index, recs ? "recommendation" : "evidence")} value={recs ? card.recommendation || card.driver : card.evidence} placeholder="Why this move" /></div>
        {card.impact && <div className="cr-rec-field cr-imp"><span className="cr-lbl">Expected impact</span><Prose path={path(index, "impact")} value={card.impact} placeholder="Expected impact" /></div>}
        {card.watch && <div className="cr-rec-field"><span className="cr-lbl">Signal to watch</span><Prose path={path(index, "watch")} value={card.watch} placeholder="Signal to watch" /></div>}
      </div>
    </div>;
  })}</div>;
}

/** The source rows sit behind a fold and only load when someone opens it. */
function SourceRecords({ model, spec }: { model: ReportModel; spec: ChapterSpec }) {
  const [open, setOpen] = useState(false);
  return <details className="cr-ev" onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
    <summary><span className="cr-evi" aria-hidden="true" />View the source records behind this chapter</summary>
    <div className="cr-evb">{open && <DataExplorer model={model} spec={spec} />}</div>
  </details>;
}

/**
 * A chapter read as one long document, in the shape of the studio's written
 * monthly reports: kicker, title and lede; contents; the figures; numbered
 * sections that argue one finding each; recommendations; method and limitations.
 */
export function ChapterReport({ model, tab, tabs, headless = false, onSection }: { model: ReportModel; tab: DeckTab; tabs: DeckTab[]; headless?: boolean; onSection?: (section: DeckSection) => void }) {
  const edit = useEdit();
  const root = useRef<HTMLDivElement>(null);
  const cid = tab.chapter;
  const spec = tab.spec ?? chapters.find(c => c.id === cid);
  const data = model.chapters[cid];
  const narrative = model.narratives[cid];
  const ids = spec ? chapterMetrics(spec, data) : [];
  const [month, setMonth] = useState(model.scope.month);
  const recs = cid === "recommendations";
  const numbered = tabs.filter(t => t.spec);
  const position = numbered.findIndex(t => t.id === tab.id) + 1;

  const parts = useMemo<Part[]>(() => {
    const out: Part[] = [];
    if (!narrative && !data) return out;
    const cards = narrative?.cards ?? [];
    const verdict = verdictCard(model, cid);
    const vIndex = cards.findIndex(c => c === verdict);
    const order = { high: 0, medium: 1, low: 2 } as const;
    const findings = cards.map((card, index) => ({ card, index })).filter(({ index }) => index !== vIndex || cards.length === 1)
      .sort((a, b) => order[a.card.priority ?? "medium"] - order[b.card.priority ?? "medium"]);
    const b = briefingOf(model, cid, ids);
    const d = decisionOf(model, cid);
    const used = new Set<string>();
    const unique = (id: string) => { let key = id, n = 2; while (used.has(key)) key = `${id}-${n++}`; used.add(key); return key; };

    if (narrative) out.push({ id: unique("start-here"), title: "Start here", sub: verdict?.headline, subPath: vIndex >= 0 ? ["narratives", cid, "cards", vIndex, "headline"] : undefined, section: "summary", kind: "verdict", node: <>
      {b.takeaways.map((t, i) => <p key={i} className={i === 0 ? "cr-lead" : undefined}><Emphasis text={t} /></p>)}
      {BRIEF.filter(f => edit?.editing || b[f.key]).map(f => edit?.editing
        ? <div key={f.key} className="cr-brief-edit"><b>{f.lead}</b><EditableText path={["narratives", cid, "briefing", f.key]} value={b[f.key]} as="p" placeholder={f.lead} /></div>
        : <p key={f.key}><strong>{f.lead}</strong> <Emphasis text={b[f.key]} /></p>)}
      {(b.soWhat || edit?.editing) && <aside className="cr-call cr-call-plain"><h4>The one-line version, if you read nothing else</h4><Prose path={["narratives", cid, "briefing", "soWhat"]} value={b.soWhat} placeholder="Why this matters for the next decision" /></aside>}
      {d && <aside className="cr-call" data-tone="decision">
        <h4>Decision for leadership{d.owner ? ` · ${d.owner}` : ""}{d.horizon ? ` · ${d.horizon}` : ""}</h4>
        <h3><EditableText path={["narratives", cid, "decision", "call"]} value={d.call} as="span" multiline={false} placeholder="The decision" /></h3>
        <Prose path={["narratives", cid, "decision", "rationale"]} value={d.rationale} placeholder="Why the evidence supports it" />
        {!!d.evidence.length && <ul>{d.evidence.map((e, i) => <li key={i}><Emphasis text={e} /></li>)}</ul>}
        {d.expectedImpact && <p><strong>Expected impact.</strong> <Emphasis text={d.expectedImpact} /></p>}
        {d.successMeasure && <p><strong>How we will know.</strong> <Emphasis text={d.successMeasure} /></p>}
        {d.risks && <p><strong>Risk and guardrail.</strong> <Emphasis text={d.risks} /></p>}
        {d.alternative && <p><strong>Alternative considered.</strong> <Emphasis text={d.alternative} /></p>}
      </aside>}
    </> });

    findings.forEach(({ card, index }) => {
      const title = sectionTitle(card, data);
      const { table, cited } = citedFor(model, cid, card);
      // The subheading opens the finding's evidence and the live analytics, as the headline always has.
      const subNode = <InsightDrilldown modal model={model} chapterId={cid} headline={card.headline} metrics={cited} table={table}><Emphasis text={card.headline} /></InsightDrilldown>;
      out.push({ id: unique(slug(title)), title, sub: card.headline, subNode, subPath: ["narratives", cid, "cards", index, "headline"], section: recs ? "plan" : "insights", kind: "insights", node: <FindingSection model={model} chapter={cid} card={card} index={index} /> });
    });

    if (data?.groups.length) {
      const p = narrative?.performers;
      out.push({ id: unique("leaders-and-laggards"), title: "Leaders and laggards", sub: p?.pattern || "Who carried the month, and who needs support", section: "performers", kind: "evidence", node: <Performers model={model} chapter={cid} /> });
    }

    if (data && data.history.length > 1) {
      const lead = ids[0];
      const ex = lead ? extremes(lead, data) : null;
      const pos = lead ? yearPosition(lead, data, model.scope.month) : null;
      const historyIds = [...new Set([...(spec?.history ?? []), ...ids])];
      const sub = ex && lead ? `${label(lead)} peaked in ${monthLabel(ex.hi.month)} at ${fmt(lead, ex.hi.v)} and bottomed in ${monthLabel(ex.lo.month)} at ${fmt(lead, ex.lo.v)}` : `${data.history.length} months, read as a shape rather than a last point`;
      out.push({ id: unique("month-by-month"), title: "Month by month", sub, section: "trends", kind: "trends", node: <>
        {pos && lead && <p>On {label(lead).toLowerCase()}, {monthLabel(model.scope.month)} ranks <strong>{pos.rank} of {pos.of}</strong> among this year's months so far. The same month last year was {monthLabel(shiftMonth(model.scope.month, -12))}; select any month on the chart to pin it and open its records.</p>}
        <TrendChartPanel history={data.history.slice(-14)} ids={historyIds} selected={month} onSelect={setMonth} title={`${tab.label} trend`} />
        <details className="cr-ev"><summary><span className="cr-evi" aria-hidden="true" />View every month, measure by measure</summary>
          <div className="cr-evb"><ReportMoMTable history={data.history.slice(-14)} ids={historyIds} selected={month} onSelect={setMonth} title={tab.label} /></div></details>
      </> });
      if (spec && !spec.derived) out.push({ id: unique("what-comes-next"), title: "What comes next", sub: "Scenarios for next month — conditional arithmetic, not forecasts", section: "outlook", kind: "trends", node: <Outlook model={model} spec={spec} ids={ids} /> });
    }

    if (data?.groups.length) out.push({ id: unique("the-breakdowns"), title: "The breakdowns", sub: "The working tables behind the findings", section: "tables", kind: "evidence", node: <>
      <KeyTables model={model} chapter={cid} mode="curated" tableLimit={2} rowLimit={8} />
      <details className="cr-ev"><summary><span className="cr-evi" aria-hidden="true" />View every breakdown in full</summary><div className="cr-evb"><KeyTables model={model} chapter={cid} /></div></details>
    </> });

    const moves = (recs ? cards.map((card, index) => ({ card, index })) : findings).filter(({ card }) => card.action?.trim() || (recs && card.headline));
    if (moves.length) out.push({ id: unique("recommendations"), title: "Recommendations", sub: `${moves.length === 1 ? "One action" : `${moves.length} actions`}, ordered by priority`, section: "plan", kind: "plan", node: <Recommendations model={model} chapter={cid} items={moves} /> });

    if (data || narrative) out.push({ id: unique("method-and-limitations"), title: "Method and limitations", sub: "How to read these numbers, and what they cannot show", section: "data", kind: "evidence", node: <>
      <h4>Sources and method</h4>
      <p>Figures for {model.scope.studio}, {monthLabel(model.scope.month)}, frozen when the report was built on {builtLabel(model.builtAt)}.{data ? ` ${data.n.toLocaleString("en-IN")} contributing records sit behind this chapter, with ${data.history.length} months of history for the trend.` : ""} Comparisons are against {monthLabel(shiftMonth(model.scope.month, -1))} and {monthLabel(shiftMonth(model.scope.month, -12))}; rates move in percentage points.</p>
      {narrative && !narrative.generated && <p>This chapter's prose was assembled from rule-based findings because no analysis provider answered; regenerate the report for the written analysis.</p>}
      {!!ids.length && <><h4>What the measures mean</h4><dl className="cr-defs">{ids.slice(0, 10).map(id => <div key={id}><dt>{label(id)}</dt><dd>{definition(id)?.description}</dd></div>)}</dl></>}
      {!!(data?.notes?.length || data?.diagnostics?.length) && <><h4>Known limitations</h4><ul>{[...(data.notes ?? []), ...(data.diagnostics ?? [])].map((n, i) => <li key={i}>{n}</li>)}</ul></>}
      {spec && !spec.derived && data && <SourceRecords model={model} spec={spec} />}
    </> });
    return out;
  }, [model, cid, narrative, data, spec, ids.join(), month, edit?.editing, recs, tab.label]);

  // Scroll-spy: the section in view drives the speaker notes and the address bar.
  useEffect(() => {
    if (!onSection || !root.current) return;
    const nodes = [...root.current.querySelectorAll<HTMLElement>("[data-deck-section]")];
    const seen = new Map<Element, number>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => seen.set(e.target, e.isIntersecting ? e.intersectionRatio : 0));
      const top = nodes.find(n => (seen.get(n) ?? 0) > 0);
      if (top) onSection(top.dataset.deckSection as DeckSection);
    }, { rootMargin: "-80px 0px -55% 0px", threshold: [0, .01] });
    nodes.forEach(n => observer.observe(n));
    return () => observer.disconnect();
  }, [parts, onSection]);

  if (!parts.length) return <p className="empty-state">Nothing was recorded for this chapter.</p>;
  const lead = ids.slice(0, 8).filter(id => data?.total[id] != null);
  const anchor = (id: string) => `${tab.id}--${id}`;
  return <div className="cr" ref={root}>
    {!headless && <header className="cr-head">
      <div className="cr-kick">{position ? `Chapter ${position} of ${numbered.length}` : "Report overview"}{spec?.eyebrow ? ` · ${spec.eyebrow}` : ""}</div>
      <h1>{spec?.title ?? tab.title}</h1>
      {edit?.editing ? <EditableText path={["narratives", cid, "summary"]} value={narrative?.summary} as="p" className="cr-lede" placeholder="The chapter's opening paragraph" />
        : <p className="cr-lede">{narrative?.summary?.trim() || spec?.deck}</p>}
      <div className="cr-meta">
        <span>{model.scope.studio}</span><span>{monthLabel(model.scope.month)}</span>
        {data && <span>{data.n.toLocaleString("en-IN")} contributing records</span>}
        {data && <span>{data.history.length} months of history</span>}
        <span>Built {builtLabel(model.builtAt)}</span>
      </div>
    </header>}
    <nav className="cr-toc" aria-label={`Contents of ${tab.label}`}>
      <div className="cr-tocl">Contents</div>
      {parts.map((p, i) => <a key={p.id} href={`#${anchor(p.id)}`} onClick={e => { e.preventDefault(); document.getElementById(anchor(p.id))?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
        <span>{String(i + 1).padStart(2, "0")}</span>{p.title}</a>)}
    </nav>
    {data && !!lead.length && <Slot id={`${tab.id}:summary:metrics`} tab={tab.id} section="summary" kind="metrics" describe="key figures strip">
      <div className="cr-kpis">{lead.map(id => <Figure key={id} id={id} data={data} />)}</div>
    </Slot>}
    {parts.map(p => <section key={p.id} id={anchor(p.id)} className="cr-section" data-deck-section={p.section}>
      <h2>{p.title}</h2>
      {edit?.editing && p.subPath ? <EditableText path={p.subPath} value={p.sub} as="div" className="cr-sub" multiline={false} placeholder="The section's verdict" />
        : p.sub && <div className="cr-sub">{p.subNode ?? <Emphasis text={p.sub} />}</div>}
      <Slot id={`${tab.id}:${p.section}:${p.id}`} tab={tab.id} section={p.section} kind={p.kind} describe={`${p.title} section`}>
        <div className="cr-body">{p.node}</div>
      </Slot>
    </section>)}
    <footer className="cr-foot">{model.scope.studio} · {monthLabel(model.scope.month)} · {spec?.title ?? tab.title}<br />Figures are gross values as recorded at snapshot, not contribution margin.</footer>
  </div>;
}
