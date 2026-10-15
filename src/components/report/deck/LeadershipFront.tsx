import type { ReportModel } from '../../../report/model';
import { definition, reportFmt } from '../../../report/definitions';
import { reportReleaseIssues } from '../../../report/release-gate.mjs';

export function LeadershipFront({ model }: { model: ReportModel }) {
  const cards = model.narratives['executive-summary']?.cards.slice(0,5) ?? [];
  const seen = new Set<string>();
  const scorecard = Object.values(model.chapters).flatMap(data => Object.keys(data.total).filter(id => {
    if (!definition(id) || seen.has(id) || !['gross_revenue','transactions','attendance','fill_rate','lead_conversion_rate'].includes(id)) return false;
    seen.add(id); return true;
  }).map(id => ({id,data})));
  const bridge=model.intelligence?.tables.find(t=>t.title==='Member-base bridge')?.rows[0];
  const issues = reportReleaseIssues(model);
  return <section className="leadership-front" aria-label="One-page leadership brief">
    <header><span className="deck-eyebrow">Leadership decision brief · {model.scope.month}</span><h1>{model.scope.studio}</h1><p>Evidence frozen {model.builtAt.slice(0,10)} · {issues.length ? 'Draft · quality gate blocked' : 'Quality gate passed'}</p></header>
    {cards.length < 3 && <p role="status">Awaiting three to five complete leadership verdicts.</p>}
    <ol className="leadership-verdicts">{cards.map((c,i)=><li key={i}><h2>{c.headline}</h2><p><b>So what:</b> {c.meaning}</p><p><b>Why:</b> {c.driver || c.evidence}</p><p><b>Action:</b> {c.action} <strong>Owner: {c.ownerArea || 'Unassigned'}</strong></p></li>)}</ol>
    <div className="intelligence-scroll"><table><caption>KPI scorecard against approved targets</caption><thead><tr><th>KPI</th><th>Actual</th><th>Target</th><th>RAG</th></tr></thead><tbody>{scorecard.map(({id,data})=>{
      const target=model.customization?.targets?.[id],actual=data.total[id],known=actual!=null&&Number.isFinite(Number(actual));
      const favorable=known&&target!=null&&((Number(actual)>=target)===(definition(id)?.higherIsBetter??true));
      const gap=known&&target!=null?Math.abs(Number(actual)-target)/Math.max(Math.abs(target),.000001):null;
      const rag=!known||target==null?'Unrated':favorable?'Green':gap!=null&&gap<=.1?'Amber':'Red';
      return <tr key={id}><th>{definition(id)?.label}</th><td>{known?reportFmt(id,actual):'Unavailable'}</td><td>{target==null?'Not set':reportFmt(id,target)}</td><td data-rag={rag}>{rag}</td></tr>;
    })}{bridge && <><tr><th>Closing paid active members</th><td>{bridge[4]}</td><td>Not set</td><td data-rag="Unrated">Unrated</td></tr><tr><th>Whole-base monthly logo churn</th><td>{typeof bridge[5]==='number'?`${(bridge[5]*100).toFixed(1)}%`:'Unavailable'}</td><td>Not set</td><td data-rag="Unrated">Unrated</td></tr></>}</tbody></table></div><small>Green: target met. Amber: adverse gap up to 10% of target. Red: larger adverse gap. Missing target or evidence is Unrated.</small>
  </section>;
}

export function IntelligenceAppendix({ model }: { model: ReportModel }) {
  const intelligence=model.intelligence;
  if(!intelligence)return <p className="notice">Regenerate this report to calculate fixed-window cohorts, revenue quality, member-base and operational controls from one frozen source snapshot.</p>;
  return <section className="intelligence-appendix"><h2>Operational intelligence & data hygiene</h2><p>As of {intelligence.asOf}. Small samples (fewer than 30 observations) are exploratory. Missing evidence remains unavailable.</p>
    {intelligence.tables.map(table=><section key={table.title}><div className="intelligence-scroll"><table><caption>{table.title}</caption><thead><tr>{table.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{table.rows.map((row,i)=><tr key={i}>{row.map((value,j)=><td key={j} className={value==='Maturing'?'cohort-maturing':''}>{value==null?'Unavailable':typeof value==='number'?(/share|MoM|logo churn|fill/i.test(table.columns[j]) ? `${(value*100).toFixed(1)}%` : value.toLocaleString('en-IN',{maximumFractionDigits:2})):value}</td>)}</tr>)}</tbody></table></div><p>{table.note}</p></section>)}
    <h3>Evidence required to complete the picture</h3><ul>{intelligence.unavailable.map(note=><li key={note}>{note}</li>)}</ul>
  </section>;
}
