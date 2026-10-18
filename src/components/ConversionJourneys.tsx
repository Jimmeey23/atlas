import { useEffect, useMemo, useState } from 'react';
import { query, type Row } from '../data/duckdb';
import { today, where } from '../data/analytics';
import { usable } from '../data/loader';
import { conversionJourneySQL } from '../data/conversion-journeys';
import { MetricInfoHint } from './ui/MetricInfoHint';
import { useStore } from '../state/store';

export function ConversionJourneys({ version }: { version: number }) {
  const filters = useStore(s => s.filters), transient = useStore(s => s.transient);
  const scope = where(filters, 'new', transient);
  const [rows, setRows] = useState<Row[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    if (!['new','sales','checkins'].every(usable)) { setError('Dated new-client, sales and attendance sources are required.'); setLoading(false); return; }
    query(conversionJourneySQL(scope, today(), filters.imports)).then(data => { if (active) { setRows(data); setLoading(false); } }).catch(e => { if (active) { setError(String(e)); setLoading(false); } });
    return () => { active = false; };
  }, [scope, filters.imports, version]);
  const totals = useMemo(() => rows.reduce<Record<string, number>>((acc, row) => {
    for (const key of Object.keys(acc)) acc[key] += Number(row[key] ?? 0);
    return acc;
  }, { clients: 0, converted: 0, conversion_eligible: 0, retained_eligible: 0, retention_eligible: 0 } as Record<string, number>), [rows]);
  const linkedClients = rows.reduce((n, row) => n + (Number(row.avg_purchases)>0 ? Number(row.clients) : 0), 0);
  const visibleRows = showAll ? rows : rows.filter(row => Number(row.avg_purchases)>0);
  const rate = (n: number, d: number) => d ? `${(100*n/d).toFixed(1)}%` : 'Unavailable';
  return <section className="secondary acquisition-tables conversion-journeys" aria-label="New client conversion and journeys">
    <h2>New client journeys & same-month outcomes</h2>
    <p className="small">Unique members, attributed to their earliest recorded first visit in the selected scope. Conversion: source-confirmed purchase within 30 days and the first-visit calendar month. Retention: a repeat attended session within that same window. Retention rates include only members observed through the window end.</p>
    {loading ? <p role="status">Loading client journeys…</p> : error ? <p role="alert">{error}</p> : <>
      <dl className="metric-related">
        <div><dt><span style={{ display: 'inline-flex', alignItems: 'center' }}>30-day conversion · same calendar month<MetricInfoHint id="conversion_30_rate" /></span></dt><dd>{rate(totals.converted, totals.conversion_eligible)}</dd><small>{totals.converted} / {totals.conversion_eligible} members with known conversion evidence</small></div>
        <div><dt><span style={{ display: 'inline-flex', alignItems: 'center' }}>30-day retention · same calendar month<MetricInfoHint id="retention_30_rate" /></span></dt><dd>{rate(totals.retained_eligible, totals.retention_eligible)}</dd><small>{totals.retained_eligible} / {totals.retention_eligible} observed members</small></div>
      </dl>
      <p className="small">Journeys link dated sales by member ID, combine items within a sale, and show up to four purchases. Same-day sales follow sale ID order; their intraday order is unavailable. Missing links mean no recorded linked purchase. Retention here measures return attendance, separately from the source Retained status.</p>
      <p className="small">{linkedClients} / {totals.clients} clients have linked dated purchases. Shares use the full first-visit cohort.</p>
      <button className="button" aria-pressed={showAll} onClick={() => { setShowAll(value => !value); setLimit(20); }}>{showAll ? "Show purchase journeys" : "Include clients without linked purchases"}</button>
      <div className="acq-table-scroll"><table className="acq-table"><thead><tr><th>Most common new client journeys</th><th><span style={{ display: 'inline-flex', alignItems: 'center' }}>Clients<MetricInfoHint id="unique_members" label="Clients" /></span></th><th><span style={{ display: 'inline-flex', alignItems: 'center' }}>Share<MetricInfoHint id="share" /></span></th><th><span style={{ display: 'inline-flex', alignItems: 'center' }}>Average purchases<MetricInfoHint id="purchases_post" label="Average purchases" /></span></th></tr></thead><tbody>
        {visibleRows.slice(0,limit).map(row => <tr key={String(row.journey)}><td>{String(row.journey)}</td><td>{Number(row.clients)}</td><td>{rate(Number(row.clients),totals.clients)}</td><td>{Number(row.avg_purchases).toFixed(1)}</td></tr>)}
      </tbody></table></div>
      {!visibleRows.length && <p>No {showAll ? "new client journeys" : "linked purchase journeys"} in this scope.</p>}
      {visibleRows.length>limit && <button className="button" onClick={() => setLimit(n => n+20)}>Show more journeys</button>}
    </>}
  </section>;
}
