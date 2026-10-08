import { metrics } from '../semantics/metrics';
import { fmt, delta } from '../semantics/formats';
import { renewalMeasures } from '../data/renewals';
export const definition = (id: string) => metrics[id] ?? (renewalMeasures[id] ? {
  ...renewalMeasures[id], description: renewalMeasures[id].expression, higherIsBetter: !['lapsed','frozen'].includes(id), sources: ['Lapsed · shared paid renewal cohort'], minSample: 3,
} : undefined);
export const reportFmt = (id: string, value: unknown) => metrics[id] ? fmt(id, value) : value == null ? '—'
  : renewalMeasures[id]?.format === 'percent' ? `${(Number(value)*100).toFixed(1)}%` : Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const reportDelta = (id: string, value: unknown, prior: unknown) => metrics[id] ? delta(id, value, prior)
  : value == null || prior == null ? '—' : renewalMeasures[id]?.format === 'percent'
    ? `${Number(value)>=Number(prior)?'+':''}${((Number(value)-Number(prior))*100).toFixed(1)}pp`
    : Number(prior) === 0 ? '—' : `${Number(value)>=Number(prior)?'+':''}${((Number(value)/Number(prior)-1)*100).toFixed(1)}%`;
