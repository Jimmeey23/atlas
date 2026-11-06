import { useState } from 'react';
import { acquisitionPeriodLabel } from '../../data/acquisition';
import type { ChurnMaturity, KraData, Period } from './types';
import { count, percent, rupees } from './format';
import { Delta, Panel, Pill } from './ui';

type Unit = 'currency' | 'percent' | 'count';

type MetricRow = { key: keyof Period; label: string; unit: Unit; inverse?: boolean; hint?: string };

type Group = { id: string; title: string; rows: MetricRow[] };

const groups: Group[] = [
  {
    id: 'revenue', title: 'Revenue',
    rows: [
      { key: 'revenue', label: 'Revenue collected', unit: 'currency', hint: 'Successful, non-voided payment value' },
      { key: 'averageItemValue', label: 'Average payment-item value', unit: 'currency' },
      { key: 'saleItems', label: 'Paid item lines', unit: 'count' },
      { key: 'knownSales', label: 'Distinct sales', unit: 'count' },
      { key: 'members', label: 'Identified paying members', unit: 'count' },
    ],
  },
  {
    id: 'trials', title: 'Lead to first class',
    rows: [
      { key: 'leads', label: 'Lead cohort', unit: 'count' },
      { key: 'scheduled', label: 'First class scheduled', unit: 'count' },
      { key: 'completed', label: 'First class completed', unit: 'count' },
      { key: 'scheduledRate', label: 'Lead → scheduled rate', unit: 'percent' },
      { key: 'completedRate', label: 'Lead → completed rate', unit: 'percent' },
    ],
  },
  {
    id: 'trialsVolume', title: 'Trials and referrals',
    rows: [
      { key: 'trials', label: 'Trial rows · Is New contains “new”', unit: 'count' },
      { key: 'referrals', label: 'Referral rows · Is New is “New - Referral Class”', unit: 'count' },
      { key: 'overlap', label: 'Rows counted as both', unit: 'count' },
      { key: 'trialsOnly', label: 'Trial rows that are not referrals', unit: 'count' },
    ],
  },
  {
    id: 'churn', title: 'Churn',
    rows: [
      { key: 'due', label: 'Eligible membership expiries', unit: 'count' },
      { key: 'renewed', label: 'Recorded renewals', unit: 'count' },
      { key: 'lapsed', label: 'Recorded churns', unit: 'count', inverse: true },
      { key: 'churnRate', label: 'Churn rate', unit: 'percent', inverse: true },
    ],
  },
];

function display(value: unknown, unit: Unit): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return unit === 'currency' ? rupees(value) : unit === 'percent' ? percent(value) : count(value);
}

function Maturity({ maturity }: { maturity: ChurnMaturity }) {
  return <div className="kra-maturity">
    <div className="kra-panel-head-copy">
      <h3>Churn settles as cohorts mature</h3>
      <p>Renewals and reactivations are written back weeks after an expiry, so the newest cohorts always read highest. The settled figure is the fairer read of retention already delivered; the headline rate stays conservative.</p>
    </div>
    <div className="kra-duo">
      <div className="kra-duo-card is-accent">
        <span>Settled cohorts · {maturity.settleDays}+ days observed</span>
        <strong>{percent(maturity.settled.rate)}</strong>
        <small>{count(maturity.settled.lapsed)} churned of {count(maturity.settled.due)} eligible expiries</small>
      </div>
      <div className="kra-duo-card">
        <span>Still settling · expired since {acquisitionPeriodLabel(maturity.boundary)}</span>
        <strong>{percent(maturity.settling.rate)}</strong>
        <small>{count(maturity.settling.lapsed)} churned of {count(maturity.settling.due)} eligible expiries{maturity.gap != null ? ` · ${(maturity.gap * 100).toFixed(1)}pp gap` : ''}</small>
      </div>
    </div>
  </div>;
}

