import layoutsCSS from "../design/report-layouts.css?raw";
import { REFERENCE_FORMAT, referenceDocument } from './reference-standard.mjs';
import { reportOptions } from "./options";
import { assertReportRelease, assertRenderedReport } from "./release-gate.mjs";
import baseCSS from "../design/report.css?raw";
import reviewCSS from "../design/report-review.css?raw";
import v2CSS from "../design/report-v2.css?raw";
import deckCSS from "../design/report-deck.css?raw";
import sourceCSS from "../design/report-source.css?raw";
import continuousCSS from "../design/report-continuous.css?raw";
import modernCSS from "../design/report-modern.css?raw";
import premiumCSS from "../design/report-premium.css?raw";
import editorialCSS from "../design/report-editorial.css?raw";
const sourceExportCSS = deckCSS + "\n" + continuousCSS + "\n" + sourceCSS + `
.report-doc.deck{--surface-1:#fff;--surface-2:#f5f7fb;--surface-3:#fff;--canvas:#fff;--text-1:#142440;--text-2:#465777;--text-3:#62718c;--hairline:#e3e8f0;--accent:#6350e8;--pos:#087d70;--neg:#b43253;--warn:#a66a20;--font-ui:Arial,Helvetica,sans-serif;--font-display:Arial,Helvetica,sans-serif;padding:24px;min-height:0}
.report-doc.deck[data-report-theme=dark]{--surface-1:#122139;--surface-2:#192c48;--surface-3:#213653;--canvas:#122139;--text-1:#edf2fc;--text-2:#c1cee3;--text-3:#a4b5d0;--hairline:#31435e;--d-line:#31435e;--accent:#b6acff;--pos:#6fdbbf;--neg:#ff9eb5}
.report-doc svg.lucide{width:16px;height:16px;min-width:16px;max-height:16px;flex:0 0 16px;display:inline-block;fill:none;stroke:currentColor}
.report-doc .source-section-head{position:static}.report-doc .source-hero,.report-doc .source-hero-art i,.report-doc .source-hero-art svg,.report-doc .deck-flip-face{animation:none!important}
.report-doc .deck-kpi{cursor:default}.report-doc .source-interactive-chart{overflow:hidden}.report-doc .source-interactive-chart svg{max-width:100%}
@media(max-width:760px){.report-doc.deck{padding:16px}}
@media print{.report-doc.deck{padding:0}.report-doc .source-hero{break-inside:avoid}.report-doc .source-card-wrap .deck-flip{height:170px}}
`;

// The builder rules in v2 are app chrome and are removed with it; the document rules travel.
const reportCSS = baseCSS + "\n" + reviewCSS + "\n" + v2CSS.split("/* ---------- Builder")[0];
import { monthLabel } from "./compute";
import type { ReportModel } from "./model";

/**
 * Inside `<style>` and `<script>`, `</` would end the element early, so it is
 * escaped. This is only ever applied to element *contents* — markup must be
 * written through untouched, or every closing tag renders as literal text.
 */
const safeInStyle = (css: string) => css.replaceAll("</", "<\\/");
const escapeHTML = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const reportFileName = (model: ReportModel) =>
  `${model.scope.studio} ${monthLabel(model.scope.month)} performance report`
    .replace(/[^\w ]+/g, "")
    .trim()
    .replaceAll(" ", "_") + ".html";

/**
 * Serialise the rendered report into one file: the stylesheet is inlined, the
 * charts are already inline SVG and no font or script is fetched, so the
 * download opens from disk with nothing behind it.
 *
 * The export is taken from the live element rather than re-rendered, so what
 * downloads is what was reviewed on screen.
 */
