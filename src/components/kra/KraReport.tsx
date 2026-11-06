import { useEffect, useMemo, useRef, useState } from 'react';
import type { Evidence, KraData, TopicRecord } from './types';
import { Masthead } from './Masthead';
import { Scorecard } from './Scorecard';
import { Narratives } from './Narratives';
import { TrackRecord } from './TrackRecord';
import { Comparison } from './Comparison';
import { ActionsPanel, Curriculum } from './Evidence';
import { Explorer, type Kind } from './Explorer';
import { Methodology, RevisionHistory, SourcesPanel, StudioRevenue } from './Appendix';
import { narratives } from './derive';
import { Section } from './Section';
import { ReportNav } from './ReportNav';
import { Panel } from './ui';
import '../../design/kra-next.css';

const kindForNarrative: Record<string, Kind> = { revenue: 'revenue', stability: 'revenue', churn: 'churn', trials: 'acquisition' };

export function KraReport() {
  const generation = useRef(0);
  const [data, setData] = useState<KraData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [imports, setImports] = useState(false);
  const [kind, setKind] = useState<Kind>('revenue');
  const [period, setPeriod] = useState('review');
  const explorerRef = useRef<HTMLDivElement>(null);

  async function load(refresh = false) {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/kra/performance?imports=${imports}${refresh ? '&refresh=true' : ''}`);
      if (request !== generation.current) return;
      const result = await response.json();
      if (request !== generation.current) return;
      if (!response.ok) throw Error(result.error);
      setData(result);
    } catch (err) {
      if (request === generation.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imports]);

  const cards = useMemo(() => (data ? narratives(data.explanations ?? {}, data.trajectories ?? {}) : []), [data]);

  function explore(next: string) {
    setKind(kindForNarrative[next] ?? 'revenue');
    setPeriod('review');
    requestAnimationFrame(() => explorerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  if (!data) {
    return error ? <div className="kra-workspace">
      <div className="kra-error" role="alert">
        <h2>KRA performance could not load</h2>
        <p>{error}</p>
        <div className="kra-error-actions">
          <button type="button" className="kra-button is-primary" disabled={loading} onClick={() => void load()}>{loading ? 'Retrying…' : 'Retry loading data'}</button>
        </div>
      </div>
    </div> : <LoadingState />;
  }

  const saveEvidence = (id: string, record: Evidence) => setData((current) => (current ? { ...current, evidence: { ...current.evidence, [id]: record } } : current));
  const saveTopic = (id: string, record: TopicRecord) => setData((current) => (current ? { ...current, evidence: { ...current.evidence, marketingTopics: { ...((current.evidence.marketingTopics as Record<string, TopicRecord>) ?? {}), [id]: record } } } : current));

  return <div className="kra-workspace">
    <Masthead data={data} loading={loading} onRefresh={() => void load(true)} />

    <ReportNav
      meta={`${data.person.split(' ')[0]} · June–November 2026`}
      sections={[
        { id: 'scorecard', label: 'Scorecard' },
        { id: 'narratives', label: 'Why it moved' },
        { id: 'track', label: 'Track record' },
        { id: 'comparison', label: 'Comparison' },
        { id: 'explorer', label: 'Source records' },
        { id: 'actions', label: 'Evidence' },
        { id: 'studios', label: 'Studios' },
        { id: 'provenance', label: 'Provenance' },
      ]}
    />

    {error && <p className="kra-alert" role="alert">{error}</p>}

    <Section id="scorecard" eyebrow="01 · Scorecard">
      <Scorecard
        data={data}
        onSaved={(result) => setData((current) => (current ? {
          ...current,
          definitions: current.definitions.map((definition) => (definition.id === result.key.split('/')[1] ? { ...definition, ...result.info } : definition)),
          scorecardEdits: { ...current.scorecardEdits, [result.key]: result.record },
          scorecardHistory: result.history,
        } : current))}
        onDrill={(nextKind, nextPeriod) => {
          setKind(nextKind as Kind);
          setPeriod(nextPeriod === 'review' || data.monthly.some((row) => row.month === nextPeriod) ? nextPeriod : period);
          requestAnimationFrame(() => explorerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }}
      />
    </Section>

    <div id="narratives">
      <Narratives cards={cards} onExplore={explore} />
    </div>

    <Section id="track" eyebrow="02 · Track record">
      <TrackRecord data={data} />
    </Section>

    <Section id="comparison" eyebrow="03 · Comparison">
      <Comparison data={data} />
    </Section>

    <Section id="explorer" eyebrow="04 · Source records">
      <div ref={explorerRef} className="kra-scroll-target">
        <div className="kra-explorer-controls">
          <label className="kra-check" style={{ paddingBlock: 5 }}>
            <input type="checkbox" checked={imports} onChange={(event) => setImports(event.target.checked)} />
            <span className={`kra-check-tick ${imports ? 'is-on' : ''}`} aria-hidden="true">{imports ? '✓' : ''}</span>
            Include imported source records
          </label>
          <span className="kra-quiet">Imported rows are excluded by default so organisation totals stay source-backed.</span>
        </div>
        <Explorer data={data} kind={kind} period={period} onKind={setKind} onPeriod={setPeriod} />
      </div>
    </Section>

    <Section id="actions" eyebrow="05 · Execution">
      <ActionsPanel data={data} onEvidence={saveEvidence} />
      <Curriculum topics={data.trainingTopics ?? []} records={(data.evidence.marketingTopics as Record<string, TopicRecord>) ?? {}} onSaved={saveTopic} />
    </Section>

    <Section id="studios" eyebrow="06 · Distribution">
      <StudioRevenue data={data} />
    </Section>

    <Section id="provenance" eyebrow="07 · Provenance">
      <SourcesPanel data={data} />
      <Methodology data={data} />
      <RevisionHistory data={data} />
    </Section>

    <footer className="kra-footer">
      <div>
        <strong>{data.person}</strong>
        <span>{data.role}</span>
      </div>
      <p>KRA review June–November 2026 · prepared from source sheets on {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Organisation results are leadership outcomes, not personally closed sales.</p>
    </footer>
  </div>;
}

function LoadingState() {
  return <div className="kra-workspace kra-loading" role="status" aria-live="polite">
    <div className="kra-loading-head">
      <span className="kra-loading-pulse" aria-hidden="true" />
      <div>
        <strong>Reading the KRA sources</strong>
        <span>Reconciling sales, leads, bookings, lapsed memberships and the New sheet…</span>
      </div>
    </div>
    <div className="kra-skeleton" style={{ height: 64, borderRadius: 10 }} />
    <div className="kra-skeleton" style={{ height: 300 }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
      <div className="kra-skeleton" style={{ height: 150 }} />
      <div className="kra-skeleton" style={{ height: 150 }} />
    </div>
  </div>;
}

export { Panel };
