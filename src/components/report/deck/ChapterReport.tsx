import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { InsightDrilldown } from "../InsightDrilldown";
import { metricSource } from "../Insight";
import { chapters, type ChapterSpec } from "../../../report/chapters";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../../report/definitions";
import { chapterMetrics, type DeckSection, type DeckTab } from "../../../report/deck";
import { documentFor, type ChapterDocument, type DocSection } from "../../../report/document";
import { builtLabel, monthLabel, monthShort, shiftMonth } from "../../../report/period";
import type { ChapterData, ReportModel } from "../../../report/model";
import { EditContext, EditableText, Slot, setIn, useEdit, type DeckEdit } from "./editing";
import { Exhibit, Rich, exhibitBody, exhibitMetrics, tone } from "./ChapterExhibits";
import { DataExplorer } from "./DataExplorer";
import { useRecordDrilldown } from "./RecordDrilldown";

const label = (id: string) => definition(id)?.label ?? id;
const slug = (text: string) => text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
type Path = (string | number)[];

/** Document paths are written through the chapter's resolved document, so older reports gain one on their first edit. */
const DOC = "__doc";

/** A paragraph of report prose, rewritable in place by an unlocked admin. */
function Prose({ path, value, placeholder, className, as = "p" }: { path: Path; value?: string; placeholder: string; className?: string; as?: "p" | "div" | "span" }) {
  const edit = useEdit();
  if (edit?.editing) return <EditableText path={path} value={value} as={as} className={className} placeholder={placeholder} />;
  const Tag = as;
  return value?.trim() ? <Tag className={className}><Rich text={value} /></Tag> : null;
}

/** A frozen figure with its month and year comparisons, as the KPI strip prints it. */
function Figure({ id, data }: { id: string; data: ChapterData }) {
  const drill = useRecordDrilldown();
  const t = tone(id, data.total[id], data.prior[id]);
  const Arrow = t === "flat" ? Minus : Number(data.total[id]) >= Number(data.prior[id]) ? ArrowUpRight : ArrowDownRight;
  const month = monthShort(String(data.history.at(-2)?.month ?? "")) || "last month";
  return <button type="button" className="cr-figure" data-tone={t} onClick={() => drill?.({ metric: id, chapterId: data.id })} title={`Open ${label(id)} source records`}>
    <span className="cr-figure-label">{label(id)}</span>
    <strong className="cr-figure-value">{fmt(id, data.total[id])}</strong>
    <span className="cr-figure-delta">
      {data.prior[id] != null && <span data-tone={t}><Arrow size={12} />{delta(id, data.total[id], data.prior[id])} vs {month}</span>}
      {data.priorYear[id] != null && <span>{delta(id, data.total[id], data.priorYear[id])} on last year</span>}
    </span>
  </button>;
}

/** One argued section: paragraphs with the exhibits between them, a callout where the reframe matters, the full table folded. */
function SectionBody({ model, section, index }: { model: ReportModel; section: DocSection; index: number }) {
  const edit = useEdit();
  const path = (...rest: Path) => [DOC, "sections", index, ...rest];
  const [first, second, ...rest] = section.exhibits;
  const paras = section.paragraphs;
  const split = Math.min(paras.length, 2);
  const exhibit = (e: typeof first, i: number) => e && <Exhibit key={`${e.ref}-${i}`} model={model} target={e.ref} view={e.view} caption={e.caption} note={e.note} highlight={e.highlight} />;
  const evidence = section.evidence && exhibitBody(model, section.evidence.ref, "table", section.exhibits.flatMap(e => e.highlight), true);
  return <>
    {paras.slice(0, split).map((p, i) => <Prose key={i} path={path("paragraphs", i)} value={p} placeholder="Paragraph" />)}
    {exhibit(first, 0)}
    {(section.callout || (edit?.editing && index === 0)) && <aside className="cr-call" data-tone={section.lens === "risk" ? "risk" : section.lens === "win" ? "win" : undefined}>
      <Prose as="div" className="cr-call-title" path={path("callout", "title")} value={section.callout?.title} placeholder="The reframe, as one sentence" />
      <Prose path={path("callout", "body")} value={section.callout?.body} placeholder="What a leader must not miss" />
    </aside>}
    {paras.slice(split).map((p, i) => <Prose key={i + split} path={path("paragraphs", i + split)} value={p} placeholder="Paragraph" />)}
    {exhibit(second, 1)}
    {rest.map((e, i) => exhibit(e, i + 2))}
    {evidence && <details className="cr-ev">
      <summary><span className="cr-evi" aria-hidden="true" />{section.evidence!.title || "Evidence"}</summary>
      <div className="cr-evb">{evidence}{section.evidence!.note && <p className="cr-fine"><Rich text={section.evidence!.note} /></p>}</div>
    </details>}
  </>;
}

