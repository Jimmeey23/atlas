import type { Definition, Evidence, KraData, Month, TopicRecord, Explanation } from './types';
import { count, percent, rupees } from './format';

/** The KRA period is a pseudo-month that stitches every non-upcoming month's rows together. */
export function aggregateMonth(data: KraData): Month {
  const rows = <T,>(pick: (row: Month) => T[]): T[] => data.monthly.flatMap((row) => (row.state === 'Upcoming' ? [] : pick(row)));
  const first = data.monthly[0];
  return {
    ...first,
    month: 'review',
    state: 'KRA period to date',
    observationEnd: data.asOf,
    explanations: data.explanations,
    sales: rows((row) => row.sales),
    churn: { ...first.churn, rows: rows((row) => row.churn.rows), due: data.comparisonPeriods.current.due, lapsed: data.comparisonPeriods.current.lapsed, renewed: data.comparisonPeriods.current.renewed, unrecorded: data.comparisonPeriods.current.unrecorded, rate: data.comparisonPeriods.current.churnRate, observedRate: data.comparisonPeriods.current.churnRate },
    acquisition: { trials: data.comparisonPeriods.current.trials, referrals: data.comparisonPeriods.current.referrals, trialsOnly: data.comparisonPeriods.current.trialsOnly, overlap: data.comparisonPeriods.current.overlap, cohortRows: data.comparisonPeriods.current.newRows, entryTypes: data.comparisonPeriods.current.entryTypes, rows: rows((row) => row.acquisition.rows) },
    trials: { ...first.trials, rows: rows((row) => row.trials.rows), leads: data.comparisonPeriods.current.leads, scheduled: data.comparisonPeriods.current.scheduled, completed: data.comparisonPeriods.current.completed, scheduledRate: data.comparisonPeriods.current.scheduledRate, completedRate: data.comparisonPeriods.current.completedRate },
    interviews: data.interviews,
    teamTraining: data.teamTraining,
  };
}

export const drillTargets: Record<string, string> = {
  revenue: 'revenue', stability: 'revenue', churn: 'churn', trials: 'acquisition', growth: 'interviews', training: 'teamTraining',
};

export const shortTargets: Record<string, string> = {
  upskilling: 'Performance marketing curriculum',
  churn: 'Churn down 10% year on year',
  growth: 'Hire and fully train the systems executive',
  trials: 'First-session rates up 10% year on year',
  training: 'Empathy, active listening and soft skills',
  stability: 'Revenue dip held below 10% month on month',
  revenue: 'Revenue up 10% year on year',
};

export const milestones: Record<string, string[]> = {
  churn: ['Action plan'], trials: ['Action plan'], stability: ['Action plan'], revenue: ['Action plan'],
  upskilling: ['Performance marketing'], growth: ['Hired', 'Fully trained'], training: ['Empathy', 'Active listening', 'Soft skills'],
};

export type ScoreValue = { primary: string; secondary?: string };

export type ScoreRow = {
  definition: Definition;
  index: number;
  values: ScoreValue[];
  yoy: number | null;
  prior: number | null;
  secondGrowth: [number | null, number | null] | null;
  state: string;
  explanation: string;
  basis?: string;
  action?: string;
  edit?: { status: string | null; note: string; annotation: string };
  manual: boolean;
  provisional: boolean;
  progress?: { done: number; total: number; label: string };
  spark: (number | null)[];
};

export type ScorecardModel = {
  period: string;
  review: boolean;
  month: Month;
  dates: [string, string, string];
  labels: [string, string, string];
  rows: ScoreRow[];
  totals: { weights: number; onTrack: number; assessed: number; revenue: [number | null, number | null, number | null]; revenueGrowth: number | null; revenuePrior: number | null };
};

const change = (current: number | null, baseline: number | null) => (current != null && baseline != null && baseline > 0 ? current / baseline - 1 : null);
const rate = (value: number | null) => (value == null ? 'No eligible cohort' : percent(value));
const money = (value: number | null) => (value == null ? 'Source review needed' : rupees(value));

function passed(value: number | null, target: number): string {
  if (value == null) return 'Baseline needed';
  return value >= target - 1e-12 ? 'On track' : 'Lagging';
}

function monthEnd(month: string): string {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
}

