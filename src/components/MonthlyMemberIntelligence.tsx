import { useEffect, useState } from 'react';
import { query, type Row } from '../data/duckdb';
import { ensureSource, usable } from '../data/loader';
import { today, where } from '../data/analytics';
import { historicalFilters, historicalTransient } from '../data/periods';
import { acquisitionPeriodLabel } from '../data/acquisition';
import { monthlyFrequencySQL, instructorMonthlyOutcomesSQL } from '../data/monthly-member-outcomes';
import { useStore } from '../state/store';
import { Register } from './Register';
import { InstructorName } from './InstructorAvatar';
import { exportCSV } from './exports';
import './MonthlyMemberIntelligence.css';

const frequencyColumns = [['members', 'Members'], ['one_class', '1 session'], ['two_six', '2–6 sessions'], ['seven_fourteen', '7–14 sessions'], ['fifteen_plus', '15+ sessions'], ['visits', 'Total sessions']] as const;
const outcomeColumns = [
  ['newcomers', 'Newcomers'], ['converted', 'Converted'], ['conversion_rate', 'Conversion %'],
  ['retained', 'Retained'], ['retention_rate', 'Retention %'], ['mature_30', '30-day eligible'],
  ['converted_30', '30-day converted'], ['conversion_30_rate', '30-day conversion %'],
  ['retained_30', '30-day returning members'], ['retention_30_rate', '30-day retention %'],
  ['second_visit_rate', 'Second-visit %'], ['avg_conversion_days', 'Days to convert'],
  ['conversion_known', 'Conversion status known'], ['retention_known', 'Retention status known'], ['undated_conversions', 'Undated conversions (eligible)'],
] as const;
const number = (value: unknown) => value == null ? '—' : Number(value).toLocaleString('en-IN');
const outcomeValue = (key: string, value: unknown) => value == null ? '—' : key.endsWith('rate') ? `${(Number(value) * 100).toFixed(1)}%` : key === 'avg_conversion_days' ? Number(value).toFixed(1) : number(value);

