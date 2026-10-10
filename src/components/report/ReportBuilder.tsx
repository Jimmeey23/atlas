import { ReportSettings } from "./ReportSettings";
import { definition } from "../../report/definitions";
import { GenerationStats } from "./GenerationStats";
import { DropdownField } from "../ui/DropdownField";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer, Sparkles, FileText, RefreshCw, TriangleAlert, ExternalLink, ChartNoAxesCombined, Clock3, Layers3, Database, Square, CheckCircle2, Loader2, CircleDashed, FilePlus2 } from "lucide-react";
import { query } from "../../data/duckdb";
import { useStore } from "../../state/store";
import { themeOptions } from "../../state/preferences";
import { monthLabel } from "../../report/compute";
import { downloadReport, printReport, openReportPage } from "../../report/export";
import type { ReportModel, ReportCustomization } from "../../report/model";
import { listReports, loadReport } from "../../report/storage";
import { ReportDocument } from "./ReportDocument";
import { chapters } from "../../report/chapters";
import { estimateSeconds, persistReport, startReport, stopReport, useReportJob } from "../../report/job";

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
const REMEMBERED: (keyof ReportCustomization)[] = ['audience','tone','detail','density','layout','evidenceView','historyMonths','accent','typography','cardStyle','lenses','insightsPerChapter','includeActions','quantifyImpact','comparisonFocus','showCover','showGlance','showContents','showInlineEvidence','showActionPlan','showCharts','showDefinitions','showConfidence','showSources','showAppendix','pageBreaks','preparedBy','confidentiality'];

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

