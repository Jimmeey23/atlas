import type {ReportEvidenceBlock} from './model';

/** Read literal numbers without joining comma-delimited lists or changing units. */
export function sourceNumbers(excerpt: string): number[] {
  try {
    const parsed = JSON.parse(excerpt);
    if (parsed && typeof parsed === 'object') {
      const collect = (value: unknown): number[] => typeof value === 'number' ? [value] : typeof value === 'string' ? sourceNumbers(value) : value && typeof value === 'object' ? Object.values(value).flatMap(collect) : [];
      return collect(parsed);
    }
  } catch { /* Most excerpts are document text, not JSON. */ }
  const normalized = excerpt.replace(/−/g, '-').replace(/(\d)[–—-](?=\d)/g, '$1 ');
  const tokens = normalized.match(/[+-]?(?:(?:(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?!,\d)|\d+)(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
  return tokens.map(token => Number(token.replace(/,/g, ''))).filter(Number.isFinite);
}

/** Uploaded evidence stays separate from the governed studio datasets. */
export function validateContentBlock(block: ReportEvidenceBlock) {
  const evidence = block.attachment;
  if (!evidence || typeof evidence.name !== 'string' || !evidence.name || !/^[a-f0-9]{64}$/.test(evidence.sha256) || typeof evidence.excerpt !== 'string' || !evidence.excerpt.trim() || evidence.excerpt.length > 12000 || typeof evidence.importedAt !== 'string' || !Number.isFinite(Date.parse(evidence.importedAt))) throw new Error('Imported elements require a named source, fingerprint and evidence excerpt.');
  if (!['text','chart','table','metric','heatmap'].includes(block.kind) || !block.id || !block.title || block.dataChapterId) throw new Error('Invalid imported report element.');
  if (block.kind === 'text') { if (!block.text?.trim()) throw new Error('Text elements must contain content.'); return; }
  const columns = block.columns;
  if (!Array.isArray(columns) || !columns.length || columns.length > 20 || new Set(columns).size !== columns.length || columns.some(c => typeof c !== 'string' || !c || ['__proto__','constructor','prototype'].includes(c))) throw new Error('Choose 1–20 unique data columns.');
  if (!Array.isArray(block.rows) || !block.rows.length || block.rows.length > 500 || block.rows.some(row=>!row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Imported elements need 1–500 evidence rows.');
  const numbers = sourceNumbers(evidence.excerpt);
  for (const [rowIndex, row] of block.rows.entries()) for (const column of columns) {
    const value = row[column];
    if (value !== null && typeof value !== 'string' && typeof value !== 'number') throw new Error('Imported cells must be text, numbers or null.');
    if (typeof value === 'number' && (!Number.isFinite(value) || !numbers.includes(value))) throw Object.assign(new Error(`Value ${value} in “${block.title}”, row ${rowIndex + 1}, column “${column}”, cannot be traced to its source excerpt. Use source values without inferred calculations.`), { code: 'IMPORT_VALUE_NOT_IN_SOURCE', row: rowIndex + 1, column, value });
  }
  if (block.kind !== 'table' && !columns.some(c => block.rows!.some(row => typeof row[c] === 'number'))) throw new Error('Visual elements require a measured numeric value.');
  if (block.kind === 'metric' && (block.rows.length !== 1 || !block.metricId || typeof block.rows[0][block.metricId] !== 'number')) throw new Error('Metric cards require one row and a numeric metric column.');
}
