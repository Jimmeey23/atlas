import { useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { acquisitionPeriodLabel } from '../../data/acquisition';
import { fmt } from '../../semantics/formats';
import type { KraData } from './types';
import { longDate, timestamp } from './types';
import { count, percent, rupees } from './format';
import { Panel, Pill, useMeasuredWidth } from './ui';

export function StudioRevenue({ data }: { data: KraData }) {
  const total = data.comparisonPeriods.current.revenue ?? data.studioSales.reduce((sum, row) => sum + (row.revenue ?? 0), 0);
  const max = Math.max(...data.studioSales.map((row) => row.revenue ?? 0), 1);
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  return <Panel className="kra-studios">
    <div className="kra-panel-head">
      <div className="kra-panel-head-copy">
        <span className="kra-eyebrow">Revenue responsibility</span>
        <h2>Revenue by studio</h2>
        <p>{acquisitionPeriodLabel(data.comparisonPeriods.current.from)} – {acquisitionPeriodLabel(data.comparisonPeriods.current.to)} to date. Organisation results are leadership outcomes, not personally closed sales.</p>
      </div>
      <div className="kra-panel-head-actions">
        <Pill tone="neutral">{count(data.directSales.items)} personally attributed item lines</Pill>
        <Pill tone="progress">{rupees(data.directSales.revenue)} attributed</Pill>
      </div>
    </div>
    <div className="kra-studio-list" ref={ref}>
      {data.studioSales.map((row) => <div key={row.location} className="kra-studio-row">
        <div className="kra-studio-name">
          <strong>{row.location}</strong>
          <span>{count(row.saleItems)} item lines · {count(row.members)} members</span>
        </div>
        <div className="kra-studio-track">
          <span style={{ width: `${Math.max(2, ((row.revenue ?? 0) / max) * 100)}%` }} />
        </div>
        <div className="kra-studio-value">
          <strong>{rupees(row.revenue)}</strong>
          <small>{total ? percent((row.revenue ?? 0) / total) : '—'} of period</small>
        </div>
      </div>)}
    </div>
    <div className="kra-studio-foot">
      <div><span>Period total</span><strong>{rupees(total)}</strong></div>
      <div><span>Personally attributed</span><strong>{rupees(data.directSales.revenue)}</strong></div>
      <p className="kra-quiet">{data.directSales.scope}</p>
    </div>
  </Panel>;
}

export function SourcesPanel({ data }: { data: KraData }) {
  const total = data.sources.reduce((sum, source) => sum + source.rows, 0);
  const problems = data.sources.filter((source) => source.error);
  return <Panel className="kra-sources">
    <div className="kra-panel-head">
      <div className="kra-panel-head-copy">
        <span className="kra-eyebrow">Provenance</span>
        <h2>Sources &amp; reporting health</h2>
        <p>Observed data coverage for this review. Infrastructure uptime and incident SLAs have no connected source and are not asserted.</p>
      </div>
      <div className="kra-panel-head-actions">
        <Pill tone={problems.length ? 'negative' : 'positive'} dot>{problems.length ? `${problems.length} source issue${problems.length > 1 ? 's' : ''}` : 'All sources responding'}</Pill>
        <Pill tone="neutral">{count(total)} source rows</Pill>
      </div>
    </div>
    <div className="kra-evidence-grid">
      {data.sources.map((source) => <article key={source.key} className="kra-source">
        <div className="kra-source-top">
          <h4>{source.key}</h4>
          <Pill tone={source.error ? 'negative' : source.stale ? 'warning' : 'positive'} dot>{source.error ? 'Unavailable' : source.stale ? 'Saved snapshot' : 'Current'}</Pill>
        </div>
        <dl>
          <dt>Records</dt><dd>{count(source.rows)}</dd>
          <dt>First record</dt><dd>{source.from ? acquisitionPeriodLabel(source.from) : '—'}</dd>
          <dt>Last record</dt><dd>{source.to ? acquisitionPeriodLabel(source.to) : '—'}</dd>
          <dt>Snapshot</dt><dd>{source.fetchedAt ? timestamp(source.fetchedAt) : 'Unavailable'}</dd>
        </dl>
        {source.error && <p className="kra-alert" role="alert">{source.error}</p>}
      </article>)}
    </div>
    <div className="kra-source-foot">
      <p className="kra-quiet">Source-row count across distinct datasets — not a unique-member total. {count(total)} rows across {data.sources.length} sources, as of {longDate(data.asOf)}.</p>
      <a className="kra-button" href={data.churnSource.url} target="_blank" rel="noreferrer"><ExternalLink size={12} />Open the Lapsed sheet</a>
    </div>
  </Panel>;
}

export function Methodology({ data }: { data: KraData }) {
  return <Panel className="kra-methodology">
    <div className="kra-panel-head">
      <div className="kra-panel-head-copy">
        <span className="kra-eyebrow">Calculation notes</span>
        <h2>Definitions &amp; coverage limits</h2>
        <p>Every figure on this page follows these rules. Where a denominator is missing, the page says so instead of showing a zero.</p>
      </div>
    </div>
    <ol className="kra-method">{data.methodology.map((text) => <li key={text}>{text}</li>)}</ol>
  </Panel>;
}

export function RevisionHistory({ data }: { data: KraData }) {
  const [open, setOpen] = useState(false);
  if (!data.scorecardHistory.length) return null;
  const entries = [...data.scorecardHistory].reverse();
  const label = (key: string, value: unknown) => (value == null ? 'Source value' : String(value));
  return <Panel className="kra-history-panel">
    <div className="kra-panel-head">
      <div className="kra-panel-head-copy">
        <span className="kra-eyebrow">Audit trail</span>
        <h2>Saved changes</h2>
        <p>{count(entries.length)} revision{entries.length === 1 ? '' : 's'} recorded. Source figures remain source-backed; every manual change keeps its before and after.</p>
      </div>
      <div className="kra-panel-head-actions">
        <button type="button" className="kra-button" onClick={() => {
          const blob = new Blob([JSON.stringify({ definitions: data.definitions, edits: data.scorecardEdits, history: data.scorecardHistory }, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url; anchor.download = 'jimmeey-kra-saved-edits.json'; anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}><Download size={13} />Download JSON</button>
        <button type="button" className="kra-button is-ghost" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{open ? 'Hide revisions' : 'Show revisions'}</button>
      </div>
    </div>
    {open && <div className="kra-history">
      {entries.map((entry) => {
        const changed = ([['current', 'Current achievement'], ['lastYear', 'Last-year achievement'], ['preceding', 'Preceding achievement'], ['yoy', 'Growth vs last year'], ['previousGrowth', 'Growth vs preceding'], ['status', 'Status'], ['explanation', 'Explanation'], ['note', 'Notes'], ['annotation', 'Annotations']] as const)
          .filter(([key]) => entry.before?.[key] !== entry.after[key]);
        return <article key={entry.id} className="kra-revision">
          <div className="kra-revision-head">
            <strong>{entry.info?.area ?? entry.key.split('/')[1]} · {entry.key.split('/')[0] === 'review' ? 'KRA period to date' : acquisitionPeriodLabel(entry.key.split('/')[0])}</strong>
            <time>{timestamp(entry.updatedAt)}</time>
          </div>
          <p>{entry.after.note || entry.after.annotation || 'KRA information or figures updated.'}</p>
          {changed.length > 0 && <details>
            <summary className="kra-note-toggle">View what changed · {changed.length} field{changed.length === 1 ? '' : 's'}</summary>
            <dl className="kra-diff">{changed.map(([key, name]) => <div key={key}>
              <dt>{name}</dt>
              <dd>
                <em>{key === 'yoy' || key === 'previousGrowth' ? fmt('conversion_rate', entry.before?.[key]) : label(key, entry.before?.[key])}</em>
                <span aria-hidden="true">→</span>
                <strong>{key === 'yoy' || key === 'previousGrowth' ? fmt('conversion_rate', entry.after[key]) : label(key, entry.after[key])}</strong>
              </dd>
            </div>)}</dl>
          </details>}
        </article>;
      })}
    </div>}
  </Panel>;
}
