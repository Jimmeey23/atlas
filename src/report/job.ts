import { create } from "zustand";
import { computeReport } from "./compute";
import { chapters } from "./chapters";
import { fallbackNarrative, generateNarratives } from "./narrative";
import { findingsFor } from "./findings";
import { saveReport, type SavedReport } from "./storage";
import type { ChapterNarrative, ReportCustomization, ReportModel } from "./model";

export type ReportStage = { label: string; done: number; total: number } | null;
export type ReportRunStatus = "idle" | "running" | "done" | "stopped" | "failed";

/**
 * The report run lives outside the Monthly report tab. Leaving the tab unmounts
 * the builder but not this store, so a run keeps writing chapters in the
 * background and the result is waiting when the reader returns.
 */
interface ReportJob {
  status: ReportRunStatus;
  stage: ReportStage;
  startedAt: number | null;
  finishedAt: number | null;
  estimatedSeconds: number;
  /** Chapters still waiting for the model in the current run. */
  pending: string[];
  model: ReportModel | null;
  error: string;
  narrativeError: string;
  storageError: string;
  /** Set when a run finishes while the reader is elsewhere; cleared once seen. */
  unseen: boolean;
  savedReports: SavedReport[];
  /** Builder inputs, kept here so they survive leaving the tab. */
  studio: string;
  month: string;
  customization: ReportCustomization | null;
  set: (patch: Partial<Omit<ReportJob, "set">>) => void;
}

export const useReportJob = create<ReportJob>((set) => ({
  status: "idle", stage: null, startedAt: null, finishedAt: null, estimatedSeconds: 0, pending: [],
  model: null, error: "", narrativeError: "", storageError: "", unseen: false, savedReports: [],
  studio: "", month: "", customization: null,
  set: (patch) => set(patch),
}));

let controller: AbortController | null = null;

export const reportRunning = () => useReportJob.getState().status === "running";

export function estimateSeconds(c: ReportCustomization) {
  return 20 + c.chapterIds.length * (c.detail === "Concise" ? 45 : 60);
}

export async function persistReport(report: ReportModel, signal?: AbortSignal) {
  const job = useReportJob.getState();
  job.set({ storageError: "" });
  try {
    const saved = await saveReport(report, signal);
    if (signal?.aborted) return;
    const current = useReportJob.getState();
    current.set({
      model: saved,
      savedReports: [{ id: saved.id!, scope: saved.scope, builtAt: saved.builtAt, savedAt: saved.savedAt!,
        aiChapters: Object.values(saved.narratives).filter(n => n.generated).length,
        chapterCount: Object.keys(saved.narratives).length }, ...current.savedReports].slice(0, 50),
    });
  } catch (e) {
    if (!signal?.aborted) useReportJob.getState().set({ storageError: `This report is not saved. ${String(e)}` });
  }
}

/** Fill chapters the run never reached with labelled rule-based copy, so a stopped report still reads. */
function completeWithFallback(model: ReportModel, written: Record<string, ChapterNarrative>) {
  const findings = findingsFor(model);
  const narratives: Record<string, ChapterNarrative> = {};
  for (const id of model.customization?.chapterIds ?? chapters.map(c => c.id)) {
    const spec = chapters.find(c => c.id === id);
    if (!spec) continue;
    narratives[id] = written[id] ?? { ...fallbackNarrative(spec, model.chapters[id], findings[id] ?? [], model), error: "Stopped before this chapter was written." };
  }
  return narratives;
}

export async function startReport({ regenerate = false }: { regenerate?: boolean } = {}) {
  const job = useReportJob.getState();
  const { studio, month, customization, model: previous } = job;
  if (!studio || !month || !customization?.chapterIds.length) return;
  controller?.abort();
  const run = new AbortController();
  controller = run;
  const live = () => controller === run && !run.signal.aborted;
  job.set({
    status: "running", error: "", narrativeError: "", storageError: "", unseen: false,
    model: regenerate ? previous : null, pending: [...customization.chapterIds],
    startedAt: Date.now(), finishedAt: null, estimatedSeconds: estimateSeconds(customization),
    stage: { label: "Reading the month", done: 0, total: 1 },
  });
  let computed: ReportModel | null = null;
  const written: Record<string, ChapterNarrative> = {};
  try {
    const reuse = regenerate && previous?.schemaVersion === 6 && previous.scope.studio === studio && previous.scope.month === month
      && chapters.filter(c => !c.derived).every(c => previous.chapters[c.id]);
    const snapshot = reuse ? previous! : await computeReport({ studio, month }, (done, total, label) => {
      if (live()) useReportJob.getState().set({ stage: { label, done, total: total + 1 } });
    });
    if (!live()) return;
    computed = { ...snapshot, narratives: regenerate ? snapshot.narratives : {}, id: undefined, savedAt: undefined, customization: { ...customization, chapterIds: [...customization.chapterIds] } };
    // Successful chapters remain available as reuse candidates. The generator
    // verifies their complete request identity before keeping them in this run.
    // Figures render at once; chapters fill in as each one is written.
    useReportJob.getState().set({ model: computed });
    const writingStarted = Date.now();
    const narratives = await generateNarratives(
      computed,
      (done, total, label) => { if (live()) useReportJob.getState().set({ stage: { label: `Writing: ${label}`, done, total } }); },
      run.signal,
      (id, narrative) => {
        written[id] = narrative;
        if (!live() || !computed) return;
        const state = useReportJob.getState();
        state.set({ pending: state.pending.filter(p => p !== id), model: { ...computed, narratives: { ...written } } });
      },
    );
    if (!live()) return;
    const completedAt = Date.now();
    const completed: ReportModel = { ...computed, narratives,
      generation: { startedAt: new Date(writingStarted).toISOString(), completedAt: new Date(completedAt).toISOString(), durationMs: completedAt - writingStarted } };
    const failures = Object.entries(narratives).filter(([, n]) => n.error);
    useReportJob.getState().set({ model: completed, pending: [],
      narrativeError: failures.map(([id, n]) => `${id}: ${n.error}`).join(" · "),
      stage: { label: "Saving report to database", done: 0, total: 1 } });
    await persistReport(completed, run.signal);
    if (!live()) return;
    useReportJob.getState().set({ status: "done", stage: null, finishedAt: Date.now(), unseen: true });
  } catch (e) {
    if (!live()) return;
    useReportJob.getState().set({ status: "failed", stage: null, finishedAt: Date.now(), pending: [], unseen: true,
      ...(computed ? { narrativeError: String(e), model: { ...computed, narratives: completeWithFallback(computed, written) } } : { error: String(e) }) });
  } finally {
    if (controller === run) controller = null;
  }
}

/** Stop the run. Chapters already written are kept; the rest fall back to labelled rule-based copy. */
export function stopReport() {
  const run = controller;
  if (!run) return;
  controller = null;
  run.abort();
  const job = useReportJob.getState();
  const model = job.model;
  const written = model ? Object.fromEntries(Object.entries(model.narratives).filter(([id]) => !job.pending.includes(id))) : {};
  const done = Object.keys(written).length;
  job.set({
    status: "stopped", stage: null, finishedAt: Date.now(), pending: [],
    model: model && Object.keys(model.chapters).length ? { ...model, narratives: completeWithFallback(model, written) } : null,
    narrativeError: model ? `Generation stopped by you after ${done} of ${model.customization?.chapterIds.length ?? done} chapters. Unwritten chapters show rule-based copy; use Rewrite insights to finish them. This version is not saved.` : "",
  });
}
