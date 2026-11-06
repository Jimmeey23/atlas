import { CalendarDays, RefreshCw, ShieldCheck } from 'lucide-react';
import type { KraData } from './types';
import { count, percent, rupees } from './format';
import { longDate } from './types';
import { Delta } from './ui';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function Masthead({ data, loading, onRefresh }: { data: KraData; loading: boolean; onRefresh: () => void }) {
  const current = data.comparisonPeriods.current;
  const last = data.comparisonPeriods.lastYear;
    const revenueGrowth = current.revenue != null && last.revenue != null && last.revenue > 0 ? current.revenue / last.revenue - 1 : null;
  const onTrack = Object.entries(data.trajectories).filter(([key, value]) => key !== 'churnYtd' && (value === 'On track')).length;
  const tracked = Object.entries(data.trajectories).filter(([key]) => key !== 'churnYtd').length;
  const stale = data.sources.some((source) => source.stale || source.error);
  const totalWeight = data.definitions.reduce((sum, definition) => sum + definition.weight, 0);

  return <header className="kra-masthead">
    <div className="kra-masthead-top">
      <div className="kra-masthead-id">
        <span className="kra-monogram" aria-hidden="true">{initials(data.person)}</span>
        <div className="kra-masthead-title">
          <span className="kra-eyebrow">KRA review · June–November 2026</span>
          <h1>{data.person}</h1>
          <span className="kra-masthead-role">{data.role}</span>
        </div>
      </div>
      <div className="kra-masthead-actions">
        <button type="button" className="kra-button" disabled={loading} onClick={onRefresh}>
          <RefreshCw size={13} className={loading ? 'kra-spin' : undefined} />
          {loading ? 'Refreshing sources…' : 'Refresh sources'}
        </button>
      </div>
    </div>

    <div className="kra-badges">
      <span className="kra-badge is-status"><i className="kra-badge-dot" />{stale ? 'Saved snapshot · refresh available' : 'Source data current'}</span>
      <span className="kra-badge"><ShieldCheck size={12} />{totalWeight}% weighted framework</span>
      <span className="kra-badge"><CalendarDays size={12} />As of {longDate(data.asOf)}</span>
      <span className="kra-badge">{count(current.saleItems)} paid item lines · {count(current.members)} identified members</span>
    </div>

    <div className="kra-masthead-figures">
      <div className="kra-figure is-accent">
        <span className="kra-figure-label">Revenue collected</span>
        <span className="kra-figure-value">{rupees(current.revenue)}<small>vs {rupees(last.revenue)} LY</small></span>
        <span className="kra-figure-foot"><Delta value={revenueGrowth} /><span>June to date</span></span>
      </div>
      <div className="kra-figure">
        <span className="kra-figure-label">Lead → first class</span>
        <span className="kra-figure-value">{percent(current.completedRate)}<small>completed</small></span>
        <span className="kra-figure-foot"><span>{percent(current.scheduledRate)} scheduled</span><span>·</span><span>{count(current.leads)} leads</span></span>
      </div>
      <div className="kra-figure">
        <span className="kra-figure-label">Churn rate · lower is better</span>
        <span className="kra-figure-value">{percent(current.churnRate)}<small>vs {percent(last.churnRate)} LY</small></span>
        <span className="kra-figure-foot"><Delta value={current.churnRate != null && last.churnRate ? current.churnRate / last.churnRate - 1 : null} inverse /><span>{count(current.lapsed)} of {count(current.due)} expiries lapsed</span></span>
      </div>
      <div className="kra-figure">
        <span className="kra-figure-label">KRAs on track</span>
        <span className="kra-figure-value">{onTrack}<small>of {tracked}</small></span>
        <span className="kra-figure-foot"><span>Data-led KRAs · evidence KRAs tracked separately</span></span>
      </div>
    </div>
  </header>;
}
