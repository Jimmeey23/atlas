import type { Row } from "../data/duckdb";
/** Studio and month a report is built for. Everything else is derived. */
export interface ReportScope {
  /** Canonical location name, as it appears in the data. */
  studio: string;
  /** "2026-07" */
  month: string;
}
export interface GroupTable {
  field: string;
  title: string;
  deck: string;
  columns: string[];
  rows: Row[];
  /** Rollup row across every group, or null when the query returned nothing. */
  total: Row | null;
}
export interface ChapterData {
  id: string;
  /** Figures for the selected month. */
  total: Row;
  /** Same figures for the month before. */
  prior: Row;
  /** Same figures for the same month a year earlier. */
  priorYear: Row;
  /** Contributing record count, for the sample-size note. */
  n: number;
  groups: GroupTable[];
  /** One row per month, trailing 13 months inclusive. */
  history: Row[];
}
export interface InsightCard {
  headline: string;
  meaning: string;
  evidence: string;
  action: string;
}
export interface ChapterNarrative {
  /** Prose under the chapter header. Empty when no provider answered. */
  summary: string;
  cards: InsightCard[];
  /** Rule-based copy is labelled so nobody reads it as analysis. */
  generated: boolean;
  error?: string;
}
export interface ReportModel {
  id?: string;
  savedAt?: string;
  schemaVersion?: number;
  scope: ReportScope;
  /** When the figures were computed, ISO. */
  builtAt: string;
  chapters: Record<string, ChapterData>;
  narratives: Record<string, ChapterNarrative>;
  /** Stable over re-runs whose figures have not moved; keys the narrative cache. */
  figuresHash: string;
}
