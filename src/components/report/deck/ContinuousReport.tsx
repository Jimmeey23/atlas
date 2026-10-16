import { hiddenReportElement } from "../../../report/generated-edits";
import { ReportEvidence } from "./ReportEvidence";
import { ReportMarquee } from "./ReportMarquee";
import { reportAppearance } from "../../../report/appearance";
import { EditorialSynthesis } from "./EditorialSynthesis";
import { LeadershipFront, IntelligenceAppendix } from "./LeadershipFront";
import { useEffect, useRef, useState } from "react";
import { ReaderContext, ReaderControls, useReaderContext, useReaderPreferences } from "./ReaderControls";
import { readingSpan } from "../../../report/reader";
import type { ReactNode } from "react";
import type { ReportModel } from "../../../report/model";
import { chapterMetrics, tableMetrics, type DeckTab } from "../../../report/deck";
import { reportOptions } from "../../../report/options";
import { BriefingPanel, DecisionPanel } from "./Briefing";
import { CompleteMetricGrid } from "./CompleteMetricGrid";
import { FlipMetricCard } from "./FlipMetricCard";
import { InsightsSection } from "./Insights";
import { KeyTables } from "./KeyTables";
import { TrendChartPanel, ReportMoMTable, ReportedElsewhere, SegmentMoMTable } from "./ReportTrends";
import { reportedElsewhere } from "../../../report/ownership";
import { RecordDrilldownProvider } from "./RecordDrilldown";
import { DataExplorer } from "./DataExplorer";
import { Slot } from "./editing";
import { EvidenceBlock } from "../ReportEvidence";
import { curatedBreakdowns } from "../../../report/evidence";
import type { Finding } from "../../../report/findings";
import { ActionPlan } from "../Glance";
import { MetricRegister } from "./MetricRegister";
import { sourceBasis } from "../../../report/review";
import { FocusTrend } from "../Insight";
import { EvidenceVisual } from "./EvidenceVisual";
import { ReportProse } from "./ReportProse";
import { MetricCommentary } from "./MetricCommentary";

/** Expensive source explorers only mount when the reader opens them. */
function Disclosure({ title, children, exporting = false, bulk = true }: { title: string; children: ReactNode; exporting?: boolean; bulk?: boolean }) {
  const [open, setOpen] = useState(false);
  const { command } = useReaderContext();
  useEffect(() => { if (bulk && command) setOpen(command.expand); }, [command, bulk]);
  if (exporting) return <section className="cr-export-evidence"><h3>{title}</h3>{children}</section>;
  return <details className="cr-disclosure" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{title}<span>Explore evidence</span></summary>{open && children}
  </details>;
}

