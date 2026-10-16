import { useState } from 'react';
import type { ReportModel } from '../../../report/model';
import { definition, reportFmt } from '../../../report/definitions';
export function ReportMarquee({ model, exporting = false }: { model: ReportModel; exporting?: boolean }) {
  const [paused, setPaused] = useState(false);
  const ids = ['gross_revenue','attendance','fill_rate','buyers','new_clients'];
  const items = ids.flatMap(id => { const data = Object.values(model.chapters).find(chapter => chapter.total[id] != null); return data ? [{ label: definition(id)?.label || id, value: reportFmt(id, data.total[id]) }] : []; });
  if (!items.length) return null;
  return <section className="p57-report-marquee" data-paused={paused || exporting} aria-label="Report highlights"><div className="p57-marquee-viewport"><div className="p57-marquee-track">{[0,1].map(copy => <div key={copy} className="p57-marquee-sequence" aria-hidden={copy === 1 || undefined}>{items.map(item => <span key={item.label}><i aria-hidden="true">✦</i><b>{item.label}</b><strong>{item.value}</strong></span>)}<span className="p57-marquee-brand">PHYSIQUE 57 INDIA · {model.scope.month}</span></div>)}</div></div>{!exporting && <button type="button" data-export="omit" aria-label={paused ? 'Play highlights animation' : 'Pause highlights animation'} onClick={() => setPaused(value => !value)}>{paused ? 'Play' : 'Pause'}</button>}</section>;
}
