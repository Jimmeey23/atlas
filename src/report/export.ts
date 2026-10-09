import reportCSS from "../design/report.css?raw";
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
  const clone = element.cloneNode(true) as HTMLElement;
  // The in-app chrome has no meaning in a file; the sticky contents rail does.
  clone.setAttribute("data-report-theme", model.customization?.theme ?? "light");
  clone.querySelectorAll("[data-export='omit']").forEach((node) => node.remove());
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
    "html{scroll-behavior:smooth}body{margin:0;background:#f4f6fa;padding:24px}",
    "@media(max-width:768px){body{padding:0}}",
    "@media print{body{padding:0;background:#fff}}",
    safeInStyle(reportCSS),
    "</style>",
    "</head>",
    "<body>",
    clone.outerHTML,
    `<script>
    document.addEventListener('click', function(event) {
      const button = event.target.closest('button');
      if (!button) return;
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
      if (button.hasAttribute('data-marquee-control')) {
        const strip = button.closest('.r-signal-strip');
        const paused = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed',String(paused));
        button.textContent = paused ? 'Resume' : 'Pause';
        button.setAttribute('aria-label', paused ? 'Resume signals' : 'Pause signals');
        strip.querySelector('.r-marquee').setAttribute('data-paused',String(paused));
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

/** Open synchronously to preserve browser user activation, then populate the standalone report. */
export async function openReportPage(element: HTMLElement, model: ReportModel) {
  const page = window.open('about:blank', '_blank');
  if (!page) throw new Error('The browser blocked the new page. Allow pop-ups and retry.');
  page.opener = null;
  try {
    const html = await serialiseReport(element, model);
    page.document.open(); page.document.write(html); page.document.close();
  } catch (error) { page.close(); throw error; }
}
