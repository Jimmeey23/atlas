import { ReportSettings } from "./ReportSettings";
import { definition } from "../../report/definitions";
import { GenerationStats } from "./GenerationStats";
import { DropdownField } from "../ui/DropdownField";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, RefreshCw, TriangleAlert, ExternalLink, Clock3, Database, Square, CheckCircle2, Loader2, CircleDashed, FilePlus2, Building2, CalendarDays, Layers3, Pin, PinOff, FileText, Presentation, Mic, PencilLine, History, Lightbulb, ArrowUpRight } from "lucide-react";
import { query } from "../../data/duckdb";
import { useStore } from "../../state/store";
import { themeOptions } from "../../state/preferences";
import { monthLabel } from "../../report/compute";
import { openReportPage } from "../../report/export";
import { reportOptions } from "../../report/options";
import type { ReportModel, ReportCustomization } from "../../report/model";
import { KEEP_RECENT, listReports, loadReport, pinReport } from "../../report/storage";
import { chapters } from "../../report/chapters";
import { estimateSeconds, persistReport, retained, startReport, stopReport, useReportJob } from "../../report/job";
import "../../design/report-studio.css";

/** Measures leadership most often sets a monthly target for. Rates are entered as percentages. */
const TARGETS_KEY = 'atlas-report-targets';
function storedTargets(): Record<string, number> {
  try { const parsed = JSON.parse(localStorage.getItem(TARGETS_KEY) || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; }
  catch { return {}; }
}
const PREFS_KEY = 'atlas-report-preferences';
/** Presentation and editorial choices persist per browser; identity and chapter scope are per report. */
function storedPreferences(): Partial<ReportCustomization> {
  try { const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; }
  catch { return {}; }
}
const REMEMBERED: (keyof ReportCustomization)[] = ['audience','tone','detail','surface','density','layout','evidenceView','historyMonths','accent','typography','cardStyle','lenses','insightsPerChapter','includeActions','quantifyImpact','comparisonFocus','showCover','showGlance','showContents','showInlineEvidence','showActionPlan','showCharts','showDefinitions','showConfidence','showSources','showAppendix','pageBreaks','preparedBy','confidentiality'];

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
const when = (iso?: string) => iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

/** Saved reports open in their own tab; unsaved ones travel there as a session snapshot. */
function openInNewTab(model: ReportModel) {
  if (model.id) { window.open(`/report?id=${encodeURIComponent(model.id)}`, "_blank", "noopener"); return Promise.resolve(); }
  return openReportPage(document.body, model);
}

/**
 * Studio and month in, a board report out. The run lives in the report job store,
 * so it keeps going when the reader moves to another tab. Reports open in a new tab.
 */
export function ReportBuilder({ version }: { version: string | number }) {
  const theme = useStore((s) => s.theme);
  const filters = useStore((s) => s.filters);
  const reportTheme = themeOptions.find((option) => option.id === theme)?.type.startsWith("Dark") ? "dark" : "light";
  const job = useReportJob();
  const { studio, month, model, stage, status, pending } = job;
  const customization: ReportCustomization = useMemo(() => job.customization ?? {
    title: 'Monthly performance report', subtitle: '', preparedFor: '', preparedBy: '', audience: 'Studio leadership', tone: 'Professional',
    detail: 'Comprehensive', instructions: '', chapterIds: chapters.map(c => c.id), theme: reportTheme, targets: storedTargets(),
    density: 'comfortable', layout: 'adaptive', evidenceView: 'auto', historyMonths: 12, accent: 'navy', focusAreas: [], ...storedPreferences(),
  }, [job.customization, reportTheme]);
  useEffect(() => { if (!job.customization) job.set({ customization }); }, [job.customization, customization]);
  const running = status === "running";
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running || job.startedAt === null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - job.startedAt!) / 1000));
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [running, job.startedAt]);
  // Seeing the tab acknowledges a run that finished in the background.
  useEffect(() => { if (job.unseen) job.set({ unseen: false }); }, [job.unseen]);

  const patch = (value: Partial<ReportCustomization>) => {
    const next = { ...customization, ...value };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(Object.fromEntries(REMEMBERED.map(k => [k, next[k]])))); } catch { /* preferences still apply to this session */ }
    const appearance = ['title','subtitle','preparedFor','preparedBy','theme','surface','density','layout','evidenceView','historyMonths','accent','typography','cardStyle','confidentiality','showCover','showGlance','showContents','showInlineEvidence','showActionPlan','showCharts','showDefinitions','showConfidence','showSources','showAppendix','pageBreaks','chapterIds'];
    // Presentation changes restyle the open report without rewriting it; it becomes an unsaved variant.
    const restyled = model && !running && Object.keys(value).every(key => appearance.includes(key))
      ? { ...model, customization: { ...customization, ...model.customization, ...value }, id: undefined, savedAt: undefined } : model;
    job.set({ customization: next, model: restyled });
  };
  const setTarget = (id: string, raw: string) => {
    const targets = { ...(customization.targets ?? {}) };
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(value)) delete targets[id];
    else targets[id] = definition(id)?.format === 'percent' ? value / 100 : value;
    try { localStorage.setItem(TARGETS_KEY, JSON.stringify(targets)); } catch { /* targets still apply to this report */ }
    job.set({ customization: { ...customization, targets } });
  };
  function moveChapter(id: string, direction: number) {
    const ids = [...customization.chapterIds]; const index = ids.indexOf(id); const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]]; patch({ chapterIds: ids });
  }
  const [studios, setStudios] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [opening, setOpening] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [locationRows, monthRows] = await Promise.all([
          query(`SELECT DISTINCT location FROM sessions WHERE location IS NOT NULL ORDER BY location`),
          query(`SELECT DISTINCT month FROM sessions WHERE month IS NOT NULL ORDER BY month DESC LIMIT 36`),
        ]);
        if (!live) return;
        const locations = locationRows.map((r) => String(r.location));
        const available = monthRows.map((r) => String(r.month));
        setStudios(locations);
        setMonths(available);
        // Open on what the dashboard is already looking at, where that exists.
        const state = useReportJob.getState();
        state.set({
          studio: state.studio || locations.find((l) => filters.location.includes(l)) || locations[0] || "",
          month: state.month || available.find((m) => m === filters.to?.slice(0, 7)) || available[0] || "",
        });
      } catch (e) {
        if (live) setLocalError(String(e));
      }
    })();
    return () => { live = false; };
  }, [version]);

  // The server prunes to the latest five plus pinned whenever a report is saved; reload after each save.
  useEffect(() => {
    const controller = new AbortController();
    setLoadingHistory(true);
    void listReports(controller.signal)
      .then(history => { if (!controller.signal.aborted) useReportJob.getState().set({ savedReports: history.filter(retained) }); })
      .catch(e => { if (!controller.signal.aborted) job.set({ storageError: String(e) }); })
      .finally(() => { if (!controller.signal.aborted) setLoadingHistory(false); });
    return () => controller.abort();
  }, [model?.id]);

  async function open(target: ReportModel | string) {
    setLocalError(""); setOpening(typeof target === "string" ? target : target.id ?? "current");
    try {
      if (typeof target === "string") { window.open(`/report?id=${encodeURIComponent(target)}`, "_blank", "noopener"); return; }
      await openInNewTab(target);
    } catch (e) { setLocalError(String(e)); }
    finally { setOpening(""); }
  }
  async function togglePin(id: string, pinned: boolean) {
    try {
      await pinReport(id, pinned);
      const state = useReportJob.getState();
      state.set({ savedReports: state.savedReports.map(r => r.id === id ? { ...r, pinned } : r) });
    } catch (e) { setLocalError(String(e)); }
  }
  async function loadIntoBuilder(id: string) {
    try { const saved = await loadReport(id); job.set({ model: saved, studio: saved.scope.studio, month: saved.scope.month, status: "idle", error: "", narrativeError: "", ...(saved.customization ? { customization: saved.customization } : {}) }); }
    catch (e) { job.set({ storageError: String(e) }); }
  }

  const ready = !!studio && !!month && customization.chapterIds.length > 0;
  const busy = running || !!opening;
  const analysisPreferences = (c?: ReportCustomization) => JSON.stringify([c?.audience, c?.tone, c?.detail, c?.instructions, c?.focusAreas ?? [], c?.targets ?? {}, c?.lenses ?? [], c?.insightsPerChapter, c?.includeActions, c?.quantifyImpact, c?.comparisonFocus]);
  const needsRewrite = !!model && !running && (analysisPreferences(model.customization) !== analysisPreferences(customization) || customization.chapterIds.some(id => !model.narratives[id]));
  const estimate = estimateSeconds(customization);
  const options = reportOptions(customization);
  const progress = stage && stage.total ? Math.round((stage.done / stage.total) * 100) : 0;
  const runChapters = (model?.customization?.chapterIds ?? customization.chapterIds).flatMap(id => chapters.find(c => c.id === id) ?? []);
  const error = job.error || localError;
  const pinned = job.savedReports.filter(r => r.pinned), recent = job.savedReports.filter(r => !r.pinned).slice(0, KEEP_RECENT);

  return (
    <div className="report-workspace rs" data-report-id={model?.id || ""}>
      <header className="rs-hero">
        <div className="rs-hero-mark"><Presentation size={22}/></div>
        <div className="rs-hero-copy"><span className="eyebrow">Monthly report studio</span><h2>Turn the month into decisions.</h2>
          <p>Build a tabbed, presentable review with verdicts, flip-to-history metric cards, month-on-month tables and live speaker notes. Reports open in their own tab.</p></div>
        <ul className="rs-hero-features">
          <li><Lightbulb size={14}/>Root cause · concentration · value at stake</li>
          <li><Mic size={14}/>Live speaker notes per page</li>
          <li><PencilLine size={14}/>Admin edits & AI component swaps</li>
        </ul>
      </header>

      <div className="rs-grid">
        <div className="rs-main">
          <section className="rs-card rs-scope" aria-label="Report scope">
            <header className="rs-card-head"><span className="rs-step">1</span><div><h3>Scope</h3><p>Choose the studio and month to review.</p></div></header>
            <div className="rs-scope-fields">
              <label className="rs-field"><span><Building2 size={14}/>Studio</span>
                <DropdownField aria-label="Studio" value={studio} onChange={(e) => job.set({ studio: e.target.value })} disabled={busy || !studios.length}>
                  {Array.from(new Set([studio, ...studios].filter(Boolean))).map((name) => <option key={name} value={name}>{name}</option>)}
                </DropdownField></label>
              <label className="rs-field"><span><CalendarDays size={14}/>Period</span>
                <DropdownField aria-label="Period" value={month} onChange={(e) => job.set({ month: e.target.value })} disabled={busy || !months.length}>
                  {Array.from(new Set([month, ...months].filter(Boolean))).map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
                </DropdownField></label>
            </div>
          </section>
          <section className="rs-card rs-settings-card" aria-label="Report design">
            <header className="rs-card-head"><span className="rs-step">2</span><div><h3>Shape the report</h3><p>Style, insight lenses, design and chapter order.</p></div></header>
            <ReportSettings value={customization} patch={patch} busy={busy} onTarget={setTarget} moveChapter={moveChapter}/>
          </section>
        </div>

        <aside className="rs-side">
          <section className="rs-card rs-generate" aria-label="Generate report">
            <header className="rs-card-head"><span className="rs-step">3</span><div><h3>Generate</h3><p>{studio || "Studio"} · {month ? monthLabel(month) : "Month"}</p></div></header>
            <dl className="rs-summary">
              <div><dt><Layers3 size={13}/>Chapters</dt><dd>{customization.chapterIds.length}</dd></div>
              <div><dt><Lightbulb size={13}/>Insights each</dt><dd>{options.insightsPerChapter}</dd></div>
              <div><dt><Clock3 size={13}/>Estimate</dt><dd>{clock(estimate)}</dd></div>
            </dl>
            {running
              ? <button className="button rb2-stop rs-cta" onClick={stopReport}><Square size={13} />Stop generating</button>
              : <button className="button primary rs-cta" disabled={!ready || busy} onClick={() => void startReport()}><Sparkles size={15} />{model ? "Rebuild report" : "Generate report"}</button>}
            {running && stage && <div className="rs-progress" role="status" aria-label="Report generation progress">
              <div className="rs-progress-head"><Loader2 size={15} className="rb2-spin"/><b>{stage.label}</b><span>{progress}%</span></div>
              <div className="report-progress-bar"><span style={{ width: `${progress}%` }} /></div>
              <small>{elapsed < job.estimatedSeconds ? `About ${clock(job.estimatedSeconds - elapsed)} remaining` : `Taking longer than estimated · ${clock(elapsed)} elapsed`} · continues if you switch tabs</small>
              {model && <ol className="rb2-chapter-steps">{runChapters.map(spec => {
                const done = !pending.includes(spec.id);
                const failed = done && model.narratives[spec.id]?.error;
                return <li key={spec.id} data-state={failed ? 'failed' : done ? 'done' : stage.label.endsWith(spec.title) ? 'active' : 'waiting'}>
                  {done ? (failed ? <TriangleAlert size={13}/> : <CheckCircle2 size={13}/>) : <CircleDashed size={13}/>}{spec.nav}
                </li>;
              })}</ol>}
            </div>}
            {needsRewrite && <p className="rs-hint"><Sparkles size={13}/>Analysis preferences changed. Rewrite insights to apply them to the saved figures.</p>}
            {job.narrativeError && !running && <p className="rs-hint" data-tone="warn"><TriangleAlert size={13}/>{status === "stopped" ? job.narrativeError : <>Some chapters could not be written. Rewrite insights to retry. {job.narrativeError}</>}</p>}
            {error && <p className="notice" role="alert"><TriangleAlert size={13} />{error}</p>}
            {job.storageError && <p className="notice" role="alert">{job.storageError}</p>}
          </section>

          {model && !running && <section className="rs-card rs-ready" aria-label="Current report">
            <div className="rs-ready-head"><span className="rs-ready-icon"><CheckCircle2 size={18}/></span><div><b>{model.customization?.title || "Monthly performance report"}</b><small>{model.scope.studio} · {monthLabel(model.scope.month)} · {model.savedAt ? `saved ${when(model.savedAt)}` : status === "stopped" ? "partial, unsaved" : "unsaved"}</small></div></div>
            <button className="button primary rs-cta" disabled={busy} onClick={() => void open(model)}>{opening ? <Loader2 size={15} className="rb2-spin"/> : <ExternalLink size={15}/>}Open report in new tab</button>
            <div className="rs-ready-actions">
              <button className="button" disabled={busy} title="Writes failed, missing or changed chapters and reuses unchanged analysis" onClick={() => void startReport({ regenerate: true })}><RefreshCw size={14} />Rewrite insights</button>
              {!model.id && <button className="button" disabled={busy} onClick={() => void persistReport(model)}><Database size={14}/>{status === "stopped" ? "Save partial" : "Save"}</button>}
              <button className="button" disabled={busy} onClick={() => job.set({ model: null, status: "idle", narrativeError: "", error: "" })}><FilePlus2 size={14}/>New</button>
            </div>
            <GenerationStats model={model}/>
            {model.schemaVersion != null && model.schemaVersion <= 3 && <p className="rs-hint" data-tone="warn"><TriangleAlert size={13}/>Saved in an earlier report format. Rebuild for current definitions.</p>}
          </section>}

          <section className="rs-card rs-library" aria-label="Report library">
            <header className="rs-card-head"><History size={16}/><div><h3>Report library</h3><p>Latest {KEEP_RECENT} reports plus pinned. Older unpinned reports are removed.</p></div></header>
            {loadingHistory && <p className="rs-hint"><Loader2 size={13} className="rb2-spin"/>Loading…</p>}
            {!loadingHistory && !job.savedReports.length && <p className="rs-empty"><FileText size={18}/>Generated reports appear here.</p>}
            {[["Pinned", pinned], ["Recent", recent]].map(([title, items]) => (items as typeof recent).length ? <div className="rs-library-group" key={title as string}>
              <span className="rs-library-label">{title as string}</span>
              <ul>{(items as typeof recent).map(item => <li key={item.id} data-current={item.id === model?.id}>
                <button className="rs-library-open" onClick={() => void open(item.id)} title="Open in new tab">
                  <span className="rs-library-icon"><FileText size={15}/></span>
                  <span><b>{item.scope.studio} · {monthLabel(item.scope.month)}</b><small>{item.title && !/^monthly performance report$/i.test(item.title) ? `${item.title} · ` : ""}{when(item.editedAt || item.savedAt)}{item.editedAt ? " · edited" : ""} · {item.aiChapters}/{item.chapterCount ?? 0} AI</small></span>
                  <ArrowUpRight size={14}/>
                </button>
                <button className="icon-button" aria-label={item.pinned ? "Unpin report" : "Pin report"} title={item.pinned ? "Unpin" : "Pin to keep"} aria-pressed={!!item.pinned} onClick={() => void togglePin(item.id, !item.pinned)}>{item.pinned ? <PinOff size={14}/> : <Pin size={14}/>}</button>
                <button className="icon-button" aria-label="Load settings into builder" title="Load into builder" disabled={busy} onClick={() => void loadIntoBuilder(item.id)}><RefreshCw size={13}/></button>
              </li>)}</ul></div> : null)}
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Shown outside the Monthly report tab while a run is writing, or once it finishes unseen. */
export function ReportJobIndicator({ onOpen }: { onOpen: () => void }) {
  const { status, stage, unseen, model, pending } = useReportJob();
  if (status !== "running" && !unseen) return null;
  const total = model?.customization?.chapterIds.length ?? 0;
  const progress = stage && stage.total ? Math.round((stage.done / stage.total) * 100) : 0;
  return <div className="rb2-indicator" role="status" data-state={status}>
    {status === "running" ? <Loader2 size={15} className="rb2-spin"/> : status === "done" ? <CheckCircle2 size={15}/> : <TriangleAlert size={15}/>}
    <div>
      <strong>{status === "running" ? "Writing monthly report" : status === "done" ? "Monthly report ready" : status === "stopped" ? "Report generation stopped" : "Report generation hit a problem"}</strong>
      <span>{status === "running" ? `${model ? `${total - pending.length}/${total} chapters` : stage?.label ?? "Starting"} · ${progress}%` : model ? `${model.scope.studio} · ${monthLabel(model.scope.month)}` : ""}</span>
    </div>
    <button className="button" onClick={() => { useReportJob.getState().set({ unseen: false }); onOpen(); }}>View</button>
    {status === "running" ? <button className="button" aria-label="Stop report generation" onClick={stopReport}><Square size={12}/>Stop</button>
      : <button className="button" aria-label="Dismiss" onClick={() => useReportJob.getState().set({ unseen: false })}>×</button>}
  </div>;
}

export type { ReportModel };
