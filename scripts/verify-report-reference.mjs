import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { REFERENCE_CHAPTERS, referenceTemplate as referenceContract, referenceWordBudgets, referenceLengthPlan, applyReferenceLength } from '../src/report/reference-standard.mjs';

import sourceTemplates from '../src/report/reference-templates.json' with { type: 'json' };
const referenceTemplate = id => {
  const contract = referenceContract(id), source = sourceTemplates.find(template => template.id === id);
  return { ...contract, sections: contract.sections.map((section, index) => ({ ...section, layout: source.sections[index].layout })) };
};

const model = { scope: { studio: 'Kwality House, Kemps Corner', month: '2026-09' }, builtAt: '2026-10-17T00:00:00Z', figuresHash: 'visual-reference-fixture', chapters: {},
  customization: { generationFormat: 'reference-v1', chapterIds: REFERENCE_CHAPTERS, theme: 'light' }, narratives: Object.fromEntries(REFERENCE_CHAPTERS.map(id => {
    const template = referenceTemplate(id);
    return [id, { generated: true, summary: 'Reference layout fixture.', cards: [{ headline: template.title, meaning: 'Reference layout fixture.', evidence: 'Reference layout fixture.', action: '' }], referenceReview: { version: 1, templateHash: template.sha256, sections: template.sections.map(section => ({ id: section.id, html: section.layout, verified: true })) } }];
  })) };
for (const id of REFERENCE_CHAPTERS) {
  const budgets = referenceWordBudgets(model, id);
  for (const [index, section] of model.narratives[id].referenceReview.sections.entries()) {
    const plan = referenceLengthPlan(section.html, budgets[index]);
    if (plan.length) section.html = applyReferenceLength(section.html, plan, Object.fromEntries(plan.map(edit => {
      const words = edit.text.split(/\s+/).slice(0, edit.words);
      while (words.length < edit.words) words.push('Reviewed.');
      return [edit.id, words];
    })), budgets[index]);
  }
}
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {ReferenceEdition} from '/src/components/report/deck/ReferenceEdition';import {ReportBuilder} from '/src/components/report/ReportBuilder';import {serialiseReport} from '/src/report/export';const model=${JSON.stringify(model)};window.exportReference=()=>serialiseReport(document.getElementById('root'),model);const root=createRoot(document.getElementById('root'));window.renderBuilder=()=>root.render(React.createElement(ReportBuilder,{version:'reference-fixture'}));root.render(React.createElement(ReferenceEdition,{model}));`;
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'reference-verification', configureServer(server) { server.middlewares.use(async (req, res, next) => {
  if (!req.url?.startsWith('/reference-verification')) return next(); res.setHeader('Content-Type', 'text/html');
  res.end(await server.transformIndexHtml(req.url, '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="/reference-entry.js"></script></body></html>'));
}); }, resolveId(id) { if (id === '/reference-entry.js') return id; }, load(id) { if (id === '/reference-entry.js') return entry; } }] });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message); });page.on('console', message=>{if(message.type()==='error')console.error('Console:',message.text());});
  await page.goto(`${server.resolvedUrls.local[0]}reference-verification`);
  await page.waitForFunction(() => document.querySelectorAll('iframe').length === 3 && [...document.querySelectorAll('iframe')].every(frame => frame.contentDocument?.querySelectorAll('section').length >= 12 && frame.clientHeight > 10000), null, { timeout: 60000 });
  const inspect = async () => page.locator('iframe').evaluateAll(frames => frames.map(frame => {
    const doc = frame.contentDocument, h2 = doc.querySelector('h2');
    return { sections: doc.querySelectorAll('section').length, tables: doc.querySelectorAll('table').length, charts: doc.querySelectorAll('svg').length, width: frame.clientWidth, overflow: doc.documentElement.scrollWidth > frame.clientWidth + 1, background: frame.contentWindow.getComputedStyle(doc.body).backgroundColor, headingFont: frame.contentWindow.getComputedStyle(h2).fontFamily, scripts: doc.querySelectorAll('script').length };
  }));
  const desktop = await inspect();
  assert.deepEqual(desktop.map(item => item.sections), [13,13,12]); assert.equal(desktop.reduce((n, item) => n + item.tables, 0), 34); assert.equal(desktop.reduce((n, item) => n + item.charts, 0), 31);
  assert.ok(desktop.every(item => !item.overflow && item.scripts === 0 && item.background === 'rgb(247, 245, 241)' && item.headingFont.includes('Iowan')));
  await mkdir('.cache/reference-verification', { recursive: true });
  await page.screenshot({ path: '.cache/reference-verification/desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(frame => frame.clientWidth === 390));
  const mobile = await inspect();
  if (mobile.some(item => item.overflow)) console.log(await page.locator('iframe').evaluateAll(frames => frames.map(frame => [...frame.contentDocument.querySelectorAll('*')].filter(node => node.getBoundingClientRect().right > 391 && (!node.closest('.tbl-wrap') || node.matches('.tbl-wrap'))).slice(0,8).map(node => ({ tag: node.tagName, class: node.className?.baseVal ?? node.className, width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right })))));
  assert.ok(mobile.every(item => !item.overflow), JSON.stringify(mobile));
  await page.screenshot({ path: '.cache/reference-verification/mobile.png' });
  const html = await page.evaluate(() => window.exportReference());
  assert.equal((html.match(/<table\b/g) ?? []).length, 34); assert.equal((html.match(/<svg\b/g) ?? []).length, 31); assert.ok(!/<iframe|<script/.test(html));
  await writeFile('.cache/reference-verification/export.html', html);
  const exported = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); await exported.setContent(html);
  assert.equal(await exported.locator('article').count(), 3); assert.equal(await exported.locator('section').count(), 38);
  await exported.emulateMedia({ media: 'print' }); await exported.pdf({ path: '.cache/reference-verification/print.pdf', format: 'A4', printBackground: true });
  await page.route('**/api/reports', route => route.fulfill({ json: [] }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.renderBuilder());
  await page.getByRole('heading', { name: 'Original reference edition', exact: true }).waitFor();
  await page.locator('details[aria-label="Report design"] > summary').click();
  assert.equal(await page.getByRole('combobox', { name: 'Generation format' }).inputValue(), 'reference-v1');
  assert.equal(await page.locator('fieldset').getByRole('checkbox', { checked: true }).count(), 3);
  await page.screenshot({ path: '.cache/reference-verification/builder-default.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ desktop, mobile, exportedSections: 38, exportTables: 34, exportCharts: 31, browserErrors: errors.length }, null, 2));
} finally { await browser?.close(); await server.close(); }
