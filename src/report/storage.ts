import type { ReportComponentSpec, ReportModel, ReportScope, SpeakerNotes } from "./model";
export interface SavedReport {
  id: string;
  scope: ReportScope;
  builtAt: string;
  savedAt: string;
  editedAt?: string;
  title?: string;
  pinned?: boolean;
  aiChapters: number;
  chapterCount?: number;
}
/** Generated reports kept by the server, in addition to pinned ones. */
export const KEEP_RECENT = 5;
const ADMIN_KEY = "atlas-report-admin";
export function adminToken(): string {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_KEY) || "null");
    return saved && Date.parse(saved.expiresAt) > Date.now() ? String(saved.token) : "";
  } catch { return ""; }
}
export function lockAdmin() { try { localStorage.removeItem(ADMIN_KEY); } catch { /* already locked */ } }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = adminToken();
  const response = await fetch(url, { ...init, headers: { ...(init?.headers ?? {}), ...(token ? { "x-atlas-admin": token } : {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Report storage request failed.");
  return body as T;
}
const json = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({ method, signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const listReports = (signal?: AbortSignal) => request<SavedReport[]>("/api/reports", { signal });
export const loadReport = (id: string, signal?: AbortSignal) => request<ReportModel>(`/api/reports/${encodeURIComponent(id)}`, { signal });
export const saveReport = (model: ReportModel, signal?: AbortSignal) => request<ReportModel>("/api/reports", json("POST", model, signal));
/** Admin only: overwrite prose, design and replaced components of a saved version. */
export const updateReport = (model: ReportModel) => request<ReportModel>(`/api/reports/${encodeURIComponent(model.id!)}`, json("PUT", {
  narratives: model.narratives, customization: model.customization, replacements: model.replacements ?? {},
  presenterNotes: model.presenterNotes ?? {}, speakerNotes: model.speakerNotes ?? {},
}));
export const saveNotes = (id: string, notes: { presenterNotes?: Record<string, string>; speakerNotes?: Record<string, SpeakerNotes | null> }) =>
  request<{ presenterNotes: Record<string, string>; speakerNotes: Record<string, SpeakerNotes> }>(`/api/reports/${encodeURIComponent(id)}/notes`, json("PATCH", notes));
export const pinReport = (id: string, pinned: boolean) => request<{ id: string; pinned: boolean }>(`/api/reports/${encodeURIComponent(id)}/pin`, json("POST", { pinned }));
export const adminStatus = () => request<{ configured: boolean; unlocked: boolean }>("/api/reports/admin");
export async function unlockAdmin(passcode: string) {
  const session = await request<{ token: string; expiresAt: string }>("/api/reports/admin", json("POST", { passcode }));
  try { localStorage.setItem(ADMIN_KEY, JSON.stringify(session)); } catch { /* unlocked for this page only */ }
  return session;
}
export const generateComponent = (context: string, prompt: string, signal?: AbortSignal) =>
  request<{ component: ReportComponentSpec }>("/api/reports/component", json("POST", { context, prompt }, signal));
export const generateSpeakerNotes = (context: string, signal?: AbortSignal) =>
  request<{ notes: SpeakerNotes }>("/api/reports/speaker-notes", json("POST", { context }, signal));