export async function serialiseReport(element: HTMLElement, model: ReportModel) {
  if (!model.importedChapters?.length) assertReportRelease(model);
  if (model.customization?.generationFormat === REFERENCE_FORMAT && !model.importedChapters?.length) return referenceDocument(model);
  assertRenderedReport(element);
  const clone = element.cloneNode(true) as HTMLElement;
  // The in-app chrome has no meaning in a file; the sticky contents rail does.
  clone.setAttribute("data-report-template", reportOptions(model.customization).reportTemplate);
  clone.setAttribute("data-report-theme", model.customization?.theme ?? "light");
  clone.querySelectorAll("[data-export='omit']").forEach((node) => node.remove());
  // Export is a durable document: native links and disclosures work offline; live controls do not.
  clone.querySelectorAll<HTMLElement>('[data-report-link]').forEach(node => {
    const anchor = document.createElement('a'); anchor.href = `#chapter-${node.dataset.reportLink}`;
    anchor.className = node.className; anchor.innerHTML = node.innerHTML; node.replaceWith(anchor);
  });
  clone.querySelectorAll<HTMLElement>('.deck-flip-front').forEach(node => { node.removeAttribute('role'); node.removeAttribute('tabindex'); node.removeAttribute('aria-pressed'); node.removeAttribute('title'); });
  clone.querySelectorAll<HTMLDetailsElement>('.cr-source,.deck-proof-definitions').forEach(node => { node.open = true; });
  clone.querySelectorAll<HTMLButtonElement>('.dk-figure').forEach(button => { const figure = document.createElement('div'); figure.className = button.className; figure.innerHTML = button.innerHTML; button.replaceWith(figure); });
  const embedded = new Map<string, Promise<string>>();
  await Promise.all(Array.from(clone.querySelectorAll('img')).map(async img => {
    const source = img.src;
    if (source.startsWith('data:')) return;
    if (!embedded.has(source)) embedded.set(source, (async () => {
      const response = await fetch(source);
      if (!response.ok) throw new Error('A report image could not be embedded. Retry the export.');
      const blob = await response.blob();
      return new Promise<string>((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=()=>reject(new Error('A report image could not be read.')); reader.readAsDataURL(blob); });
    })());
    img.src = await embedded.get(source)!;
    img.removeAttribute('loading');
  }));
  // Background photographs must travel with the standalone file too.
  const originals=Array.from(element.querySelectorAll<HTMLElement>('.source-hero[data-photo], .chapter-photo-hero'));
  await Promise.all(Array.from(clone.querySelectorAll<HTMLElement>('.source-hero[data-photo], .chapter-photo-hero')).map(async (hero,i)=>{
    let background=getComputedStyle(originals[i]).backgroundImage;
    const urls=[...background.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
    for(const match of urls){
      const src=new URL(match[1],location.href).href;
      if(!embedded.has(src))embedded.set(src,(async()=>{const response=await fetch(src);if(!response.ok)throw new Error('The hero image could not be embedded. Retry export.');const blob=await response.blob();return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('The hero image could not be read.'));reader.readAsDataURL(blob);});})());
      background=background.replace(match[0],`url("${await embedded.get(src)!}")`);
    }
    hero.style.backgroundImage=background;
  }));
  const title = `${model.customization?.title || "Performance report"} — ${model.scope.studio} — ${monthLabel(model.scope.month)} performance report`;
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHTML(title)}</title>`,
    `<meta name="generator" content="Atlas Studio Intelligence">`,
    `<meta name="description" content="${escapeHTML(title)}">`,
    "<style>",
    "html{scroll-behavior:smooth}body{margin:0;background:#fff;padding:0}",
    "@media(max-width:768px){body{padding:0}}",
    "@media print{body{padding:0;background:#fff}}",
    safeInStyle(reportCSS + "\n" + sourceExportCSS + "\n" + modernCSS + "\n" + premiumCSS + "\n" + editorialCSS + "\n" + layoutsCSS),
    "</style>",
    "</head>",
    "<body>",
    clone.outerHTML,
    `<script>
    document.addEventListener('click', function(event) {
      const button = event.target.closest('button');
      if (!button) return;
      if(button.hasAttribute('data-insight-toggle')) {
        const details=button.closest('.r2-insight').querySelector('.r-insight-drilldown');
        if(details) details.open=!details.open;
      }
      if(button.hasAttribute('data-history-export')) {
        const root=button.closest('[data-report-history]');
        const table=root.querySelector('table');
        const rows=Array.from(table.querySelectorAll('tr')).filter(function(row){return !row.hidden;});
        const csv=rows.map(function(row){return Array.from(row.children).filter(function(cell){return !cell.hidden;}).map(function(cell){const value=cell.querySelector('[data-history-value]:not([hidden])');return '"'+(value?value.textContent:cell.textContent).replaceAll('"','""')+'"';}).join(',');}).join('\\n');
        const url=URL.createObjectURL(new Blob(['\\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download='monthly-comparison.csv';link.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
      }
      if (button.hasAttribute('data-view-control')) {
        const root = button.closest('[data-switch-root]');
        const choice = button.getAttribute('data-view-control');
        root.querySelectorAll('[data-view-control]').forEach(function(b) {
          if (b.closest('[data-switch-root]') === root) b.setAttribute('aria-pressed', String(b === button));
        });
        root.querySelectorAll('[data-view-panel]').forEach(function(panel) {
          if (panel.parentElement === root) panel.hidden = panel.getAttribute('data-view-panel') !== choice;
        });
      }
      if (button.hasAttribute('data-comparison-control')) {
        const root = button.closest('.r-bar-chart');
        const choice = button.getAttribute('data-comparison-control');
        root.querySelectorAll('[data-comparison-control]').forEach(function(b) {b.setAttribute('aria-pressed',String(b === button));});
        root.querySelectorAll('[data-comparison-panel]').forEach(function(panel) {panel.hidden = panel.getAttribute('data-comparison-panel') !== choice;});
      }
      if (button.closest('[data-carousel-root]')) {
        const root = button.closest('[data-carousel-root]');
        const slides = Array.from(root.querySelectorAll('[data-carousel-slide]'));
        if (button.hasAttribute('data-carousel-pause')) {
          const paused = button.getAttribute('aria-pressed') !== 'true';
          root.dataset.paused = String(paused);
          button.setAttribute('aria-pressed',String(paused));
          button.textContent = paused ? 'Resume' : 'Pause';
          button.setAttribute('aria-label',paused ? 'Resume photography' : 'Pause photography');
        } else {
          const current = slides.findIndex(function(slide) {return !slide.hidden;});
          const choice = button.hasAttribute('data-carousel-choice') ? Number(button.dataset.carouselChoice) : (current + Number(button.dataset.carouselStep) + slides.length) % slides.length;
          slides.forEach(function(slide,i) {slide.hidden = i !== choice;});
          root.querySelectorAll('[data-carousel-choice]').forEach(function(dot) {dot.setAttribute('aria-pressed',String(Number(dot.dataset.carouselChoice) === choice));});
        }
      }

    });
    document.addEventListener('change',function(event){
      const control=event.target.closest('[data-history-control]');if(!control)return;
      const root=control.closest('[data-report-history]');
      const read=function(key){return root.querySelector('[data-history-control="'+key+'"]').value;};
      const rows=Array.from(root.querySelectorAll('[data-history-month]'));
      const months=rows.map(function(row){return row.dataset.historyMonth;}).sort();const visible=months.slice(-Number(read('periods')));
      rows.forEach(function(row){row.hidden=!visible.includes(row.dataset.historyMonth);});
      root.querySelectorAll('[data-history-metric]').forEach(function(cell){cell.hidden=read('metric')!=='all'&&cell.dataset.historyMetric!==read('metric');});
      root.querySelectorAll('[data-history-value]').forEach(function(value){value.hidden=value.dataset.historyValue!==read('mode');});
      rows.sort(function(a,b){return read('order')==='newest'?b.dataset.historyMonth.localeCompare(a.dataset.historyMonth):a.dataset.historyMonth.localeCompare(b.dataset.historyMonth);}).forEach(function(row){root.querySelector('tbody').appendChild(row);});
    });
    let printing = false;
    window.addEventListener('beforeprint',function(){printing=true;});
    window.addEventListener('afterprint',function(){printing=false;});
    document.querySelectorAll('[data-carousel-root]').forEach(function(root) {
      root.dataset.paused = root.querySelector('[data-carousel-pause]').getAttribute('aria-pressed');
      setInterval(function() {
        if (printing || document.hidden || root.dataset.paused === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        root.querySelector('[data-carousel-step="1"]').click();
      },7000);
    });
    </script>`,
    "</body>",
    "</html>",
  ].join("\n");
}

export async function downloadReport(element: HTMLElement, model: ReportModel) {
  const blob = new Blob([await serialiseReport(element, model)], {
    type: "text/html;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = reportFileName(model);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next frame; revoking synchronously races the download in
  // some browsers.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/**
 * PDF through the browser's own print path. It keeps live text — selectable,
 * searchable and sharp at any zoom — which a canvas rasteriser does not, and
 * costs no vendor bundle.
 */
export async function printReport(element: HTMLElement, model: ReportModel) {
  const html = await serialiseReport(element, model);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1100px;height:800px;left:-12000px;border:0;";
  document.body.append(frame);
  try {
    const doc=frame.contentDocument;
    if (!doc) throw new Error("The browser refused a print frame. Use Download HTML and print the file.");
    doc.open(); doc.write(html); doc.close();
    await doc.fonts?.ready;
    await Promise.all(Array.from(doc.images).map(img=>img.decode()));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const target=frame.contentWindow;
    if (!target) throw new Error('The print frame is unavailable. Retry the export.');
    target.addEventListener('afterprint',()=>frame.remove(),{once:true});
    target.focus(); target.print();
  } catch(error) { frame.remove(); throw error; }
}

/** Transfer the frozen snapshot into the live report app without losing user activation. */
export async function openReportPage(_element: HTMLElement, model: ReportModel) {
  const page = window.open('about:blank', '_blank');
  if (!page) throw new Error('The browser blocked the new page. Allow pop-ups and retry.');
  try {
    const key = crypto.randomUUID();
    // Session storage belongs to the new tab and survives refresh; no report data in the URL.
    page.sessionStorage.setItem(`atlas-report-page:${key}`, JSON.stringify(model));
    page.opener = null;
    page.location.replace(`/report?draft=${key}`);
  } catch (error) { page.close(); throw error; }
}