function shiftMonth(month: string, offset: number): string {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function scorecardModel(data: KraData, period: string): ScorecardModel {
  const review = period === 'review';
  const currentMonth = data.monthly.find((row) => row.month === data.asOf.slice(0, 7))?.month
    ?? data.monthly.filter((row) => row.state !== 'Upcoming').at(-1)?.month
    ?? data.monthly[0].month;
  const month = data.monthly.find((row) => row.month === period) ?? data.monthly.find((row) => row.month === currentMonth) ?? data.monthly[0];
  const selected = month.month;
  const cutoff = month.state !== 'Month to date'
    ? new Date(Date.UTC(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)), 0)).toISOString().slice(0, 10)
    : data.asOf;
  const previousMonth = shiftMonth(selected, -1);
  const previousMonthEnd = monthEnd(previousMonth);
  const previousEnd = month.state === 'Completed month'
    ? previousMonthEnd
    : `${previousMonth}-${String(Math.min(Number(cutoff.slice(8)), Number(previousMonthEnd.slice(8)))).padStart(2, '0')}`;

  const current = data.comparisonPeriods.current;
  const last = data.comparisonPeriods.lastYear;
  const preceding = data.comparisonPeriods.precedingMatched;

  const dates: [string, string, string] = review
    ? [`${current.from} · ${current.to}`, `${last.from} · ${last.to}`, `${preceding.from} · ${preceding.to}`]
    : [`${selected}-01 · ${cutoff}`, `${String(Number(selected.slice(0, 4)) - 1) + selected.slice(4)}-01 · ${String(Number(selected.slice(0, 4)) - 1) + cutoff.slice(4)}`, `${previousMonth}-01 · ${previousEnd}`];
  const labels: [string, string, string] = review
    ? ['KRA period to date', 'Same window last year', 'Preceding window · matched']
    : [month.state === 'Month to date' ? `${selected} · to date` : selected, 'Same month last year · matched', 'Previous month · matched'];

  const amounts: [number | null, number | null, number | null] = review ? [current.revenue, last.revenue, preceding.revenue] : [month.revenue, month.baselineRevenue, month.previousRevenue];
  const acquisition = review ? [current, last, preceding] : [month.acquisition, month.baselineAcquisition, month.previousAcquisition];
  const trials = review ? [current, last, preceding] : [month.trials, month.baselineTrials, month.previousTrials];
  const churn = review ? [current.churnRate, last.churnRate, preceding.churnRate] : [month.churn.rate ?? month.churn.observedRate, month.matchedBaselineChurn.observedRate, month.previousMatchedChurn.observedRate];

  const interviews = review ? data.interviews : month.interviews;
  const teamTraining = review ? data.teamTraining : month.teamTraining;
  const revenueGrowth = change(amounts[0], amounts[1]);
  const revenuePrevious = change(amounts[0], amounts[2]);
  const scheduledGrowth = change(trials[0].scheduledRate, trials[1].scheduledRate);
  const completedGrowth = change(trials[0].completedRate, trials[1].completedRate);
  const provisionalMonth = !review && month.state !== 'Completed month';

  const topicRecords = (data.evidence.marketingTopics ?? {}) as Record<string, TopicRecord>;
  const completedTopicsBy = (date: string) => data.trainingTopics.filter((topic) => topicRecords[topic.id]?.status === 'Completed' && topicRecords[topic.id].date <= date).length;

  const series = {
    revenue: data.monthly.map((row) => row.revenue),
    churn: data.monthly.map((row) => row.churn.rate ?? row.churn.observedRate),
    trials: data.monthly.map((row) => row.trials.completedRate),
    stability: data.monthly.map((row) => row.revenueMoM),
  };

  const rows: ScoreRow[] = data.definitions.map((definition, index) => {
    const saved = data.evidence[definition.id] as Evidence | undefined;
    let values: ScoreValue[] = [{ primary: 'Not recorded' }, { primary: 'Not recorded' }, { primary: 'Not recorded' }];
    let yoy: number | null = null;
    let prior: number | null = null;
    let state = saved?.status ?? 'Not recorded';
    let explanation = saved?.note || 'Record completed milestones under Evidence & actions.';
    let secondGrowth: [number | null, number | null] | null = null;
    let progress: ScoreRow['progress'];
    let basis: string | undefined;
    let action: string | undefined;
    let spark: (number | null)[] = [];

    if (definition.id === 'revenue' || definition.id === 'stability') {
      values = amounts.map((value) => ({ primary: money(value), secondary: 'Collected revenue' }));
      yoy = revenueGrowth;
      prior = revenuePrevious;
      spark = series.revenue;
      state = definition.id === 'revenue' ? passed(yoy, 0.1) : review ? data.trajectories.stability : prior == null ? 'Baseline needed' : prior > -0.1 + 1e-12 ? 'On track' : 'Lagging';
      const narrative = review ? data.explanations[definition.id] : month.explanations.revenue;
      explanation = narrative?.finding ?? 'Comparison follows recorded payment collections.';
      basis = narrative?.basis;
      action = narrative?.action;
      if (definition.id === 'stability') {
        if (!review) {
          explanation = `${prior == null ? 'The preceding revenue baseline needs review.' : prior >= 0 ? 'Collections grew against the preceding period.' : `Collections retained ${percent(1 + prior)} of the preceding period level.`} The target allows a dip below 10%.`;
          basis = 'Payment value on successful, non-voided sales; month-to-date comparisons use matching elapsed days.';
        }
      }
    } else if (definition.id === 'trials') {
      values = acquisition.map((value) => ({ primary: `${count(value.trials)} trials · ${count(value.referrals)} referrals`, secondary: 'New sheet · Is New rows' }));
      yoy = change(acquisition[0].trials, acquisition[1].trials);
      prior = change(acquisition[0].trials, acquisition[2].trials);
      secondGrowth = [change(acquisition[0].referrals, acquisition[1].referrals), change(acquisition[0].referrals, acquisition[2].referrals)];
      spark = series.trials;
      state = scheduledGrowth == null || completedGrowth == null ? 'Baseline needed' : scheduledGrowth >= 0.1 - 1e-12 && completedGrowth >= 0.1 - 1e-12 ? 'On track' : 'Lagging';
      explanation = `Trials are Is New rows containing “new”; referrals are rows where Is New is exactly “New - Referral Class”. Status follows lead-to-first-session rates: ${rate(trials[0].scheduledRate)} scheduled, ${rate(trials[0].completedRate)} completed.`;
      basis = 'Lead creation cohorts linked by member ID, with a valid unambiguous email fallback, to the earliest non-cancelled scheduled and attended session.';
      action = 'Separate lead-volume movement from scheduling and completion rates before attributing any change to team execution.';
      if (!review && (month.state !== 'Completed month' || month.trialsTarget == null)) explanation += ' The observation window is still open.';
      progress = { done: trials[0].completed, total: Math.max(trials[0].leads, 1), label: 'Leads that completed a first class' };
    } else if (definition.id === 'churn') {
      const cohorts = review ? [current, last, preceding] : [month.churn, month.matchedBaselineChurn, month.previousMatchedChurn];
      values = churn.map((value, i) => ({ primary: rate(value), secondary: `${count(cohorts[i].lapsed)} of ${count(cohorts[i].due)} expiries lapsed` }));
      yoy = change(churn[0], churn[1]);
      prior = change(churn[0], churn[2]);
      spark = series.churn;
      state = passed(yoy == null ? null : -yoy, 0.1);
      explanation = review ? data.explanations.churn.finding : `${count(month.churn.lapsed)} churns (Status Lapsed, 30+ days past the Churned Date) from ${count(month.churn.due)} eligible expiry records. Lower is better.`;
      basis = data.churnMaturity ? `Churn settles as cohorts mature: memberships expired on or before ${data.churnMaturity.boundary} read ${percent(data.churnMaturity.settled.rate)}, newer cohorts ${percent(data.churnMaturity.settling.rate)}. The headline rate stays conservative and is never adjusted.` : undefined;
      action = data.explanations.churn?.action;
      progress = { done: cohorts[0].renewed, total: Math.max(cohorts[0].due, 1), label: 'Memberships renewed' };
    } else if (definition.id === 'upskilling') {
      const total = data.trainingTopics.length;
      const done = completedTopicsBy(review ? data.asOf : cutoff);
      values = [{ primary: `${done} / ${total} topics`, secondary: 'Manually marked complete' }, { primary: 'Not recorded' }, { primary: 'Not recorded' }];
      state = done === total && total > 0 ? 'Completed' : done > 0 ? 'In progress' : 'Not started';
      explanation = saved?.note || 'Mark completed performance-marketing topics in the curriculum checklist.';
      progress = { done, total: Math.max(total, 1), label: 'Curriculum topics completed' };
    } else if (definition.id === 'growth') {
      const done = saved?.checks.length ?? 0;
      const levels = `L1 ${count(interviews.level1)} · L2 ${count(interviews.level2)} · L3 ${count(interviews.level3)}`;
      values = [
        { primary: `${count(interviews.interviews)} interviews · ${count(interviews.candidates)} candidates`, secondary: interviews.upcoming ? `${levels} · ${count(interviews.upcoming)} scheduled ahead` : levels },
        { primary: 'Not recorded', secondary: 'No prior-year interview record' },
        { primary: 'Not recorded', secondary: 'No preceding-period interview record' },
      ];
      state = saved?.status ?? (interviews.interviews ? 'In progress' : 'Not started');
      explanation = `Systems Executive (Automation Analyst) interviews on the calendar: ${count(interviews.interviews)} across ${count(interviews.candidates)} candidates (${levels}${interviews.inPerson ? `, ${count(interviews.inPerson)} in person` : ''}), ${Math.round(interviews.minutes / 6) / 10} interview hours. A completed hire and full training still need dated milestone evidence: ${done} / 2 recorded.`;
      progress = { done, total: 2, label: 'Hire and training milestones' };
    } else if (definition.id === 'training') {
      const done = saved?.checks.length ?? 0;
      const hours = Math.round(teamTraining.minutes / 6) / 10;
      values = [
        { primary: `${count(teamTraining.sessions)} sessions · ${hours} hours`, secondary: `${count(teamTraining.teamTraining)} team · ${count(teamTraining.adminOperations)} admin operations` },
        { primary: 'Not recorded', secondary: 'No prior-year session record' },
        { primary: 'Not recorded', secondary: 'No preceding-period session record' },
      ];
      state = saved?.status ?? (teamTraining.sessions ? 'In progress' : 'Not started');
      explanation = `${count(teamTraining.sessions)} team training sessions delivered (${hours} hours, ${count(teamTraining.inPerson)} in person)${teamTraining.lastSession ? `. Most recent session recorded on ${teamTraining.lastSession}` : ''}. Empathy, active-listening and soft-skills milestones are tracked separately: ${done} / 3 recorded.`;
      progress = { done, total: 3, label: 'Soft-skills milestones' };
    } else {
      const done = saved?.checks.length ?? 0;
      const withinPeriod = review || !saved?.date || saved.date <= cutoff;
      values[0] = { primary: withinPeriod ? `${done} / 3 milestones` : 'Not recorded', secondary: withinPeriod ? saved?.status ?? 'Not started' : 'No dated evidence' };
      state = withinPeriod ? saved?.status ?? 'Not started' : 'Not recorded';
      if (!withinPeriod) explanation = 'The recorded milestone evidence is dated after this period.';
      progress = { done, total: 3, label: 'Required milestones' };
    }

    const pending = !review && month.state === 'Upcoming';
    if (pending) {
      values = [{ primary: 'Upcoming' }, { primary: '—' }, { primary: '—' }];
      state = 'Upcoming';
      yoy = null;
      prior = null;
      secondGrowth = null;
      explanation = 'This review month has not started.';
      progress = undefined;
    }

    const edit = data.scorecardEdits[`${period}/${definition.id}`];
    if (definition.targetEdited && !edit?.status) {
      state = 'Review needed';
      explanation += ' The target was edited; set the status against the revised target.';
    }
    const manual = !!edit && [edit.current, edit.lastYear, edit.preceding, edit.yoy, edit.previousGrowth, edit.status, edit.explanation].some((value) => value != null);
    if (edit) {
      [edit.current, edit.lastYear, edit.preceding].forEach((value, i) => { if (value != null) values[i] = { primary: value, secondary: 'Manually entered' }; });
      if (edit.current != null || edit.lastYear != null) { yoy = null; secondGrowth = null; }
      if (edit.current != null || edit.preceding != null) { prior = null; secondGrowth = null; }
      if (edit.current != null || edit.lastYear != null || edit.preceding != null) state = 'Review needed';
      if (edit.yoy != null) { yoy = edit.yoy; secondGrowth = null; }
      if (edit.previousGrowth != null) { prior = edit.previousGrowth; secondGrowth = null; }
      if (edit.status != null) state = edit.status;
      if (edit.explanation != null) explanation = edit.explanation;
      if (edit.note) explanation = explanation;
    }

    const provisional = !manual && !pending && definition.kind === 'data'
      && (provisionalMonth || (definition.id === 'churn' && !review && !month.churn.final) || (definition.id === 'trials' && !review && month.trialsTarget == null));

    return {
      definition, index, values, yoy, prior, secondGrowth, state, explanation, basis, action,
      edit: edit ? { status: edit.status, note: edit.note, annotation: edit.annotation } : undefined,
      manual, provisional, progress, spark,
    };
  });

  const totals = {
    weights: data.definitions.reduce((sum, definition) => sum + definition.weight, 0),
    onTrack: rows.filter((row) => row.state === 'On track' || row.state === 'Completed').length,
    assessed: rows.length,
    revenue: amounts,
    revenueGrowth,
    revenuePrior: revenuePrevious,
  };

  return { period, review, month, dates, labels, rows, totals };
}

export type NarrativeCard = { key: string; title: string; trajectory: string; finding: string; basis: string; action: string };

export function narratives(explanations: Record<string, Explanation>, trajectories: Record<string, string>): NarrativeCard[] {
  const titles: Record<string, string> = { stability: 'Revenue stability', revenue: 'Revenue growth', churn: 'Churn reduction', trials: 'Trials and referrals' };
  return Object.entries(explanations).map(([key, explanation]) => ({
    key,
    title: titles[key] ?? key,
    trajectory: trajectories[key] ?? 'Observation in progress',
    finding: explanation.finding,
    basis: explanation.basis,
    action: explanation.action,
  }));
}
