import { TrendingUp, TriangleAlert, ArrowRightCircle, LayoutDashboard, Users, CalendarClock, Eye } from "lucide-react";
import { chapters, chapterNumber, type ChapterSpec } from "../../report/chapters";
import { definition, reportFmt as fmt, reportDelta as delta } from "../../report/definitions";
import type { Finding } from "../../report/findings";
import type { InsightCard, ReportModel } from "../../report/model";
import { decisionBrief } from "../../report/decision-brief";
import { lensOf, Spark, tone } from "./Insight";

/** The one or two measures that best summarise each area on the scorecard. */
export const HEADLINE: Record<string, string[]> = {
  'executive-summary': ['attendance', 'fill_rate'],
  'revenue-performance': ['gross_revenue', 'aov'],
  'conversion-funnel': ['new_clients', 'conversion_rate'],
  leads: ['leads', 'lead_conversion_rate'],
  renewals: ['renewal_rate', 'lapsed'],
  lapsed: ['utilisation', 'churn_rate'],
  instructors: ['avg_class_size_incl', 'revenue_per_session'],
  'instructor-outcomes': ['payroll_conversion', 'payroll_retention'],
  formats: ['fill_rate', 'avg_class_size_incl'],
  sessions: ['fill_rate', 'empty_session_rate'],
  recurring: ['fill_rate', 'avg_class_size_incl'],
  'late-cancellations': ['booking_late_rate', 'booking_late_cancelled'],
  'community-attendance': ['unique_attendees', 'visits_per_member'],
  'website-marketing': ['leads', 'website_win_rate'],
  'meta-marketing': ['meta_spend', 'meta_cpl'],
};

const rank = { high: 0, medium: 1, low: 2 } as const;
type Pick = { card: InsightCard; spec: ChapterSpec };

function picks(model: ReportModel, specs: ChapterSpec[], lenses: string[]): Pick[] {
  return specs.flatMap(spec => (model.narratives[spec.id]?.generated ? model.narratives[spec.id].cards : []).map(card => ({ card, spec })))
    .filter(p => lenses.includes(lensOf(p.card)))
    .sort((a, b) => rank[a.card.priority ?? 'medium'] - rank[b.card.priority ?? 'medium']);
}

