import { useMemo, useState } from 'react';
import { Check, ChevronDown, ExternalLink, Plus } from 'lucide-react';
import { DropdownField } from '../ui/DropdownField';
import { acquisitionPeriodLabel } from '../../data/acquisition';
import type { Definition, Evidence as EvidenceRecord, KraData, Topic, TopicRecord } from './types';
import { milestones, shortTargets } from './derive';
import { longDate, plural, timestamp } from './types';
import { Panel, Pill, StatusPill } from './ui';

const STATUSES = ['Not started', 'In progress', 'Completed'];

function EvidenceForm({ id, saved, asOf, onSaved }: { id: string; saved?: EvidenceRecord; asOf: string; onSaved: (record: EvidenceRecord) => void }) {
  const [form, setForm] = useState<EvidenceRecord>(saved ?? { status: 'Not started', note: '', url: '', date: '', checks: [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const required = milestones[id] ?? [];

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/kra/evidence/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return <form className="kra-evidence-form" onSubmit={save}>
    <label className="kra-field">Progress
      <DropdownField className="kra-select" aria-label={`${id} progress`} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
        {STATUSES.map((value) => <option key={value}>{value}</option>)}
      </DropdownField>
    </label>
    <label className="kra-field">Evidence date
      <input className="kra-input" type="date" min="2026-06-01" max={asOf < '2026-11-30' ? asOf : '2026-11-30'} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
    </label>
    <fieldset className="kra-milestones">
      <legend>Required milestones</legend>
      {required.map((value) => {
        const on = form.checks.includes(value);
        return <label key={value} className={`kra-check ${on ? 'is-on' : ''}`}>
          <input type="checkbox" checked={on} onChange={(event) => setForm({ ...form, checks: event.target.checked ? [...form.checks, value] : form.checks.filter((item) => item !== value) })} />
          <span className="kra-check-tick"><Check size={10} strokeWidth={3.2} /></span>{value}
        </label>;
      })}
    </fieldset>
    <label className="kra-field kra-wide">Dated outcomes and evidence
      <textarea className="kra-textarea" aria-label={`${id} outcome evidence`} maxLength={6000} rows={3} value={form.note}
        placeholder="Record the course, hire, onboarding or training outcomes and the evidence that supports them."
        onChange={(event) => setForm({ ...form, note: event.target.value })} />
    </label>
    <label className="kra-field kra-wide">Supporting link
      <input className="kra-input" type="url" placeholder="https://…" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} />
    </label>
    <div className="kra-wide kra-evidence-foot">
      <button className="kra-button is-primary" disabled={saving}>{saving ? 'Saving…' : 'Save evidence'}</button>
      <p className="kra-quiet">Self-reported evidence{saved?.updatedAt ? ` · last saved ${timestamp(saved.updatedAt)}` : ''}. Completion requires a dated note and every required milestone.</p>
    </div>
    {error && <p className="kra-alert kra-wide" role="alert">{error}</p>}
  </form>;
}

function EvidenceRow({ definition, saved, asOf, defaultOpen, onSaved }: { definition: Definition; saved?: EvidenceRecord; asOf: string; defaultOpen?: boolean; onSaved: (record: EvidenceRecord) => void }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const required = milestones[definition.id] ?? [];
  const done = saved?.checks.length ?? 0;
  return <div className={`kra-action-row ${open ? 'is-open' : ''}`}>
    <div className="kra-action-main">
      <div className="kra-action-title">
        <strong>{definition.area}</strong>
        <Pill tone="neutral">{definition.weight}%</Pill>
        <StatusPill state={saved?.status ?? 'Not started'} />
        {required.length > 0 && <span className="kra-action-meta">{done} of {plural(required.length, 'milestone')} recorded</span>}
      </div>
      <p className="kra-kra-target">{definition.manual ? definition.target : shortTargets[definition.id] ?? definition.target}</p>
      <div className="kra-action-meta">
        <span>{saved?.date ? `Evidence dated ${longDate(saved.date)}` : 'No dated evidence recorded'}</span>
        {saved?.updatedAt && <span>Updated {timestamp(saved.updatedAt)}</span>}
        {saved?.url && <a href={saved.url} target="_blank" rel="noreferrer">Supporting link <ExternalLink size={9} /></a>}
      </div>
      {saved?.note && !open && <p className="kra-quiet">{saved.note.length > 170 ? saved.note.slice(0, 168).trimEnd() + '…' : saved.note}</p>}
      {open && <EvidenceForm id={definition.id} saved={saved} asOf={asOf} onSaved={onSaved} />}
    </div>
    <div className="kra-action-side">
      <button type="button" className="kra-button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {open ? 'Close' : saved ? 'Update' : 'Record evidence'} <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
    </div>
  </div>;
}

export function ActionsPanel({ data, onEvidence }: { data: KraData; onEvidence: (id: string, record: EvidenceRecord) => void }) {
  const dataLed = data.definitions.filter((definition) => definition.kind === 'data');
  const evidenceLed = data.definitions.filter((definition) => definition.kind === 'evidence');
  const saved = (id: string) => data.evidence[id] as EvidenceRecord | undefined;
  return <Panel className="kra-actions">
    <div className="kra-panel-head">
      <div className="kra-panel-head-copy">
        <span className="kra-eyebrow">Execution log</span>
        <h2>Actions &amp; supporting evidence</h2>
        <p>Data-led KRAs need a dated action plan; evidence-led KRAs need dated outcomes and every milestone. Suggestions elsewhere on this page are not represented as actions taken.</p>
      </div>
      <div className="kra-panel-head-actions">
        <Pill tone="progress">{dataLed.filter((definition) => saved(definition.id)?.status === 'Completed').length} / {dataLed.length} action plans complete</Pill>
        <Pill tone="positive">{evidenceLed.filter((definition) => saved(definition.id)?.status === 'Completed').length} / {evidenceLed.length} evidence sets complete</Pill>
      </div>
    </div>
    <div className="kra-action-group">
      <h3>Data-led KRAs · {dataLed.reduce((sum, definition) => sum + definition.weight, 0)}% weight</h3>
      <div className="kra-action-list">
        {dataLed.map((definition) => <EvidenceRow key={definition.id} definition={definition} saved={saved(definition.id)} asOf={data.asOf} onSaved={(record) => onEvidence(definition.id, record)} />)}
      </div>
    </div>
    <div className="kra-action-group">
      <h3>Upskilling, hiring &amp; team training · {evidenceLed.reduce((sum, definition) => sum + definition.weight, 0)}% weight</h3>
      <p className="kra-quiet">Completion here is never inferred from revenue or attendance — it needs a dated outcome.</p>
      <div className="kra-action-list">
        {evidenceLed.map((definition) => <EvidenceRow key={definition.id} definition={definition} saved={saved(definition.id)} asOf={data.asOf} onSaved={(record) => onEvidence(definition.id, record)} />)}
      </div>
    </div>
  </Panel>;
}

export function Curriculum({ topics, records, onSaved }: { topics: Topic[]; records: Record<string, TopicRecord>; onSaved: (id: string, record: TopicRecord) => void }) {
  const [filter, setFilter] = useState<'All' | 'Completed' | 'Pending'>('All');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const isCompleted = (id: string) => records[id]?.status === 'Completed';
  const completed = topics.filter((topic) => isCompleted(topic.id)).length;
  const visible = topics.filter((topic) => filter === 'All' || (filter === 'Completed' ? isCompleted(topic.id) : !isCompleted(topic.id)));
  const chosen = selected.filter((id) => visible.some((topic) => topic.id === id));
  const allChosen = !!visible.length && chosen.length === visible.length;
  const pct = topics.length ? Math.round((completed / topics.length) * 100) : 0;
  const byCategory = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    topics.forEach((topic) => {
      const entry = map.get(topic.category) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (isCompleted(topic.id)) entry.done += 1;
      map.set(topic.category, entry);
    });
    return [...map.entries()];
  }, [topics, records]);

  async function update(id: string, status: string) {
    setBusy(id); setError('');
    try {
      const response = await fetch('/api/kra/training/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note: records[id]?.note ?? '' }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      onSaved(id, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  // One queued write for the whole selection, so a bulk change cannot land half-applied.
  async function updateMany(ids: string[], status: string) {
    if (!ids.length) return;
    setBusy('bulk'); setError('');
    try {
      const response = await fetch('/api/kra/training', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, status }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      Object.entries(result as Record<string, TopicRecord>).forEach(([id, record]) => onSaved(id, record));
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  }

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  return <Panel className="kra-curriculum">
    <div className="kra-panel-head">
      <div className="kra-panel-head-copy">
        <span className="kra-eyebrow">Professional upskilling · 10% weight</span>
        <h2>Performance marketing curriculum</h2>
        <p>Mark each topic yourself. Progress is saved with the date you report it; nothing is pre-marked and completion is never inferred.</p>
      </div>
      <div className="kra-curriculum-progress">
        <div className="kra-progress is-positive" role="img" aria-label={`${completed} of ${topics.length} topics completed`}><span style={{ width: `${pct}%` }} /></div>
        <strong>{completed} / {topics.length}</strong>
        <Pill tone={pct === 100 ? 'positive' : 'progress'}>{pct}%</Pill>
      </div>
    </div>

    <div className="kra-category-strip">
      {byCategory.map(([category, entry]) => <div key={category}>
        <span>{category}</span>
        <strong>{entry.done}<em>/{entry.total}</em></strong>
        <div className={`kra-progress ${entry.done === entry.total ? 'is-positive' : 'is-progress'}`}><span style={{ width: `${Math.round((entry.done / entry.total) * 100)}%` }} /></div>
      </div>)}
    </div>

    <div className="kra-curriculum-head">
      <div className="kra-tabs kra-tabs-compact" role="tablist" aria-label="Topic filter">
        {(['All', 'Pending', 'Completed'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>
          {value} · {value === 'All' ? topics.length : value === 'Completed' ? completed : topics.length - completed}
        </button>)}
      </div>
      <div className="kra-bulkbar">
        <label className="kra-check" style={{ paddingBlock: 4 }}>
          <input type="checkbox" aria-label="Select all visible topics" checked={allChosen} ref={(node) => { if (node) node.indeterminate = !!chosen.length && !allChosen; }} onChange={(event) => setSelected(event.target.checked ? visible.map((topic) => topic.id) : [])} />
          <span className="kra-check-tick"><Check size={10} strokeWidth={3.2} /></span>Select all
        </label>
        <strong>{chosen.length || visible.length}</strong> of {visible.length} shown
        <div className="kra-bulkbar-actions">
          {chosen.length > 0 && <>
            <button type="button" className="kra-button is-primary" disabled={busy === 'bulk'} onClick={() => void updateMany(chosen, 'Completed')}>{busy === 'bulk' ? 'Saving…' : `Mark ${chosen.length} complete`}</button>
            <button type="button" className="kra-button" disabled={busy === 'bulk'} onClick={() => void updateMany(chosen, 'In progress')}>In progress</button>
            <button type="button" className="kra-button is-ghost" onClick={() => setSelected([])}>Clear</button>
          </>}
          {!chosen.length && <button type="button" className="kra-button" disabled={!visible.length || busy === 'bulk'} onClick={() => void updateMany(visible.map((topic) => topic.id), 'Completed')}>
            <Plus size={12} />Mark all {filter === 'All' ? 'topics' : filter.toLowerCase()} complete
          </button>}
        </div>
      </div>
    </div>

    {error && <p className="kra-alert" role="alert">{error}</p>}

    <div className="kra-curriculum-grid">
      {visible.map((topic) => {
        const record = records[topic.id];
        const status = record?.status ?? 'Not started';
        return <label key={topic.id} className={`kra-topic ${status === 'Completed' ? 'is-done' : status === 'In progress' ? 'is-active' : ''} ${chosen.includes(topic.id) ? 'is-selected' : ''}`}>
          <input type="checkbox" checked={chosen.includes(topic.id)} aria-label={`Select ${topic.title}`} onChange={() => toggle(topic.id)} />
          <span className={`kra-check-tick ${status === 'Completed' ? 'is-on' : ''}`}>{status === 'Completed' ? <Check size={10} strokeWidth={3.2} /> : null}</span>
          <span className="kra-topic-body">
            <span>{topic.category}</span>
            <strong>{topic.title}</strong>
            <span className="kra-topic-foot">
              <StatusPill state={status} />
              <time>{record?.date ? acquisitionPeriodLabel(record.date) : 'No date yet'}</time>
            </span>
          </span>
          <span className="kra-topic-action">
            <DropdownField className="kra-select" aria-label={`Progress for ${topic.title}`} disabled={busy === topic.id || busy === 'bulk'} value={status} onChange={(event) => void update(topic.id, event.target.value)}>
              {STATUSES.map((value) => <option key={value}>{value}</option>)}
            </DropdownField>
          </span>
        </label>;
      })}
    </div>
    {!visible.length && <p className="kra-empty">No topics in this view.</p>}
    <p className="kra-quiet">{plural(completed, 'topic')} completed of {topics.length}. Manually reported progress · upskilling weight 10%.</p>
  </Panel>;
}