/**
 * Studio and month in, a board report out. The run itself lives in the report
 * job store, so it keeps going when the reader moves to another tab.
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
    const appearance = ['title','subtitle','preparedFor','preparedBy','theme','density','layout','evidenceView','historyMonths','accent','typography','cardStyle','confidentiality','showCover','showGlance','showContents','showInlineEvidence','showActionPlan','showCharts','showDefinitions','showConfidence','showSources','showAppendix','pageBreaks','chapterIds'];
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
  const [exporting, setExporting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [localError, setLocalError] = useState("");
  const document_ = useRef<HTMLElement>(null);
  const presentedId = useRef("");
  useEffect(() => { presentedId.current = model?.id || ""; }, [model?.id]);
  useEffect(() => {
    let live = true;
    const listener = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id || presentedId.current === id || running) return;
      presentedId.current = id;
      void loadReport(id).then(saved => { if (live) useReportJob.getState().set({ model: saved, studio: saved.scope.studio, month: saved.scope.month }); })
        .catch(e => { if (live) { presentedId.current = ""; setLocalError(String(e)); } });
    };
    window.addEventListener("p57-present-report", listener);
    return () => { live = false; window.removeEventListener("p57-present-report", listener); };
  }, [running]);

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

  useEffect(() => {
    const controller = new AbortController();
    setLoadingHistory(true);
    void (async () => {
      try {
        const history = await listReports(controller.signal);
        if (!controller.signal.aborted) {
          const state = useReportJob.getState();
          state.set({ savedReports: [...state.savedReports, ...history.filter(item => !state.savedReports.some(saved => saved.id === item.id))].slice(0, 50) });
        }
      } catch (e) {
        if (!controller.signal.aborted) job.set({ storageError: String(e) });
      } finally {
        if (!controller.signal.aborted) setLoadingHistory(false);
      }
    })();
    return () => controller.abort();
  }, []);

  async function openSaved(id: string) {
    setLoadingSaved(true);
    job.set({ storageError: "" });
    try {
      const saved = await loadReport(id);
      job.set({ model: saved, studio: saved.scope.studio, month: saved.scope.month, narrativeError: "", error: "", status: "idle",
        ...(saved.customization ? { customization: saved.customization } : {}) });
    } catch (e) { job.set({ storageError: String(e) }); }
    finally { setLoadingSaved(false); }
  }

  const ready = !!studio && !!month && customization.chapterIds.length > 0;
  const busy = running || loadingSaved || exporting;
  const analysisPreferences = (c?: ReportCustomization) => JSON.stringify([c?.audience, c?.tone, c?.detail, c?.instructions, c?.focusAreas ?? [], c?.targets ?? {}, c?.lenses ?? [], c?.insightsPerChapter, c?.includeActions, c?.quantifyImpact, c?.comparisonFocus]);
  const needsRewrite = !!model && !running && (analysisPreferences(model.customization) !== analysisPreferences(customization) || customization.chapterIds.some(id => !model.narratives[id]));
  const estimate = estimateSeconds(customization);

  async function exportReport(kind: 'html' | 'pdf') {
    if (!model || !document_.current) return;
    setExporting(true); setLocalError('');
    try { await (kind === 'html' ? downloadReport : printReport)(document_.current, model); }
    catch (e) { setLocalError(String(e)); }
    finally { setExporting(false); }
  }

  const progress = stage && stage.total ? Math.round((stage.done / stage.total) * 100) : 0;
  const runChapters = (model?.customization?.chapterIds ?? customization.chapterIds).flatMap(id => chapters.find(c => c.id === id) ?? []);
  const error = job.error || localError;

  return (
    <div className="report-workspace" data-report-id={model?.id || ""}>
      <header className="report-generator-heading rb2-hero" data-export="omit">
        <div className="rb-heading-mark"><ChartNoAxesCombined size={24}/></div>
        <div><span className="eyebrow">Monthly performance intelligence</span><h2>Turn the month into decisions.</h2>
          <p>Every insight arrives with its evidence: the figures, the breakdown that proves it, whether it will last, what it is worth and the move it suggests.</p></div>
        <div className="rb-heading-tags"><span><Layers3 size={14}/>Wins · Risks · Drivers · Opportunities</span><span><Database size={14}/>Source-backed evidence</span></div>
      </header>
      <div className="report-controls rb2-controls" data-export="omit">
        <label>
          <span className="small">Studio</span>
          <DropdownField aria-label="Studio" value={studio} onChange={(e) => job.set({ studio: e.target.value })} disabled={busy || !studios.length}>
            {Array.from(new Set([studio, ...studios].filter(Boolean))).map((name) => <option key={name} value={name}>{name}</option>)}
          </DropdownField>
        </label>
        <label>
          <span className="small">Period</span>
          <DropdownField aria-label="Period" value={month} onChange={(e) => job.set({ month: e.target.value })} disabled={busy || !months.length}>
            {Array.from(new Set([month, ...months].filter(Boolean))).map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
          </DropdownField>
        </label>
        {running
          ? <button className="button rb2-stop" onClick={stopReport}><Square size={13} />Stop generating</button>
          : <button className="button primary" disabled={!ready || busy} onClick={() => void startReport()}><Sparkles size={14} />{model ? "Rebuild report" : "Generate report"}</button>}
        {model && !running && (
          <>
            <button className="button" disabled={busy} title="Writes failed, missing or changed chapters and reuses unchanged analysis" onClick={() => void startReport({ regenerate: true })}><RefreshCw size={14} />Rewrite insights</button>
            <button className="button" disabled={busy} onClick={() => {
              if (!document_.current) return;
              setExporting(true);
              void openReportPage(document_.current, model).catch(e => setLocalError(String(e))).finally(() => setExporting(false));
            }}><ExternalLink size={14}/>Open in new page</button>
            <button className="button" disabled={busy} onClick={() => job.set({ model: null, status: "idle", narrativeError: "", error: "" })}><FilePlus2 size={14}/>New report</button>
            <button className="button" disabled={busy} onClick={() => void exportReport("html")}><Download size={14} />Download HTML</button>
            <button className="button" disabled={busy} onClick={() => void exportReport("pdf")}><Printer size={14} />Export PDF</button>
          </>
        )}
      </div>

      <ReportSettings value={customization} patch={patch} busy={busy} onTarget={setTarget} moveChapter={moveChapter}/>
      {needsRewrite && <p className="rb-help" data-export="omit"><Sparkles size={14}/>Analysis preferences changed or chapters were added. Rewrite insights to apply them to the saved figures.</p>}
      {!running && <div className="rb-generation-note" data-export="omit"><Clock3 size={15}/><span>Estimated new generation <b>{clock(estimate)}</b></span><span>{customization.chapterIds.length} chapters · unchanged analysis is reused · you can switch tabs and come back</span></div>}
      <div className="report-history" data-export="omit">
        <label>
          <span className="small">Saved reports · latest 50 versions</span>
          <DropdownField aria-label="Saved reports" disabled={busy || loadingHistory || !job.savedReports.length} value={model?.id || ""}
            onChange={e => e.target.value && void openSaved(e.target.value)}>
            <option value="">{loadingHistory ? "Loading saved reports…" : "Select a saved report"}</option>
            {job.savedReports.map(saved => <option key={saved.id} value={saved.id}>
              {saved.scope.studio} · {monthLabel(saved.scope.month)} · {new Date(saved.savedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {saved.aiChapters}/{saved.chapterCount ?? 7} AI chapters
            </option>)}
          </DropdownField>
        </label>
        <span className="small" role="status">{model?.savedAt ? "Saved to database · available next session" : running ? "Saving automatically when generation completes" : model ? "Unsaved report" : "Reports are saved automatically after generation"}</span>
        {model && !model.id && !running && <button className="button" disabled={busy} onClick={() => void persistReport(model)}>{status === "stopped" ? "Save this partial version" : "Retry saving"}</button>}
      </div>
      {job.storageError && <div className="notice" role="alert">{job.storageError}</div>}
      {running && stage && (
        <section className="rb2-progress" role="status" data-export="omit" aria-label="Report generation progress">
          <header>
            <Loader2 size={16} className="rb2-spin"/>
            <div><strong>{stage.label}</strong><span>{progress}% · {elapsed < job.estimatedSeconds ? `about ${clock(job.estimatedSeconds - elapsed)} remaining` : `taking longer than estimated · ${clock(elapsed)} elapsed`} · continues if you switch tabs</span></div>
            <button className="button rb2-stop" onClick={stopReport}><Square size={12}/>Stop</button>
          </header>
          <div className="report-progress-bar"><span style={{ width: `${progress}%` }} /></div>
          {model && <ol className="rb2-chapter-steps">{runChapters.map(spec => {
            const done = !pending.includes(spec.id);
            const failed = done && model.narratives[spec.id]?.error;
            return <li key={spec.id} data-state={failed ? 'failed' : done ? 'done' : stage.label.endsWith(spec.title) ? 'active' : 'waiting'}>
              {done ? (failed ? <TriangleAlert size={13}/> : <CheckCircle2 size={13}/>) : <CircleDashed size={13}/>}{spec.nav}
            </li>;
          })}</ol>}
        </section>
      )}
      {error && <div className="notice" role="alert" data-export="omit"><TriangleAlert size={13} />{error}</div>}
      {job.narrativeError && !running && (
        <div className="notice" role="status" data-export="omit">
          <TriangleAlert size={13} />
          {status === "stopped" ? job.narrativeError : <>Some chapters could not be written. Use Rewrite insights to retry; unchanged completed chapters will be reused. {job.narrativeError}</>}
        </div>
      )}

      {model && !running && <GenerationStats model={model}/>}
      {model && (!model.schemaVersion || model.schemaVersion < 3) && <div className="notice">This saved version uses the earlier report format. Rebuild to include leads, renewal cohorts, instructor scorecards, recurring slots and late-cancellation analysis.</div>}
      {model?.schemaVersion === 3 && <div className="notice">This saved snapshot predates the corrected complimentary-visit and recorded-duration calculations. Rebuild the report to use the current source definitions; the original snapshot is preserved.</div>}
      {model ? (
        <ReportDocument key={model.id ?? model.figuresHash} model={model} pending={running ? pending : undefined} theme={model.customization?.theme ?? reportTheme} ref={document_} />
      ) : (
        !busy && (
          <div className="empty-state" data-export="omit">
            <FileText size={22} />
            <h3>Your next review starts here.</h3>
            <p>Choose a studio and month. The report opens with a one-page scorecard, then walks each area through what worked, what didn’t, what drove it and what to do next — with the chart and figures for every claim beside it.</p>
          </div>
        )
      )}
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
