import { REFERENCE_FORMAT, referenceTemplate, referenceReviewIssues } from './reference-standard.mjs';
/** Shared by generation, storage API and export. Population keys prevent comparing unlike scopes. */
export function reportReleaseIssues(report) {
  const issues = [];
  const selected = report.customization?.chapterIds ?? Object.keys(report.chapters ?? {});
  if (!selected.length) issues.push("No report chapters selected");
  if (report.customization?.generationFormat === REFERENCE_FORMAT && selected.some(id => !referenceTemplate(id))) issues.push('No supplied reference exists for one or more selected chapters; choose the flexible report format for those chapters');
  for (const id of selected) {
    const n = report.narratives?.[id];
    if (report.customization?.generationFormat === REFERENCE_FORMAT && referenceTemplate(id)) issues.push(...referenceReviewIssues(n?.referenceReview, id, { month: report.scope?.month, model: report }));
    if (id === 'executive-summary' && (n?.cards?.length < 3 || n?.cards?.length > 5)) issues.push('Executive brief requires three to five verdicts');
    const heads = new Set();
    for (const card of n?.cards ?? []) {
      const key = String(card.action || card.headline).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
      if (heads.has(key)) issues.push(`${id}: duplicate finding or recommendation`);
      heads.add(key);
      if (['executive-summary','recommendations'].includes(id)) {
        for (const field of ['meaning','action','ownerArea']) if (!card[field]?.trim() || /^[—–-]$/.test(card[field].trim())) issues.push(`${id}: missing ${field}`);
      }
      if (id === 'executive-summary') for (const field of ['meaning','driver','action']) {
        if (!card[field]?.trim() || card[field].trim().split(/\s+/).length>25) issues.push(`executive-summary: ${field} must be a concise verdict clause (up to 25 words)`);
      }
      if (id === 'recommendations' && card.impact && !/unavailable|cannot (?:estimate|calculate)|not (?:estimable|calculable)|\d[\s\S]*[–−-][\s\S]*\d/i.test(card.impact)) issues.push('recommendations: supported impact range or explicit evidence gap required');
      if (id === 'recommendations' && !/\d{4}-\d{2}-\d{2}/.test(card.horizon ?? '')) issues.push('recommendations: explicit deadline required');
      if (id === 'recommendations') for (const field of ['horizon','impact','watch','priorActionResult']) if (!card[field]?.trim()) issues.push(`${id}: missing ${field}`);
    }
    if (!n?.generated || n.error || !n.summary?.trim() || !n.cards?.length)
      issues.push(`${id}: narrative incomplete or failed${n?.error ? ` (${n.error})` : ""}`);
  }
  const walk = (value, path) => {
    if (typeof value === 'string' && /[{}]|Analysis unavailable|Failed to fetch/i.test(value)) issues.push(`${path}: unresolved template or failed analysis`);
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}.${i}`));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k,v]) => walk(v, `${path}.${k}`));
  };
  walk(report.narratives, 'narratives');
  // Guard the reported additive bridge even when it occurs in a derived prose chapter.
  const movementMetrics = {attendance: /attendance(?: by [\p{L} ]{1,35})? (?:moved|changed)\s*([+−–-]?[\d,]+(?:\.\d+)?)/giu};
  for (const [id,narrative] of Object.entries(report.narratives ?? {})) {
    for (const [metric,pattern] of Object.entries(movementMetrics)) {
      const source = report.chapters?.[id]?.total?.[metric] != null ? report.chapters[id] : report.chapters?.sessions;
      if(source?.total?.[metric] == null || source?.prior?.[metric] == null) continue;
      const text=[narrative.summary,...(narrative.cards ?? []).flatMap(c=>[c.headline,c.meaning,c.evidence,c.driver])].filter(Boolean).join(' ');
      for(const match of text.matchAll(pattern)) {
        const value=Number(match[1].replaceAll(',','').replace(/[−–]/g,'-'));
        if(Math.abs(value-(source.total[metric]-source.prior[metric]))>.5) issues.push(`${id}: ${metric} narrative change disagrees with frozen figures`);
      }
    }
  }
  const seen = new Map();
  for (const [id, chapter] of Object.entries(report.chapters ?? {})) {
    // Only an explicit, equal population may share a figure; network/expiry cohorts differ.
    if (!chapter.populationKey) continue;
    for (const period of ['total', 'prior', 'priorYear']) for (const [metric, value] of Object.entries(chapter[period] ?? {})) {
      if (metric === 'n' || value == null || typeof value !== 'number') continue;
      const key = `${chapter.populationKey}|${period}|${metric}`;
      const previous = seen.get(key);
      if (previous && Math.abs(previous.value - value) > 1e-8 * Math.max(1, Math.abs(value))) issues.push(`${id}: ${metric} disagrees with ${previous.id} (${value} vs ${previous.value})`);
      else seen.set(key, {id, value});
    }
    for (const group of chapter.groups ?? []) {
      const metric = group.analysis?.metric;
      if (metric && group.analysis.totalChange != null && chapter.total?.[metric] != null && chapter.prior?.[metric] != null && Math.abs(group.analysis.totalChange - (chapter.total[metric] - chapter.prior[metric])) > 0.01)
        issues.push(`${id}/${group.id ?? group.field}: ${metric} bridge disagrees with chapter change`);
    }
  }
  return [...new Set(issues)];
}
export function assertReportRelease(report) {
  const issues = reportReleaseIssues(report);
  if (issues.length) throw new Error(`Report quality gate failed:\n${issues.join('\n')}`);
}
export function assertRenderedReport(element) {
  const clone = element.cloneNode?.(true);
  clone?.querySelectorAll('style,script').forEach(node=>node.remove());
  const text = (clone ?? element).textContent ?? '';
  if (/[{}]|Analysis unavailable|Failed to fetch/i.test(text)) throw new Error('Report quality gate failed: unresolved output text.');
  for (const node of element.querySelectorAll('.deck-kpi-value, .metric-value, [data-kpi-value]')) {
    if (!node.textContent?.trim() || /^[—–-]$/.test(node.textContent.trim())) throw new Error('Report quality gate failed: empty KPI card.');
  }
}
