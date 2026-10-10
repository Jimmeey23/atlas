import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { reportRoutes } from '../server/reports.mjs';
import { presentationRoutes } from '../server/presentation.mjs';
import { stickyNoteRoutes } from '../server/sticky-notes.mjs';

// Isolated report database and canned AI answers: nothing reaches production storage or OpenAI.
const shots = process.env.SHOTS || '/tmp';
const documents = new Map(); const order = new Map(); let tick = 0;
const store = { read: async k => structuredClone(documents.get(k) ?? null), write: async (k, v) => { documents.set(k, structuredClone(v)); order.set(k, ++tick); }, remove: async k => { documents.delete(k); order.delete(k); } };
const cloud = { from: () => ({ select: () => ({ like: (_, p) => ({ order: () => ({ limit: async () => ({ data: [...documents.keys()].filter(k => k.startsWith(p.replace(/%$/, ''))).sort((a, b) => order.get(b) - order.get(a)).map(key => ({ key })), error: null }) }) }) }) }) };
const env = { ATLAS_ADMIN_PASSCODE: 'verify-admin', ATLAS_ADMIN_SECRET: 'verify-secret-verify-secret-0000' };
const api = express(); api.use(express.json({ limit: '20mb' }));
api.post('/api/reports/component', (req, res) => {
  if (!req.get('x-atlas-admin')) return res.status(403).json({ error: 'Unlock admin editing to change this report.' });
  res.json({ component: { kind: 'chart', title: 'Attendance across 14 months', subtitle: 'AI redesign from section figures', body: '', tone: 'info', items: [], columns: [], rows: [], bullets: [], left: { label: '', points: [] }, right: { label: '', points: [] },
    chart: { type: 'bar', unit: '', categories: ['Jul', 'Aug', 'Sep'], series: [{ name: 'Attendance', values: [940, 880, 747] }] }, prompt: req.body.prompt, generatedAt: new Date().toISOString() } });
});
api.post('/api/reports/speaker-notes', (_req, res) => res.json({ notes: { opener: 'AI opener for this page.', points: ['AI point one', 'AI point two'], numbers: ['Attendance 747'], questions: [{ q: 'Why?', a: 'Barre slots.' }], transition: 'Now to sales.', generated: true } }));
reportRoutes(api, store, cloud, env); presentationRoutes(api, store); stickyNoteRoutes(api, store, cloud);
const http = api.listen(0, '127.0.0.1'); await new Promise(r => http.once('listening', r));
const vite = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 5198, strictPort: true, proxy: { '/api': `http://127.0.0.1:${http.address().port}` } } });

const months = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2025, 7 + i, 1)).toISOString().slice(0, 7));
const wave = (base, amp, i) => Math.round(base + amp * Math.sin(i / 2.2) + i * base * .01);
function chapter(id, metrics, groups) {
  const history = months.map((month, i) => ({ month, ...Object.fromEntries(metrics.map(([m, base, amp, rate]) => [m, rate ? +(base + amp * Math.sin(i / 2)).toFixed(3) : wave(base, amp, i)])) }));
  const at = k => history.at(k);
  return { id, n: 1200, total: { ...at(-1) }, prior: { ...at(-2) }, priorYear: { ...at(-13) }, groups, history };
}
const verdict = (headline, extra = {}) => ({ headline, meaning: 'September at Kenkere House saw a marked drop from recent highs. Attendance was down 15.1% MoM and fill rate slipped 7.7pp. Trial conversion remains soft.', evidence: 'Attendance 747 vs 880 in August.', action: 'Run outreach to dormant and receding members this week.', focus: 'kpis', lens: 'risk', priority: 'high', confidence: 'medium',
  driver: 'Volume loss concentrated in Barre under one instructor (−84 visits) and Saturday (−104).', concentration: 'Barre and Saturday morning slots carry 70% of the drop.', offset: 'PowerCycle attendance held flat and average class size rose in evening slots.',
  trend: 'New reversal after gains from March–July; YoY and YTD still positive.', impact: 'Indicative ≈₹3.7L/month (524 visits × ₹714/visit).', watch: 'Saturday Barre fill above 70% by mid-October.', ownerArea: 'Studio operations', horizon: 'Next 30 days', ...extra });