function ReportChapter({ model, tab, number, exporting = false }: { model: ReportModel; tab: DeckTab; number: number; exporting?: boolean }) {
  const [flipped, setFlipped] = useState("");
  const [selected, setSelected] = useState(model.scope.month);
  const data = model.chapters[tab.chapter], narrative = model.narratives[tab.chapter];
  const options = reportOptions(model.customization);
  const ids = tab.spec ? chapterMetrics(tab.spec, data) : [];
  const historyIds = [...new Set([...(tab.spec?.history ?? []), ...ids])].filter(id => !tab.spec || !reportedElsewhere(tab.spec, id));
  const hidden = (element: string) => hiddenReportElement(model, tab.chapter, element);
  const metricRefs = [...ids.slice(0, 6).map(metricId => ({ metricId, dataChapterId: tab.chapter })), ...(model.documentEdits?.metrics[tab.chapter] ?? [])].filter((metric, index, all) => !hidden(`metric:${metric.metricId}`) && all.findIndex(other => other.metricId === metric.metricId && other.dataChapterId === metric.dataChapterId) === index);
  const plan = tab.chapter === "recommendations";
  return <RecordDrilldownProvider model={model} chapterId={tab.chapter}>
    <section className="cr-chapter r-section" id={`chapter-${tab.id}`} data-chapter={tab.chapter} data-reader-chapter={tab.id} tabIndex={-1}>
      <header className="cr-chapter-head"><span className="cr-number">{String(number).padStart(2, "0")}</span>
        <div><span className="deck-eyebrow">{tab.spec?.eyebrow || "Leadership review"}</span><h2>{tab.title}</h2><p>{tab.spec?.deck}</p></div>
        <span className="cr-basis">{tab.spec?.network ? "Network scope" : "Selected studio"}<small>{data ? `${data.n.toLocaleString("en-IN")} contributing records` : "Cross-chapter synthesis"}</small></span>
      </header>
      {narrative?.error && <p className="notice" role="status">Analysis unavailable: {narrative.error}. The available source evidence is shown below.</p>}
      {data?.n === 0 && <p className="notice">No contributing records are available for this chapter. Missing performance is unavailable, not zero.</p>}
      {narrative && <p className="cr-analysis-basis">{narrative.generated ? "AI-written analysis · grounded in the frozen report" : "Calculated findings · rule-based analysis"}</p>}

      {!hidden("metrics") && data && data.n > 0 && !!metricRefs.length && <Slot id={`${tab.id}:summary:metrics`} tab={tab.id} section="summary" kind="metrics" describe="key metric cards">
        <CompleteMetricGrid full={exporting || !!model.documentEdits?.metrics[tab.chapter]?.length} items={metricRefs.map((_, index) => String(index))} render={key => { const metric = metricRefs[Number(key)]; return <FlipMetricCard key={key} id={metric.metricId} data={model.chapters[metric.dataChapterId]} target={model.customization?.targets?.[metric.metricId]} flipped={flipped === key} onToggle={() => setFlipped(current => current === key ? '' : key)}/>; }}/>

      </Slot>}
      {!hidden("summary") && data && <section className="rp-chapter-story rp-evidence-pair" aria-label="Chapter overview and corresponding evidence">
        <div className="rp-panel-prose"><span className="deck-eyebrow">Chapter overview</span><h3>The performance story</h3><ReportProse text={narrative?.summary}/>{!!narrative?.briefing?.takeaways.length && <><h4>Key readings</h4><ul className="rp-takeaways">{narrative.briefing.takeaways.map((text, i) => <li key={i}>{text}</li>)}</ul></>}<div className="rp-reading-basis"><b>Reading basis</b><p>Selected month, previous month and the same month last year, wherever recorded. Missing observations remain unavailable.</p></div></div>
        <a href="#report-appendix">Inspect the chart, definitions and monthly register in the appendix</a>
      </section>}
      {!hidden("summary") && !data && narrative?.summary && <section className="rp-synthesis-prose"><ReportProse text={narrative.summary}/></section>}
      {!hidden("briefing") && <Slot id={`${tab.id}:summary:verdict`} tab={tab.id} section="summary" kind="verdict" describe="chapter briefing"><Disclosure exporting={exporting} title="Chapter briefing · drivers, durability and outlook"><BriefingPanel model={model} chapter={tab.chapter} ids={ids} showTakeaways={false}/></Disclosure></Slot>}
      {!hidden("commentary") && !!narrative?.metricCommentary?.length && <Disclosure exporting={exporting} title="Complete written metric review"><MetricCommentary model={model} chapter={tab.chapter} exporting={exporting}/></Disclosure>}
      {!hidden("performers") && narrative?.performers && <section className="cr-metric-commentary" aria-label="Breakdown interpretation">{Object.entries(narrative.performers).filter(([, text]) => text).map(([key, text]) => <div key={key}><h4>{key === "leaders" ? "Leading segments" : key === "laggards" ? "Segments needing attention" : "Pattern across the evidence"}</h4><p>{text}</p></div>)}</section>}
      {!narrative && <p className="empty-state">No written analysis is available for this chapter. Review its source evidence or rewrite insights in Monthly reports.</p>}
      {!hidden("findings") && !!narrative?.cards.length && <Slot id={`${tab.id}:insights:insights`} tab={tab.id} section="insights" kind="insights" describe="insight list"><InsightsSection model={model} tab={tab.chapter} plan={plan} initialView="list" exporting={exporting} editorial sectionNumber={number}/></Slot>}
      {!hidden("decision") && options.showActionPlan && <Slot id={`${tab.id}:summary:decision`} tab={tab.id} section="summary" kind="verdict" describe="leadership decision"><DecisionPanel model={model} chapter={tab.chapter} ids={ids}/></Slot>}
      {plan && options.showActionPlan && <ActionPlan cards={narrative?.cards ?? []}/>}

      {!!model.documentEdits?.blocks[tab.chapter]?.length && <div className="p57-authored-elements">{model.documentEdits.blocks[tab.chapter].map((block, index) => <ReportEvidence key={block.id} block={block} chapterId={tab.chapter} model={model} path={["documentEdits", "blocks", tab.chapter, index]}/>)}</div>}
      {/* Chapter-wide context is supporting evidence; insight-specific proof stays with each finding. */}
      {!hidden("trends") && options.showCharts && data && data.history.length > 1 && !!historyIds.length && <Disclosure exporting={exporting} title="Supporting evidence · monthly trends"><div className="cr-trend">{exporting ? historyIds.slice(0, 3).map(id => <FocusTrend key={id} id={id} history={data.history.slice(-options.historyMonths)}/>) : <TrendChartPanel history={data.history.slice(-options.historyMonths)} ids={historyIds} selected={selected} onSelect={setSelected} title={`${tab.label} · monthly trend`}/>}</div></Disclosure>}

      {!hidden("tables") && !!data?.groups.length && <Disclosure exporting={exporting} title="Complete evidence tables · sort, search and export"><Slot id={`${tab.id}:tables:tables`} tab={tab.id} section="tables" kind="evidence" describe="key tables">{exporting ? <div className="p57-adaptive-grid">{data.groups.map((group, i) => <div key={i} data-reader-span={readingSpan({ columns: group.columns.length + 1, rows: group.rows.length, longestLabel: Math.max(0, ...group.rows.map(row => String(row.g).length)) })}><EvidenceBlock table={group} full initialView="table" showCharts={false}/></div>)}</div> : <KeyTables model={model} chapter={tab.chapter}/>}</Slot></Disclosure>}
      <ReportedElsewhere spec={tab.spec}/>
      {!exporting && data && tab.spec && !tab.spec.derived && <Disclosure exporting={exporting} bulk={false} title="Item-level source records"><DataExplorer model={model} spec={tab.spec}/></Disclosure>}
      {!hidden("source") && options.showSources && <details className="cr-source"><summary>Source, coverage & interpretation limits</summary><p>{tab.spec?.source || "Frozen report chapters"}</p>{[...(data?.notes ?? []), ...(data?.diagnostics ?? [])].map((note, i) => <p key={i}>{note}</p>)}<p>Monthly figures are frozen at report generation. {sourceBasis(model, tab.chapter)}. Missing values are unavailable. Arithmetic drivers and associations do not establish cause.</p></details>}
    </section>
  </RecordDrilldownProvider>;
}

