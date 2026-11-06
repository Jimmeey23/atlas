import { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { DropdownField } from '../ui/DropdownField';
import { acquisitionPeriodLabel } from '../../data/acquisition';
import { exportCSV } from '../exports';
import type { KraData, Month, SourceRow } from './types';
import { aggregateMonth } from './derive';
import { count, percent, rupees } from './format';
import { Panel, Pill } from './ui';

type Kind = 'revenue' | 'acquisition' | 'trials' | 'churn' | 'interviews' | 'teamTraining';

const kinds: { value: Kind; label: string; blurb: string }[] = [
  { value: 'revenue', label: 'Revenue', blurb: 'Successful, non-voided payment item lines for the selected payment month.' },
  { value: 'churn', label: 'Churn', blurb: 'Lapsed-sheet membership records expiring in the period. Status Lapsed counts 30 days after the Churned Date.' },
  { value: 'acquisition', label: 'Trials & referrals', blurb: 'New-sheet rows by First Visit Date, with the Is New value kept on every row so each count traces back to its source.' },
  { value: 'trials', label: 'First-class funnel', blurb: 'Lead-creation cohorts observed through the matched window end. Missing or ambiguous IDs cannot be linked.' },
  { value: 'interviews', label: 'Interviews', blurb: 'Systems Executive (Automation Analyst) interviews recorded on the calendar. Hiring activity evidence, not proof of a hire.' },
  { value: 'teamTraining', label: 'Team training', blurb: 'Team training sessions delivered in the period, from the calendar record.' },
];

type Column = [string, string];

const columns: Record<Kind, Column[]> = {
  revenue: [['member', 'Member'], ['member_id', 'Member ID'], ['date', 'Payment date'], ['product', 'Purchase'], ['category', 'Category'], ['associate', 'Sold by'], ['location', 'Studio'], ['revenue', 'Payment value'], ['status', 'Status']],
  churn: [['member', 'Member'], ['member_id', 'Member ID'], ['product', 'Membership'], ['location', 'Studio'], ['start_date', 'Start'], ['end_date', 'Expiry'], ['revenue', 'Paid value'], ['status', 'Recorded status'], ['churned_date', 'Churned date'], ['churn_included', 'Counted as churn']],
  acquisition: [['member', 'Member'], ['member_id', 'Member ID'], ['date', 'First visit'], ['entry_type', 'Is New'], ['location', 'Studio'], ['product', 'First purchase post trial'], ['trial_included', 'Counted as trial'], ['referral_included', 'Counted as referral']],
  trials: [['member', 'Prospect'], ['lead_id', 'Lead ID'], ['member_id', 'Member ID'], ['email', 'Email'], ['date', 'Lead created'], ['source', 'Source'], ['associate', 'Associate'], ['identity_basis', 'Identity match'], ['scheduled', 'First scheduled'], ['completed', 'First completed']],
  interviews: [['candidate', 'Candidate'], ['role', 'Role'], ['level', 'Level'], ['mode', 'Format'], ['date', 'Interview date'], ['start', 'Start'], ['end', 'End'], ['minutes', 'Minutes'], ['state', 'Status']],
  teamTraining: [['session', 'Session'], ['category', 'Category'], ['mode', 'Format'], ['date', 'Date'], ['start', 'Start'], ['end', 'End'], ['minutes', 'Minutes'], ['state', 'Status']],
};

const PAGE = 25;

function rowsFor(month: Month, kind: Kind): SourceRow[] {
  switch (kind) {
    case 'revenue': return month.sales;
    case 'churn': return month.churn.rows;
    case 'acquisition': return month.acquisition.rows;
    case 'trials': return month.trials.rows;
    case 'interviews': return month.interviews.rows as unknown as SourceRow[];
    case 'teamTraining': return month.teamTraining.rows as unknown as SourceRow[];
  }
}

function cellValue(key: string, input: unknown): string {
  if (key === 'revenue') return rupees(input);
  if (key === 'date' || key.endsWith('_date') || key === 'scheduled' || key === 'completed') return input == null ? '—' : acquisitionPeriodLabel(input);
  if (typeof input === 'boolean') return input ? 'Yes' : 'No';
  return String(input ?? '—');
}

function Summary({ kind, month }: { kind: Kind; month: Month }) {
  const items: { label: string; value: string; hint?: string }[] = [];
  if (kind === 'revenue') {
    items.push(
      { label: 'Collected revenue', value: rupees(month.sales.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0)) },
      { label: 'Item lines', value: count(month.sales.length) },
      { label: 'Studios', value: count(new Set(month.sales.map((row) => row.location)).size) },
      { label: 'Associates', value: count(new Set(month.sales.map((row) => row.associate).filter(Boolean)).size) },
    );
  } else if (kind === 'churn') {
    items.push(
      { label: 'Eligible expiries', value: count(month.churn.due) },
      { label: 'Renewed', value: count(month.churn.renewed) },
      { label: 'Churned', value: count(month.churn.lapsed) },
      { label: 'Churn rate', value: percent(month.churn.rate ?? month.churn.observedRate) },
      { label: 'In grace', value: count(month.churn.grace) },
    );
  } else if (kind === 'acquisition') {
    items.push(
      { label: 'Trial rows', value: count(month.acquisition.trials) },
      { label: 'Referral rows', value: count(month.acquisition.referrals) },
      { label: 'Counted as both', value: count(month.acquisition.overlap) },
      { label: 'Cohort rows', value: count(month.acquisition.cohortRows) },
    );
  } else if (kind === 'trials') {
    items.push(
      { label: 'Lead cohort', value: count(month.trials.leads) },
      { label: 'Scheduled', value: count(month.trials.scheduled) },
      { label: 'Completed', value: count(month.trials.completed) },
      { label: 'Completed rate', value: percent(month.trials.completedRate) },
    );
  } else if (kind === 'interviews') {
    items.push(
      { label: 'Interviews', value: count(month.interviews.interviews) },
      { label: 'Candidates', value: count(month.interviews.candidates) },
      { label: 'In person', value: count(month.interviews.inPerson) },
      { label: 'Hours', value: `${Math.round(month.interviews.minutes / 6) / 10}h` },
    );
  } else {
    items.push(
      { label: 'Sessions', value: count(month.teamTraining.sessions) },
      { label: 'Team training', value: count(month.teamTraining.teamTraining) },
      { label: 'Admin operations', value: count(month.teamTraining.adminOperations) },
      { label: 'Hours', value: `${Math.round(month.teamTraining.minutes / 6) / 10}h` },
    );
  }
  return <div className="kra-explorer-summary">{items.map((item) => <div key={item.label}>
    <span>{item.label}</span>
    <strong>{item.value}</strong>
    {item.hint && <small>{item.hint}</small>}
  </div>)}</div>;
}