export function Comparison({ data }: { data: KraData }) {
  const [group, setGroup] = useState('revenue');
  const periods = data.comparisonPeriods;
  const windows: [string, Period][] = [
    ['current', periods.current],
    ['lastYear', periods.lastYear],
    ['precedingMatched', periods.precedingMatched],
    ['ytd', periods.ytd],
  ];
  const active = groups.find((item) => item.id === group) ?? groups[0];

  return <Panel className="kra-comparison">
    <div className="kra-panel-head">
      <div className="kra-panel-head-copy">
        <span className="kra-eyebrow">Matched-period comparison</span>
        <h2>Every metric, against two fair baselines</h2>
        <p>{acquisitionPeriodLabel(periods.current.from)} – {acquisitionPeriodLabel(periods.current.to)} against the identical calendar window last year and the preceding period of equal elapsed length. Never a part-month against a full one.</p>
      </div>
    </div>

    <div className="kra-window-cards">
      {windows.map(([key, period]) => <div key={key} className={key === 'current' ? 'is-now' : ''}>
        <span>{key === 'current' ? 'KRA period to date' : key === 'lastYear' ? 'Same window last year' : key === 'precedingMatched' ? 'Preceding window · matched' : 'Year to date'}</span>
        <small>{acquisitionPeriodLabel(period.from)} – {acquisitionPeriodLabel(period.to)}</small>
        <strong>{rupees(period.revenue)}</strong>
        <em>{percent(period.churnRate)} churn · {count(period.trials)} trials</em>
      </div>)}
    </div>

    <div className="kra-comparison-split">
      <div>
        <div className="kra-tabs kra-tabs-compact" role="tablist" aria-label="Metric group">
          {groups.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === group} onClick={() => setGroup(item.id)}>{item.title}</button>)}
        </div>
        <div className="kra-matrix-wrap">
          <table className="kra-matrix">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col" className="kra-matrix-group-start">KRA period</th>
                <th scope="col" className="kra-matrix-group">Last year</th>
                <th scope="col" className="kra-matrix-group">vs last year</th>
                <th scope="col" className="kra-matrix-group">Preceding</th>
                <th scope="col" className="kra-matrix-group">vs preceding</th>
                <th scope="col" className="kra-matrix-group-start">Trajectory</th>
              </tr>
            </thead>
            <tbody>
              {active.rows.map((row) => {
                const area = active.id === 'churn' ? 'churn' : active.id === 'trials' ? 'trials' : 'revenue';
                const current = periods.current[row.key];
                const lastYear = periods.lastYear[row.key];
                const preceding = periods.precedingMatched[row.key];
                const movement = (a: unknown, b: unknown) => (Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Number(b) !== 0 ? Number(a) / Number(b) - 1 : null);
                return <tr key={String(row.key)}>
                  <th scope="row"><span className="kra-matrix-label"><strong>{row.label}</strong>{row.hint && <small>{row.hint}</small>}</span></th>
                  <td className="kra-matrix-group-start kra-matrix-emphasis">{display(current, row.unit)}</td>
                  <td className="kra-matrix-value">{display(lastYear, row.unit)}</td>
                  <td><Delta value={movement(current, lastYear)} inverse={row.inverse} /></td>
                  <td className="kra-matrix-value">{display(preceding, row.unit)}</td>
                  <td><Delta value={movement(current, preceding)} inverse={row.inverse} /></td>
                  <td className="kra-matrix-group-start kra-matrix-trajectory"><Pill tone={data.trajectories[area] === 'On track' ? 'positive' : data.trajectories[area] === 'Lagging' ? 'negative' : 'neutral'}>{data.trajectories[area] ?? 'Observation in progress'}</Pill></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <p className="kra-quiet kra-matrix-note">Matched window on every column: equal elapsed days, no part-month against a full one, no future revenue included. Rates use their own cohort denominators and are never averaged.</p>
      </div>

      <div className="kra-comparison-side">
        <Maturity maturity={data.churnMaturity} />
        <div className="kra-year-table">
          <h3>Year-to-date churn</h3>
          <table className="kra-table">
            <thead><tr><th scope="col">Measure</th><th scope="col">YTD</th><th scope="col">Same window LY</th><th scope="col">Change</th></tr></thead>
            <tbody>
              <tr><td>Eligible expiries</td><td>{count(periods.ytd.due)}</td><td>{count(periods.ytdLastYear.due)}</td><td><Delta value={periods.ytdLastYear.due ? periods.ytd.due / periods.ytdLastYear.due - 1 : null} /></td></tr>
              <tr><td>Recorded churns</td><td>{count(periods.ytd.lapsed)}</td><td>{count(periods.ytdLastYear.lapsed)}</td><td><Delta value={periods.ytdLastYear.lapsed ? periods.ytd.lapsed / periods.ytdLastYear.lapsed - 1 : null} inverse /></td></tr>
              <tr><td>Churn rate</td><td>{percent(periods.ytd.churnRate)}</td><td>{percent(periods.ytdLastYear.churnRate)}</td><td><Delta value={periods.ytd.churnRate != null && periods.ytdLastYear.churnRate ? periods.ytd.churnRate / periods.ytdLastYear.churnRate - 1 : null} inverse /></td></tr>
            </tbody>
            <tfoot><tr><td>Window</td><td colSpan={3}>{acquisitionPeriodLabel(periods.ytd.from)} – {acquisitionPeriodLabel(periods.ytd.to)} vs {acquisitionPeriodLabel(periods.ytdLastYear.from)} – {acquisitionPeriodLabel(periods.ytdLastYear.to)}</td></tr></tfoot>
          </table>
          <p className="kra-quiet">Zero-value, frozen and excluded membership names are removed from both sides.</p>
        </div>
      </div>
    </div>
  </Panel>;
}
