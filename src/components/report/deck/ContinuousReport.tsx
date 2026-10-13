import { chapterHeroStyle } from "./chapterHero";
import { useState } from "react";
import type { ReactNode } from "react";
import type { ReportModel } from "../../../report/model";
import { chapterMetrics, type DeckTab } from "../../../report/deck";
import { reportOptions } from "../../../report/options";
import { BriefingPanel, DecisionPanel } from "./Briefing";
import { CompleteMetricGrid } from "./CompleteMetricGrid";
import { FlipMetricCard } from "./FlipMetricCard";
import { InsightsSection } from "./Insights";
import { KeyTables } from "./KeyTables";
import { TrendChartPanel, ReportMoMTable } from "./ReportTrends";
import { RecordDrilldownProvider } from "./RecordDrilldown";
import { DataExplorer } from "./DataExplorer";
import { Slot } from "./editing";
import { EvidenceBlock } from "../ReportEvidence";
import { curatedBreakdowns } from "../../../report/evidence";
import { CoverPage } from "./CoverPage";
import type { Finding } from "../../../report/findings";
import { ActionPlan } from "../Glance";

/** Expensive source explorers only mount when the reader opens them. */
function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details className="cr-disclosure" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{title}<span>Explore evidence</span></summary>{open && children}
  </details>;
}

function ReportChapter({ model, tab, number }: { model: ReportModel; tab: DeckTab; number: number }) {
  const [flipped, setFlipped] = useState("");
  const [selected, setSelected] = useState(model.scope.month);
  const data = model.chapters[tab.chapter], narrative = model.narratives[tab.chapter];
  const options = reportOptions(model.customization);
  const ids = tab.spec ? chapterMetrics(tab.spec, data) : [];
  const historyIds = [...new Set([...(tab.spec?.history ?? []), ...ids])];
  const plan = tab.chapter === "recommendations";
  const evidence = curatedBreakdowns(data?.groups ?? [], 1)[0];
  return <RecordDrilldownProvider model={model} chapterId={tab.chapter}>
    <section className="cr-chapter r-section" id={`chapter-${tab.id}`} data-chapter={tab.chapter}>
      <header className="cr-chapter-head chapter-photo-hero" data-photo="chapter" style={chapterHeroStyle(number - 1, tab.title)}><span className="cr-number">{String(number).padStart(2, "0")}</span>
        <div><span className="deck-eyebrow">{tab.spec?.eyebrow || "Leadership review"}</span><h2>{tab.title}</h2><p>{tab.spec?.deck}</p></div>
        <span className="cr-basis">{tab.spec?.network ? "Network scope" : "Selected studio"}<small>{data ? `${data.n.toLocaleString("en-IN")} contributing records` : "Cross-chapter synthesis"}</small></span>
      </header>
      {narrative?.error && <p className="notice" role="status">Analysis unavailable: {narrative.error}. The available source evidence is shown below.</p>}
      {narrative?.summary && <p className="cr-summary">{narrative.summary}</p>}
      {data && !!ids.length && <Slot id={`${tab.id}:summary:metrics`} tab={tab.id} section="summary" kind="metrics" describe="key metric cards">
        <CompleteMetricGrid items={ids.slice(0, 6)} render={id => <FlipMetricCard key={id} id={id} data={data} target={model.customization?.targets?.[id]} flipped={flipped === id} onToggle={() => setFlipped(current => current === id ? "" : id)}/>}/>
      </Slot>}
      <Slot id={`${tab.id}:summary:verdict`} tab={tab.id} section="summary" kind="verdict" describe="chapter briefing"><BriefingPanel model={model} chapter={tab.chapter} ids={ids}/></Slot>
      {!narrative && <p className="empty-state">No written analysis is available for this chapter. Review its source evidence or rewrite insights in Monthly reports.</p>}
      {!!narrative?.cards.length && <Slot id={`${tab.id}:insights:insights`} tab={tab.id} section="insights" kind="insights" describe="insight list"><InsightsSection model={model} tab={tab.chapter} plan={plan} initialView="list"/></Slot>}
      {options.showActionPlan && <Slot id={`${tab.id}:summary:decision`} tab={tab.id} section="summary" kind="verdict" describe="leadership decision"><DecisionPanel model={model} chapter={tab.chapter} ids={ids}/></Slot>}
      {plan && options.showActionPlan && <ActionPlan cards={narrative?.cards ?? []}/>}
      {/* Chapter-wide context is supporting evidence; insight-specific proof stays with each finding. */}
      {options.showCharts && data && data.history.length > 1 && <Disclosure title="Supporting evidence · monthly trends"><div className="cr-trend"><TrendChartPanel history={data.history.slice(-options.historyMonths)} ids={historyIds} selected={selected} onSelect={setSelected} title={`${tab.label} · monthly trend`}/></div></Disclosure>}
      {options.showInlineEvidence && evidence && <Disclosure title={`Supporting evidence · ${evidence.title}`}><div className="cr-evidence"><EvidenceBlock table={evidence} full initialView={options.showCharts ? "chart" : "table"} showCharts={options.showCharts}/></div></Disclosure>}
      {!!data?.groups.length && <Disclosure title="Complete evidence tables · sort, search and export"><Slot id={`${tab.id}:tables:tables`} tab={tab.id} section="tables" kind="evidence" describe="key tables"><KeyTables model={model} chapter={tab.chapter}/></Slot></Disclosure>}
      {data && !!data.history.length && <Disclosure title="Month-by-month comparison register"><ReportMoMTable history={data.history.slice(-options.historyMonths)} ids={historyIds} selected={selected} onSelect={setSelected} title={tab.label}/></Disclosure>}
      {data && tab.spec && !tab.spec.derived && <Disclosure title="Item-level source records"><DataExplorer model={model} spec={tab.spec}/></Disclosure>}
      {options.showSources && <details className="cr-source"><summary>Source, coverage & interpretation limits</summary><p>{tab.spec?.source || "Frozen report chapters"}</p>{[...(data?.notes ?? []), ...(data?.diagnostics ?? [])].map((note, i) => <p key={i}>{note}</p>)}<p>Monthly figures are frozen at report generation. Item-level drilldowns read the live source and may have changed since. Missing values are unavailable. Arithmetic drivers and associations do not establish cause.</p></details>}
    </section>
  </RecordDrilldownProvider>;
}