const formatGroup = { id: 'format', field: 'format', title: 'Attendance by format', columns: ['attendance', 'fill_rate'], compare: 'attendance', minimum: 'At least three sessions', rows: [{ g: 'Barre', attendance: 420, fill_rate: .61 }, { g: 'PowerCycle', attendance: 230, fill_rate: .72 }, { g: 'Strength Lab', attendance: 97, fill_rate: .55 }], prior: { Barre: { attendance: 504, fill_rate: .7 }, PowerCycle: { attendance: 228, fill_rate: .71 }, 'Strength Lab': { attendance: 148, fill_rate: .6 } }, priorYear: {}, total: { attendance: 747, fill_rate: .63 } };
const model = { scope: { studio: 'Kenkere House', month: months.at(-1) }, builtAt: '2026-10-10T00:00:00Z', figuresHash: 'deck-fixture', schemaVersion: 6,
  customization: { title: 'Monthly performance report', subtitle: '', preparedFor: 'Leadership', preparedBy: '', audience: 'Studio leadership', tone: 'Professional', detail: 'Comprehensive', instructions: '', chapterIds: ['executive-summary', 'sessions', 'revenue-performance', 'recommendations'], theme: 'light', showCharts: true },
  chapters: {
    'executive-summary': chapter('executive-summary', [['attendance', 860, 90], ['fill_rate', .66, .06, true], ['avg_class_size_incl', 9, 1]], []),
    sessions: chapter('sessions', [['sessions', 98, 8], ['attendance', 860, 90], ['fill_rate', .66, .06, true], ['empty_session_rate', .05, .02, true], ['avg_class_size_incl', 9, 1]], [formatGroup]),
    'revenue-performance': chapter('revenue-performance', [['gross_revenue', 1450000, 220000], ['net_revenue', 1230000, 180000], ['transactions', 410, 40], ['aov', 3500, 300]], []),
  },
  narratives: {
    'executive-summary': { generated: true, summary: 'September softened across demand. Attendance fell 15.1% and fill rate slipped 7.7pp. Value at stake is ≈₹3.7L a month.', cards: [verdict('September is the weakest month of 2026 by volume and utilisation'), { headline: 'Revenue held despite lower visits', meaning: 'Collections were steady.', evidence: '₹14.6L vs ₹14.2L', action: 'Protect membership renewals.', focus: 'cross', lens: 'win', priority: 'medium', confidence: 'high', driver: 'Membership renewals', concentration: '', offset: '', trend: 'Persistent for 3 months', impact: '', watch: '' }] },
    sessions: { generated: true, summary: 'Demand fell while supply held. Fill rate dropped to 63%. Saturday Barre carried most of the decline.', cards: [verdict('Attendance down 15.1% MoM as Barre and Saturday slots slipped'), { headline: 'Barre attendance fell 84 visits', meaning: 'Barre carries most of the decline.', evidence: '420 vs 504', action: 'Rebalance Saturday Barre slots.', focus: 'format', lens: 'risk', metrics: ['attendance'], highlight: ['Barre'], priority: 'high', confidence: 'medium', driver: 'Fewer repeat visits', concentration: 'Saturday 9–11am', offset: 'PowerCycle flat', trend: 'New', impact: '₹60k', watch: 'Saturday fill' }, { headline: 'PowerCycle held its fill rate', meaning: 'Evening demand is resilient.', evidence: '72% vs 71%', action: '', focus: 'format', lens: 'win', metrics: ['fill_rate'], priority: 'low', confidence: 'high' }] },
    'revenue-performance': { generated: true, summary: 'Collections were stable. Average order value rose.', cards: [verdict('Gross collections steady at ₹14.6L', { lens: 'win' })] },
    recommendations: { generated: true, summary: 'Three moves for October.', cards: [{ headline: 'Win back dormant members', meaning: 'Largest recoverable value.', evidence: '524 visits gap', action: 'Call dormant members with a class pack offer.', recommendation: 'Cheaper than acquisition.', focus: 'kpis', lens: 'next_step', priority: 'high', ownerArea: 'Sales & front desk', horizon: 'Immediate', impact: '≈₹3.7L/month', watch: 'Reactivations' }, { headline: 'Fix Saturday Barre', meaning: 'Concentrated decline.', evidence: '−104 visits', action: 'Rotate instructors on Saturday Barre.', recommendation: 'Targets the drop directly.', focus: 'cross', lens: 'next_step', priority: 'medium', ownerArea: 'Instructor management', horizon: 'Next 30 days', impact: '', watch: 'Saturday fill' }] },
  },
};

