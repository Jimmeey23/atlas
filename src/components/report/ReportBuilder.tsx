import { definition } from "../../report/definitions";
import { GenerationStats } from "./GenerationStats";
import { DropdownField } from "../ui/DropdownField";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer, Sparkles, FileText, RefreshCw, TriangleAlert, ExternalLink } from "lucide-react";
import { query } from "../../data/duckdb";
import { useStore } from "../../state/store";
import { themeOptions } from "../../state/preferences";
import { computeReport, monthLabel } from "../../report/compute";
import { clearNarrativeCache, generateNarratives } from "../../report/narrative";
import { downloadReport, printReport, openReportPage } from "../../report/export";
import type { ReportModel, ReportCustomization } from "../../report/model";
import { listReports, loadReport, saveReport, type SavedReport } from "../../report/storage";
import { ReportDocument } from "./ReportDocument";

import { chapters } from "../../report/chapters";

type Stage = { label: string; done: number; total: number } | null;

/**
 * Studio and month in, a board report out. The picker reads the studios and
 * months the data actually holds rather than a fixed list, so a studio that
 * opened last month appears without a code change.
 */
/** Measures leadership most often sets a monthly target for. Rates are entered as percentages. */
const TARGET_METRICS = ['gross_revenue', 'fill_rate', 'session_complimentary_rate', 'conversion_rate', 'retention_rate', 'lead_conversion_rate', 'renewal_rate', 'booking_late_rate'];
const TARGETS_KEY = 'atlas-report-targets';
function storedTargets(): Record<string, number> {
  try { const parsed = JSON.parse(localStorage.getItem(TARGETS_KEY) || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; }
  catch { return {}; }
}

export function ReportBuilder({ version }: { version: string | number }) {
  const theme = useStore((s) => s.theme);
  const filters = useStore((s) => s.filters);
  const reportTheme =
    themeOptions.find((option) => option.id === theme)?.type.startsWith("Dark") ? "dark" : "light";
  const [customization, setCustomization] = useState<ReportCustomization>({ title: 'Monthly performance report', subtitle: '', preparedFor: '', preparedBy: '', audience: 'Studio leadership', tone: 'Professional', detail: 'Comprehensive', instructions: '', chapterIds: chapters.map(c => c.id), theme: reportTheme, targets: storedTargets() });
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const estimate = 20 + customization.chapterIds.length * (customization.detail === 'Comprehensive' ? 60 : 45);
  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const patch = (value: Partial<ReportCustomization>) => setCustomization(c => ({ ...c, ...value }));
  const setTarget = (id: string, raw: string) => setCustomization(c => {
    const targets = { ...(c.targets ?? {}) };
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(value)) delete targets[id];
    else targets[id] = definition(id)?.format === 'percent' ? value / 100 : value;
    try { localStorage.setItem(TARGETS_KEY, JSON.stringify(targets)); } catch { /* targets still apply to this report */ }
    return { ...c, targets };
  });
  function moveChapter(id: string, direction: number) {
    const ids = [...customization.chapterIds]; const index = ids.indexOf(id); const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]]; patch({ chapterIds: ids });
  }
  const [studios, setStudios] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [studio, setStudio] = useState("");
  const [month, setMonth] = useState("");
  const [model, setModel] = useState<ReportModel | null>(null);
  const [stage, setStage] = useState<Stage>(null);
  const [error, setError] = useState("");
  const [narrativeError, setNarrativeError] = useState("");
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [storageError, setStorageError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const document_ = useRef<HTMLElement>(null);
  const run = useRef<AbortController>();
  const presentedId = useRef("");
  useEffect(() => {
    presentedId.current = model?.id || "";
  }, [model?.id]);
  useEffect(() => {
    let live = true;
    const listener = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id || presentedId.current === id) return;
      presentedId.current = id;
      void loadReport(id).then(saved => { if(live) {setModel(saved);setStudio(saved.scope.studio);setMonth(saved.scope.month);} }).catch(e=>{if(live){presentedId.current="";setError(String(e));}});
    };
    window.addEventListener("p57-present-report", listener);
    return () => {live=false;window.removeEventListener("p57-present-report",listener);};
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [locationRows, monthRows] = await Promise.all([
          query(
            `SELECT DISTINCT location FROM sessions WHERE location IS NOT NULL ORDER BY location`,
          ),
          query(
            `SELECT DISTINCT month FROM sessions WHERE month IS NOT NULL ORDER BY month DESC LIMIT 36`,
          ),
        ]);
        if (!live) return;
        const locations = locationRows.map((r) => String(r.location));
        const available = monthRows.map((r) => String(r.month));
        setStudios(locations);
        setMonths(available);
        // Open on what the dashboard is already looking at, where that exists.
        setStudio((current) =>
          current
            ? current
            : locations.find((l) => filters.location.includes(l)) || locations[0] || "",
        );
        setMonth((current) =>
          current
            ? current
            : available.find((m) => m === filters.to?.slice(0, 7)) || available[0] || "",
        );
      } catch (e) {
        if (live) setError(String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [version]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingHistory(true);
    void (async () => {
      try {
        const history = await listReports(controller.signal);
        if (!controller.signal.aborted) setSavedReports(current => [...current, ...history.filter(item => !current.some(saved => saved.id === item.id))].slice(0,50));

      } catch (e) {
        if (!controller.signal.aborted) setStorageError(String(e));
      } finally {
        if (!controller.signal.aborted) setLoadingHistory(false);
      }
    })();
    return () => controller.abort();
  }, []);

  async function persistReport(report: ReportModel, signal?: AbortSignal) {
    setStorageError("");
    try {
      const saved = await saveReport(report, signal);
      if (signal?.aborted) return;
      setModel(saved);
      setSavedReports(current => [{ id: saved.id!, scope: saved.scope, builtAt: saved.builtAt,
        savedAt: saved.savedAt!, aiChapters: Object.values(saved.narratives).filter(n => n.generated).length, chapterCount: Object.keys(saved.narratives).length }, ...current].slice(0, 50));
    } catch (e) {
      if (!signal?.aborted) setStorageError(`This report is not saved. ${String(e)}`);
    }
  }

  async function openSaved(id: string) {
    setLoadingSaved(true);
    setStorageError("");
    try {
      const saved = await loadReport(id);
      setModel(saved);
      if (saved.customization) setCustomization(saved.customization);
      setStudio(saved.scope.studio);
      setMonth(saved.scope.month);
      setNarrativeError("");
    } catch (e) { setStorageError(String(e)); }
    finally { setLoadingSaved(false); }
  }

  const ready = !!studio && !!month && customization.chapterIds.length > 0;
  const busy = stage !== null || loadingSaved || exporting;

  async function exportReport(kind: 'html' | 'pdf') {
    if (!model || !document_.current) return;
    setExporting(true); setError('');
    try { await (kind === 'html' ? downloadReport : printReport)(document_.current, model); }
    catch(e) { setError(String(e)); }
    finally { setExporting(false); }
  }

  async function build(regenerate = false) {
    if (!ready) return;
    run.current?.abort();
    const controller = new AbortController();
    run.current = controller;
    setError("");
    setNarrativeError("");
    setModel(null);
    setStartedAt(Date.now()); setElapsed(0); setEstimatedSeconds(estimate);
    setStage({ label: "Reading the month", done: 0, total: 1 });
    try {
      const snapshot = await computeReport({ studio, month }, (done, total, label) =>
        setStage({ label, done, total: total + 1 }),
      );
      if (controller.signal.aborted) return;
      const computed = { ...snapshot, customization: { ...customization, chapterIds: [...customization.chapterIds] } };
      if (regenerate) clearNarrativeCache(computed);
      try {
        const writingStarted = Date.now();
        const narratives = await generateNarratives(
          computed,
          (done, total, label) => setStage({ label: `Writing: ${label}`, done, total }),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const completedAt = Date.now();
        const completed = { ...computed, narratives, generation: { startedAt: new Date(writingStarted).toISOString(), completedAt: new Date(completedAt).toISOString(), durationMs: completedAt - writingStarted } };
        setModel(completed);
        const failures = Object.entries(narratives).filter(([, n]) => n.error);
        if (failures.length) setNarrativeError(failures.map(([id, n]) => `${id}: ${n.error}`).join(" · "));
        setStage({ label: "Saving report to database", done: 0, total: 1 });
        await persistReport(completed, controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) setNarrativeError(String(e));
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(String(e));
    } finally {
      if (!controller.signal.aborted) { setStage(null); setStartedAt(null); }
    }
  }

  useEffect(() => () => run.current?.abort(), []);

  const progress = useMemo(
    () => (stage && stage.total ? Math.round((stage.done / stage.total) * 100) : 0),
    [stage],
  );

  return (
    <div className="report-workspace" data-report-id={model?.id || ""}>
      <header className="report-generator-heading" data-export="omit"><span className="eyebrow">Monthly reports</span><h2>Create your report</h2><p>Choose the scope, shape the report and set the questions your analysis should answer.</p></header>
      <div className="report-controls" data-export="omit">
        <label>
          <span className="small">Studio</span>
          <DropdownField
            aria-label="Studio"
            value={studio}
            onChange={(e) => setStudio(e.target.value)}
            disabled={busy || !studios.length}
          >
            {Array.from(new Set([studio, ...studios].filter(Boolean))).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </DropdownField>
        </label>
        <label>
          <span className="small">Period</span>
          <DropdownField
            aria-label="Period"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={busy || !months.length}
          >
            {Array.from(new Set([month, ...months].filter(Boolean))).map((key) => (
              <option key={key} value={key}>
                {monthLabel(key)}
              </option>
            ))}
          </DropdownField>
        </label>
        <button className="button primary" disabled={!ready || busy} onClick={() => void build()}>
          <Sparkles size={14} />
          {model ? "Rebuild report" : "Generate report"}
        </button>
        {model && (
          <>
            <button className="button" disabled={busy} onClick={() => void build(true)}>
              <RefreshCw size={14} />
              Rewrite insights
            </button>
            <button className="button" disabled={busy} onClick={() => {
              if (!document_.current) return;
              setExporting(true);
              void openReportPage(document_.current, model).catch(e => setError(String(e))).finally(() => setExporting(false));
            }}><ExternalLink size={14}/>Open in new page</button>
            <button className="button" disabled={busy} onClick={() => setModel(null)}>New report</button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void exportReport("html")}
            >
              <Download size={14} />
              Download HTML
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void exportReport("pdf")}
            >
              <Printer size={14} />
              Export PDF
            </button>
          </>
        )}
      </div>

      <fieldset className="report-customization" disabled={busy} data-export="omit"><legend>Personalise your report</legend>
        <div className="report-customization-grid">
          {(['title', 'subtitle', 'preparedFor', 'preparedBy'] as const).map(key => <label key={key}><span>{({title:'Report title',subtitle:'Subtitle',preparedFor:'Prepared for',preparedBy:'Prepared by'})[key]}</span><input value={customization[key]} maxLength={160} onChange={e => patch({[key]:e.target.value})}/></label>)}
          {([{key:'audience',label:'Audience',options:['Studio leadership','Executive board','Operations team','Commercial team']},{key:'tone',label:'Writing style',options:['Professional','Direct and action-oriented','Plain language']},{key:'detail',label:'Narrative depth',options:['Comprehensive','Concise']},{key:'theme',label:'Report appearance',options:['light','dark']}] as const).map(field => <label key={field.key}><span>{field.label}</span><DropdownField value={customization[field.key]} onChange={e => patch({[field.key]:e.target.value})}>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</DropdownField></label>)}
        </div>
        <label className="report-priorities"><span>Analysis priorities & editorial instructions</span><textarea rows={3} maxLength={3000} value={customization.instructions} onChange={e => patch({instructions:e.target.value})} placeholder="For example: focus on retention risks, compare format efficiency, and prioritise actions for studio managers."/></label>
        <div className="report-targets"><span>Monthly targets (optional)</span><p className="small">Findings compare results with these and value any shortfall. Leave a target blank to use only the studio's own history as the benchmark.</p>
          <div className="report-customization-grid">{TARGET_METRICS.filter(id => definition(id)).map(id => { const pct = definition(id)!.format === 'percent'; const value = customization.targets?.[id];
            return <label key={id}><span>{definition(id)!.label}{pct ? ' (%)' : ' (₹)'}</span><input type="number" inputMode="decimal" step="any" min="0" aria-label={`${definition(id)!.label} target`} value={value == null ? '' : pct ? +(value * 100).toFixed(2) : value} onChange={e => setTarget(id, e.target.value)}/></label>; })}</div></div>
        <p className="small">Select chapters and set their reading order. Source figures and metric definitions stay governed.</p>
        <div className="report-chapter-options">{[...customization.chapterIds, ...chapters.map(c => c.id).filter(id => !customization.chapterIds.includes(id))].map(id => {
          const chapter = chapters.find(c => c.id === id)!; const index = customization.chapterIds.indexOf(id);
          return <div key={id}><label><input type="checkbox" checked={index >= 0} onChange={e => patch({chapterIds:e.target.checked ? [...customization.chapterIds,id] : customization.chapterIds.filter(c => c !== id)})}/>{chapter.title}</label>{index >= 0 && <span><button type="button" className="button" aria-label={`Move ${chapter.title} up`} disabled={busy || index === 0} onClick={() => moveChapter(id,-1)}>↑</button><button type="button" className="button" aria-label={`Move ${chapter.title} down`} disabled={busy || index === customization.chapterIds.length - 1} onClick={() => moveChapter(id,1)}>↓</button></span>}</div>;
        })}</div>
        <p className="small">Approximate wait: {clock(estimate)} for {customization.chapterIds.length} chapters. Cached insights may be faster; provider retries may take longer.</p>
      </fieldset>
      <div className="report-history" data-export="omit">
        <label>
          <span className="small">Saved reports · latest 50 versions</span>
          <DropdownField aria-label="Saved reports" disabled={busy || loadingHistory || !savedReports.length} value={model?.id || ""}
            onChange={e => e.target.value && void openSaved(e.target.value)}>
            <option value="">{loadingHistory ? "Loading saved reports…" : "Select a saved report"}</option>
            {savedReports.map(saved => <option key={saved.id} value={saved.id}>
              {saved.scope.studio} · {monthLabel(saved.scope.month)} · {new Date(saved.savedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {saved.aiChapters}/{saved.chapterCount ?? 7} AI chapters
            </option>)}
          </DropdownField>
        </label>
        <span className="small" role="status">{model?.savedAt ? "Saved to database · available next session" : model ? "Unsaved report" : "Reports are saved automatically after generation"}</span>
        {model && !model.id && <button className="button" disabled={busy} onClick={() => void persistReport(model)}>Retry saving</button>}
      </div>
      {storageError && <div className="notice" role="alert">{storageError}</div>}
      {stage && (
        <div className="report-progress" role="status" data-export="omit">
          <div className="report-progress-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="small">
            {stage.label} · {progress}% · {elapsed < estimatedSeconds ? `Approximately ${clock(estimatedSeconds - elapsed)} remaining` : `Taking longer than estimated · ${clock(elapsed)} elapsed`}
          </span>
        </div>
      )}
      {error && (
        <div className="notice" role="alert" data-export="omit">
          <TriangleAlert size={13} />
          {error}
        </div>
      )}
      {narrativeError && (
        <div className="notice" role="status" data-export="omit">
          <TriangleAlert size={13} />
          Some chapters could not be written. Available figures and generated chapters are preserved; use Rewrite insights to retry. {narrativeError}
        </div>
      )}

      {model && <GenerationStats model={model}/>}
      {model && (!model.schemaVersion || model.schemaVersion < 3) && <div className="notice">This saved version uses the earlier report format. Rebuild to include leads, renewal cohorts, instructor scorecards, recurring slots and late-cancellation analysis.</div>}
      {model?.schemaVersion === 3 && <div className="notice">This saved snapshot predates the corrected complimentary-visit and recorded-duration calculations. Rebuild the report to use the current source definitions; the original snapshot is preserved.</div>}
      {model ? (
        <ReportDocument key={model.id ?? model.figuresHash} model={model} theme={model.customization?.theme ?? reportTheme} ref={document_} />
      ) : (
        !busy && (
          <div className="empty-state" data-export="omit">
            <FileText size={22} />
            <h3>Build a board report</h3>
            <p>
              Choose a studio and a month, and the comprehensive report is built from that
              studio's own figures — money, demand, the funnel, the membership base, then what
              to do and what comes next. Download it as a single file to send on.
            </p>
          </div>
        )
      )}
    </div>
  );
}