export function Explorer({ data, kind, period, onKind, onPeriod }: {
  data: KraData;
  kind: Kind;
  period: string;
  onKind: (next: Kind) => void;
  onPeriod: (next: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const aggregate = useMemo(() => aggregateMonth(data), [data]);
  const month = period === 'review' ? aggregate : data.monthly.find((row) => row.month === period) ?? aggregate;
  const rows = rowsFor(month, kind);
  const cols = columns[kind];

  useEffect(() => { setPage(0); }, [kind, period]);

  const matching = rows.filter((row) => [row.member, row.member_id, row.email, row.product, row.associate, row.candidate, row.session, row.lead_id]
    .some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase())));
  const pages = Math.max(1, Math.ceil(matching.length / PAGE));
  const current = Math.min(page, pages - 1);
  const slice = matching.slice(current * PAGE, current * PAGE + PAGE);
  const active = kinds.find((item) => item.value === kind) ?? kinds[0];

  const perKind = (candidate: Kind) => rowsFor(month, candidate).length;

  return <Panel className="kra-explorer-panel">
    <div className="kra-panel-head">
      <div className="kra-panel-head-copy">
        <span className="kra-eyebrow">Source records</span>
        <h2>Trace every figure back to its rows</h2>
        <p>{active.blurb}</p>
      </div>
      <div className="kra-panel-head-actions">
        <DropdownField className="kra-select" aria-label="Source record period" value={period} onChange={(event) => onPeriod(event.target.value)}>
          <option value="review">KRA period to date</option>
          {data.monthly.map((row) => <option key={row.month} value={row.month}>{acquisitionPeriodLabel(row.month)}{row.state === 'Upcoming' ? ' · upcoming' : ''}</option>)}
        </DropdownField>
        <button type="button" className="kra-button" disabled={!matching.length} onClick={() => exportCSV(`kra-${kind}-${month.month}`, matching)}><Download size={13} />Export</button>
      </div>
    </div>

    <div className="kra-explorer">
      <div className="kra-explorer-nav" role="tablist" aria-label="Record set">
        {kinds.map((item) => <button key={item.value} type="button" role="tab" aria-selected={item.value === kind} onClick={() => onKind(item.value)}>
          {item.label}<span>{count(perKind(item.value))}</span>
        </button>)}
      </div>
      <div className="kra-explorer-body">
        <Summary kind={kind} month={month} />
        {kind === 'acquisition' && month.acquisition.entryTypes.length > 0 && <div className="kra-entry-breakdown">
          <div className="kra-panel-head-copy">
            <h3>Is New value breakdown</h3>
            <p>{count(month.acquisition.cohortRows)} New-sheet rows in this period. Trials = value contains “new”; referrals = value is exactly “New - Referral Class”.</p>
          </div>
          <table className="kra-table">
            <thead><tr><th scope="col">Is New value</th><th scope="col">Rows</th><th scope="col">Trial</th><th scope="col">Referral</th></tr></thead>
            <tbody>{month.acquisition.entryTypes.map((entry) => <tr key={entry.value}>
              <td>{entry.value}</td><td>{count(entry.rows)}</td><td>{entry.trial ? 'Yes' : 'No'}</td><td>{entry.referral ? 'Yes' : 'No'}</td>
            </tr>)}</tbody>
            <tfoot><tr><td>Total cohort rows</td><td>{count(month.acquisition.cohortRows)}</td><td>{count(month.acquisition.trials)}</td><td>{count(month.acquisition.referrals)}</td></tr></tfoot>
          </table>
          <p className="kra-quiet">{count(month.acquisition.overlap)} rows are counted in both columns; {count(month.acquisition.trialsOnly)} trial rows are not referrals.</p>
        </div>}

        <div className="kra-table-toolbar">
          <span className="kra-search"><Search size={13} /><input className="kra-input" aria-label="Search source records" placeholder="Search member, ID, purchase, associate or candidate…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></span>
          <Pill tone="neutral">{count(matching.length)} records</Pill>
          <p className="kra-quiet">{active.label} · {period === 'review' ? 'KRA period to date' : acquisitionPeriodLabel(period)}</p>
        </div>

        <div className="kra-table-wrap">
          <table className="kra-table">
            <thead><tr>{cols.map(([, label]) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>
              {slice.map((row, index) => <tr key={String(row.source_row ?? row.lead_id ?? index)}>
                {cols.map(([key]) => <td key={key} className={row[key] === true ? 'kra-cell-good' : row[key] === false && (key.endsWith('_included')) ? 'kra-cell-empty' : ''}>{cellValue(key, row[key])}</td>)}
              </tr>)}
            </tbody>
            <tfoot><tr>
              <td>Filtered · {count(matching.length)}</td>
              {cols.slice(1).map(([key]) => <td key={key}>{
                key === 'revenue' ? rupees(matching.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0))
                  : key === 'minutes' ? `${count(matching.reduce((sum, row) => sum + Number(row.minutes ?? 0), 0))} min`
                    : key === 'scheduled' || key === 'completed' ? count(matching.filter((row) => row[key]).length)
                      : ['churn_included', 'trial_included', 'referral_included'].includes(key) ? count(matching.filter((row) => row[key]).length)
                        : '—'
              }</td>)}
            </tr></tfoot>
          </table>
          {!matching.length && <p className="kra-empty">No source records in this slice.</p>}
        </div>

        <div className="kra-pagination">
          <span>Page {current + 1} of {pages} · showing {count(slice.length)} of {count(matching.length)}</span>
          <div>
            <button type="button" className="kra-button" disabled={!current} onClick={() => setPage(current - 1)}>Previous</button>
            <button type="button" className="kra-button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  </Panel>;
}

export type { Kind };
