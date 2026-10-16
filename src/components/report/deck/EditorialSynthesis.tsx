import type { ReportModel } from '../../../report/model';
import type { DeckTab } from '../../../report/deck';
import { actionReviewWindow } from '../../../report/editorial';
import { lensOf } from '../Insight';
import { reportOptions } from '../../../report/options';
import { ReportProse } from './ReportProse';

/** Cross-chapter registers reuse reviewed arguments; they do not manufacture new claims. */
export function EditorialSynthesis({ model, tabs }: { model: ReportModel; tabs: DeckTab[] }) {
  const options = reportOptions(model.customization);
  const findings = tabs.filter(tab => tab.id !== 'overview' && !['executive-summary', 'recommendations', 'predictions'].includes(tab.chapter))
    .flatMap(tab => (model.narratives[tab.chapter]?.cards ?? []).filter(card => card.focus !== 'kpis').map(card => ({ card, tab })));
  const causes = findings.filter(({ card }) => card.driver && ['risk', 'driver', 'watch'].includes(lensOf(card))).slice(0, 6);
  const opportunities = findings.filter(({ card }) => card.impact && lensOf(card) === 'opportunity').slice(0, 5);
  const recommendations = tabs.some(tab => tab.chapter === 'recommendations') ? model.narratives.recommendations?.cards.filter(card => card.action) ?? [] : [];
  if (!causes.length && !opportunities.length && !recommendations.length) return null;
  return <section className="p57-review-synthesis" id="report-investigation" aria-label="Cross-chapter investigation and recovery review">
    {!!causes.length && <section><h2>Root-cause investigation</h2><p>These are the supplied drivers and competing explanations to investigate. Associations and arithmetic contributions do not establish cause.</p><div className="p57-editorial-table"><div className="p57-table-scroll" role="region" tabIndex={0} aria-label="Root-cause evidence register"><table><thead><tr><th scope="col">Observed finding</th><th scope="col">Driver / explanation to test</th><th scope="col">Counter-evidence</th><th scope="col">Review signal</th></tr></thead><tbody>{causes.map(({ card, tab }, i) => <tr key={i}><th scope="row"><a href={`#chapter-${tab.id}`}>{card.headline}</a></th><td>{card.driver}</td><td>{card.offset || 'No counter-signal supplied; explanation remains unverified.'}</td><td>{card.watch || 'Investigation check to agree.'}</td></tr>)}</tbody></table></div></div></section>}
    {options.quantifyImpact && !!opportunities.length && <section><h2>Recovery opportunities</h2><p>Conditional operating opportunities from the chapter evidence. Values can overlap and must not be added together.</p>{opportunities.map(({ card, tab }, i) => <aside className="p57-editorial-callout" key={i}><b>{card.headline}</b><ReportProse text={card.impact}/><a href={`#chapter-${tab.id}`}>Read the assumptions and supporting evidence ↗</a></aside>)}</section>}
    {options.showActionPlan && !!recommendations.length && <section id="report-review-plan"><h2>Proposed 30 / 60 / 90-day review plan</h2><p>Review windows follow each proposed date relative to the evidence freeze. An empty window has no proposed action; timings require agreement.</p>{['First 30 days', 'Days 31–60', 'Days 61–90', 'Beyond 90 days', 'Review timing to agree', 'Review date precedes evidence freeze'].map(window => {
      const cards = recommendations.filter(card => actionReviewWindow(card.horizon, model.builtAt) === window);
      return cards.length ? <section key={window}><h3>{window}</h3><ol>{cards.map((card, i) => <li key={i}><strong>{card.action}</strong><p>Proposed owner: {card.ownerArea || 'To agree'} · Review: {card.horizon || 'To agree'}</p><p>Success measure: {card.watch || 'To agree'}</p></li>)}</ol></section> : null;
    })}</section>}
  </section>;
}
