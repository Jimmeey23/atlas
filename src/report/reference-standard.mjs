import { parseFragment, serializeOuter } from 'parse5';
import initialTemplates from './reference-contracts.json' with { type: 'json' };
// Vite substitutes an empty module: the browser receives contracts only after API authentication.
let templates = initialTemplates;
export function setReferenceTemplates(value) {
  if (!Array.isArray(value)) throw new Error('Invalid reference contracts');
  templates = value;
}

export const REFERENCE_FORMAT = 'reference-v1';
export const REFERENCE_CHAPTERS = ['instructors', 'sessions', 'revenue-performance'];
export function referenceTemplate(id, month) {
  const template = templates.find(template => template.id === id);
  if (!template || !month || month === '2026-09' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return template;
  const date = new Date(`${month}-01T12:00:00Z`), year = Number(month.slice(0, 4));
  const name = (offset, style) => new Date(Date.UTC(year, date.getUTCMonth() + offset, 1)).toLocaleDateString('en-IN', { month: style, timeZone: 'UTC' });
  const shift = value => value.replace(/\b(September|Sept|Sep|Jun|Aug|2026|2025)\b/g, token => token === '2026' ? String(year) : token === '2025' ? String(year - 1) : name(token === 'Jun' ? -3 : token === 'Aug' ? -1 : 0, token === 'September' ? 'long' : 'short'));
  return { ...template, coverHtml: shift(template.coverHtml), sections: template.sections.map(section => ({ ...section, title: shift(section.title), subheadings: section.subheadings.map(shift), tableHeaders: section.tableHeaders.map(headers => headers.map(shift)), layout: shift(section.layout) })) };
}
const children = node => node.childNodes ?? [];
const all = node => [node, ...children(node).flatMap(all)];
const text = node => node.nodeName === '#text' ? node.value : children(node).map(text).join(' ');
const byTag = (root, tag) => all(root).filter(node => node.tagName === tag);
const normal = value => String(value).replace(/\s+/g, ' ').trim();
export const htmlText = html => normal(text(parseFragment(html)));
const visibleText = node => ['style', 'script', 'title', 'desc'].includes(node.tagName) ? '' : node.nodeName === '#text' ? node.value : children(node).map(visibleText).join(' ');
export const wordCount = html => normal(visibleText(parseFragment(html))).split(/\s+/).filter(Boolean).length;
const allowedTags = new Set('section div span h2 h3 h4 p b strong em i br ul ol li dl dt dd code table thead tbody tfoot tr th td figure figcaption svg g title desc rect line path circle polyline polygon text tspan'.split(' '));
const allowedAttrs = new Set('class id role aria-label aria-hidden colspan rowspan scope style viewBox viewbox xmlns width height x y x1 y1 x2 y2 cx cy r rx ry d points fill stroke stroke-width stroke-dasharray stroke-linecap stroke-linejoin font-family font-size font-weight text-anchor transform opacity fill-opacity stroke-opacity preserveAspectRatio'.split(' '));
function layoutSignature(node) {
  const tags = new Set(['section', 'div', 'figure', 'h2', 'h3', 'h4', 'table', 'svg']);
  const classes = (node.attrs?.find(attr => attr.name === 'class')?.value ?? '').split(/\s+/).filter(Boolean);
  const tones = new Set(['red', 'green', 'teal', 'gold', 'vio']);
  if (classes.includes('kpi')) for (const tone of ['r', 'g', 'v', 'b', 't']) tones.add(tone);
  const name = `${node.tagName ?? ''}.${classes.filter(name => !tones.has(name)).sort().join('.')}`;
  if (['table', 'svg'].includes(node.tagName)) return [name];
  const nested = children(node).flatMap(layoutSignature);
  return tags.has(node.tagName) ? [[name, nested]] : nested;
}

/** One parser and one contract in the browser, storage, export and server. */
export function referenceSectionIssues(html, template, section, { length = true, draft = false, words = section.words } = {}) {
  if (typeof html !== 'string' || !html.trim() || html.length > 180000) return ['Missing or oversized reference section'];
  const root = parseFragment(html), nodes = all(root), issues = [];
  for (const node of nodes) {
    if (node.tagName && !allowedTags.has(node.tagName)) issues.push(`Unsupported markup: ${node.tagName}`);
    for (const attr of node.attrs ?? []) {
      if (!allowedAttrs.has(attr.name) || /url\s*\(|expression\s*\(|@import|javascript:|[<>]/i.test(attr.value)) issues.push(`Unsupported attribute: ${attr.name}`);
      if (attr.name === 'style' && /display\s*:\s*none|visibility\s*:\s*hidden|position\s*:\s*(fixed|absolute)|opacity\s*:\s*0(?:\s*;|\s*$)|font-size\s*:\s*0(?:px|em|rem|\s|;|$)|text-indent\s*:\s*-/i.test(attr.value)) issues.push('Hidden or displaced content cannot satisfy the reference length');
    }
  }
  const sections = byTag(root, 'section');
  if (sections.length !== 1 || children(root).filter(n => n.tagName).length !== 1 || children(root).some(node => node.nodeName === '#text' && normal(node.value))) issues.push('Return one complete section');
  if (sections[0]?.attrs?.find(attr => attr.name === 'id')?.value !== section.anchor) issues.push(`Keep section anchor ${section.anchor}`);
  const headings = byTag(root, 'h2');
  if (headings.length !== 1) issues.push('The section requires one main heading');
  if (!section.dynamicTitle && normal(text(headings[0] ?? {})) !== section.title) issues.push(`Keep the section heading: ${section.title}`);
  for (const tag of ['h3', 'h4']) {
    if (byTag(root, tag).length !== byTag(parseFragment(section.layout), tag).length) issues.push(`Keep the reference ${tag} subsection count`);
  }
  const layoutClasses = ['grid2', 'grid3', 'card', 'kpis', 'kpi', 'ins', 'callout', 'tbl-wrap', 'legend'];
  const original = all(parseFragment(section.layout));
  if (JSON.stringify(layoutSignature(root)) !== JSON.stringify(layoutSignature(parseFragment(section.layout)))) issues.push('Keep the reference layout container hierarchy and ordering');
  for (const name of layoutClasses) {
    if (nodes.filter(node => hasClass(node, name)).length !== original.filter(node => hasClass(node, name)).length) issues.push(`Keep the reference ${name} layout blocks`);
  }
  const tables = byTag(root, 'table');
  if (tables.length !== section.tableHeaders.length) issues.push(`Expected ${section.tableHeaders.length} tables; received ${tables.length}`);
  tables.forEach((table, index) => {
    const headers = byTag(table, 'th').map(node => normal(text(node)));
    const expected = section.tableHeaders[index];
    if (expected && JSON.stringify(headers) !== JSON.stringify(expected)) issues.push(`Table ${index + 1} must retain the reference column headings`);
  });
  const charts = byTag(root, 'svg').length;
  if (charts !== section.charts) issues.push(`Expected ${section.charts} inline charts; received ${charts}`);
  const actual = wordCount(html);
  // A draft has room to breathe; the final edition has an exact, deterministic word budget.
  const tolerance = draft ? Math.max(8, Math.ceil(words * .05)) : 0;
  if (length && Math.abs(actual - words) > tolerance) issues.push(`Reference length: ${words} words${draft ? ` (draft allowance ${words - tolerance}–${words + tolerance})` : ' exactly'}; received ${actual}`);
  if (/\{\{|\}\}|\[(?:insert|placeholder|todo)|lorem ipsum|September 2026 data goes here/i.test(htmlText(html))) issues.push('Unresolved template content');
  return [...new Set(issues)];
}

export function referenceReviewIssues(review, chapter, { length = true, month, model } = {}) {
  const template = referenceTemplate(chapter, month);
  if (!template || review?.version !== 1 || review.templateHash !== template.sha256) return ['Reference edition is missing or uses an obsolete template'];
  if (!Array.isArray(review.sections) || review.sections.length !== template.sections.length) return [`Reference edition requires all ${template.sections.length} sections`];
  const budgets = model ? referenceWordBudgets(model, chapter) : template.sections.map(section => section.words);
  return template.sections.flatMap((section, index) => {
    const result = review.sections[index];
    if (result?.id !== section.id) return [`${chapter}: section order does not match the reference`];
    if (result.verified !== true) return [`${chapter}/${section.id}: independent evidence audit is incomplete`];
    return referenceSectionIssues(result.html, template, section, { length, words: budgets[index] }).map(issue => `${chapter}/${section.id}: ${issue}`);
  });
}

export const escapeReferenceText = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const hasClass = (node, name) => node.attrs?.find(attr => attr.name === 'class')?.value.split(/\s+/).includes(name);
const replaceText = (node, value) => { node.childNodes = [{ nodeName: '#text', value: String(value), parentNode: node }]; };
function referenceCover(model, template, period) {
  const root = parseFragment(template.coverHtml), nodes = all(root);
  const findClass = name => nodes.find(node => hasClass(node, name));
  const total = model.chapters?.[template.id]?.total ?? {};
  const count = value => value == null ? 'Unavailable' : Number(value).toLocaleString('en-IN');
  const inr = value => value == null ? 'Unavailable' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const pct = value => value == null ? 'Unavailable' : `${(Number(value) * 100).toFixed(1)}%`;
  const trainerGroup = model.chapters?.instructors?.groups?.find(group => group.field === 'trainer');
  const labels = {
    Studio: `Physique 57 — ${model.scope.studio}`, Period: `1–${new Date(Number(model.scope.month.slice(0, 4)), Number(model.scope.month.slice(5)), 0).getDate()} ${period}`,
    Instructors: trainerGroup && !trainerGroup.omitted ? `${trainerGroup.rows.length} recorded` : 'Unavailable',
    Classes: count(model.chapters?.sessions?.total?.sessions), 'Check-ins': count(model.chapters?.['community-attendance']?.total?.checkins),
    Utilisation: pct(total.fill_rate), 'Cash collected': inr(total.gross_revenue), 'Adjusted (ex-one-off)': 'Unavailable',
    Transactions: count(total.transactions), Buyers: count(total.buyers), 'Discount rate': pct(total.discount_rate),
    Prepared: new Date(model.builtAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
  };
  replaceText(byTag(root, 'h1')[0], template.id === 'revenue-performance' ? `Sales & Revenue Performance · ${model.scope.studio}` : template.coverTitle);
  replaceText(findClass('sub'), template.id === 'instructors' ? 'Instructor performance, schedule-adjusted evidence, community relationships and proposed deployment priorities for the next monthly review.' : template.id === 'sessions' ? 'Studio session performance, format and timetable intelligence, capacity utilisation and proposed schedule changes grounded in the reporting evidence.' : 'Revenue quality, product and package economics, sales team performance, concentration and the relationship between cash collections and earned revenue.');
  for (const node of nodes.filter(node => hasClass(node, 'k'))) {
    const value = children(node.parentNode).find(child => hasClass(child, 'v'));
    if (value) replaceText(value, labels[normal(text(node))] ?? 'Unavailable');
  }
  const links = byTag(root, 'a');
  const descriptions = template.id === 'instructors' ? ['The findings that matter', 'Studio and instructor KPIs', 'Instructor metrics and comparisons', 'Appeal versus timetable advantage', 'Loyalty, reach and return practice', 'Concentration, workload and fit', 'Contradictions and misleading averages', 'Instructor actions and review KPIs', 'Where each instructor fits', 'What to monitor', 'Quantified with explicit assumptions', 'How to assess progress', 'Definitions and evidence limits'] : template.id === 'sessions' ? ['What drove the reporting result', 'Studio KPIs', 'Distribution, capacity and bookings', 'Ranked and explained', 'Format-level evidence and comparisons', 'Attendance and capacity heatmaps', 'Where the timetable needs attention', 'Contradictions and missing context', 'Proposed session-level changes', 'The proposed weekly template', 'Quantified with explicit assumptions', 'Monitoring and review indicators', 'Definitions and evidence limits'] : ['The decision-maker’s summary', 'Where recorded collections came from', 'Collections and practice demand', 'Product mix and contributions', 'Price, term and value', 'Ticket size, discounting and payment mix', 'Recorded sales ownership and contribution', 'How much depends on how few', 'Collections versus attendance attribution', 'Signals behind the headline totals', 'Proposed priorities and review measures', 'How each figure was calculated'];
  links.forEach((link, index) => {
    const section = template.sections[index]; if (!section) return;
    const label = children(link).find(node => node.tagName === 'span');
    if (label && template.id === 'revenue-performance' && index === 2) replaceText(label, 'Selected-month Comparisons');
    link.childNodes = [label, { nodeName: '#text', value: ` ${descriptions[index]}`, parentNode: link }].filter(Boolean);
    link.attrs = [{ name: 'href', value: `#${template.id}-${section.anchor}` }];
  });
  return serializeOuter(children(root).find(node => node.tagName));
}

const referencePeriod = model => new Date(`${model.scope.month}-01T12:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
const referenceFooter = model => `<div class="foot">Physique 57 — ${escapeReferenceText(model.scope.studio)} · ${escapeReferenceText(referencePeriod(model))} performance intelligence. Prepared from the selected studio’s frozen report evidence. Refer to the methodology section for metric definitions, source coverage, reconciliation boundaries and unavailable analyses. Proposed actions and scenarios are distinct from recorded outcomes.</div>`;

/** The last section absorbs variable-length identity metadata; total visible words stay exact. */
export function referenceWordBudgets(model, chapter) {
  const template = referenceTemplate(chapter, model.scope.month);
  const budgets = template.sections.map(section => section.words);
  budgets[budgets.length - 1] = template.bodyWords - wordCount(referenceCover(model, template, referencePeriod(model))) - wordCount(referenceFooter(model)) - budgets.slice(0, -1).reduce((sum, words) => sum + words, 0);
  return budgets;
}

/** Select prose, never numeric tables or chart geometry, for exact-length copy editing. */
export function referenceLengthPlan(html, target) {
  const root = parseFragment(html), nodes = all(root), delta = wordCount(html) - target;
  if (!delta) return [];
  const candidates = nodes.map((node, index) => ({ node, index, words: normal(text(node)).split(/\s+/).filter(Boolean).length }))
    .filter(item => ['p', 'dd', 'li'].includes(item.node.tagName) && item.words >= 24 && !all(item.node).some(node => ['table', 'svg', 'ul', 'ol', 'div', 'figure', 'h2', 'h3', 'h4'].includes(node.tagName)))
    .sort((a, b) => b.words - a.words);
  const chosen = []; let total = 0;
  for (const item of candidates) {
    if (chosen.some(other => all(other.node).includes(item.node) || all(item.node).includes(other.node))) continue;
    chosen.push(item); total += item.words; if (total - delta >= chosen.length * 24) break;
  }
  if (!chosen.length || total - delta < chosen.length * 24 || chosen.length > 8) throw new Error('Analysis reference length requires a new section draft');
  const requested = total - delta; let remaining = requested;
  return chosen.map((item, index) => {
    const words = index === chosen.length - 1 ? remaining : Math.max(24, Math.floor(requested * item.words / total)); remaining -= words;
    if (words > 1500 || words < 1) throw new Error('Analysis reference length requires a new section draft');
    return { id: `p${index}`, nodeIndex: item.index, text: normal(text(item.node)), words };
  });
}

export function applyReferenceLength(html, plan, replacements, target) {
  const root = parseFragment(html), nodes = all(root);
  for (const item of plan) {
    const tokens = replacements?.[item.id];
    if (!Array.isArray(tokens) || tokens.length !== item.words || tokens.some(token => typeof token !== 'string' || /\s|[<>]/u.test(token) || !token)) throw new Error('Analysis reference length response is malformed');
    replaceText(nodes[item.nodeIndex], tokens.join(' '));
  }
  const result = children(root).map(serializeOuter).join('');
  if (wordCount(result) !== target) throw new Error('Analysis reference length does not reconcile');
  return result;
}

/** Isolated original styles, with no network resources or executable source-document scripts. */
export function referenceDocument(model, chapterIds = model.customization?.chapterIds ?? REFERENCE_CHAPTERS) {
  const selected = chapterIds.filter(id => referenceTemplate(id));
  const style = selected.map(id => referenceTemplate(id).css).join('\n').replaceAll('</', '<\\/');
  const period = referencePeriod(model);
  const body = selected.map(id => {
    const template = referenceTemplate(id, model.scope.month), review = model.narratives?.[id]?.referenceReview;
    const content = review?.sections?.map((section, index) => {
      if (!template.sections[index] || section.id !== template.sections[index].id || referenceSectionIssues(section.html, template, template.sections[index], { length: false }).length) return '<section><h2>Section requires review</h2><p>The reference section failed validation.</p></section>';
      const root = parseFragment(section.html);
      for (const node of all(root)) for (const attr of node.attrs ?? []) if (attr.name === 'id') attr.value = `${id}-${attr.value}`;
      for (const table of byTag(root, 'table')) {
        let ancestor = table.parentNode, scrolls = false;
        while (ancestor) { if (hasClass(ancestor, 'tbl-wrap')) scrolls = true; ancestor = ancestor.parentNode; }
        if (!scrolls) {
          const parent = table.parentNode, wrapper = children(parseFragment('<div class="reference-table-scroll"></div>'))[0];
          wrapper.parentNode = parent; wrapper.childNodes = [table];
          parent.childNodes[parent.childNodes.indexOf(table)] = wrapper; table.parentNode = wrapper;
        }
      }
      return children(root).map(serializeOuter).join('');
    }).join('\n') || '<section><h2>Preparing the reference edition</h2><p>This report is not complete yet.</p></section>';
    return `<article id="chapter-${id}">${referenceCover(model, template, period)}<div class="wrap">${content}${referenceFooter(model)}</div></article>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeReferenceText(model.scope.studio)} · ${escapeReferenceText(period)}</title><style>${style}\narticle+article{break-before:page}.cover .meta .k,.cover .meta .v{padding-right:0;margin-right:0;border-right:0}svg{max-width:100%;height:auto}table{max-width:100%}.reference-table-scroll{overflow-x:auto;max-width:100%;min-width:0}@media(max-width:700px){.wrap{padding-left:20px;padding-right:20px}.cover h1{font-size:34px}.table-wrap,.table-scroll,.tbl-wrap{overflow-x:auto;max-width:100%;min-width:0}.grid2,.grid3{grid-template-columns:minmax(0,1fr)}.grid2>*,.grid3>*,.card{min-width:0;max-width:100%}.cover .meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.cover .meta>div{padding:0;margin:0;border:0}.cover .meta>div:first-child{grid-column:1/-1}svg{overflow:hidden!important}}@media print{.cover{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body>${body}</body></html>`;
}
