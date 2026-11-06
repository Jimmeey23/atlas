import { useState } from 'react';
import { ArrowUpRight, PencilLine, Table2 } from 'lucide-react';
import { DropdownField } from '../ui/DropdownField';
import { MetricInfoHint } from '../ui/MetricInfoHint';
import { acquisitionPeriodLabel } from '../../data/acquisition';
import type { ScoreRow } from './derive';
import type { KraData } from './types';
import { scorecardModel, drillTargets, shortTargets } from './derive';
import { percent, rupees } from './format';
import { Delta, Modal, Panel, Pill, StatusPill } from './ui';
import type { EditResult } from './EditDialog';
import { KraEditDialog } from './EditDialog';

/** Windows arrive as "YYYY-MM-DD · YYYY-MM-DD" and are rendered as "1 Jun – 6 Nov 2026". */
function windowLabel(window: string): string {
  const [from, to] = window.split(' · ');
  return `${acquisitionPeriodLabel(from)} – ${acquisitionPeriodLabel(to)}`;
}

function Value({ value, muted }: { value: { primary: string; secondary?: string }; muted?: boolean }) {
  return <div className={`kra-cell-value ${muted || value.primary === 'Not recorded' || value.primary === '—' ? 'is-muted' : ''}`}>
    <strong>{value.primary}</strong>
    {value.secondary && <small>{value.secondary}</small>}
  </div>;
}

/** The full finding, basis and suggested action live in a dialog so a row never reflows. */
function DetailDialog({ row, churnSource, onClose }: { row: ScoreRow; churnSource: KraData['churnSource']; onClose: () => void }) {
  const [status, setStatus] = useState(row.edit?.status ?? row.state);
  return <Modal
    title={row.definition.area}
    subtitle={<>{shortTargets[row.definition.id] ?? row.definition.target} · {row.definition.weight}% weight</>}
    onClose={onClose}
    size="m"
    footer={<><p className="kra-quiet">Status shown is the source status unless a manual edit exists.</p><button type="button" className="kra-button" onClick={onClose}>Close</button></>}
  >
    <div className="kra-detail">
      <div className="kra-detail-status">
        <div><span>Status</span><StatusPill state={status} /></div>
        <div><span>Now</span><strong>{row.values[0].primary}</strong></div>
        <div><span>Last year</span><strong>{row.values[1].primary}</strong></div>
        <div><span>Preceding</span><strong>{row.values[2].primary}</strong></div>
      </div>
      <section>
        <h4>What the records show</h4>
        <p>{row.explanation}</p>
      </section>
      {row.basis && <section><h4>How this is measured</h4><p>{row.basis}</p></section>}
      {row.action && <section className="kra-detail-action"><h4>Suggested next step</h4><p>{row.action}</p></section>}
      {row.edit?.note && <section><h4>Note</h4><p>{row.edit.note}</p></section>}
      {row.edit?.annotation && <section><h4>Annotation</h4><p>{row.edit.annotation}</p></section>}
      {row.definition.id === 'churn' && <a className="kra-button" href={churnSource.url} target="_blank" rel="noreferrer">Open the Lapsed sheet <ArrowUpRight size={12} /></a>}
    </div>
  </Modal>;
}

function Explanation({ row, onOpen }: { row: ScoreRow; onOpen: () => void }) {
  const preview = row.explanation.length > 132 ? row.explanation.slice(0, 130).trimEnd() + '…' : row.explanation;
  return <div className="kra-cell-note">
    <p>{preview}</p>
    <button type="button" className="kra-note-toggle" onClick={onOpen}>Read full note</button>
  </div>;
}

