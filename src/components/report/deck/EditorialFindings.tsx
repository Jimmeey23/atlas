import type { InsightCard, ReportModel } from '../../../report/model';
import { reportOptions } from '../../../report/options';
import { definition, reportFmt, reportDelta } from '../../../report/definitions';
import { monthLabel, shiftMonth } from '../../../report/period';
import { lensLabel, lensOf } from '../Insight';
import { ReportProse } from './ReportProse';
import { useRecordDrilldown } from './RecordDrilldown';

/** One frozen breakdown per argument, with bounded rows and explicit omitted coverage. */
export function EditorialFindings({ model, chapter, items, exporting = false, sectionNumber }: {
  model: ReportModel; chapter: string; items: { card: InsightCard; index: number }[]; exporting?: boolean; sectionNumber?: number;
}) {
  const data = model.chapters[chapter];
  const options = reportOptions(model.customization);
  const drill = useRecordDrilldown();
  const shownTables = new Set<string>();
  return <div className="p57-editorial-findings">{items.map(({ card, index }, i) => {
    const table = data?.groups.find(group => (group.id ?? group.field) === card.focus);
    const tableKey = table ? (table.fields ?? [table.field]).join('+') : '';
    const showTable = options.showInlineEvidence && table && !shownTables.has(tableKey) && shownTables.size < 2;
    if (showTable) shownTables.add(tableKey);
    const columns = table ? [...new Set([...(card.metrics ?? []).filter(id => table.columns.includes(id)), ...(table.compare ? [table.compare] : []), ...table.columns])].slice(0, 4) : [];
    // Preserve source ranking while keeping explicitly cited rows in the visible excerpt.
    const rows = table ? [...table.rows.filter(row => card.highlight?.includes(String(row.g))), ...table.rows.filter(row => !card.highlight?.includes(String(row.g)))].slice(0, 10) : [];
    const unique = new Set<string>();
    const paragraph = (values: (string | undefined)[]) => values.filter((value): value is string => { if (!value?.trim() || unique.has(value.trim())) return false; unique.add(value.trim()); return true; }).join(' ');
    const paragraphs = [paragraph([card.meaning]), paragraph([card.evidence, card.driver, card.concentration]), paragraph([card.offset, card.trend])].filter(Boolean);
    return <article key={index} className="p57-editorial-finding" data-lens={lensOf(card)}>
      <h3><span>{sectionNumber == null ? i + 1 : `${sectionNumber}.${i + 1}`} · </span>{card.headline}</h3>
      <div className="p57-finding-meta"><span>{lensLabel(lensOf(card))}</span>{options.showConfidence && card.confidence && <span>{card.confidence} evidence confidence</span>}</div>
      {paragraphs.map((text, j) => <ReportProse key={j} text={text}/>)}
      {showTable && <figure className="p57-editorial-table"><figcaption>{table.title}</figcaption><div className="p57-table-scroll" role="region" tabIndex={0} aria-label={table.title}><table><thead><tr><th scope="col">{table.field.replaceAll('_', ' ')}</th>{columns.map(id => <th scope="col" key={id}>{definition(id)?.label ?? id}</th>)}{table.compare && <><th scope="col">MoM</th><th scope="col">YoY</th></>}</tr></thead><tbody>{rows.map((row, r) => <tr key={r}><th scope="row">{String(row.g ?? 'Unspecified')}</th>{columns.map(id => <td key={id}>{reportFmt(id, row[id])}</td>)}{table.compare && <><td>{reportDelta(table.compare, row[table.compare], table.prior?.[String(row.g)]?.[table.compare])}</td><td>{reportDelta(table.compare, row[table.compare], table.priorYear?.[String(row.g)]?.[table.compare])}</td></>}</tr>)}</tbody></table></div><p className="p57-table-note">{monthLabel(model.scope.month)}. MoM: {monthLabel(shiftMonth(model.scope.month, -1))}; YoY: {monthLabel(shiftMonth(model.scope.month, -12))}{table.compare ? ` · changes in ${definition(table.compare)?.label ?? table.compare}` : ''}. {rows.length} of {table.rows.length} stored rows shown{table.omitted ? `; ${table.omitted} eligible rows omitted from the stored ranking` : ''}. {table.minimum} Missing comparisons are unavailable.</p></figure>}
      {card.impact && <aside className="p57-editorial-callout"><b>Conditional value at stake</b><ReportProse text={card.impact}/></aside>}
      {options.includeActions && (card.action || card.recommendation) && <aside className="p57-editorial-callout" data-tone="action"><b>Proposed move</b><ReportProse text={card.action}/>{card.recommendation !== card.action && <ReportProse text={card.recommendation}/>}<small>{[card.ownerArea && `Proposed owner: ${card.ownerArea}`, card.horizon && `Review: ${card.horizon}`].filter(Boolean).join(' · ')}</small>{card.watch && <p><strong>Signal to watch:</strong> {card.watch}</p>}{card.priorActionResult && <p><strong>Prior action result:</strong> {card.priorActionResult}</p>}</aside>}
      {!options.includeActions && card.watch && <p><strong>Signal to watch:</strong> {card.watch}</p>}
      {!exporting && drill && card.metrics?.[0] && <button type="button" className="p57-evidence-link" data-export="omit" onClick={() => drill({ metric: card.metrics![0], chapterId: chapter, table, group: card.highlight?.[0] })}>Inspect source records for this finding ↗</button>}
    </article>;
  })}</div>;
}
