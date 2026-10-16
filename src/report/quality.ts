import type { ChapterData, InsightCard, ReportModel } from './model';
import { definition, reportFmt, reportDelta } from './definitions';

const numberTokens = (text: string) => [...text.replace(/Physique\s*57|\bP57\b/gi, '').replaceAll(',', '').matchAll(/(?:₹\s*)?[-+−–]?\d+(?:\.\d+)?(?:\s*(?:%|pp|lakhs?(?![a-z])|crores?(?![a-z])|Cr(?![a-z])|L(?![a-z])))?/gi)].map(m => {
  const token = m[0].replace(/\s|₹|[+−–-]/g, '').toLowerCase().replace(/lakhs?/, 'l').replace(/crores?/, 'cr');
  return String(parseFloat(token)) + token.replace(/^[\d.]+/, '');
});
/** Parse JSON records before tokenizing: commas between array values are not thousands separators. */
function evidenceTokens(text: string): string[] {
  const collect = (value: unknown): string[] => {
    if (typeof value === 'number' || typeof value === 'string') return numberTokens(String(value));
    if (Array.isArray(value)) return value.flatMap(collect);
    if (value && typeof value === 'object') return Object.values(value).flatMap(collect);
    return [];
  };
  return text.split('\n').flatMap(line => {
    try { return collect(JSON.parse(line)); } catch { return numberTokens(line); }
  });
}

const unitScale: Record<string, number> = { l: 1e5, cr: 1e7 };
/** A token's value in base units, plus half its last displayed digit: the rounding a correct restatement may carry. */
function tokenValue(token: string) {
  const [, digits, unit] = token.match(/^([\d.]+)(.*)$/) ?? [];
  if (!digits) return null;
  const scale = unitScale[unit] ?? (unit === '%' || unit === 'pp' ? 0.01 : 1);
  const decimals = digits.split('.')[1]?.length ?? 0;
  return { value: parseFloat(digits) * scale, tolerance: 0.5 * 10 ** -decimals * scale, unit };
}
/** Supplied values in base units, sorted for lookup. Percent figures also stand as plain numbers. */
function suppliedValues(tokens: Iterable<string>) {
  const values: number[] = [];
  for (const token of tokens) {
    const t = tokenValue(token);
    if (!t) continue;
    values.push(t.value);
    if (t.unit === '%' || t.unit === 'pp') values.push(t.value * 100);
  }
  return values.sort((a, b) => a - b);
}
/** True when the claim is a rounding of a supplied value: ₹1.58Cr of 15812345, or 54.9% of a 0.5491 ratio. */
function roundsSupplied(token: string, values: number[]) {
  const t = tokenValue(token);
  if (!t) return false;
  const near = (target: number) => {
    let lo = 0, hi = values.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (values[mid] < target - t.tolerance) lo = mid + 1; else hi = mid; }
    return lo < values.length && values[lo] <= target + t.tolerance * (1 + 1e-9);
  };
  return near(t.value) || ((t.unit === '%' || t.unit === 'pp') && near(t.value * 100));
}

/** Fail closed for malformed references and uncited numeric evidence. Does not infer causal truth from prose. */
export function validateNarrativeCards(cards: InsightCard[], metricIds: string[], focusIds: string[], model: ReportModel, chapter: string, suppliedEvidence: string, observations: string[] = []) {
  const heads = new Set<string>();
  for (const card of cards) {
    if (!['kpis', 'trend', 'cross', ...focusIds].includes(card.focus ?? '')) throw new Error('Analysis cited an unavailable evidence table. Rewrite insights to retry.');
    if (card.metrics != null && (!Array.isArray(card.metrics) || card.metrics.some(id => !metricIds.includes(id)))) throw new Error('Analysis cited an unavailable metric. Rewrite insights to retry.');
    if (card.lens && !['win','risk','driver','opportunity','watch','next_step'].includes(card.lens)) throw new Error('Analysis used an invalid insight lens.');
    if (!['high','medium','low'].includes(card.confidence ?? '')) throw new Error('Analysis omitted a valid confidence level.');
    const head = card.headline.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (heads.has(head)) throw new Error('Analysis repeated a finding instead of adding a distinct insight.');
    heads.add(head);
    const data = model.chapters[chapter];
    const table = data?.groups.find(g => (g.id ?? g.field) === card.focus);
    if (card.highlight?.some(label => !table?.rows.some(row => String(row.g) === label))) throw new Error('Analysis highlighted a row absent from its cited evidence table.');
    // Raw evidence is supplemented with the exact displayed values and governed deltas, so INR abbreviations and rate changes are accepted.
    const formatted: string[] = [];
    const datasets: ChapterData[] = Object.values(model.chapters);
    for (const d of datasets) {
      formatted.push(String(d.history.length), String(d.n));
      const ids = metricIds;
      for (const id of ids) {
        if (!definition(id)) continue;
        for (const row of [d.total, d.prior, d.priorYear, d.yearToDate, d.priorYearToDate, ...d.history]) if (row?.[id] != null) formatted.push(reportFmt(id, row[id]));
        formatted.push(reportDelta(id, d.total[id], d.prior[id]), reportDelta(id, d.total[id], d.priorYear[id]));
        for (const group of d.groups) for (const row of group.rows) {
          formatted.push(reportFmt(id, row[id]), reportFmt(id, group.prior?.[String(row.g)]?.[id]), reportDelta(id, row[id], group.prior?.[String(row.g)]?.[id]), reportDelta(id, row[id], group.priorYear?.[String(row.g)]?.[id]));
        }
      }
    }
    const allowed = new Set(evidenceTokens(suppliedEvidence + '\n' + formatted.join(' ')));
    const observedText = [card.headline, card.meaning, card.driver, card.trend, card.concentration, card.offset, card.monthContext, card.yearContext, card.reasoning, ...observations].filter((text): text is string => typeof text === 'string').join(' ').split(/(?<=[.!?])\s+/).filter(sentence => !/\b(propos(?:ed|al)|target|hypothesis|hypotheses|scenario|if |could |might |may )/i.test(sentence)).join(' ');
    const values = suppliedValues(allowed);
    const unsupported = numberTokens(card.evidence + ' ' + observedText).filter(token => !allowed.has(token) && !roundsSupplied(token, values));
    if (unsupported.length) throw new Error(`Analysis included a numeric evidence claim not present in the supplied figures: ${[...new Set(unsupported)].join(', ')}. Use exact supplied values and units; do not calculate new observed claims.`);
    const causal = [card.meaning, card.driver, card.reasoning].filter(Boolean).join(' ').split(/(?<=[.!?])\s+/);
    if (causal.some(sentence => /\b(caused by|because of|due to|resulted in)\b/i.test(sentence) && !/\b(hypothesis|hypotheses|may|might|could|cannot establish|does not establish|not establish|not prove|check|test|verify)\b/i.test(sentence))) throw new Error('Analysis asserted an unverified cause. Rewrite insights to retry.');
  }
}