/** One page a leader can read in two minutes: the verdict, every area's scorecard, and what to act on. */
export function AtAGlance({ model, specs, ranked, targets }: { model: ReportModel; specs: ChapterSpec[]; ranked: Finding[]; targets?: Record<string, number> }) {
  const brief = model.narratives['executive-summary'];
  const verdict = brief?.cards.find(c => c.focus === 'kpis') ?? brief?.cards[0];
  const areas = specs.filter(spec => !spec.derived && model.chapters[spec.id]?.n);
  const wins = picks(model, specs.filter(s => s.id !== 'recommendations'), ['win', 'opportunity']).slice(0, 3);
  const risks = picks(model, specs.filter(s => s.id !== 'recommendations'), ['risk', 'watch']).slice(0, 3);
  const moves = picks(model, chapters.filter(c => c.id === 'recommendations'), ['next_step']).slice(0, 4);
  const fallbackWins = wins.length ? [] : ranked.filter(f => f.tone === 'opportunity').slice(0, 3);
  const fallbackRisks = risks.length ? [] : ranked.filter(f => f.tone === 'risk').slice(0, 3);
  const nav = (id: string) => chapters.find(c => c.id === id)?.nav ?? id;
  return <section className="r-container r2-glance" id="at-a-glance" aria-labelledby="glance-title">
    <header className="r2-glance-head">
      <span className="r-eyebrow"><LayoutDashboard size={12}/> The month at a glance</span>
      <h2 id="glance-title">{verdict?.headline ?? `${model.scope.studio}: performance scorecard`}</h2>
      {(brief?.summary || verdict?.meaning) && <p>{brief?.summary || verdict?.meaning}</p>}
    </header>
    {!!areas.length && <div className="r2-scorecard" role="list">
      {areas.map(spec => {
        const data = model.chapters[spec.id];
        const ids = [...(HEADLINE[spec.id] ?? []), ...spec.metrics].filter((id, i, all) => all.indexOf(id) === i && definition(id) && data.total[id] != null).slice(0, 2);
        if (!ids.length) return null;
        const tones = ids.map(id => tone(id, data.total[id], data.prior[id]));
        const status = tones.every(t => t === 'up') ? 'good' : tones.every(t => t === 'down') ? 'bad' : 'mixed';
        const verdictCard = model.narratives[spec.id]?.cards.find(c => c.focus === 'kpis');
        return <a role="listitem" className="r2-score" href={`#${spec.id}`} key={spec.id} data-status={status}>
          <span className="r2-score-head"><b>{spec.nav}</b><i aria-label={`Overall ${status}`}/></span>
          {ids.map(id => {
            const target = targets?.[id];
            return <span className="r2-score-metric" key={id}>
              <small>{definition(id)?.label}</small>
              <strong>{fmt(id, data.total[id])}</strong>
              <em data-tone={tone(id, data.total[id], data.prior[id])}>MoM {delta(id, data.total[id], data.prior[id])}</em>
              <em data-tone={tone(id, data.total[id], data.priorYear[id])}>YoY {delta(id, data.total[id], data.priorYear[id])}</em>
              {target != null && <em data-tone={(Number(data.total[id]) >= target) === (definition(id)?.higherIsBetter ?? true) ? 'up' : 'down'}>Target {fmt(id, target)}</em>}
            </span>;
          })}
          <Spark id={ids[0]} history={data.history.slice(-12)} width={160} height={28} />
          {verdictCard && <span className="r2-score-verdict">{verdictCard.headline}</span>}
        </a>;
      })}
    </div>}
    <div className="r3-overview" aria-label="Leadership decision brief">
      {[
        {title:"Where we're losing ground",icon:TrendingUp,pick:risks[0],fallback:fallbackRisks[0],kind:'decline'},
        {title:'What needs immediate attention',icon:TriangleAlert,pick:risks[1] || moves[0] || risks[0],fallback:fallbackRisks[1],kind:'attention'},
        {title:'Recovery opportunity to prioritise',icon:ArrowRightCircle,pick:picks(model,specs.filter(s=>s.id !== 'recommendations'),['opportunity'])[0] || risks[0] || wins[0],fallback:fallbackWins[0],kind:'opportunity'},
      ].map(({title,icon:Icon,pick,fallback,kind})=><section key={kind} data-kind={kind}>
        <h3><Icon size={18}/>{title}</h3>
        {pick ? <a href={`#${pick.spec.id}`}><b>{pick.card.headline}</b><p>{kind === 'opportunity' ? decisionBrief(pick.card)?.opportunity || pick.card.meaning : pick.card.meaning}</p></a>
          : fallback ? <a href={`#${fallback.chapter}`}><b>{fallback.text.split('. ')[0]}</b><p>{fallback.text}</p></a>
          : <p>No supported finding is available for this brief.</p>}
      </section>)}
    </div>
  </section>;
}

/** Recommendations as a plan a meeting can work through. */
export function ActionPlan({ cards }: { cards: InsightCard[] }) {
  const rows = [...cards].sort((a, b) => rank[a.priority ?? 'medium'] - rank[b.priority ?? 'medium']);
  if (!rows.length) return null;
  return <div className="r2-plan">
    <div className="r2-plan-head"><span className="r-eyebrow">Action plan</span><h3>{rows.length} moves, in priority order</h3><p>Owner areas and horizons are proposals for discussion. Values at stake are indicative and can overlap; do not add them up.</p></div>
    <div className="r-table-wrap"><table className="r-table r2-plan-table">
      <thead><tr><th>#</th><th>Move</th><th>Why</th><th>Owner</th><th>When</th><th>Recovery / scaling potential</th><th>Success signal & target</th></tr></thead>
      <tbody>{rows.map((card, i) => <tr key={i} data-priority={card.priority ?? 'medium'}>
        <td><span className="r2-plan-no">{chapterNumber(i)}</span><small className="r2-tag" data-priority={card.priority ?? 'medium'}>{card.priority ?? 'medium'}</small></td>
        <td><b>{card.headline}</b>{decisionBrief(card)?.steps.length ? <ol>{decisionBrief(card)!.steps.map((step,j)=><li key={j}><b>{step.label}: </b>{step.detail}</li>)}</ol> : <p>{card.action}</p>}</td>
        <td>{card.recommendation || card.meaning}</td>
        <td>{card.ownerArea ? <span className="r2-inline"><Users size={11}/>{card.ownerArea}</span> : '—'}</td>
        <td>{card.horizon ? <span className="r2-inline"><CalendarClock size={11}/>{decisionBrief(card)?.review || card.horizon}</span> : '—'}</td>
        <td>{decisionBrief(card)?.opportunity || card.impact || '—'}</td>
        <td>{(decisionBrief(card)?.success || card.watch) ? <span className="r2-inline"><Eye size={11}/>{decisionBrief(card)?.success || card.watch}</span> : '—'}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
