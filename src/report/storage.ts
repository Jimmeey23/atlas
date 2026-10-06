import type { ReportModel, ReportScope } from "./model";
export interface SavedReport {
  id: string;
  scope: ReportScope;
  builtAt: string;
  savedAt: string;
  aiChapters: number;
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Report storage request failed.");
  return body as T;
}
export const listReports = (signal?: AbortSignal) => request<SavedReport[]>("/api/reports", { signal });
export const loadReport = (id: string, signal?: AbortSignal) => request<ReportModel>(`/api/reports/${encodeURIComponent(id)}`, { signal });
export const saveReport = (model: ReportModel, signal?: AbortSignal) => request<ReportModel>("/api/reports", {
  method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(model),
});
