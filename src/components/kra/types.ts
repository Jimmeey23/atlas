import type { KraEdit, KraHistory } from './EditDialog';

export type EntryType = { value: string; rows: number; trial: boolean; referral: boolean };
export type Period = { trials: number; referrals: number; trialsOnly: number; overlap: number; newRows: number; entryTypes: EntryType[]; from: string; to: string; revenue: number | null; saleItems: number; knownSales: number; knownItems: number; averageItemValue: number | null; members: number; leads: number; scheduled: number; completed: number; scheduledRate: number | null; completedRate: number | null; due: number; matureDue: number; renewed: number; unrecorded: number; missingDates: number; lapsed: number; churnRate: number | null; grace: number };
export type Explanation = { finding: string; basis: string; action: string };
export type Topic = { id: string; category: string; title: string };
export type TopicRecord = { status: string; note: string; date: string; basis?: string };

export type SourceRow = Record<string, unknown>;

export type Evidence = { status: string; note: string; url: string; date: string; checks: string[]; updatedAt?: string };

export type Churn = {
  rows: SourceRow[]; due: number; renewed: number; lapsed: number; grace: number; unrecorded: number;
  missingDates: number; rate: number | null; observedRate: number | null; final: boolean;
};

export type Acquisition = {
  trials: number; referrals: number; trialsOnly: number; overlap: number; cohortRows: number;
  entryTypes: { value: string; rows: number; trial: boolean; referral: boolean }[]; rows: SourceRow[];
};

export type InterviewRow = { source_row: number; date: string; start: string; end: string; candidate: string; level: number; mode: string; role: string; minutes: number; state: string };
export type TrainingRow = { source_row: number; date: string; start: string; end: string; session: string; category: string; mode: string; minutes: number; state: string };
export type TeamTraining = { from: string; to: string; sessions: number; teamTraining: number; adminOperations: number; inPerson: number; minutes: number; months: string[]; lastSession: string | null; rows: TrainingRow[] };
export type Interviews = { from: string; to: string; interviews: number; candidates: number; level1: number; level2: number; level3: number; inPerson: number; minutes: number; upcoming: number; horizon: string; months: string[]; rows: InterviewRow[] };

export type Trial = { rows: SourceRow[]; leads: number; identified: number; scheduled: number; completed: number; scheduledRate: number | null; completedRate: number | null };

export type Month = {
  month: string; state: string; revenue: number | null; baselineRevenue: number | null; previousRevenue: number | null;
  revenueYoY: number | null; revenueMoM: number | null; revenueTarget: boolean | null; stabilityTarget: boolean | null;
  churnTarget: boolean | null; trialsTarget: boolean | null; churn: Churn; baselineChurn: Churn; previousChurn: Churn;
  previousMatchedChurn: Churn; previousTrials: Trial; churnReduction: number | null; observedChurnReduction: number | null;
  precedingRevenue: number | null; precedingRevenueGrowth: number | null; precedingChurn: Churn; matchedBaselineChurn: Churn;
  precedingTrials: Trial; explanations: Record<string, Explanation>; trials: Trial; baselineTrials: Trial;
  scheduledGrowth: number | null; completedGrowth: number | null; observationEnd: string | null; sales: SourceRow[];
  acquisition: Acquisition; baselineAcquisition: Acquisition; previousAcquisition: Acquisition; precedingAcquisition: Acquisition;
  interviews: Interviews; teamTraining: TeamTraining;
};

export type ChurnMaturity = { settleDays: number; boundary: string; settled: { due: number; lapsed: number; rate: number | null }; settling: { due: number; lapsed: number; rate: number | null }; gap: number | null };

export type Definition = { id: string; area: string; target: string; weight: number; kind: string; manual?: boolean; targetEdited?: boolean };

export type SourceHealth = { key: string; status: string; fetchedAt: number | null; stale: boolean; error: string | null; rows: number; from: string | null; to: string | null };

export type KraData = {
  scorecardEdits: Record<string, KraEdit>; scorecardHistory: KraHistory[]; churnSource: { title: string; url: string; basis: string };
  person: string; role: string; asOf: string; activeMonth: string; mtdEnd: string; interviews: Interviews; teamTraining: TeamTraining;
  churnMaturity: ChurnMaturity; definitions: Definition[]; monthly: Month[]; assessments: Record<string, { assessed: number; met: number; months: number }>;
  evidence: Record<string, Evidence | Record<string, TopicRecord>>; methodology: string[]; comparisonPeriods: Record<string, Period>;
  explanations: Record<string, Explanation>; trajectories: Record<string, string>; trainingTopics: Topic[]; sources: SourceHealth[];
  studioSales: { location: string; revenue: number | null; saleItems: number; knownSales: number; members: number }[];
  directSales: { items: number; revenue: number | null; scope: string };
};

export type { KraEdit, KraHistory };

export type PillTone = 'positive' | 'negative' | 'neutral' | 'progress' | 'warning';

/** Five statuses are possible across the scorecard, the narrative cards and the drill-downs. */
export function statusTone(value: string | null | undefined): PillTone {
  switch (value) {
    case 'On track':
    case 'Completed':
    case 'Held':
      return 'positive';
    case 'Lagging':
      return 'negative';
    case 'In progress':
    case 'Observation in progress':
      return 'progress';
    case 'Baseline review needed':
    case 'Baseline needed':
    case 'Review needed':
    case 'Action update needed':
    case 'Evidence needed':
    case 'Not recorded':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** Three-letter weekday + short date, e.g. "Fri 6 Nov 2026". */
export function longDate(value: unknown): string {
  if (value == null || value === '') return '—';
  const key = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const date = new Date(key + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime())) return key;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function monthLabel(value: string): string {
  const date = new Date(value + '-01T00:00:00Z');
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function monthName(value: string): string {
  const date = new Date(value + '-01T00:00:00Z');
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
}

export function timestamp(value: number | string | null | undefined): string {
  if (value == null || value === '') return 'Unavailable';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unavailable';
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
}

export function duration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0h';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function plural(count: number, single: string, many = single + 's'): string {
  return `${count.toLocaleString('en-IN')} ${count === 1 ? single : many}`;
}
