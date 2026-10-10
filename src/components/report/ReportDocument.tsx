import { AdaptiveGrid } from "./AdaptiveGrid";
import { reportOptions } from "../../report/options";
import logo from '../../assets/report/logo.png';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { chapters, chapterNumber } from '../../report/chapters';
import { monthLabel } from '../../report/compute';
import { definition, reportFmt as fmt, reportDelta as delta } from '../../report/definitions';
import type { ReportModel } from '../../report/model';
import { FindingList, MetricCards, SectionHeader, MonthlyHistory } from './kit';
import { findingsFor, ledger } from '../../report/findings';
import { ReferenceHero } from './ReportChrome';
import { CriterionEvidence, EvidenceBlock, TrendEvidence } from './ReportEvidence';
import { InsightBlock, lensOf } from './Insight';
import { ActionPlan, AtAGlance } from './Glance';

const PRIORITY_METRICS: Record<string, string[]> = {
  'revenue-performance': ['gross_revenue', 'net_revenue', 'transactions', 'aov', 'membership_rev_share'],
  'conversion-funnel': ['new_clients', 'conversion_rate', 'retention_rate', 'zero_return_rate', 'avg_ltv'],
  leads: ['leads', 'converted_leads', 'lead_conversion_rate', 'untouched_leads', 'response_time_hours'],
  lapsed: ['memberships_count', 'utilisation', 'churn_rate', 'remaining_sessions', 'revenue_at_risk_30d'],
  instructors: ['sessions', 'avg_class_size_incl', 'fill_rate', 'revenue_per_session', 'draw_premium_pp'],
  'instructor-outcomes': ['new_handled', 'payroll_conversion', 'payroll_retention', 'payroll_revenue'],
  sessions: ['sessions', 'attendance', 'fill_rate', 'empty_session_rate', 'unsold_seats'],
  'late-cancellations': ['bookings', 'booking_late_cancelled', 'booking_late_rate', 'booking_no_shows', 'booking_no_show_rate'],
};

/**
 * Layout consumes the frozen engine snapshot; interactive views never recompute its figures.
 * Structure: cover → one-page scorecard → contents → chapters, each led by its verdict and
 * its key measures, then insights that carry their own evidence, then the full evidence pack.
 */
