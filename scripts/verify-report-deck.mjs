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
// A small Sessions sheet so Explore data renders real grouped rows; every other source is unavailable.
const formats = ['Barre 57', 'PowerCycle', 'Strength Lab'], trainers = ['Asha', 'Rohan', 'Meera', 'Kabir'], times = ['07:00', '09:00', '18:30'];
const sheetRows = Array.from({ length: 72 }, (_, i) => [`2026-09-${String(1 + i % 28).padStart(2, '0')} ${times[i % 3]}:00`, 'Kenkere House', trainers[i % 4], formats[i % 3], times[i % 3], 14, 9 + i % 5, 6 + i % 7, i % 3 ? 0 : 1, i % 4 ? 0 : 1, 2400 + (i % 6) * 650]);
api.get('/api/sheets/:key', (req, res) => req.params.key === 'sessions'
  ? res.json({ key: 'sessions', title: 'Sessions', id: 'fixture', status: 'ok', fetchedAt: Date.now(), hash: 'fixture-sessions', columns: ['Date', 'Location', 'Trainer', 'Class', 'Time', 'Capacity', 'Booked', 'CheckedIn', 'LateCancelled', 'Complimentary', 'Revenue'], rows: sheetRows })
  : res.status(404).json({ status: 'error', error: 'Not in the fixture' }));
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
    sessions: { generated: true, summary: 'Demand fell while supply held. Fill rate dropped to 63%. Saturday Barre carried most of the decline.',
      briefing: { takeaways: ['Attendance 747, down 15.1% on August and the lowest month of 2026', 'Fill rate 63%, down 7.7pp as sessions held at 98', 'Barre lost 84 visits; Saturday mornings carry 70% of the drop', 'PowerCycle held fill at 72% with evening class sizes up'],
        whatChanged: 'Visits fell 133 to 747 while supply held at 98 sessions, so fill slipped 7.7pp to 63%. Against September last year attendance is 4% lower; year to date it is still 6% ahead.',
        whyItMoved: 'Volume, not rate: Barre lost 84 visits and Strength Lab 51, while PowerCycle was flat. Repeat visits per member fell from 3.1 to 2.6. Leading hypothesis: one Saturday Barre instructor change reduced repeat bookings; check week-by-week bookings for those slots.',
        whereItSits: 'Barre (−84) and Saturday 9–11am (−104) carry 70% of the decline; weekday evenings are broadly flat.',
        whatHeldUp: 'PowerCycle fill held at 72% and evening average class size rose, so demand loss is slot-specific rather than studio-wide.',
        outlook: 'New reversal after gains March–July. The three-month pace implies about 830 visits in October; last year\'s seasonality implies about 790.',
        soWhat: 'If Saturday Barre stays at this level, the studio forgoes roughly 524 visits a month, indicatively ₹3.7L at ₹714 per visit.' },
      decision: { call: 'Rotate the Saturday 9–11am Barre instructors and re-open two trial spots per class for October', rationale: 'The decline is concentrated in a few Saturday slots rather than across the timetable, so a targeted schedule change addresses most of the loss without disrupting slots that held up. Doing nothing leaves the largest single gap in the month unaddressed.',
        evidence: ['Saturday 9–11am attendance −104 visits vs August', 'Barre −84 visits; PowerCycle +2', 'Fill rate 63% vs 70.7% in August', 'Repeat visits per member 2.6 vs 3.1'],
        expectedImpact: 'Indicative ≈₹3.7L/month if Saturday Barre recovers August levels (524 visits × ₹714 average revenue per visit).', successMeasure: 'Saturday Barre fill above 70% by the October review.',
        risks: 'Instructor rotation can unsettle loyal regulars; keep the most-booked instructor on one of the two slots as a guardrail.', alternative: 'Cutting Saturday capacity would lift fill on paper but lose revenue; the evidence points to demand, not oversupply.', owner: 'Studio operations', horizon: 'Next 30 days' },
      performers: { leaders: 'PowerCycle leads on fill at 72%, ten points above Barre, and held its level against August.', laggards: 'Strength Lab trails at 55% fill on fewer sessions; its sample is thin, so treat it as a signal.', pattern: 'The gap is about Saturday morning Barre, not format quality overall.' },
      questions: [{ q: 'Is this seasonal?', a: 'Partly: September dipped last year too, but by 4%, not 15%.' }, { q: 'Did we lose members or visits?', a: 'Visits: active member count is flat; frequency fell.' }],
      cards: [verdict('Attendance down 15.1% MoM as Barre and Saturday slots slipped'), { headline: 'Barre attendance fell 84 visits', meaning: 'Barre carries most of the decline.', evidence: '420 vs 504', action: 'Rebalance Saturday Barre slots.', focus: 'format', lens: 'risk', metrics: ['attendance'], highlight: ['Barre'], priority: 'high', confidence: 'medium', driver: 'Fewer repeat visits', concentration: 'Saturday 9–11am', offset: 'PowerCycle flat', trend: 'New', impact: '₹60k', watch: 'Saturday fill' }, { headline: 'PowerCycle held its fill rate', meaning: 'Evening demand is resilient.', evidence: '72% vs 71%', action: '', focus: 'format', lens: 'win', metrics: ['fill_rate'], priority: 'low', confidence: 'high' }] },
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
  await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/deck-cover.png` });
  assert.ok(await page.locator('.dk-score').count() >= 2, 'cover carries the chapter scorecard');
  await page.locator('.dk-scorecard').scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/deck-cover-2.png` });
  await page.locator('#main').evaluate(el => el.scrollTo({ top: 0 }));
  // Chapter tab → verdict with the new categories and flip cards.
  await page.getByRole('navigation', { name: 'Report chapters' }).getByRole('button', { name: 'Schedule' }).or(page.locator('.deck-tabs button', { hasText: /Sessions|Schedule|Classes/ })).first().click();
  await page.locator('.dk-brief').waitFor();
  for (const label of ['The reading', 'Where it sits', 'Against the year', 'What moved the number']) assert.ok(await page.locator('.dk-brief').getByText(label, { exact: true }).count(), `reading shows ${label}`);
  assert.ok(await page.locator('.dk-bridge-row').count() >= 3, 'the driver bridge decomposes the movement');
  assert.ok(await page.locator('.dk-portfolio').count(), 'the portfolio map places each row on contribution against momentum');
  assert.ok(await page.locator('.dk-ask li').count() >= 3, 'the page offers the questions it raises');
  assert.ok((await page.locator('.deck-page-question').innerText()).length > 0, 'each page states the question it answers');
  assert.ok(await page.locator('.deck-sections').getByRole('tab', { name: 'Executive pulse' }).count(), 'sections are named as intelligence layers');
  // The revenue chapter takes the movement apart: volume against spend, then reads its quality.
  await page.locator('.deck-tabs button', { hasText: /Sales|Revenue/ }).first().click();
  await page.locator('.dk-anatomy').waitFor();
  assert.equal(await page.locator('.dk-anatomy .dk-anat-row').count(), 3, 'the anatomy bridge shows both effects and the net change');
  assert.ok((await page.locator('.dk-quality-verdict').innerText()).trim().length > 0, 'the growth-quality read names a verdict');
  assert.ok(await page.locator('.dk-quality-rows > div').count() >= 3, 'quality rows read momentum beside the topline');
  await page.locator('.dk-ask').scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/deck-anatomy.png` });
  await page.locator('#main').evaluate(el => el.scrollTo({ top: 0 }));
  await page.locator('.deck-tabs button', { hasText: /Schedule|Sessions/ }).first().click();
  await page.locator('.dk-brief').waitFor();
  for (const label of ['Action centre', 'Expected outcome', 'How we will know', 'Guardrail']) assert.ok(await page.locator('.dk-decision').getByText(label, { exact: true }).count(), `action centre shows ${label}`);
  assert.ok((await page.locator('.deck-metric-grid').boundingBox()).y < (await page.locator('.dk-brief').boundingBox()).y, 'metric cards sit above the briefing');
  assert.ok(await page.locator('.dk-takeaways li').count() >= 3, 'briefing lists takeaways'); await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/deck-verdict.png`, fullPage: false });
  await page.locator('.dk-decision').scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/deck-decision.png` });
  const card = page.locator('.deck-flip').first();
  await card.locator('.deck-flip-front').click();
  assert.equal(await card.getAttribute('data-flipped'), 'true');
  const second = page.locator('.deck-flip').nth(1);
  await second.locator('.deck-flip-front').click(); await page.waitForTimeout(700);
  assert.equal(await card.getAttribute('data-flipped'), 'false', 'flipping another card unflips the first');
  assert.equal(await page.locator('.deck-flip[data-flipped=true]').count(), 1, 'only one card flipped');
  await second.getByRole('button', { name: 'Flip back' }).click(); await page.waitForTimeout(700);
  assert.equal(await second.getAttribute('data-flipped'), 'false', 'clicking again flips back');
  await card.locator('.deck-flip-front').click();
  await page.waitForTimeout(700);
  assert.ok(await card.locator('.deck-flip-chart svg').count(), 'flipped card draws its 14-month chart');
  await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${shots}/deck-flip.png` });
  // Speaker notes start closed and follow the page once opened; they never repeat on-screen text.
  assert.equal(await page.locator('.deck-drawer').getAttribute('data-open'), 'false', 'notes start closed');
  await page.getByRole('button', { name: 'Notes' }).click();
  assert.equal(await page.locator('.deck-drawer').getAttribute('data-open'), 'true');
  const opener = await page.locator('.deck-notes-opener').innerText();
  await page.locator('.deck-sections').getByRole('tab', { name: /AI discoveries/ }).click();
  await page.waitForFunction(previous => document.querySelector('.deck-notes-opener')?.textContent !== previous, opener);
  assert.ok(await page.locator('.deck-insight').count() >= 2, 'every finding is on the page');
  await page.locator('.dk-view-toggle').getByRole('button', { name: /One at a time/ }).click();
  assert.ok(await page.locator('.dk-rail button').count() >= 2, 'insight rail lists every finding');
  await page.locator('.dk-rail button').nth(1).click(); await page.waitForTimeout(400);
  assert.ok((await page.locator('.deck-insight-headline h3').first().innerText()).length > 0);
  assert.ok(await page.locator('.deck-notes-qa').count() >= 5, 'notes carry a question bank');
  await page.screenshot({ path: `${shots}/deck-insights.png` });
  await page.locator('.dk-rail button').first().click();
  // Notes change the available report width without changing the viewport breakpoint.
  for (const width of [1440, 1280, 390]) {
    if (width === 390) await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.setViewportSize({ width, height: 920 });
    await page.waitForTimeout(350);
    const layout = await page.locator('.dk-insights').evaluate(root => {
      const rail = root.querySelector('.dk-rail').getBoundingClientRect();
      const card = root.querySelector('.deck-insight').getBoundingClientRect();
      const claim = root.querySelector('.deck-insight-claim').getBoundingClientRect();
      return { width: root.clientWidth, overflow: root.scrollWidth - root.clientWidth,
        railBottom: rail.bottom, cardTop: card.top, cardWidth: card.width, claimWidth: claim.width };
    });
    assert.ok(layout.overflow <= 1, `insights fit their reading panel at ${width}px`);
    if (layout.width <= 1100) assert.ok(layout.railBottom <= layout.cardTop + 1, 'finding rail sits above the card in a reduced reading panel');
    assert.ok(layout.claimWidth >= Math.min(360, layout.cardWidth - 2), 'the finding remains readable with notes or on mobile');
    const metricOverlap = await page.locator('.deck-proof-metric').evaluateAll(metrics => metrics.some(metric => {
      const value = metric.querySelector('strong')?.getBoundingClientRect();
      const spark = metric.querySelector('.r2-spark')?.getBoundingClientRect();
      return value && spark && Math.min(value.right, spark.right) > Math.max(value.left, spark.left)
        && Math.min(value.bottom, spark.bottom) > Math.max(value.top, spark.top);
    }));
    assert.equal(metricOverlap, false, 'metric values and sparklines never overlap');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `page fits at ${width}px`);
    await page.screenshot({ path: `${shots}/deck-insights-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 920 });
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.keyboard.press('ArrowRight');
  await page.locator('.dk-performers').waitFor(); await page.locator('.dk-criteria button').nth(1).click();
  await page.locator('.dk-perf-name').first().click(); await page.waitForTimeout(300);
  assert.ok(await page.locator('.dk-perf-detail').count(), 'a performer row expands to every measure');
  await page.screenshot({ path: `${shots}/deck-performers.png` });
  await page.keyboard.press('ArrowRight'); await page.locator('.dk-outlook').waitFor();
  await page.locator('.dk-scenario-bar button', { hasText: 'Last year' }).click();
  assert.equal(await page.locator('.dk-scenario-bar button[aria-pressed=true]').innerText(), "Last year's season", 'scenario switches');
  await page.locator('.dk-scenario footer button', { hasText: "Last year's pattern" }).first().click();
  assert.ok(await page.locator('.dk-scenario-ly').count(), 'last-year pattern opens');
  assert.ok(await page.locator('.dk-scenario-read').count(), 'each measure has a written reading');
  await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/deck-outlook.png` });
  await page.keyboard.press('ArrowRight');
  await page.locator('.deck-register').waitFor();
  assert.ok(await page.locator('.monthly-table table tbody tr').count() >= 3, 'MoM table renders');
  await page.locator('.monthly-table-controls .segmented button', { hasText: 'MoM Δ' }).click();
  await page.locator('.monthly-table tbody tr').first().locator('td button').nth(3).click();
  assert.ok(await page.locator('.deck-selected-month').count() > 0, 'clicking a month pins it');
  await page.locator('.deck-record-dialog').waitFor();
  // The dialog shows the clicked cell's records, with its context, not the whole month.
  await page.locator('.deck-record-dialog .dk-x-context').waitFor();
  assert.match(await page.locator('.deck-record-dialog .dk-x-context').innerText(), /Showing/);
  await page.waitForTimeout(600); await page.screenshot({ path: `${shots}/deck-drill.png` });
  await page.getByRole('button', { name: 'Close source records' }).click();
  await page.waitForTimeout(600); await page.screenshot({ path: `${shots}/deck-trends.png` });
  await page.keyboard.press('ArrowRight'); await page.locator('.dk-tables').waitFor(); await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/deck-evidence.png` });
  await page.keyboard.press('ArrowRight'); await page.locator('.dk-explorer').waitFor();
  await page.locator('.dk-x-group-row').first().waitFor({ timeout: 20000 });
  assert.ok(await page.locator('.dk-x-group-row').count() >= 2, 'records group by the chapter breakdown');
  await page.locator('.dk-x-group-row button').first().click();
  assert.ok(await page.locator('.dk-x-group-body[data-open=true] tr').count() > 1, 'a group expands to its rows');
  await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/deck-data.png` });
  // AI talk track.
  await page.getByRole('button', { name: /Write talk track with AI/ }).click();
  await page.getByText('AI opener for this page.').waitFor();
  // Admin: unlock, edit text, AI-replace one component, save to the database.
  await page.getByRole('button', { name: 'Unlock admin editing' }).click();
  await page.getByLabel('Admin passcode').fill('verify-admin'); await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.locator('.deck-edit-banner').waitFor();
  await page.locator('.deck-tabs button').first().click();
  await page.locator('.deck-tabs button').nth(2).click();
  const headline = page.locator('.dk-brief h2.deck-editable');
  await headline.click(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Edited verdict headline'); await page.locator('.deck-page-head h1').click();
  await page.locator('[data-slot$=":summary:metrics"] .deck-ai').click();
  await page.locator('.deck-ai-panel textarea').fill('Bar chart of attendance');
  await page.getByRole('button', { name: 'Generate' }).click();
  await page.getByRole('button', { name: 'Use this' }).click();
  assert.ok(await page.locator('[data-slot$=":summary:metrics"][data-replaced=true] .deck-spec').count(), 'only that component is replaced');
  assert.ok(await page.locator('.dk-brief').count(), 'the rest of the page is untouched');
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
  // Dark theme: the same page reads correctly on the app's dark surfaces.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'midnight'));
  await page.locator('.deck-tabs button', { hasText: 'Schedule' }).click(); await page.locator('.dk-decision').scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/deck-dark.png` });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'gloss'));
  // Mobile.
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow on mobile');
  await page.screenshot({ path: `${shots}/deck-mobile.png` });
  assert.deepEqual(errors, []);
  console.log('PASS: fixed navbar, chapter/section tabs, the reading with driver bridge, action centre, discovery cards with evidence, flip measures, MoM table + chart, live + AI speaker notes, admin edit, AI component swap, DB persistence, pinning, retention, mobile.');
} finally { await browser?.close(); await vite.close(); http.closeAllConnections(); await new Promise(r => http.close(r)); }
