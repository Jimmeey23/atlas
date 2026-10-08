import logo from '../../assets/report/logo.png';
import { forwardRef } from 'react';
import { chapters, chapterNumber } from '../../report/chapters';
import { monthLabel } from '../../report/compute';
import { definition, reportFmt as fmt, reportDelta as delta } from '../../report/definitions';
import type { ChapterNarrative, ReportModel } from '../../report/model';
import { InsightPane, MetricCards, SectionHeader, MonthlyHistory } from './kit';
import { ReferenceHero } from './ReportChrome';
import { CriterionEvidence, EvidenceBlock, TrendEvidence } from './ReportEvidence';

/** Layout consumes the frozen engine snapshot; interactive views never recompute its figures. */
export const ReportDocument = forwardRef<HTMLElement, { model: ReportModel; theme: 'light' | 'dark' }>(
  function ReportDocument({ model, theme }, ref) {
    const built = new Date(model.builtAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const available = chapters.filter(spec => model.chapters[spec.id] || model.narratives[spec.id]);
    const aiCount = Object.values(model.narratives).filter(n=>n.generated).length;
    const select = (narrative: ChapterNarrative | undefined, focus: string) => narrative ? {
      ...narrative, summary:'', cards:narrative.generated ? narrative.cards.filter(card=>card.focus===focus).slice(0,1) : [],
    } : undefined;
    return <article className="report-doc" data-report-theme={theme} ref={ref}>
      <div className="r-page-frame" aria-hidden="true"/>
      <div className="r-topbar"><a className="r-brand" href="#report-cover"><img src={logo} alt="Physique 57"/><span>Studio intelligence<small>{model.scope.studio} · {monthLabel(model.scope.month)}</small></span></a><nav aria-label="Chapter navigation">{available.map(spec=><a key={spec.id} href={`#${spec.id}`}>{spec.nav}</a>)}</nav></div>
      <ReferenceHero studio={model.scope.studio} period={monthLabel(model.scope.month)} built={built} aiCount={aiCount} total={available.length} highlights={[
        ['revenue-performance','gross_revenue'],['conversion-funnel','new_clients'],['executive-summary','fill_rate'],['renewals','renewal_rate']
      ].flatMap(([chapter,id])=>model.chapters[chapter]?.total[id]!=null ? [{label:definition(id)?.label ?? id,value:fmt(id,model.chapters[chapter].total[id])}] : [])}/>
      <nav className="r-container r-contents" aria-label="Report contents">{available.map((spec,index)=><a key={spec.id} href={`#${spec.id}`}><span>{chapterNumber(index)}</span><b>{spec.nav}</b></a>)}</nav>
      <div className="r-container">
        {available.map((spec,index)=>{
          const data=model.chapters[spec.id], narrative=model.narratives[spec.id];
          const statement = narrative?.generated ? narrative.cards.find(card=>card.focus==='kpis') ?? narrative.cards[0] : undefined;
          const groups=data?.groups ?? [];
          // Instructor scorecards already contain all ranking measures. Keep the alternatives in one criterion switch.
          const rankingGroups = spec.id==='instructors' ? groups.filter(g=>g.id?.startsWith('trainer-')) : [];
          const shownGroups=groups.filter(g=>!rankingGroups.includes(g));
          let openHalf = -1; const fullGroups = new Set<number>();
          shownGroups.forEach((g,i)=>{ if(g.columns.length>5) { if(openHalf>=0)fullGroups.add(openHalf); openHalf=-1; } else if(openHalf<0)openHalf=i; else openHalf=-1; });
          if(openHalf>=0)fullGroups.add(openHalf);
          const focusedIds=new Set(['kpis','trend',...groups.map(g=>g.id ?? g.field)]);
          const extra = narrative?.generated ? narrative.cards.filter(card=>!focusedIds.has(card.focus ?? '')).slice(0,2) : [];
          const lead = spec.derived ? narrative?.cards.filter(card=>card !== statement).slice(0,4) ?? [] : narrative?.generated ? narrative.cards.filter(card=>card.focus==='kpis' && card !== statement).slice(0,1) : [];
          const priorities: Record<string,string[]> = {
            'revenue-performance':['gross_revenue','net_revenue','transactions','aov','membership_rev_share'],
            'conversion-funnel':['new_clients','conversion_rate','retention_rate','zero_return_rate','avg_ltv'],
            leads:['leads','converted_leads','lead_conversion_rate','untouched_leads','response_time_hours'],
            lapsed:['memberships_count','utilisation','churn_rate','remaining_sessions','revenue_at_risk_30d'],
            instructors:['sessions','avg_class_size_incl','fill_rate','revenue_per_session','draw_premium_pp'],
            'instructor-outcomes':['new_handled','payroll_conversion','payroll_retention','payroll_revenue','contribution_margin'],
            sessions:['sessions','attendance','fill_rate','empty_session_rate','unsold_seats'],
            'late-cancellations':['bookings','booking_late_cancelled','booking_late_rate','booking_no_shows','booking_no_show_rate'],
          };
          const metrics=[...new Set([...(priorities[spec.id] ?? []),...spec.metrics])].filter(id=>data?.total[id]!=null);
          return <section className="r-section" id={spec.id} key={spec.id}>
            <SectionHeader number={chapterNumber(index)} total={available.length} topic={spec.title} eyebrow={spec.eyebrow} title={statement?.headline || spec.title} deck={narrative?.generated ? narrative.summary : spec.deck} highlights={data ? spec.metrics.filter(id=>data.total[id]!=null).slice(0,3).map(id=>({label:definition(id)?.label ?? id,value:fmt(id,data.total[id])})) : narrative?.generated ? narrative.cards.slice(0,2).map(card=>({label:'Decision signal',value:card.headline})) : []} id={`${spec.id}-title`}/>
            {!narrative?.generated && <p className="r-analysis-note">AI interpretation unavailable for this snapshot. {narrative?.error ? 'Rewrite insights to retry.' : 'Generate insights to add a decision brief.'} Recorded figures remain available.</p>}
            {!spec.derived && (!data || !data.n) && <p className="r-empty">No selected-month source records. This is unavailable data, not a result of zero.</p>}
            {data && <MetricCards ids={metrics.slice(0,5)} total={data.total} prior={data.prior} priorYear={data.priorYear} history={data.history}/>}
            {spec.derived && statement && <InsightPane title="Priority decision" narrative={narrative ? {...narrative,summary:"",cards:[statement]} : undefined}/>}
            {!spec.derived && statement?.action && <p className="r-management-move"><span>Management move</span>{statement.action}</p>}
            {!!lead.length && <InsightPane title="Management reading" narrative={narrative ? {...narrative,summary:'',cards:lead} : undefined}/>}
            {data && <TrendEvidence history={data.history} ids={spec.history} title={`${spec.nav} · monthly trajectory`} narrative={select(narrative,'trend')}/>}
            <div className="r-evidence-grid">{shownGroups.map((table,i)=><EvidenceBlock full={fullGroups.has(i)} key={table.id ?? table.field} table={table} narrative={select(narrative,table.id ?? table.field)}/>)}
              {!!rankingGroups.length && <CriterionEvidence tables={rankingGroups} narrative={narrative}/>}</div>
            {!!extra.length && <InsightPane title="Operating implications" narrative={narrative ? {...narrative,summary:'',cards:extra} : undefined}/>}
            {data && (metrics.length>5 || spec.history.length>0) && <details className="r-supporting-detail"><summary>Supporting measures & monthly history <span>Explore the source detail</span></summary>
              {metrics.length>5 && <div className="r-table-wrap"><table className="r-table"><thead><tr><th>Supporting measure</th><th>This month</th><th>MoM</th><th>YoY</th></tr></thead><tbody>{metrics.slice(5).map(id=><tr key={id}><td>{definition(id)?.label ?? id}</td><td>{fmt(id,data.total[id])}</td><td>{delta(id,data.total[id],data.prior[id])}</td><td>{delta(id,data.total[id],data.priorYear[id])}</td></tr>)}</tbody></table></div>}
              {!!spec.history.length && <MonthlyHistory data={data} ids={spec.history} title={spec.nav}/>}</details>}
            {data && <details className="r-method-detail"><summary>Source & interpretation limits</summary>{data.notes?.map((note,i)=><p key={i}>{note}</p>)}<p>Source: {spec.source} · {data.n.toLocaleString('en-IN')} contributing records. Rankings use eligible samples. Comparisons use the previous month and the same month last year; unavailable values are a dash. See each breakdown’s sample note.</p></details>}
          </section>;
        })}
        <section className="r-source-basis"><h3>Reading the evidence</h3><p>Cash collections and attendance-attributed revenue have different bases. Renewal cohorts split each expiry month into renewed, lapsed and frozen memberships. Instructor economics use the configured rate, not actual salaries. Recorded lead stages are cohort positions, not historical stage transitions. Recent newcomer outcomes may still mature. Current membership snapshots describe the build date.</p><details className="r-method-detail"><summary>Source snapshot freshness</summary>{model.sources?.map(source=><p key={source.key}><strong>{source.title}</strong> · {source.status}{source.stale ? ' · stale snapshot' : ''} · {source.fetchedAt ? new Date(source.fetchedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : 'Refresh time unavailable'}</p>)}</details></section>
        <footer className="r-footer"><img src={logo} alt="Physique 57"/><div><strong>{model.scope.studio} / {monthLabel(model.scope.month)}</strong><p>Evidence → Interpretation → Action · Immutable report snapshot · Built {built}</p></div></footer>
      </div>
    </article>;
  },
);