/** Recommendations as the written reports print them: numbered, owned, with the reasoning and the expected impact. */
function Recommendations({ doc }: { doc: ChapterDocument }) {
  return <div className="cr-recs">{doc.recommendations.map((r, n) => {
    const path = (key: string) => [DOC, "recommendations", n, key];
    return <div className="cr-rec" key={n}>
      <span className="cr-rn">{String(n + 1).padStart(2, "0")}</span>
      <div className="cr-rb">
        <h3><Prose as="span" path={path("title")} value={r.title} placeholder="The action" /></h3>
        {(r.owner || r.horizon) && <div className="cr-ro">{[r.owner, r.horizon].filter(Boolean).join(" · ")}</div>}
        {r.reasoning && <p><span className="cr-lbl">Reasoning</span><Prose as="span" path={path("reasoning")} value={r.reasoning} placeholder="The figures that justify it" /></p>}
        {r.impact && <p className="cr-imp"><span className="cr-lbl">Expected impact</span><Prose as="span" path={path("impact")} value={r.impact} placeholder="What changes, and by how much" /></p>}
      </div>
    </div>;
  })}</div>;
}

/** The source rows sit behind a fold and only load when someone opens it. */
function SourceRecords({ model, spec }: { model: ReportModel; spec: ChapterSpec }) {
  const [open, setOpen] = useState(false);
  return <details className="cr-ev" onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
    <summary><span className="cr-evi" aria-hidden="true" />Evidence — the source records behind this chapter</summary>
    <div className="cr-evb">{open && <DataExplorer model={model} spec={spec} />}</div>
  </details>;
}