export const ReportDocument = forwardRef<HTMLElement, { model: ReportModel; theme: 'light' | 'dark'; pending?: string[] }>(
  function ReportDocument({ model, theme, pending }, ref) {
    const options = reportOptions(model.customization);
    const adaptive = options.layout === "adaptive";
    const built = new Date(model.builtAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const ordered = model.customization ? model.customization.chapterIds.flatMap(id => chapters.find(c => c.id === id) ?? []) : chapters;
    const available = ordered.filter(spec => model.chapters[spec.id] || model.narratives[spec.id] || pending?.includes(spec.id));
    const aiCount = Object.values(model.narratives).filter(n => n.generated).length;
    const findings = findingsFor(model), ranked = ledger(findings);
    const targets = model.customization?.targets;
    const initialView = options.evidenceView === 'table' || !options.showCharts ? 'table' : options.evidenceView === 'chart' ? 'chart' : undefined;
    return <article className="report-doc r2" data-report-theme={theme} data-density={options.density} data-accent={options.accent}
      data-typography={options.typography} data-card-style={options.cardStyle} data-page-breaks={options.pageBreaks} ref={ref}>
      <div className="r-page-frame" aria-hidden="true"/>
      <div className="r-topbar"><a className="r-brand" href="#report-cover"><img src={logo} alt="Physique 57"/><span>Studio intelligence<small>{model.scope.studio} · {monthLabel(model.scope.month)}</small></span></a>
        {options.confidentiality && <span className="r2-classification">{options.confidentiality}</span>}
        <nav aria-label="Chapter navigation">{options.showGlance && <a href="#at-a-glance">At a glance</a>}{available.map(spec => <a key={spec.id} href={`#${spec.id}`}>{spec.nav}</a>)}</nav></div>
      {options.showCover ? <ReferenceHero studio={model.scope.studio} period={monthLabel(model.scope.month)} built={built} aiCount={aiCount} total={available.length} title={model.customization?.title} subtitle={model.customization?.subtitle} preparedFor={model.customization?.preparedFor} preparedBy={model.customization?.preparedBy}/> : <header className="r-container r-personal-cover" id="report-cover"><h1>{model.customization?.title || `${model.scope.studio} monthly review`}</h1><p>{monthLabel(model.scope.month)}{model.customization?.preparedFor ? ` · Prepared for ${model.customization.preparedFor}` : ''}</p></header>}
      {options.showGlance && <AtAGlance model={model} specs={available} ranked={ranked} targets={targets}/>}
      {options.showContents && <nav className="r-container r2-contents" aria-label="Report contents">{available.map((spec, index) => {
        const verdict = model.narratives[spec.id]?.cards.find(c => c.focus === 'kpis');
        return <a key={spec.id} href={`#${spec.id}`}><span>{chapterNumber(index)}</span><div><b>{spec.title}</b>{verdict && <small>{verdict.headline}</small>}</div></a>;
      })}</nav>}
      <div className="r-container">
        {available.map((spec, index) => {
          const data = model.chapters[spec.id], narrative = model.narratives[spec.id];
          const writing = pending?.includes(spec.id) && !narrative;
          const statement = narrative?.cards.find(card => card.focus === 'kpis') ?? narrative?.cards[0];
          const groups = data?.groups ?? [];
          // Instructor scorecards already contain all ranking measures. Keep the alternatives in one criterion switch.
          const rankingGroups = spec.id === 'instructors' ? groups.filter(g => g.id?.startsWith('trainer-')) : [];
          const shownGroups = groups.filter(g => !rankingGroups.includes(g));
          const insights = (narrative?.cards ?? []).filter(card => card !== statement && (spec.id === 'recommendations' || options.lenses.includes(lensOf(card))));
          const plan = spec.id === 'recommendations';
          const flags = spec.derived ? [] : (findings[spec.id] ?? []).slice(0, 6);
          const metrics = [...new Set([...(PRIORITY_METRICS[spec.id] ?? []), ...spec.metrics])].filter(id => data?.total[id] != null);
          // Breakdowns the insights already show inline are not repeated in the evidence pack's lead slot.
          const inline = new Set(options.showInlineEvidence ? insights.map(c => c.focus) : []);
          const pack = shownGroups.filter(g => !inline.has(g.id ?? g.field));
          return <section className="r-section r2-section" data-layout={plan ? 'plan' : spec.derived ? 'outlook' : 'analysis'} id={spec.id} key={spec.id}>
            <SectionHeader number={chapterNumber(index)} total={available.length} topic={spec.title} eyebrow={spec.eyebrow} title={statement?.headline || spec.title} deck={spec.deck} id={`${spec.id}-title`}/>
            {writing && <p className="r2-writing" role="status"><Loader2 size={14} className="rb2-spin"/>Writing this chapter’s analysis… figures below are final.</p>}
            {!writing && narrative && !narrative.generated && <p className="r-analysis-note">AI interpretation unavailable for this chapter{narrative.error ? ` (${narrative.error})` : ''}. Rule-based findings are shown; recorded figures are final.</p>}
            {!spec.derived && (!data || !data.n) && <p className="r-empty">No selected-month source records. This is unavailable data, not a result of zero.</p>}
            {(narrative?.summary || statement) && <div className="r2-verdict">
              <span className="r-eyebrow">Chapter verdict</span>
              <p>{narrative?.summary || statement?.meaning}</p>
              {statement && (statement.driver || statement.trend || statement.impact) && <dl>
                {statement.driver && <div><dt>Main driver</dt><dd>{statement.driver}</dd></div>}
                {statement.trend && <div><dt>Durability</dt><dd>{statement.trend}</dd></div>}
                {statement.impact && <div><dt>At stake</dt><dd>{statement.impact}</dd></div>}
              </dl>}
            </div>}
            {data && <MetricCards ids={metrics.slice(0, 5)} total={data.total} prior={data.prior} priorYear={data.priorYear} history={options.showCharts ? data.history.slice(-options.historyMonths) : undefined} definitions={options.showDefinitions}/>}
            {plan && options.showActionPlan && <ActionPlan cards={narrative?.cards ?? []}/>}
            {!!insights.length && <div className="r2-insights">
              <div className="r2-insights-head"><span className="r-eyebrow">{plan ? 'Recommendations in detail' : 'Insights & evidence'}</span><small>{insights.length} {plan ? 'moves' : 'insights'} · evidence shown beside each claim</small></div>
              {insights.map((card, i) => <InsightBlock key={i} card={card} model={model} chapterId={spec.id} index={i} plan={plan} targets={targets}
                inlineEvidence={options.showInlineEvidence && options.showCharts} confidence={options.showConfidence}/>)}
            </div>}
            {spec.id === 'executive-summary' && !narrative?.cards.length && <FindingList title="Biggest signals across the report" findings={ranked.slice(0, 6)}/>}
            {!narrative?.cards.length && spec.id !== 'executive-summary' && <FindingList findings={flags}/>}
            {data && options.showCharts && <TrendEvidence history={data.history.slice(-options.historyMonths)} ids={spec.history} title={`${spec.nav} monthly trajectory`}/>}
            {(pack.length > 0 || rankingGroups.length > 0) && (options.showAppendix ? <details className="r-supporting-detail r-data-appendix" open={!options.showInlineEvidence}>
              <summary>Evidence pack <span>{pack.length + (rankingGroups.length ? 1 : 0)} breakdowns · chart or full table</span></summary>
              <AdaptiveGrid className="r-evidence-grid" enabled={adaptive}>{pack.map(table => <EvidenceBlock showCharts={options.showCharts} initialView={initialView} key={table.id ?? table.field} table={table}/>)}
                {!!rankingGroups.length && <CriterionEvidence tables={rankingGroups} showCharts={options.showCharts} initialView={options.evidenceView === "auto" ? undefined : options.evidenceView}/>}</AdaptiveGrid>
            </details> : null)}
            {data && options.showAppendix && (metrics.length > 5 || spec.history.length > 0) && <details className="r-supporting-detail"><summary>Supporting measures & monthly history <span>Explore the source detail</span></summary>
              {metrics.length > 5 && <div className="r-table-wrap"><table className="r-table"><thead><tr><th>Supporting measure</th><th>This month</th><th>MoM</th><th>YoY</th></tr></thead><tbody>{metrics.slice(5).map(id => <tr key={id}><td>{definition(id)?.label ?? id}</td><td>{fmt(id, data.total[id])}</td><td>{delta(id, data.total[id], data.prior[id])}</td><td>{delta(id, data.total[id], data.priorYear[id])}</td></tr>)}</tbody></table></div>}
              {!!spec.history.length && <MonthlyHistory key={options.historyMonths} initialPeriods={options.historyMonths} data={data} ids={spec.history} title={spec.nav}/>}</details>}
            {data && options.showSources && <details className="r-method-detail"><summary>Source & interpretation limits</summary>{data.notes?.map((note, i) => <p key={i}>{note}</p>)}<p>Source: {spec.source} · {data.n.toLocaleString('en-IN')} contributing records. Rankings use eligible samples. Comparisons use the previous month and the same month last year; unavailable values are a dash. See each breakdown’s sample note.</p></details>}
          </section>;
        })}
        <section className="r-source-basis"><h3>Reading the evidence</h3><p>Cash collections and attendance-attributed revenue have different bases. Renewal cohorts split each expiry month into renewed, lapsed and frozen memberships. Recorded lead stages are cohort positions, not historical stage transitions. Recent newcomer outcomes may still mature. Current membership snapshots describe the build date. Driver decompositions are arithmetic and do not prove cause; values at stake are indicative and can overlap.</p><details className="r-method-detail"><summary>Source snapshot freshness</summary>{model.sources?.map(source => <p key={source.key}><strong>{source.title}</strong> · {source.status}{source.stale ? ' · stale snapshot' : ''} · {source.fetchedAt ? new Date(source.fetchedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Refresh time unavailable'}</p>)}</details></section>
        <footer className="r-footer"><img src={logo} alt="Physique 57"/><div><strong>{model.scope.studio} / {monthLabel(model.scope.month)}</strong><p>{options.confidentiality ? `${options.confidentiality} · ` : ''}Immutable report snapshot · Built {built}</p></div></footer>
      </div>
    </article>;
  },
);
