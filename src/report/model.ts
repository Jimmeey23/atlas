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
  id?: string;
  fields?: string[];
  compare?: string;
  prior?: Record<string, Row>;
  priorYear?: Record<string, Row>;
  omitted?: number;
  minimum?: string;
  diagnostics?: string[];
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
  notes?: string[];
  diagnostics?: string[];
  /** One row per month, trailing 14 months inclusive. */
  history: Row[];
}
export interface InsightCard {
  headline: string;
  meaning: string;
  evidence: string;
  action: string;
  focus?: string;
  category?: 'red_flag' | 'worked' | 'didnt_work' | 'meaning' | 'next_step' | 'plain_language';
  plainLanguage?: string;
  confidence?: 'high' | 'medium' | 'low';
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
  sources?: { key: string; title: string; fetchedAt: number | null; stale: boolean; status: string }[];
  rate?: number;
  scope: ReportScope;
  /** When the figures were computed, ISO. */
  builtAt: string;
  chapters: Record<string, ChapterData>;
  narratives: Record<string, ChapterNarrative>;
  /** Stable over re-runs whose figures have not moved; keys the narrative cache. */
  figuresHash: string;
}
