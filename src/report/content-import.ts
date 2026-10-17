import type {ReportEvidenceBlock} from './model';

/** Uploaded evidence stays separate from the governed studio datasets. */
export function validateContentBlock(block: ReportEvidenceBlock) {
  const evidence = block.attachment;
  if (!evidence || typeof evidence.name !== 'string' || !evidence.name || !/^[a-f0-9]{64}$/.test(evidence.sha256) || typeof evidence.excerpt !== 'string' || !evidence.excerpt.trim() || evidence.excerpt.length > 12000 || typeof evidence.importedAt !== 'string' || !Number.isFinite(Date.parse(evidence.importedAt))) throw new Error('Imported elements require a named source, fingerprint and evidence excerpt.');
  if (!['text','chart','table','metric','heatmap'].includes(block.kind) || !block.id || !block.title || block.dataChapterId) throw new Error('Invalid imported report element.');
  if (block.kind === 'text') { if (!block.text?.trim()) throw new Error('Text elements must contain content.'); return; }
  const columns = block.columns;
  if (!Array.isArray(columns) || !columns.length || columns.length > 20 || new Set(columns).size !== columns.length || columns.some(c => typeof c !== 'string' || !c || ['__proto__','constructor','prototype'].includes(c))) throw new Error('Choose 1–20 unique data columns.');
  if (!Array.isArray(block.rows) || !block.rows.length || block.rows.length > 500 || block.rows.some(row=>!row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Imported elements need 1–500 evidence rows.');
  const numbers = evidence.excerpt.replace(/,/g,'').match(/[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
  for (const row of block.rows) for (const column of columns) {
    const value = row[column];
    if (value !== null && typeof value !== 'string' && typeof value !== 'number') throw new Error('Imported cells must be text, numbers or null.');
    if (typeof value === 'number' && (!Number.isFinite(value) || !numbers.includes(value))) throw new Error(`A value in ${block.title} cannot be traced to its source excerpt. Use source values without inferred calculations.`);
  }
  if (block.kind !== 'table' && !columns.some(c => block.rows!.some(row => typeof row[c] === 'number'))) throw new Error('Visual elements require a measured numeric value.');
  if (block.kind === 'metric' && (block.rows.length !== 1 || !block.metricId || typeof block.rows[0][block.metricId] !== 'number')) throw new Error('Metric cards require one row and a numeric metric column.');
}
