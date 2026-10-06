import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer, Sparkles, FileText, RefreshCw, TriangleAlert } from "lucide-react";
import { query } from "../../data/duckdb";
import { useStore } from "../../state/store";
import { themeOptions } from "../../state/preferences";
import { computeReport, monthLabel } from "../../report/compute";
import { clearNarrativeCache, generateNarratives } from "../../report/narrative";
import { downloadReport, printReport } from "../../report/export";
import type { ReportModel } from "../../report/model";
import { listReports, loadReport, saveReport, type SavedReport } from "../../report/storage";
import { ReportDocument } from "./ReportDocument";

type Stage = { label: string; done: number; total: number } | null;

/**
 * Studio and month in, a board report out. The picker reads the studios and
 * months the data actually holds rather than a fixed list, so a studio that
 * opened last month appears without a code change.
 */
export function ReportBuilder({ version }: { version: string | number }) {
  const theme = useStore((s) => s.theme);
  const filters = useStore((s) => s.filters);
  const reportTheme =
    themeOptions.find((option) => option.id === theme)?.type.startsWith("Dark") ? "dark" : "light";
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
  const [loadingSaved, setLoadingSaved] = useState(false);
  const document_ = useRef<HTMLElement>(null);
  const run = useRef<AbortController>();

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
    setLoadingSaved(true);
    void (async () => {
      try {
        const history = await listReports(controller.signal);
        setSavedReports(history);
        if (history[0]) {
          const saved = await loadReport(history[0].id, controller.signal);
          if (!controller.signal.aborted) {
            setModel(saved);
            setStudio(saved.scope.studio);
            setMonth(saved.scope.month);
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) setStorageError(String(e));
      } finally {
        if (!controller.signal.aborted) setLoadingSaved(false);
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
      setStudio(saved.scope.studio);
      setMonth(saved.scope.month);
      setNarrativeError("");
    } catch (e) { setStorageError(String(e)); }
    finally { setLoadingSaved(false); }
  }

  const ready = !!studio && !!month;
  const busy = stage !== null || loadingSaved;

  async function build(regenerate = false) {
    if (!ready) return;
    run.current?.abort();
    const controller = new AbortController();
    run.current = controller;
    setError("");
    setNarrativeError("");
    setStage({ label: "Reading the month", done: 0, total: 1 });
    try {
      const computed = await computeReport({ studio, month }, (done, total, label) =>
        setStage({ label, done, total: total + 1 }),
      );
      if (controller.signal.aborted) return;
      if (regenerate) clearNarrativeCache(computed);
      setModel(computed);
      try {
        const narratives = await generateNarratives(
          computed,
          (done, total, label) => setStage({ label: `Writing: ${label}`, done, total }),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const completed = { ...computed, narratives };
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
      if (!controller.signal.aborted) setStage(null);
    }
  }

  useEffect(() => () => run.current?.abort(), []);

  const progress = useMemo(
    () => (stage && stage.total ? Math.round((stage.done / stage.total) * 100) : 0),
    [stage],
  );

  return (
    <div className="report-workspace">
      <div className="report-controls" data-export="omit">
        <label>
          <span className="small">Studio</span>
          <select
            value={studio}
            onChange={(e) => setStudio(e.target.value)}
            disabled={busy || !studios.length}
          >
            {Array.from(new Set([studio, ...studios].filter(Boolean))).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="small">Period</span>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={busy || !months.length}
          >
            {Array.from(new Set([month, ...months].filter(Boolean))).map((key) => (
              <option key={key} value={key}>
                {monthLabel(key)}
              </option>
            ))}
          </select>
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
            <button
              className="button"
              disabled={busy}
              onClick={() => document_.current && downloadReport(document_.current, model)}
            >
              <Download size={14} />
              Download HTML
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                try {
                  if (document_.current) printReport(document_.current, model);
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              <Printer size={14} />
              Export PDF
            </button>
          </>
        )}
      </div>

      <div className="report-history" data-export="omit">
        <label>
          <span className="small">Saved reports · latest 50 versions</span>
          <select aria-label="Saved reports" disabled={busy || !savedReports.length} value={model?.id || ""}
            onChange={e => e.target.value && void openSaved(e.target.value)}>
            <option value="">{loadingSaved ? "Loading saved reports…" : "Select a saved report"}</option>
            {savedReports.map(saved => <option key={saved.id} value={saved.id}>
              {saved.scope.studio} · {monthLabel(saved.scope.month)} · {new Date(saved.savedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {saved.aiChapters}/{saved.chapterCount ?? 7} AI chapters
            </option>)}
          </select>
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
            {stage.label} · {progress}%
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

      {model && (!model.schemaVersion || model.schemaVersion < 3) && <div className="notice">This saved version uses the earlier report format. Rebuild to include leads, renewal cohorts, instructor scorecards, recurring slots and late-cancellation analysis.</div>}
      {model ? (
        <ReportDocument model={model} theme={reportTheme} ref={document_} />
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
