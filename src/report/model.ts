import type { Row } from "../data/duckdb";
import type { ChapterUsage } from "./usage";
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
  /** Engine-derived drivers over every group, not only the ranked rows shown. */
  analysis?: GroupAnalysis;
  title: string;
  deck: string;
  columns: string[];
  rows: Row[];
  /** Rollup row across every group, or null when the query returned nothing. */
  total: Row | null;
}
/** A group's change against the prior month, over every group rather than the shown rows. */
export interface GroupMover { g: string; current: number | null; prior: number | null; change: number }
export interface GroupAnalysis {
  /** Additive measure the movers are read on, e.g. gross_revenue or attendance. */
  metric?: string;
  /** Total change in `metric` across all groups. */
  totalChange?: number;
  gainers?: GroupMover[];
  decliners?: GroupMover[];
  /** Rate bridge: within-group rate change versus shift in group mix. */
  bridge?: { rate: string; denominator: string; current: number; prior: number; rateEffect: number; mixEffect: number; drivers: { g: string; units: number; rateChange: number }[] };
  /** Shares of the total held by the largest groups, on `metric`. */
  concentration?: { metric: string; groups: number; top1: { g: string; share: number }; top3Share: number };
  /** Median of the ranking criterion and the gain if every eligible group below it reached it. */
  medianLift?: { metric: string; median: number; groupsBelow: number; units: number };
}
export interface ChapterData {
  id: string;
  /** Figures for the selected month. */
  total: Row;
  /** Same figures for the month before. */
  prior: Row;
  /** Same figures for the same month a year earlier. */
  priorYear: Row;
  yearToDate?: Row;
  priorYearToDate?: Row;
  /** Contributing record count, for the sample-size note. */
  n: number;
  groups: GroupTable[];
  notes?: string[];
  diagnostics?: string[];
  /** One row per month, trailing 14 months inclusive. */
  history: Row[];
}
export interface InsightCard {
  layout?: 'comparison' | 'narrative' | 'full';
  monthContext?: string;
  yearContext?: string;
  reasoning?: string;
  recommendation?: string;
  headline: string;
  meaning: string;
  evidence: string;
  action: string;
  focus?: string;
  category?: 'red_flag' | 'worked' | 'didnt_work' | 'meaning' | 'next_step' | 'plain_language';
  plainLanguage?: string;
  confidence?: 'high' | 'medium' | 'low';
  /** Money or volume at stake, with its arithmetic. */
  impact?: string;
  /** The leading indicator and threshold to review next month. */
  watch?: string;
}
export interface ChapterNarrative {
  /** Prose under the chapter header. Empty when no provider answered. */
  summary: string;
  cards: InsightCard[];
  /** Rule-based copy is labelled so nobody reads it as analysis. */
  generated: boolean;
  error?: string;
  /** Provider tokens and cost for this chapter in the run that produced it. */
  usage?: ChapterUsage;
}
export interface ReportCustomization {
  title: string; subtitle: string; preparedFor: string; preparedBy: string;
  audience: string; tone: string; detail: string; instructions: string;
  chapterIds: string[]; theme: "light" | "dark";
  /** Management targets by metric id, in the metric's own units (rates as 0–1). */
  targets?: Record<string, number>;
  density?: 'compact' | 'comfortable'; layout?: 'adaptive' | 'full'; evidenceView?: 'auto' | 'chart' | 'table';
  historyMonths?: 6 | 12 | 14; accent?: 'navy' | 'teal' | 'graphite'; focusAreas?: string[];
  showCover?: boolean; showDefinitions?: boolean; showConfidence?: boolean; showSources?: boolean;
  showAppendix?: boolean; showCharts?: boolean;
}
/** A rule-engine signal scoped to the report's studio and month. */
export interface ReportSignal {
  rule: string;
  severity: "critical" | "attention" | "opportunity" | "context";
  entity: string;
  title: string;
  text: string;
  impactINR: number;
  n: number;
}
export interface ReportModel {
  customization?: ReportCustomization;
  id?: string;
  savedAt?: string;
  schemaVersion?: number;
  sources?: { key: string; title: string; fetchedAt: number | null; stale: boolean; status: string }[];
  additionalContext?: {title:string;scope:string;status:string;data?:unknown;limitations:string}[];
  rate?: number;
  scope: ReportScope;
  /** When the figures were computed, ISO. */
  builtAt: string;
  chapters: Record<string, ChapterData>;
  narratives: Record<string, ChapterNarrative>;
  /** Wall-clock span of the narrative run, for the generation stats. */
  generation?: { startedAt: string; completedAt: string; durationMs: number };
  /** Studio-month rule-engine signals; absent on reports saved before they existed. */
  signals?: ReportSignal[];
  /** Stable over re-runs whose figures have not moved; keys the narrative cache. */
  figuresHash: string;
}
