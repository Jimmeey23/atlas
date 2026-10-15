import { ArrowUpRight } from 'lucide-react';
import { HEADLINE } from '../Glance';
import { definition, reportFmt as fmt, reportDelta as delta } from '../../../report/definitions';
import { verdictCard } from '../../../report/brief';
import { reportOptions } from '../../../report/options';
import { builtLabel, monthLabel } from '../../../report/period';
import { reportedElsewhere } from '../../../report/ownership';
import type { DeckTab } from '../../../report/deck';
import type { Finding } from '../../../report/findings';
import type { ReportModel } from '../../../report/model';

/** Compact report identity and chapter scorecard; the full executive narrative follows. */
export function CoverPage({ model, tabs, ranked, onNavigate }: { model: ReportModel; tabs: DeckTab[]; ranked: Finding[]; onNavigate: (id: string) => void }) {
  const options = reportOptions(model.customization);
  const areas = tabs.filter(t => t.id !== "overview" && t.spec && !t.spec.derived && model.chapters[t.chapter]);
  const exec = verdictCard(model, 'executive-summary');
  return <div className="dk-cover">
    <header className="cr-cover-head">
      <span className="deck-eyebrow">Physique 57 India · Monthly studio intelligence</span>
      <h1>{model.customization?.title || 'Monthly performance report'}</h1>
      <p className="cr-cover-scope">{model.scope.studio} <span> / </span> {monthLabel(model.scope.month)}</p>
      {options.showCover && <><p>{model.customization?.subtitle || 'A comprehensive review of performance, the community journey and opportunities for the month ahead.'}</p>
      <dl className="cr-cover-meta"><div><dt>Evidence frozen</dt><dd>{builtLabel(model.builtAt)}</dd></div>{model.customization?.preparedFor && <div><dt>Prepared for</dt><dd>{model.customization.preparedFor}</dd></div>}{model.customization?.preparedBy && <div><dt>Prepared by</dt><dd>{model.customization.preparedBy}</dd></div>}<div><dt>Analysis</dt><dd>{Object.values(model.narratives).filter(n => n.generated).length} AI-written · {Object.values(model.narratives).filter(n => !n.generated).length} calculated chapters</dd></div></dl></>}
    </header>
    {exec && <section className="cr-month-verdict" aria-label="The month in one line"><span className="deck-eyebrow">Leadership reading</span><h2>{exec.headline}</h2><p>{exec.meaning}</p></section>}
    {options.showGlance && !!areas.length && <section aria-label="Scorecard"><div className="dk-section-head"><span className="deck-eyebrow">Performance at a glance</span><h3>Across the studio</h3></div>
      <div className="dk-scorecard">{areas.map((tab, index) => {
        const data = model.chapters[tab.chapter];
        // A measure another chapter of the same records reports is shown there, not here.
        const ids = [...new Set([...(HEADLINE[tab.chapter] ?? []), ...(tab.spec?.metrics ?? [])])].filter(id => definition(id) && data.total[id] != null && !(tab.spec && reportedElsewhere(tab.spec, id))).slice(0, 2);
        const verdict = verdictCard(model, tab.chapter);
        const move = (id: string, base: unknown) => {
          const a = Number(data.total[id]), b = Number(base);
          if (data.n === 0 || base == null || !Number.isFinite(a) || !Number.isFinite(b) || a === b) return { tone: "flat", arrow: "→" };
          return { tone: (a > b) === (definition(id)?.higherIsBetter ?? true) ? "good" : "bad", arrow: a > b ? "↑" : "↓" };
        };
        const lead = ids[0] ? move(ids[0], data.prior[ids[0]]).tone : "flat";
        return <button key={tab.id} type="button" className="dk-score" data-tone={lead} onClick={() => onNavigate(tab.id)} data-report-link={tab.id}><span className="dk-score-head"><span className="dk-score-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><b>{tab.label}</b><ArrowUpRight size={14}/></span><span className="dk-score-metrics">{ids.map(id => { const mom = move(id, data.prior[id]), yoy = move(id, data.priorYear[id]); return <span key={id}><small>{definition(id)?.label}</small><strong>{fmt(id, data.n > 0 ? data.total[id] : null)}</strong><span className="dk-score-deltas"><em data-tone={mom.tone}>{mom.arrow} {delta(id, data.n > 0 ? data.total[id] : null, data.prior[id])} <i>MoM</i></em><em data-tone={yoy.tone}>{yoy.arrow} {delta(id, data.n > 0 ? data.total[id] : null, data.priorYear[id])} <i>YoY</i></em></span></span>; })}</span>{verdict && <span className="dk-score-verdict">{verdict.headline}</span>}</button>;
      })}</div>
    </section>}
    {!model.narratives['executive-summary'] && !!ranked.length && <section className="cr-executive-summary"><h2>Calculated signals for review</h2><p>No executive narrative was saved. These signals come from the frozen figures.</p><ul>{ranked.slice(0, 4).map((f, i) => <li key={i}>{f.text}</li>)}</ul></section>}
  </div>;
}