export function Scorecard({ data, onSaved, onDrill }: {
  data: KraData;
  onSaved: (result: EditResult) => void;
  onDrill?: (kind: string, month: string) => void;
}) {
  const [period, setPeriod] = useState('review');
  const [editing, setEditing] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const model = scorecardModel(data, period);
  const { rows, totals, labels, dates, review, month } = model;
  const editingRow = rows.find((row) => row.definition.id === editing);
  const detailRow = rows.find((row) => row.definition.id === detail);

  const periodOptions = [
    { value: 'review', label: `${acquisitionPeriodLabel(data.comparisonPeriods.current.from)} – ${acquisitionPeriodLabel(data.comparisonPeriods.current.to)} · KRA to date` },
    ...data.monthly.map((row) => ({ value: row.month, label: `${acquisitionPeriodLabel(row.month)}${row.state === 'Month to date' ? ' · month to date' : row.state === 'Upcoming' ? ' · upcoming' : ''}` })),
  ];

  return <Panel className="kra-scorecard">
    <div className="kra-panel-head">
      <div className="kra-panel-head-copy">
        <span className="kra-eyebrow">Weighted scorecard</span>
        <h2>Where each KRA stands</h2>
        <p>Achievement, movement and evidence for all seven KRAs against two matched baselines. Status is never inferred from revenue alone.</p>
      </div>
      <div className="kra-panel-head-actions">
        <Pill tone={totals.onTrack >= 4 ? 'positive' : 'progress'} dot>{totals.onTrack} of {totals.assessed} on track</Pill>
        <label className="kra-field" style={{ gap: 0 }}>
          <span className="kra-field-hint" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>Scorecard period</span>
          <DropdownField className="kra-select" aria-label="Scorecard period" value={period} onChange={(event) => setPeriod(event.target.value)}>
            {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </DropdownField>
        </label>
      </div>
    </div>

    {/* The three windows this table compares, stated once so every column is unambiguous. */}
    <div className="kra-windows">
      {labels.map((label, index) => <div key={label} className={index === 0 ? 'is-now' : ''}>
        <span>{label}</span>
        <strong>{windowLabel(dates[index])}</strong>
      </div>)}
      <p className="kra-windows-note">Matching elapsed days and observation windows on every column. No future revenue is included.</p>
    </div>

    <div className="kra-score-wrap">
      <table className="kra-score-table">
        <colgroup>
          <col style={{ width: 232 }} />
          <col style={{ width: 190 }} />
          <col style={{ width: 88 }} />
          <col style={{ width: 148 }} />
          <col style={{ width: 88 }} />
          <col style={{ width: 136 }} />
          <col style={{ width: 226 }} />
          <col style={{ width: 42 }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">KRA &amp; target</th>
            <th scope="col" className="kra-col-is-now">{review ? 'KRA to date' : month.state === 'Month to date' ? 'Selected month · to date' : 'Selected month'}</th>
            <th scope="col">vs last year</th>
            <th scope="col">{review ? 'Same window last year' : 'Same month last year'}</th>
            <th scope="col">vs preceding</th>
            <th scope="col">{review ? 'Preceding window' : 'Previous month'}</th>
            <th scope="col">Status &amp; evidence</th>
            <th scope="col"><span className="kra-sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <tr key={row.definition.id}>
            <td className="kra-col-kra">
              <div className="kra-kra-cell">
                <div className="kra-kra-name">
                  <strong>{row.definition.area}</strong>
                  <MetricInfoHint id={row.definition.id} label={row.definition.area} />
                </div>
                <p className="kra-kra-target" title={row.definition.target}>{row.definition.manual ? row.definition.target : shortTargets[row.definition.id] ?? row.definition.target}</p>
                <div className="kra-kra-meta">
                  <span className="kra-weight">{row.definition.weight}% weight</span>
                  {row.manual && <span className="kra-kra-kind is-warning">Manual edit</span>}
                  {row.definition.kind === 'evidence' && <span className="kra-kra-kind">Evidence-led</span>}
                </div>
                {row.progress && <div className="kra-meter">
                  <div className="kra-meter-top"><span>{row.progress.label}</span><strong>{row.progress.done} of {row.progress.total}</strong></div>
                  <div className={`kra-progress ${row.progress.done >= row.progress.total ? 'is-positive' : 'is-progress'}`} role="img" aria-label={`${row.progress.label}: ${row.progress.done} of ${row.progress.total}`}>
                    <span style={{ width: `${Math.min(100, Math.round((row.progress.done / Math.max(1, row.progress.total)) * 100))}%` }} />
                  </div>
                </div>}
              </div>
            </td>
            <td className="kra-col-now">
              <Value value={row.values[0]} />
            </td>
            <td>
              <Delta value={row.yoy} inverse={row.definition.id === 'churn'} label="—" />
            </td>
            <td><div className="kra-cell-stack"><Value value={row.values[1]} muted />{row.secondGrowth && <span className="kra-cell-extra">Referral movement {row.secondGrowth[0] == null ? 'not comparable' : `${(row.secondGrowth[0] * 100).toFixed(1)}%`}</span>}</div></td>
            <td>
              <Delta value={row.prior} inverse={row.definition.id === 'churn'} label="—" />
            </td>
            <td><div className="kra-cell-stack"><Value value={row.values[2]} muted />{row.secondGrowth && <span className="kra-cell-extra">Referral movement {row.secondGrowth[1] == null ? 'not comparable' : `${(row.secondGrowth[1] * 100).toFixed(1)}%`}</span>}</div></td>
            <td>
              <div className="kra-cell-stack">
                <StatusPill state={row.state} />
                {row.provisional && <small className="kra-provisional">Provisional · observation window open</small>}
                <Explanation row={row} onOpen={() => setDetail(row.definition.id)} />
              </div>
            </td>
            <td>
              <div className="kra-row-tools">
                <button type="button" className="kra-icon-button" aria-label={`Edit ${row.definition.area}`} title="Edit KRA, notes and annotations" onClick={() => setEditing(row.definition.id)}><PencilLine size={13} /></button>
                {onDrill && drillTargets[row.definition.id] && <button type="button" className="kra-icon-button" aria-label={`View ${row.definition.area} source records`} title="View source records" onClick={() => onDrill(drillTargets[row.definition.id], period)}><Table2 size={13} /></button>}
              </div>
            </td>
          </tr>)}
        </tbody>
        <tfoot>
          <tr>
            <td className="kra-col-kra">
              <div className="kra-kra-cell">
                <div className="kra-kra-name"><strong>Total weighted framework</strong></div>
                <p className="kra-kra-target">{totals.weights}% weight · {totals.onTrack} of {totals.assessed} KRAs on track</p>
              </div>
            </td>
            <td className="kra-col-now"><strong className="kra-total-value">{rupees(totals.revenue[0])}</strong></td>
            <td><Delta value={totals.revenueGrowth} /></td>
            <td>{rupees(totals.revenue[1])}</td>
            <td><Delta value={totals.revenuePrior} /></td>
            <td>{rupees(totals.revenue[2])}</td>
            <td colSpan={2} className="kra-score-footnote">Revenue figures in the footer are the source total. Rates use their own cohort denominators and are never averaged.</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div className="kra-score-notes">
      <p>Comparisons use matching elapsed days. Historical upskilling, hiring and training milestones require recorded evidence, and saved edits are labelled beside the source figures.</p>
      <p className="kra-quiet">Churn reads {percent(data.comparisonPeriods.current.churnRate)} on the conservative headline rate; the settled-cohort view below shows retention already delivered.</p>
    </div>

    {detailRow && <DetailDialog row={detailRow} churnSource={data.churnSource} onClose={() => setDetail(null)} />}

    {editingRow && <KraEditDialog
      key={`${period}/${editing}`}
      period={period}
      definition={editingRow.definition}
      saved={editingRow.edit ? data.scorecardEdits[`${period}/${editing}`] : undefined}
      source={{ current: editingRow.values[0].primary, lastYear: editingRow.values[1].primary, preceding: editingRow.values[2].primary, status: editingRow.state, explanation: editingRow.explanation }}
      onSaved={onSaved}
      onClose={() => setEditing(null)}
    />}
  </Panel>;
}
