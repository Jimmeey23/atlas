import { useEffect, useRef, useState } from 'react';
import { DropdownField } from '../ui/DropdownField';
import { acquisitionPeriodLabel } from '../../data/acquisition';

export type KraEdit = { current: string | null; lastYear: string | null; preceding: string | null; yoy: number | null; previousGrowth: number | null; status: string | null; explanation: string | null; note: string; annotation: string; updatedAt: string; basis: string };
export type KraInfo = { id: string; area: string; target: string; weight: number; kind: string; manual?: boolean; targetEdited?: boolean };
export type EditResult = { key: string; record: KraEdit; info: Omit<KraInfo, 'id' | 'kind'>; history: KraHistory[] };
export type KraHistory = { id: string; key: string; updatedAt: string; before: KraEdit | null; after: KraEdit; info: Omit<KraInfo, 'id' | 'kind'> };

const STATUSES = ['On track', 'Lagging', 'In progress', 'Completed', 'Not started', 'Not recorded', 'Baseline needed', 'Review needed', 'Upcoming'];
const empty = { current: '', lastYear: '', preceding: '', yoy: '', previousGrowth: '', status: '', explanation: '', note: '', annotation: '' };

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`kra-field ${wide ? 'kra-wide' : ''}`}>
    <span>{label}{hint && <em className="kra-field-hint">{hint}</em>}</span>
    {children}
  </label>;
}

/**
 * Edits are stored per period. Name, target and weight apply to every period; the
 * figures, notes and annotations written here apply to the period the dialog was
 * opened from, which is why the period is restated in the subtitle.
 */
export function KraEditDialog({ period, definition, saved, source, onSaved, onClose }: {
  period: string;
  definition: KraInfo;
  saved?: KraEdit;
  source: { current: string; lastYear: string; preceding: string; status: string; explanation: string };
  onSaved: (result: EditResult) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState({ area: definition.area, target: definition.target, weight: String(definition.weight) });
  const [form, setForm] = useState<typeof empty>(() => {
    const start = { ...empty };
    for (const key of Object.keys(empty) as (keyof typeof empty)[]) {
      if (key === 'yoy' || key === 'previousGrowth') {
        const growth = saved?.[key];
        if (growth != null) start[key] = String(Number(growth) * 100);
      } else {
        const value = saved?.[key];
        start[key] = typeof value === 'string' ? value : '';
      }
    }
    return start;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { ref.current?.showModal(); return () => { ref.current?.close(); }; }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const data = {
        ...form,
        current: form.current.trim() || null,
        lastYear: form.lastYear.trim() || null,
        preceding: form.preceding.trim() || null,
        status: form.status || null,
        explanation: form.explanation.trim() || null,
        yoy: form.yoy.trim() ? Number(form.yoy) / 100 : null,
        previousGrowth: form.previousGrowth.trim() ? Number(form.previousGrowth) / 100 : null,
      };
      const response = await fetch('/api/kra/scorecard/' + period + '/' + definition.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ info: { ...info, weight: Number(info.weight) }, data, expectedUpdatedAt: saved?.updatedAt ?? null }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      onSaved(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const input = (key: keyof typeof empty, label: string, placeholder?: string, type = 'text') => <Field label={label}>
    <input className="kra-input" aria-label={label} type={type} step={type === 'number' ? 'any' : undefined} value={form[key]} placeholder={placeholder} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
  </Field>;

  return <dialog ref={ref} className="kra-dialog kra-edit-dialog kra-dialog-l" aria-labelledby="kra-edit-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form className="kra-dialog-shell" onSubmit={save}>
      <header className="kra-dialog-head">
        <div>
          <span className="kra-eyebrow">{period === 'review' ? 'Full KRA review' : acquisitionPeriodLabel(period)} · saved edits</span>
          <h2 id="kra-edit-title">{definition.area}</h2>
          <p>Name, target and weight apply to every period. Achievements, notes and annotations apply to {period === 'review' ? 'the KRA period to date' : acquisitionPeriodLabel(period)} only.</p>
        </div>
        <button type="button" className="kra-icon-button" aria-label="Close KRA editor" disabled={busy} onClick={onClose}>×</button>
      </header>
      <div className="kra-dialog-body">
        <div className="kra-edit-grid">
          <div className="kra-edit-section kra-wide">
            <h3>Definition</h3>
            <p>Changing the name, target or weight marks this KRA as manually maintained everywhere.</p>
          </div>
          <Field label="KRA name">
            <input className="kra-input" aria-label="KRA name" required maxLength={200} value={info.area} onChange={(event) => setInfo({ ...info, area: event.target.value })} />
          </Field>
          <Field label="Weight" hint="%">
            <input className="kra-input" aria-label="KRA weight" type="number" min="0" max="100" step="any" required value={info.weight} onChange={(event) => setInfo({ ...info, weight: event.target.value })} />
          </Field>
          <Field label="Target / KRA information" wide>
            <textarea className="kra-textarea" aria-label="KRA target" rows={2} maxLength={2000} value={info.target} onChange={(event) => setInfo({ ...info, target: event.target.value })} />
          </Field>

          <div className="kra-edit-section kra-wide">
            <h3>Achievement for this period</h3>
            <p>Leave a field blank to keep the source value. Entering a manual achievement clears the computed comparison for that column.</p>
          </div>
          {input('current', 'Current achievement', source.current)}
          {input('lastYear', 'Last-year achievement', source.lastYear)}
          {input('preceding', 'Preceding achievement', source.preceding)}
          {input('yoy', 'Growth vs last year', 'Source comparison', 'number')}
          {input('previousGrowth', 'Growth vs preceding', 'Source comparison', 'number')}
          <Field label="Status">
            <DropdownField className="kra-select" aria-label="Edited KRA status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="">Use source status · {source.status}</option>
              {STATUSES.map((status) => <option key={status}>{status}</option>)}
            </DropdownField>
          </Field>
          <Field label="Explanation" wide>
            <textarea className="kra-textarea" aria-label="Edited KRA explanation" rows={2} maxLength={6000} value={form.explanation} placeholder={source.explanation} onChange={(event) => setForm({ ...form, explanation: event.target.value })} />
          </Field>

          <div className="kra-edit-section kra-wide">
            <h3>Notes &amp; annotations</h3>
            <p>Both are saved with the period and shown beside the source figures on the scorecard.</p>
          </div>
          <Field label="Notes" wide>
            <textarea className="kra-textarea" aria-label="KRA notes" rows={3} maxLength={10000} value={form.note} placeholder="Add context, decisions, owners or follow-up actions…" onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </Field>
          <Field label="Annotations" wide>
            <textarea className="kra-textarea" aria-label="KRA annotations" rows={2} maxLength={10000} value={form.annotation} placeholder="Annotate a figure, a comparison or a source record…" onChange={(event) => setForm({ ...form, annotation: event.target.value })} />
          </Field>
        </div>
        {error && <p className="kra-alert" role="alert">{error}</p>}
      </div>
      <footer className="kra-dialog-foot">
        <p className="kra-quiet">Saved changes survive refreshes and app restarts, and every revision is kept in the audit trail.</p>
        <button type="button" className="kra-button is-ghost" disabled={busy} onClick={() => setForm({ ...form, current: '', lastYear: '', preceding: '', yoy: '', previousGrowth: '', status: '', explanation: '' })}>Use source figures</button>
        <button type="button" className="kra-button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="kra-button is-primary" disabled={busy}>{busy ? 'Saving…' : 'Save KRA & notes'}</button>
      </footer>
    </form>
  </dialog>;
}
