import reportCSS from "../design/report.css?raw";
import { monthLabel } from "./compute";
import type { ReportModel } from "./model";

/** `</` is escaped so no embedded text can close the tag it sits in. */
const safe = (text: string) => text.replaceAll("</", "<\\/");
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
export function serialiseReport(element: HTMLElement, model: ReportModel) {
  const clone = element.cloneNode(true) as HTMLElement;
  // The in-app chrome has no meaning in a file; the sticky contents rail does.
  clone.querySelectorAll("[data-export='omit']").forEach((node) => node.remove());
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
    safe(reportCSS),
    "</style>",
    "</head>",
    "<body>",
    safe(clone.outerHTML),
    "</body>",
    "</html>",
  ].join("\n");
}

export function downloadReport(element: HTMLElement, model: ReportModel) {
  const blob = new Blob([serialiseReport(element, model)], {
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
export function printReport(element: HTMLElement, model: ReportModel) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.append(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("The browser refused a print frame. Use Download HTML and print the file.");
  }
  doc.open();
  doc.write(serialiseReport(element, model));
  doc.close();
  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  if (doc.readyState === "complete") run();
  else frame.addEventListener("load", run, { once: true });
}
