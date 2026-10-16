import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Isolated rendering fixture: no credentials, remote sheets, saved reports or AI calls.
const shots = process.env.SHOTS || '/tmp/p57-editorial';
await mkdir(shots, { recursive: true });
const card = (extra = {}) => ({ headline: 'Attendance grew while capacity held', meaning: 'Community members recorded more visits on the same timetable. The operating question is whether that demand persists before adding supply.', evidence: '120 visits versus 100 in August; 10 sessions in both months.', driver: 'Barre contributed the recorded increase. This is an arithmetic contribution, not evidence of why community members booked.', offset: 'One observed month cannot establish a durable change.', trend: 'A longer matched history is required to establish persistence.', action: 'Review bookings for the same Barre slots before adding sessions.', recommendation: 'A focused review protects capacity decisions against a one-month spike.', impact: '', watch: 'Bookings per session in the next review.', ownerArea: 'Studio operations', horizon: 'Proposed 2026-11-15', priority: 'high', confidence: 'medium', metrics: ['attendance'], focus: 'format', lens: 'driver', ...extra });
const group = { field: 'format', title: 'Attendance and fill by format', columns: ['sessions', 'attendance', 'fill_rate'], compare: 'attendance', minimum: 'At least three sessions', omitted: 2, rows: [{ g: 'Barre', sessions: 6, attendance: 80, fill_rate: .8 }, { g: 'Cycle', sessions: 4, attendance: 40, fill_rate: .5 }], prior: { Barre: { sessions: 6, attendance: 60 }, Cycle: { sessions: 4, attendance: 40 } }, priorYear: {} };
const model = { scope: { studio: 'Editorial verification studio', month: '2026-09' }, builtAt: '2026-10-16T00:00:00Z', figuresHash: 'editorial-fixture', chapters: { sessions: { id: 'sessions', n: 10, total: { attendance: 120, sessions: 10, fill_rate: .7 }, prior: { attendance: 100, sessions: 10, fill_rate: .6 }, priorYear: {}, groups: [group], history: [{ month: '2026-08', attendance: 100 }, { month: '2026-09', attendance: 120 }] } },
  customization: { title: 'Monthly performance review', subtitle: '', preparedFor: 'Leadership', preparedBy: '', audience: 'Leadership', tone: 'Professional', detail: 'Comprehensive', instructions: '', chapterIds: ['sessions', 'recommendations'], theme: 'light', showCharts: false },
  narratives: { sessions: { generated: true, summary: 'Visits increased on unchanged session supply. Review recurring demand before expanding capacity.', metricCommentary: [{ metricIds: ['attendance'], text: 'WRITTEN_REVIEW: Visits increased from 100 to 120. Historical coverage is limited; this does not prove a durable trend.' }], cards: [card({ focus: 'kpis', action: 'Review overall demand before expanding capacity.' }), card({ highlight: ['Barre'] }), card({ headline: 'Cycle visits held at 40', meaning: 'Demand was stable for Cycle.', evidence: '40 visits in both months.', driver: 'Recorded Cycle demand was unchanged.', action: '', recommendation: '', lens: 'win', highlight: ['Cycle'] })] }, recommendations: { generated: true, summary: 'Validate repeat demand before expanding the timetable.', cards: [card({ focus: 'kpis', lens: 'next_step', impact: 'Unavailable: incremental paid-seat yield is missing.', priorActionResult: 'Not recorded' }), card({ headline: 'Review retained demand', action: 'Review repeat bookings for the same slots after the first review.', focus: 'cross', lens: 'next_step', horizon: 'Proposed 2026-12-15', impact: 'Unavailable: matched member evidence is missing.', priorActionResult: 'Not recorded' })] } } };