export function ContinuousReport({ model, tabs, ranked, onNavigate, exporting = false, withNavigation = false }: { model: ReportModel; tabs: DeckTab[]; ranked: Finding[]; onNavigate: (id: string) => void; exporting?: boolean; withNavigation?: boolean }) {
  const options = reportOptions(model.customization);
  const root = useRef<HTMLDivElement>(null);
  const { preferences, update } = useReaderPreferences();
  const [command, setCommand] = useState<{ expand: boolean; revision: number } | null>(null);
  return <ReaderContext.Provider value={{ command }}><div className={withNavigation ? "cr-layout" : "cr-layout-plain"}>
    {withNavigation && <nav className="cr-rail" aria-label="Report chapter index"><b>Atlas<span>Physique 57 India</span></b>{tabs.map((tab, i) => <a key={tab.id} href={`#chapter-${tab.id}`} onClick={event => { if (!exporting) { event.preventDefault(); onNavigate(tab.id); } }}><span>{String(i).padStart(2, '0')}</span>{tab.label}</a>)}<small>{model.scope.studio}<br/>{model.scope.month}</small></nav>}
    <div ref={root} className="cr-report p57-reference-review" style={reportAppearance(model)} data-reader-layout={preferences.layout} data-reader-size={preferences.textSize} data-reader-spacing={preferences.spacing}>
    {!exporting && <ReaderControls model={model} tabs={tabs} root={root} preferences={preferences} onPreferences={update} onEvidence={expand => setCommand(current => ({ expand, revision: (current?.revision ?? 0) + 1 }))}/>}
    <section id="chapter-overview" data-reader-chapter="overview" tabIndex={-1}><RecordDrilldownProvider model={model} chapterId="executive-summary"><LeadershipFront model={model} exporting={exporting}/></RecordDrilldownProvider><ReportMarquee model={model} exporting={exporting}/></section>
    {options.showContents && <nav className="cr-contents" aria-label="Report contents"><span className="deck-eyebrow">Inside this review</span>{tabs.filter(tab => tab.id !== "overview").map((tab, i) => <a key={tab.id} href={`#chapter-${tab.id}`} onClick={e => { if (!exporting) { e.preventDefault(); onNavigate(tab.id); } }}><span>{String(i + 1).padStart(2, "0")}</span>{tab.label}<span aria-hidden="true">↗</span></a>)}</nav>}
    {tabs.filter(tab => tab.id !== "overview").map((tab, i) => <ReportChapter key={tab.id} model={model} tab={tab} number={i + 1} exporting={exporting}/>)}
    <EditorialSynthesis model={model} tabs={tabs}/>
    {options.showActionPlan && <section className="cr-closing" aria-label="Closing synthesis"><span className="deck-eyebrow">Next review</span><h2>Final leadership takeaway</h2><p>{model.narratives.recommendations?.summary || "Use the evidence and proposed actions in each chapter to agree priorities for the next studio review. Conditional opportunities may overlap and should not be added together."}</p><ol>{tabs.filter(t => t.id !== "overview" && t.chapter !== "recommendations").flatMap(t => { const d = model.narratives[t.chapter]?.decision; const c = model.narratives[t.chapter]?.cards.find(c => c.action && c.priority === "high"); return d?.call || c ? [<li key={t.id}><b>{t.label}</b><p>{d?.call || c?.action}</p><small>Proposed owner: {d?.owner || c?.ownerArea || "To be agreed"} · Review: {d?.horizon || c?.horizon || "To be agreed"}</small>{(d?.successMeasure || c?.watch) && <p>Measure to review: {d?.successMeasure || c?.watch}</p>}</li>] : []; }).slice(0, 5)}</ol></section>}
    <section className="cr-appendix" id="report-appendix"><h2>Appendix · registers, definitions & evidence</h2><IntelligenceAppendix model={model}/>{tabs.filter(t=>t.id!=="overview").map(tab=>{const data=model.chapters[tab.chapter];if(!data)return null;const ids=tableMetrics(tab.spec,data);return <RecordDrilldownProvider key={tab.id} model={model} chapterId={tab.chapter}><Disclosure exporting={exporting} title={`${tab.label} · metric and monthly registers`}><EvidenceVisual data={data} table={curatedBreakdowns(data.groups,1)[0]} metrics={ids.slice(0,3)} month={model.scope.month} title={`${tab.label} · evidence`} exporting={exporting} showCharts={options.showCharts}/><MetricRegister chapter={tab.chapter} data={data} month={model.scope.month} exporting={exporting}/>{!!ids.length&&<ReportMoMTable exporting={exporting} history={data.history.slice(-options.historyMonths)} ids={ids} selected={model.scope.month} onSelect={()=>{}} title={tab.label}/>}<SegmentMoMTable data={data} selected={model.scope.month} onSelect={()=>{}} exporting={exporting}/></Disclosure></RecordDrilldownProvider>;})}</section>
    {options.showSources && <footer className="cr-method"><h2>Evidence & reading basis</h2><p>Cash collections and attendance-attributed revenue measure different populations. Newcomer and lead outcomes depend on observation time; current stages do not reconstruct historical transitions. Membership snapshots describe the build date. Conditional value at stake can overlap across recommendations and must not be added together.</p>{model.sources?.map(source => <p key={source.key}><b>{source.title}</b> · {source.status}{source.stale ? " · stale snapshot" : ""} · {source.fetchedAt ? new Date(source.fetchedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Refresh time unavailable"}</p>)}</footer>}
  </div></div></ReaderContext.Provider>;
}
