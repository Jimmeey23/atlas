import { readingSpan } from "../../../report/reader";
import type { ReportModel } from '../../../report/model';
import { definition } from '../../../report/definitions';
import { EvidenceVisual } from './EvidenceVisual';
import { ReportProse } from './ReportProse';

export function MetricCommentary({ model, chapter, exporting = false }: { model: ReportModel; chapter: string; exporting?: boolean }) {
  const comments = model.narratives[chapter]?.metricCommentary;
  const data = model.chapters[chapter];
  if (!comments?.length || !data) return null;
  return <section className="rp-metric-review" aria-label="Detailed metric review"><header className="rp-section-heading"><span className="deck-eyebrow">Written performance review</span><h3>Reading the measures together</h3><p>Each interpretation is paired with the same measures from the frozen report.</p></header><div className="p57-adaptive-grid">{comments.map((item, i) => <article className="rp-analysis-panel rp-evidence-pair" key={i} data-reader-span={readingSpan({ columns: item.metricIds.length + 1, words: item.text.split(/\s+/).length })}>
    <div className="rp-panel-prose"><span className="rp-section-count">Review {String(i + 1).padStart(2, '0')}</span><h4>{item.metricIds.map(id => definition(id)?.label ?? id).join(' · ')}</h4><ReportProse text={item.text}/></div>
    <EvidenceVisual data={data} metrics={item.metricIds} month={model.scope.month} exporting={exporting} showCharts={model.customization?.showCharts !== false}/>
  </article>)}</div></section>;
}