function Method({ model, spec, data, doc, cid, live }: { model: ReportModel; spec?: ChapterSpec; data?: ChapterData; doc: ChapterDocument; cid: string; live: boolean }) {
  const narrative = model.narratives[cid];
  const ids = spec ? chapterMetrics(spec, data) : [];
  const sources = (model.sources ?? []).filter(s => !spec || spec.derived || s.key === spec.source);
  return <>
    {doc.method.map((p, i) => <Prose key={i} path={[DOC, "method", i]} value={p} placeholder="Method" />)}
    <p className="cr-fine">Figures for {model.scope.studio}, {monthLabel(model.scope.month)}, frozen when the report was built on {builtLabel(model.builtAt)}.{data ? ` ${data.n.toLocaleString("en-IN")} contributing records sit behind this chapter, with ${data.history.length} months of history.` : ""} Comparisons are against {monthLabel(shiftMonth(model.scope.month, -1))} and {monthLabel(shiftMonth(model.scope.month, -12))}; rates move in percentage points.{narrative && !narrative.generated ? " This chapter's prose was assembled from the engine's own findings because no analysis provider answered; regenerate the report for the written analysis." : ""}</p>
    {!!sources.length && <details className="cr-ev">
      <summary><span className="cr-evi" aria-hidden="true" />Evidence — what was read</summary>
      <div className="cr-evb"><div className="cr-table-wrap"><table className="cr-table"><thead><tr><th>Source</th><th>Status</th><th>Refreshed</th></tr></thead>
        <tbody>{sources.map(s => <tr key={s.key}><td>{s.title}</td><td>{s.stale ? "Stale" : s.status}</td><td>{s.fetchedAt ? new Date(s.fetchedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td></tr>)}</tbody></table></div></div>
    </details>}
    {!!ids.length && <><h4>Definitions used in this chapter</h4><ul className="cr-defs">{ids.slice(0, 12).map(id => <li key={id}><strong>{label(id)}.</strong> {definition(id)?.description}</li>)}</ul></>}
    {!!(data?.notes?.length || data?.diagnostics?.length) && <><h4>Known limitations</h4>{[...(data.notes ?? []), ...(data.diagnostics ?? [])].map((n, i) => <p key={i} className="cr-fine">{n}</p>)}</>}
    {live && spec && !spec.derived && data && <SourceRecords model={model} spec={spec} />}
  </>;
}

interface Part { id: string; title: string; sub?: string; subPath?: Path; subNode?: ReactNode; section: DeckSection; kind: "verdict" | "insights" | "plan" | "evidence"; node: ReactNode }

/**
 * A chapter read as one long document, in the shape of the studio's written
 * monthly reports: kicker, title and lede; contents; the figures; numbered
 * sections that each argue one point with their exhibits and evidence;
 * recommendations; method and limitations.
 */
export function ChapterReport({ model, tab, tabs, headless = false, exporting = false, onSection }: { model: ReportModel; tab: DeckTab; tabs: DeckTab[]; headless?: boolean; exporting?: boolean; onSection?: (section: DeckSection) => void }) {
  const edit = useEdit();
  const root = useRef<HTMLDivElement>(null);
  const cid = tab.chapter;
  const spec = tab.spec ?? chapters.find(c => c.id === cid);
  const data = model.chapters[cid];
  const narrative = model.narratives[cid];
  const ids = spec ? chapterMetrics(spec, data) : [];
  const doc = useMemo(() => documentFor(model, cid), [model, cid]);
  const numbered = tabs.filter(t => t.spec);
  const position = numbered.findIndex(t => t.id === tab.id) + 1;

  // Edits to the document land on the chapter's resolved document as a whole.
  const docEdit = useMemo<DeckEdit | null>(() => edit && doc ? { ...edit, set: (path, value) => path[0] === DOC
    ? edit.set(["narratives", cid, "document"], setIn(doc, path.slice(1), value)) : edit.set(path, value) } : edit, [edit, doc, cid]);

  const parts = useMemo<Part[]>(() => {
    if (!doc) return [];
    const used = new Set<string>();
    const unique = (id: string) => { let key = id, n = 2; while (used.has(key)) key = `${id}-${n++}`; used.add(key); return key; };
    const out: Part[] = doc.sections.map((s, i): Part => {
      const anchor = s.exhibits[0]?.ref ?? s.evidence?.ref;
      const ev = anchor ? exhibitMetrics(model, anchor) : { ids: [] as string[], chapter: undefined, table: undefined };
      const metrics = ev.ids.map(id => ({ id, data: metricSource(model, ev.chapter ?? cid, id) })).filter((m): m is { id: string; data: ChapterData } => !!m.data);
      // The thesis opens the section's evidence and live analytics.
      const subNode = s.sub && metrics.length && !exporting ? <InsightDrilldown modal model={model} chapterId={ev.chapter ?? cid} headline={s.sub} metrics={metrics} table={ev.table}><Rich text={s.sub} /></InsightDrilldown> : undefined;
      const lead = i === 0 && tab.id !== "overview";
      return { id: unique(slug(s.title)), title: s.title, sub: s.sub, subNode, subPath: [DOC, "sections", i, "sub"], section: lead ? "summary" : "insights", kind: lead ? "verdict" : "insights",
        node: <SectionBody model={model} section={s} index={i} /> };
    });
    if (doc.recommendations.length) out.push({ id: unique("recommendations"), title: "Recommendations", sub: `${doc.recommendations.length === 1 ? "One action" : `${doc.recommendations.length} actions`}, ordered by expected value`, section: "plan", kind: "plan", node: <Recommendations doc={doc} /> });
    out.push({ id: unique("method-and-limitations"), title: "Method and limitations", sub: "How to read these numbers, and what they cannot show", section: "data", kind: "evidence", node: <Method model={model} spec={spec} data={data} doc={doc} cid={cid} live={!exporting} /> });
    return out;
  }, [model, cid, doc, spec, data, tab.id, exporting]);

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
  return <EditContext.Provider value={docEdit}><div className="cr" ref={root}>
    {!headless && <header className="cr-head">
      <div className="cr-kick">{position ? `Chapter ${position} of ${numbered.length}` : "Report overview"}{spec?.eyebrow ? ` · ${spec.eyebrow}` : ""}</div>
      <h1>{spec?.title ?? tab.title}</h1>
      {edit?.editing ? <EditableText path={["narratives", cid, "summary"]} value={narrative?.summary} as="p" className="cr-lede" placeholder="The chapter's opening paragraph" />
        : <p className="cr-lede"><Rich text={narrative?.summary?.trim() || spec?.deck || ""} /></p>}
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
    {data && !spec?.derived && !!lead.length && exporting && <div className="cr-kpis">{lead.map(id => <Figure key={id} id={id} data={data} />)}</div>}
    {data && !spec?.derived && !!lead.length && !exporting && <Slot id={`${tab.id}:summary:metrics`} tab={tab.id} section="summary" kind="metrics" describe="key figures strip">
      <div className="cr-kpis">{lead.map(id => <Figure key={id} id={id} data={data} />)}</div>
    </Slot>}
    {parts.map(p => <section key={p.id} id={anchor(p.id)} className="cr-section" data-deck-section={p.section}>
      <h2>{p.title}</h2>
      {edit?.editing && p.subPath ? <EditableText path={p.subPath} value={p.sub} as="div" className="cr-sub" multiline={false} placeholder="The section's thesis" />
        : p.sub && <div className="cr-sub">{p.subNode ?? <Rich text={p.sub} />}</div>}
      <Slot id={`${tab.id}:${p.section}:${p.id}`} tab={tab.id} section={p.section} kind={p.kind} describe={`${p.title} section`}>
        <div className="cr-body">{p.node}</div>
      </Slot>
    </section>)}
    <footer className="cr-foot">{model.scope.studio} · {monthLabel(model.scope.month)} · {spec?.title ?? tab.title}<br />Revenue figures are gross values as recorded at snapshot, not contribution margin.</footer>
  </div></EditContext.Provider>;
}
