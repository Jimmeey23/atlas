import { useMemo, useState } from 'react';
import type { KraData } from './types';
import { monthLabel } from './types';
import { count, percent, rupees } from './format';
import { Panel, Pill } from './ui';

type Series = {
  key: string; title: string; unit: 'currency' | 'percent';
  values: (number | null)[]; baseline: (number | null)[];
  baselineLabel: string; target: string; note: string;
};

function formatValue(value: number | null, unit: 'currency' | 'percent'): string {
  if (value == null) return '—';
  return unit === 'currency' ? rupees(value) : percent(value);
}

/**
 * Monthly bars for the four data-led KRAs. Bars start at zero on a shared
 * baseline, and months with no source coverage are drawn as an empty slot with
 * an explicit label rather than a zero-height bar.
 */
export function TrackRecord({ data }: { data: KraData }) {
  const [seriesKey, setSeriesKey] = useState('revenue');
  const [hover, setHover] = useState<number | null>(null);

  const series: Series[] = useMemo(() => [
    {
      key: 'revenue', title: 'Revenue', unit: 'currency',
      values: data.monthly.map((row) => row.revenue),
      baseline: data.monthly.map((row) => row.baselineRevenue),
      baselineLabel: 'Same month last year',
      target: 'Target · 10% up year on year',
      note: 'Successful, non-voided payment value for each month, with the same calendar month last year beside it.',
    },
    {
      key: 'churn', title: 'Churn rate', unit: 'percent',
      values: data.monthly.map((row) => row.churn.rate ?? row.churn.observedRate),
      baseline: data.monthly.map((row) => row.matchedBaselineChurn.observedRate),
      baselineLabel: 'Same month last year',
      target: 'Target · 10% relative reduction vs last year',
      note: 'Memberships expiring in the month that lapsed 30+ days past the Churned Date. Lower is better.',
    },
    {
      key: 'trials', title: 'Completed rate', unit: 'percent',
      values: data.monthly.map((row) => row.trials.completedRate),
      baseline: data.monthly.map((row) => row.baselineTrials.completedRate),
      baselineLabel: 'Same month last year',
      target: 'Target · 10% relative growth vs last year',
      note: 'Share of each lead-creation cohort that attended a first class, followed through an equal observation window.',
    },
    {
      key: 'scheduled', title: 'Scheduled rate', unit: 'percent',
      values: data.monthly.map((row) => row.trials.scheduledRate),
      baseline: data.monthly.map((row) => row.baselineTrials.scheduledRate),
      baselineLabel: 'Same month last year',
      target: 'Target · 10% relative growth vs last year',
      note: 'Share of each lead cohort that reached a first scheduled class, on the same matched observation window.',
    },
  ], [data]);

  const active = series.find((item) => item.key === seriesKey) ?? series[0];
  const known = [...active.values, ...active.baseline].filter((value): value is number => value != null && Number.isFinite(value));
  const max = active.unit === 'percent' ? Math.max(0.1, ...known) * 1.1 : Math.max(1, ...known) * 1.06;


  return <Panel className="kra-track-panel">
    <div className="kra-panel-head">
      <div className="kra-panel-head-copy">
        <span className="kra-eyebrow">Monthly track record</span>
        <h2>How the four data-led KRAs moved</h2>
        <p>{active.note}</p>
      </div>
      <div className="kra-panel-head-actions">
        <div className="kra-tabs kra-tabs-compact" role="tablist" aria-label="Monthly series">
          {series.map((item) => <button key={item.key} type="button" role="tab" title={item.target} aria-selected={item.key === seriesKey} onClick={() => { setSeriesKey(item.key); setHover(null); }}>{item.title}</button>)}
        </div>
      </div>
    </div>

    <div className="kra-track-chart">
      <div className="kra-track-legend">
        <span><i className="kra-key is-current" />{active.title} · {data.monthly.length} months</span>
        <span><i className="kra-key is-baseline" />{active.baselineLabel}</span>
      </div>
      <div className="kra-track-plot">
        <div className="kra-track-grid" aria-hidden="true">
          {[1, 0.75, 0.5, 0.25, 0].map((fraction) => <div key={fraction} className="kra-track-gridline">
            <span>{formatValue(max * fraction, active.unit)}</span>
          </div>)}
        </div>
        <div className="kra-track-baseline">
          {data.monthly.map((row, index) => {
            const value = active.values[index];
            const base = active.baseline[index];
            const isCurrent = row.state === 'Month to date';
            const upcoming = row.state === 'Upcoming';
            return <div key={row.month} className={`kra-track-col ${hover === index ? 'is-hover' : ''} ${isCurrent ? 'is-current' : ''}`}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover((current) => (current === index ? null : current))}
              role="group"
              tabIndex={0}
              aria-label={`${monthLabel(row.month)}: ${formatValue(value, active.unit)}, last year ${formatValue(base, active.unit)}`}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}>
              <div className="kra-track-bar-slot">
                {upcoming
                  ? <span className="kra-track-none">Upcoming</span>
                  : <>
                    <span className="kra-track-pair">
                      <span className="kra-track-fill" style={{ height: `${value == null ? 0 : Math.max(2, (value / max) * 100)}%` }}>
                        {hover === index && value != null && <em>{formatValue(value, active.unit)}</em>}
                      </span>
                      <span className="kra-track-ghost" style={{ height: `${base == null ? 0 : Math.max(2, (base / max) * 100)}%` }} />
                    </span>
                    {value == null && <span className="kra-track-none">No source</span>}
                  </>}
              </div>
              <span className="kra-track-col-label">{monthLabel(row.month)}</span>
            </div>;
          })}
        </div>
      </div>
      <div className="kra-track-meta">
        <span className="kra-track-target">{active.target}</span>
        <span className="kra-quiet">Hover or focus a month for its exact figure.</span>
      </div>
    </div>

    <div className="kra-track-table-wrap">
      <table className="kra-table kra-track-table">
        <thead><tr>
          <th scope="col">Month</th>
          <th scope="col">Coverage</th>
          <th scope="col">Revenue</th>
          <th scope="col">YoY</th>
          <th scope="col">Churn</th>
          <th scope="col">Scheduled</th>
          <th scope="col">Completed</th>
          <th scope="col">Assessment</th>
        </tr></thead>
        <tbody>
          {data.monthly.map((row) => {
            const upcoming = row.state === 'Upcoming';
            return <tr key={row.month}>
              <td><strong>{monthLabel(row.month)}</strong></td>
              <td className={row.state === 'Month to date' ? 'kra-cell-good' : upcoming ? 'kra-cell-empty' : ''}>{row.state}</td>
              <td>{upcoming ? '—' : rupees(row.revenue)}</td>
              <td>{upcoming ? '—' : percent(row.revenueYoY)}</td>
              <td>{upcoming ? '—' : percent(row.churn.rate ?? row.churn.observedRate)}</td>
              <td>{upcoming ? '—' : percent(row.trials.scheduledRate)}</td>
              <td>{upcoming ? '—' : percent(row.trials.completedRate)}</td>
              <td>{upcoming ? 'Pending' : row.revenueTarget == null ? 'Coverage needed' : row.revenueTarget ? 'Target met' : 'Below target'}</td>
            </tr>;
          })}
        </tbody>
        <tfoot><tr>
          <td>KRA period</td>
          <td>{count(data.monthly.filter((row) => row.state !== 'Upcoming').length)} months observed</td>
          <td>{rupees(data.comparisonPeriods.current.revenue)}</td>
          <td>{percent(data.comparisonPeriods.current.revenue != null && data.comparisonPeriods.lastYear.revenue ? data.comparisonPeriods.current.revenue / data.comparisonPeriods.lastYear.revenue - 1 : null)}</td>
          <td>{percent(data.comparisonPeriods.current.churnRate)}</td>
          <td>{percent(data.comparisonPeriods.current.scheduledRate)}</td>
          <td>{percent(data.comparisonPeriods.current.completedRate)}</td>
          <td>{count(data.definitions.length)} KRAs reviewed</td>
        </tr></tfoot>
      </table>
    </div>
  </Panel>;
}
