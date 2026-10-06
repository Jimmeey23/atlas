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
  clone.setAttribute("data-report-theme", "light");
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
  const title = `${model.scope.studio} — ${monthLabel(model.scope.month)} performance report`;
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