export function ContinuousReport({ model, tabs, ranked, onNavigate }: { model: ReportModel; tabs: DeckTab[]; ranked: Finding[]; onNavigate: (id: string) => void }) {
  const options = reportOptions(model.customization);
  return <div className="cr-report">
    <section id="chapter-overview"><CoverPage model={model} tabs={tabs} ranked={ranked} onNavigate={onNavigate}/>{!!model.narratives["executive-summary"]?.cards.length && <RecordDrilldownProvider model={model} chapterId="executive-summary"><Disclosure title="Executive synthesis · the connections across chapters"><InsightsSection model={model} tab="executive-summary" initialView="list"/></Disclosure></RecordDrilldownProvider>}</section>
    {options.showContents && <nav className="cr-contents" aria-label="Report contents"><span className="deck-eyebrow">Inside this review</span>{tabs.filter(tab => tab.id !== "overview").map((tab, i) => <button key={tab.id} onClick={() => onNavigate(tab.id)}><span>{String(i + 1).padStart(2, "0")}</span>{tab.label}<span aria-hidden="true">↗</span></button>)}</nav>}
    {tabs.filter(tab => tab.id !== "overview").map((tab, i) => <ReportChapter key={tab.id} model={model} tab={tab} number={i + 1}/>)}
    {options.showSources && <footer className="cr-method"><h2>Evidence & reading basis</h2><p>Cash collections and attendance-attributed revenue measure different populations. Newcomer and lead outcomes depend on observation time; current stages do not reconstruct historical transitions. Membership snapshots describe the build date. Conditional value at stake can overlap across recommendations and must not be added together.</p>{model.sources?.map(source => <p key={source.key}><b>{source.title}</b> · {source.status}{source.stale ? " · stale snapshot" : ""} · {source.fetchedAt ? new Date(source.fetchedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Refresh time unavailable"}</p>)}</footer>}
  </div>;
}