export function MonthlyMemberIntelligence({ kind, version }: { kind: 'frequency' | 'instructors'; version: string | number }) {
  const filters = useStore(s => s.filters), transient = useStore(s => s.transient);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [month, setMonth] = useState('all'), [search, setSearch] = useState('');
  const [showShare, setShowShare] = useState(false);
  const frequency = kind === 'frequency';
  useEffect(() => {
    let active = true;
    setBusy(true); setError(''); setRows([]);
    (async () => {
      const sources = frequency ? ['checkins'] : ['new', 'checkins'];
      await Promise.all(sources.map(source => ensureSource(source)));
      if (sources.some(source => !usable(source))) throw new Error('Source unavailable. Refresh the required sheets in Data quality.');
      const history = historicalFilters(filters, today());
      const scope = where(history, frequency ? 'checkins' : 'new', historicalTransient(transient));
      const result = await query(frequency ? monthlyFrequencySQL(scope) : instructorMonthlyOutcomesSQL(scope, today()));
      if (active) setRows(result);
    })().catch(e => { if (active) setError(String(e)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [frequency, version, filters, transient]);
  const months = [...new Set(rows.map(row => String(row.month)))];
  const selectedMonth = months.includes(month) ? month : 'all';
  const visible = rows.filter(row => (selectedMonth === 'all' || row.month === selectedMonth) && (frequency || String(row.trainer).toLowerCase().includes(search.toLowerCase())));
  const totals = visible.filter(row => row.access_type === 'All access types');
  const splits = visible.filter(row => row.access_type !== 'All access types');
  function frequencyValue(row: Row, key: string) {
    if (showShare && ['one_class', 'two_six', 'seven_fourteen', 'fifteen_plus'].includes(key)) return Number(row.members) ? `${(Number(row[key]) / Number(row.members) * 100).toFixed(1)}%` : '—';
    return number(row[key]);
  }
  const table = (data: Row[], split: boolean) => <div className="table-scroll" tabIndex={0} aria-label={split ? 'Monthly frequency by access type' : 'Monthly member frequency'}><table className="worklist-table">
    <thead><tr><th scope="col">Month</th>{split && <th scope="col">Access type</th>}{frequencyColumns.map(([key, label]) => <th scope="col" key={key}>{label}{showShare && key !== 'members' && key !== 'visits' ? ' %' : ''}</th>)}</tr></thead>
    <tbody>{data.map(row => <tr key={`${row.month}-${row.access_type}`}><th scope="row">{acquisitionPeriodLabel(row.month)}</th>{split && <td>{String(row.access_type)}</td>}{frequencyColumns.map(([key]) => <td key={key}>{frequencyValue(row, key)}</td>)}</tr>)}</tbody>
  </table></div>;
  return <Register index={frequency ? 'OF' : '03c'} title={frequency ? 'Monthly member practice frequency' : 'Monthly instructor retention & conversion'}
    subtitle="Last 26 completed months · studio and other non-date filters apply"
    actions={<button className="button" disabled={busy || !visible.length} onClick={() => exportCSV(`${kind}-monthly`, visible)}>Export CSV</button>}>
    <div className="member-month-controls"><label>Month <select value={selectedMonth} onChange={e => setMonth(e.target.value)}><option value="all">All months</option>{months.map(value => <option key={value} value={value}>{acquisitionPeriodLabel(value)}</option>)}</select></label>
      {frequency ? <label><input type="checkbox" checked={showShare} onChange={e => setShowShare(e.target.checked)} />Show frequency as % of members</label> : <label>Instructor <input type="search" value={search} placeholder="Find an instructor…" onChange={e => setSearch(e.target.value)} /></label>}
    </div>
    {busy ? <p role="status">Loading monthly member intelligence…</p> : error ? <p role="alert">{error}</p> : !visible.length ? <p>No identified member records match this scope.</p> : frequency ? <>
      {table(totals, false)}<h3 className="member-month-subtitle">Frequency by membership & access type</h3>{table(splits, true)}
    </> : <div className="table-scroll" tabIndex={0} aria-label="Instructor outcomes by first-visit month"><table className="worklist-table">
      <thead><tr><th scope="col">Instructor</th><th scope="col">First-visit month</th>{outcomeColumns.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}</tr></thead>
      <tbody>{visible.map(row => <tr key={`${row.month}-${row.trainer}`}><th scope="row"><InstructorName name={String(row.trainer)} /></th><td>{acquisitionPeriodLabel(row.month)}</td>{outcomeColumns.map(([key]) => <td key={key}>{outcomeValue(key, row[key])}</td>)}</tr>)}</tbody>
    </table></div>}
    <details className="member-month-definitions"><summary>Definitions & source coverage</summary>{frequency ? <>
      <p>Only attended check-ins with a member ID count. Each member belongs to exactly one frequency band per calendar month in the filtered scope. Repeated check-ins for the same member and session count once; when session ID is missing, date, studio, experience, time and instructor identify the session. Members can appear in multiple months.</p>
      <p>Access types use the recorded Cleaned Category, with the membership/product name as a fallback when the category is unrecognized. Members attending with multiple types appear once under Mixed access. Unrecognized or missing names appear under Other / unspecified. Percentage mode divides each band by the member count on that row. Cancellations and no-shows are excluded.</p>
    </> : <>
      <p>Each identified newcomer is attributed once to their earliest recorded first visit and its instructor, before applying the selected studio and other filters. Overall conversion and retention use recorded source statuses divided by the newcomer count; these statuses reflect the latest source snapshot. Known-status counts show coverage.</p>
      <p>30-day conversion requires Converted status and a purchase dated from the first visit through day 30. 30-day retention means a subsequent attended studio session on days 1–30, with any instructor or studio. Both rates divide by eligible newcomers whose full 30-day window is observable. Observation is capped at the earlier of today and the latest check-in date{rows[0]?.observed_through ? ` (${String(rows[0].observed_through)})` : ''}. Recent cohorts remain unavailable until eligible. Undated converted purchases remain unverified and are counted separately.</p>
      <p>Second-visit rate uses recorded post-trial visits. Days to convert averages non-negative recorded conversion spans for converted newcomers. A blank value means unavailable evidence or no eligible denominator. A complete, current check-in feed is required to assess return visits.</p>
    </>}</details>
  </Register>;
}
