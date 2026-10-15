import { useState } from 'react';
import { Search } from 'lucide-react';
import type { ChapterData } from '../../../report/model';
import { reviewRows } from '../../../report/review';
import { monthLabel, shiftMonth } from '../../../report/period';
import { definition } from '../../../report/definitions';
import { useRecordDrilldown } from './RecordDrilldown';

export function MetricRegister({ chapter, data, month, exporting = false }: { chapter: string; data: ChapterData; month: string; exporting?: boolean }) {
  const [search, setSearch] = useState('');
  const drill = useRecordDrilldown();
  const rows = reviewRows(chapter, data);
  return <section className="cr-register" aria-label="Complete metric comparison register" data-metric-register>
    <header><div><span className="deck-eyebrow">Complete metric coverage</span><h3>Performance comparison register</h3><p>Frozen report figures · rate changes in percentage points · unavailable values shown as —</p></div>
      {!exporting && <label className="cr-search" data-export="omit"><Search size={15}/><input aria-label="Search chapter metrics" placeholder="Search metrics…" value={search} onChange={e => setSearch(e.target.value)}/></label>}</header>
    <div className="cr-table-scroll" role="region" aria-label="Metric comparisons" tabIndex={0}><table><thead><tr><th scope="col">Metric</th>{[monthLabel(month), monthLabel(shiftMonth(month, -1)), monthLabel(shiftMonth(month, -12)), 'MoM change', 'YoY change', `YTD ${month.slice(0,4)}`, 'YTD change'].map(h => <th scope="col" key={h}>{h}</th>)}<th scope="col">Definition</th></tr></thead>
      <tbody>{rows.filter(r => r.label.toLowerCase().includes(search.toLowerCase())).map(row => <tr key={row.id}><th scope="row">{!exporting && drill ? <button onClick={() => drill({ chapterId: chapter, metric: row.id })} title="Inspect source records">{row.label}</button> : row.label}</th>{row.values.map((v, i) => <td key={i}>{v}</td>)}<td><details><summary>Calculation</summary><p>{definition(row.id)?.description}</p></details></td></tr>)}</tbody></table></div>
    {!rows.some(r => r.label.toLowerCase().includes(search.toLowerCase())) && <p className="empty-state">No metrics match this search.</p>}
    <p className="cr-register-note">YTD uses the governed aggregate for the same elapsed calendar months, never an average of monthly rates. Metric links open source records; these may be live when no frozen records were saved.</p>
  </section>;
}