let browser;
const errors = [];
try {
  await vite.listen(); const url = 'http://127.0.0.1:5198';
  // Stale history beyond the retention window is pruned on listing.
  for (let i = 0; i < 7; i++) await fetch(`${url}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...model, figuresHash: `old-${i}` }) });
  const saved = await (await fetch(`${url}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(model) })).json();
  assert.equal((await (await fetch(`${url}/api/reports`)).json()).length, 5, 'only the latest five reports are kept');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${url}/report?id=${saved.id}`);
  await page.locator('.deck-nav').waitFor();
  // Fixed navbar at the very top.
  const nav = await page.locator('.deck-nav').boundingBox(); assert.equal(Math.round(nav.y), 0);
  assert.equal(await page.locator('.deck-nav').evaluate(el => getComputedStyle(el).position), 'fixed');
  await page.screenshot({ path: `${shots}/deck-cover.png` });
  // Chapter tab → verdict with the new categories and flip cards.
  await page.getByRole('navigation', { name: 'Report chapters' }).getByRole('button', { name: 'Schedule' }).or(page.locator('.deck-tabs button', { hasText: /Sessions|Schedule|Classes/ })).first().click();
  await page.locator('.deck-verdict').waitFor();
  for (const label of ['Root cause', 'Where it concentrates', 'What held up', 'Structural or one-off?', 'Value at stake', 'Watch next month', 'Decision for leadership']) assert.ok(await page.locator('.deck-verdict').getByText(label, { exact: true }).count(), `verdict shows ${label}`);
  assert.ok(await page.locator('.deck-bullets li').count() >= 3, 'summary renders as bullets'); await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/deck-verdict.png`, fullPage: false });
  const card = page.locator('.deck-flip').first();
  await card.locator('.deck-flip-front').click();
  assert.equal(await card.getAttribute('data-flipped'), 'true');
  await page.waitForTimeout(700);
  assert.ok(await card.locator('.deck-flip-chart svg').count(), 'flipped card draws its 14-month chart');
  await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${shots}/deck-flip.png` });
  // Speaker notes follow the page.
  assert.equal(await page.locator('.deck-drawer').getAttribute('data-open'), 'true');
  const opener = await page.locator('.deck-notes-opener').innerText();
  await page.locator('.deck-sections').getByRole('tab', { name: /Insights/ }).click();
  await page.waitForFunction(previous => document.querySelector('.deck-notes-opener')?.textContent !== previous, opener);
  assert.ok(await page.locator('.r2-insight').count() >= 2); await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/deck-insights.png` });
  await page.keyboard.press('ArrowRight');
  await page.locator('.deck-register').waitFor();
  assert.ok(await page.locator('.monthly-table table tbody tr').count() >= 3, 'MoM table renders');
  await page.locator('.monthly-table-controls .segmented button', { hasText: 'MoM Δ' }).click();
  await page.locator('.monthly-table tbody tr').first().locator('td button').nth(3).click();
  assert.ok(await page.locator('.deck-selected-month').count() > 0, 'clicking a month pins it');
  await page.waitForTimeout(600); await page.screenshot({ path: `${shots}/deck-trends.png` });
  await page.keyboard.press('ArrowRight'); await page.locator('.deck-evidence').waitFor(); await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/deck-evidence.png` });
  // AI talk track.
  await page.getByRole('button', { name: /Write talk track with AI/ }).click();
  await page.getByText('AI opener for this page.').waitFor();
  // Admin: unlock, edit text, AI-replace one component, save to the database.
  await page.getByRole('button', { name: 'Unlock admin editing' }).click();
  await page.getByLabel('Admin passcode').fill('verify-admin'); await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.locator('.deck-edit-banner').waitFor();
  await page.locator('.deck-tabs button').first().click();
  await page.locator('.deck-tabs button').nth(2).click();
  const headline = page.locator('.deck-verdict h2.deck-editable');
  await headline.click(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Edited verdict headline'); await page.locator('.deck-page-head h1').click();
  await page.locator('[data-slot$=":summary:metrics"] .deck-ai').click();
  await page.locator('.deck-ai-panel textarea').fill('Bar chart of attendance');
  await page.getByRole('button', { name: 'Generate' }).click();
  await page.getByRole('button', { name: 'Use this' }).click();
  assert.ok(await page.locator('[data-slot$=":summary:metrics"][data-replaced=true] .deck-spec').count(), 'only that component is replaced');
  assert.ok(await page.locator('.deck-verdict').count(), 'the rest of the page is untouched');
  await page.screenshot({ path: `${shots}/deck-admin.png` });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Changes saved to the database.').waitFor();
  const stored = await (await fetch(`${url}/api/reports/${saved.id}`)).json();
  assert.ok(Object.values(stored.narratives).some(n => n.cards.some(c => c.headline === 'Edited verdict headline')), 'edit persisted');
  assert.ok(Object.keys(stored.replacements).some(k => k.endsWith(':summary:metrics')), 'replacement persisted');
  assert.ok(Object.keys(stored.speakerNotes ?? {}).length === 1, 'AI talk track persisted');
  await page.reload(); await page.locator('[data-replaced=true]').waitFor();
  // Pin.
  await page.getByRole('button', { name: 'Pin report' }).click(); await page.getByText(/Pinned/).first().waitFor();
  // Mobile.
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow on mobile');
  await page.screenshot({ path: `${shots}/deck-mobile.png` });
  assert.deepEqual(errors, []);
  console.log('PASS: fixed navbar, chapter/section tabs, verdict categories, flip cards, MoM table + chart, evidence, live + AI speaker notes, admin edit, AI component swap, DB persistence, pinning, retention, mobile.');
} finally { await browser?.close(); await vite.close(); http.closeAllConnections(); await new Promise(r => http.close(r)); }