const before = JSON.stringify(model);
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {ContinuousReport} from '/src/components/report/deck/ContinuousReport';
import {deckTabs} from '/src/report/deck'; import {serialiseReport} from '/src/report/export';
import '/src/design/app.css'; import '/src/styles.css'; import '/src/design/report.css'; import '/src/design/report-review.css'; import '/src/design/report-v2.css'; import '/src/design/report-deck.css'; import '/src/design/report-continuous.css'; import '/src/design/report-modern.css'; import '/src/design/report-premium.css'; import '/src/design/report-editorial.css';
const model=${JSON.stringify(model)};const root=createRoot(document.getElementById('root'));
window.renderReport=(exporting=false,theme='light')=>{model.customization.theme=theme;root.render(React.createElement('main',{className:'report-doc r2 deck cr-inline', 'data-report-theme':theme},React.createElement(ContinuousReport,{model,tabs:deckTabs(model),ranked:[],onNavigate:()=>{},exporting})));};
window.exportReport=()=>serialiseReport(document.querySelector('main'),model);window.renderReport();`;
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'editorial-verification', configureServer(server) { server.middlewares.use(async (req, res, next) => { if (req.url !== '/editorial-verification') return next(); res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml(req.url, '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="/editorial-entry.js"></script></body></html>')); }); }, resolveId(id) { if (id === '/editorial-entry.js') return id; }, load(id) { if (id === '/editorial-entry.js') return entry; } }] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}editorial-verification`);
  await page.locator('.p57-editorial-finding').first().waitFor();
  const chapter = page.locator('[data-chapter="sessions"]');
  assert.equal(await chapter.locator('.p57-editorial-table').count(), 1, 'same breakdown is printed once');
  assert.equal(await chapter.locator('.p57-editorial-table tbody tr').count(), 2);
  assert.ok((await chapter.locator('.p57-table-note').innerText()).includes('2 eligible rows omitted'));
  assert.equal(await chapter.locator('.rp-analysis-panel').count(), 0, 'supporting metric review is lazy');
  await chapter.getByText('Complete written metric review', { exact: false }).click();
  assert.ok((await chapter.innerText()).includes('WRITTEN_REVIEW'));
  await chapter.getByText('Complete written metric review', { exact: false }).click();
  await page.waitForFunction(() => !document.querySelector('[data-chapter="sessions"] .rp-analysis-panel'));
  assert.equal(await page.getByRole('heading', { name: 'Root-cause investigation', exact: true }).count(), 1);
  assert.equal(await page.getByRole('heading', { name: 'Proposed 30 / 60 / 90-day review plan', exact: true }).count(), 1);
  await chapter.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/desktop.png` });
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no document overflow at ${width}`);
    await chapter.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${shots}/${width}.png` });
  }
  await page.evaluate(() => window.renderReport(false, 'dark'));
  await page.waitForFunction(() => document.querySelector('main').dataset.reportTheme === 'dark');
  const dark = await page.locator('.p57-reference-review').evaluate(el => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
  assert.notEqual(dark.fg, dark.bg);
  await page.screenshot({ path: `${shots}/dark.png` });
  await page.evaluate(() => window.renderReport(true));
  await page.waitForFunction(() => document.querySelector('.cr-export-evidence'));
  const html = await page.evaluate(() => window.exportReport());
  assert.ok(html.includes('WRITTEN_REVIEW') && html.includes('p57-reference-review'));
  assert.ok(!/<link[^>]+stylesheet|<script[^>]+src=/i.test(html), 'offline export embeds its assets');
  await writeFile(`${shots}/sample.html`, html);
  const offline = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await offline.route('**/*', route => route.abort()); await offline.setContent(html);
  assert.equal(await offline.locator('[data-chapter="sessions"] .deck-flip').count(), 3, 'export retains all KPIs even when downloaded from mobile');
  assert.equal(await offline.locator('.p57-editorial-finding').count(), 4, 'export retains chapter arguments and recommendation');
  await offline.locator('[data-chapter="sessions"]').scrollIntoViewIfNeeded();
  await offline.screenshot({ path: `${shots}/offline.png` });
  assert.equal(JSON.stringify(model), before, 'rendering does not mutate input fixtures');
  assert.deepEqual(errors, []);
  console.log(`Editorial reader verified: desktop, tablet, mobile, dark theme, lazy detail and offline export. Screenshots: ${shots}`);
} finally { await browser?.close(); await server.close(); }
