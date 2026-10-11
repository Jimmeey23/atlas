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
      document: {
        sections: [
          { title: 'Start here', sub: 'Demand fell while supply held. The month lost visits, not members.', lens: 'risk', priority: 'high',
            paragraphs: ['September delivered **747 visits across 98 sessions**, down 133 on August and the lowest month of 2026. Supply did not move: the studio ran the same timetable it ran all summer, so the fall in volume went straight into fill, which slipped **7.7 points to 63%**.',
              'Against September last year the picture is milder. Attendance is 4% lower than a year ago and the year to date is still 6% ahead, so this is a reversal of a strong summer rather than a collapse.',
              '**First, the loss is concentrated.** Barre lost 84 visits and Saturday mornings carry most of it; weekday evenings are broadly flat. **Second, the members are still here.** Active members held level while visits per member fell from 3.1 to 2.6.'],
            callout: { title: 'The one-line version, if you read nothing else', body: 'If Saturday Barre stays where it is, the studio forgoes roughly **524 visits a month**, indicatively ₹3.7L at ₹714 a visit. Everything else in the timetable held up, so this is one problem with one owner rather than a studio-wide slowdown.' },
            exhibits: [{ ref: 'sessions/trend/attendance', view: 'chart', caption: 'Attendance by month — September undid the summer gains', note: 'September at 747 is the lowest point since March; the same month last year sits 4% higher.', highlight: [] }],
            evidence: { title: 'Evidence — the month against every comparison', ref: 'sessions/kpis', note: 'Rates move in percentage points. Year to date compares the same elapsed months.' } },
          { title: 'Saturday Barre carried the fall', sub: 'Barre attendance fell 84 visits, and almost all of it sits in two Saturday morning slots.', lens: 'risk', priority: 'high',
            paragraphs: ['**Barre fell from 504 visits to 420**, while PowerCycle was flat at 230 and Strength Lab lost 51 on a thin base. Barre is the studio\'s largest format, so a fall there moves the whole month.',
              'The leading hypothesis is the Saturday instructor change: repeat bookings in those slots dropped first. That is a hypothesis, and week-by-week bookings for the two slots would confirm or reject it.'],
            callout: null,
            exhibits: [{ ref: 'sessions/group/format', view: 'chart', caption: 'Attendance by format — Barre carried the decline', note: 'Barre is down 84 visits on August; PowerCycle is up 2.', highlight: ['Barre'] }],
            evidence: { title: 'Evidence — every format, against August and last year', ref: 'sessions/group/format', note: 'Formats with fewer than three sessions are excluded from the ranking.' } },
          { title: 'Evenings held up', sub: 'PowerCycle held its fill at 72%, so the problem is a slot, not the studio.', lens: 'win', priority: 'medium',
            paragraphs: ['PowerCycle fill held at **72% against 71% in August**, and evening class sizes rose. Demand for the studio has not gone anywhere; it has stopped coming on Saturday mornings.',
              'That matters for the response. A studio-wide promotion would spend money on members who are already booking; the evidence points to one slot.'],
            callout: { title: 'A flat evening is the strongest evidence that this is fixable', body: 'If the whole timetable had softened, the answer would be acquisition. It did not: the evening book held while the weekend morning thinned, which points at the slot and the instructor rather than at the market.' },
            exhibits: [{ ref: 'sessions/trend/fill_rate', view: 'chart', caption: 'Fill rate by month — the slide began in August', note: 'Fill reached its 2026 high in July before falling for two months.', highlight: [] }],
            evidence: null },
          { title: 'What next month looks like', sub: 'Conditional arithmetic, not a forecast: October lands between 790 and 830 visits on recent patterns.', lens: 'watch', priority: 'low',
            paragraphs: ['If the three-month pace holds, attendance sits around 830 in October; last year\'s seasonality alone would put it nearer 790. Neither is a forecast.'],
            callout: null,
            exhibits: [{ ref: 'sessions/scenarios', view: 'table', caption: 'Next month under four conditional scenarios', note: 'Each column applies one assumption to this month.', highlight: [] }],
            evidence: null },
        ],
        recommendations: [
          { title: 'Rotate the Saturday 9–11am Barre instructors for October', owner: 'Instructor management', horizon: 'Next 30 days', reasoning: 'Saturday 9–11am lost **104 visits** against August and Barre lost 84; the rest of the timetable was flat.', impact: 'Recovering August levels on those slots is worth roughly 524 visits a month, indicatively ₹3.7L at ₹714 a visit.' },
          { title: 'Call members whose visits halved this month', owner: 'Member experience', horizon: 'Immediate', reasoning: 'Visits per member fell from **3.1 to 2.6** while active members held flat.', impact: 'The members are still contactable; a call costs nothing and protects renewals.' },
          { title: 'Hold evening capacity as it is', owner: 'Studio operations', horizon: 'Monitor', reasoning: 'PowerCycle fill held at **72%** and evening class sizes rose.', impact: 'Avoids moving supply away from the slots that are working.' },
        ],
        method: ['Figures come from the Sessions sheet for Kenkere House, frozen when the report was built. Fill is attendance over capacity across all sessions, weighted by capacity.', 'Instructor effects are hypotheses: the data records who taught, not why members came.'],
      },
      questions: [{ q: 'Is this seasonal?', a: 'Partly: September dipped last year too, but by 4%, not 15%.' }, { q: 'Did we lose members or visits?', a: 'Visits: active member count is flat; frequency fell.' }],
      cards: [verdict('Attendance down 15.1% MoM as Barre and Saturday slots slipped'), { section: 'Saturday Barre carried the fall', headline: 'Barre attendance fell 84 visits', meaning: 'Barre carries most of the decline.', evidence: '420 vs 504', action: 'Rebalance Saturday Barre slots.', focus: 'format', lens: 'risk', metrics: ['attendance'], highlight: ['Barre'], priority: 'high', confidence: 'medium', driver: 'Fewer repeat visits', concentration: 'Saturday 9–11am', offset: 'PowerCycle flat', trend: 'New', impact: '₹60k', watch: 'Saturday fill' }, { section: 'Evenings held up', headline: 'PowerCycle held its fill rate', meaning: 'Evening demand is resilient.', evidence: '72% vs 71%', action: '', focus: 'format', lens: 'win', metrics: ['fill_rate'], priority: 'low', confidence: 'high' }] },
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
  // Fixed navbar at the very top, chapters only: no section tabs.
  const nav = await page.locator('.deck-nav').boundingBox(); assert.equal(Math.round(nav.y), 0);
  assert.equal(await page.locator('.deck-nav').evaluate(el => getComputedStyle(el).position), 'fixed');
  assert.equal(await page.locator('.deck-sections').count(), 0, 'chapters are not split into section tabs');
  await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/deck-cover.png` });
  assert.ok(await page.locator('.dk-score').count() >= 2, 'cover carries the chapter scorecard');
  // The overview reads on from the cover as the executive document.
  await page.locator('.cr-toc').first().scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/deck-overview-doc.png` });
  // A chapter is one document: kicker, title, lede, meta, contents, figures, numbered sections.
  await page.locator('.deck-tabs button', { hasText: /Sessions|Schedule|Classes/ }).first().click();
  await page.locator('.cr-head h1').waitFor();
  assert.match(await page.locator('.cr-kick').innerText(), /Chapter \d+ of \d+/i);
  assert.match(await page.locator('.cr-lede').innerText(), /Demand fell while supply held/);
  assert.ok(await page.locator('.cr-meta span').count() >= 4, 'meta line under the lede');
  const toc = await page.locator('.cr-toc a').allInnerTexts();
  for (const title of ['Start here', 'Saturday Barre carried the fall', 'Evenings held up', 'What next month looks like', 'Recommendations', 'Method and limitations'])
    assert.ok(toc.some(t => t.includes(title)), `contents list ${title}`);
  for (const gone of ['Leaders and laggards', 'Month by month', 'The breakdowns']) assert.ok(!toc.some(t => t.includes(gone)), `no ${gone} appendix`);
  assert.equal(await page.locator('.cr-section').count(), toc.length, 'every contents entry is a section');
  assert.ok(await page.locator('.cr-kpis .cr-figure').count() >= 4, 'key figures strip');
  assert.ok((await page.locator('.cr-kpis').boundingBox()).y > (await page.locator('.cr-toc').boundingBox()).y, 'figures follow the contents');
  await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/deck-chapter-head.png` });
  // Start here: thesis, argued paragraphs with bold claims, its chart, the one-line version, the evidence fold.
  const start = page.locator('.cr-section').first();
  assert.match(await start.locator('.cr-sub').innerText(), /Demand fell while supply held/);
  assert.equal(await start.locator('.cr-body > p').count(), 3, 'Start here argues in paragraphs');
  assert.ok(await start.locator('.cr-body > p strong', { hasText: '747 visits across 98 sessions' }).count(), 'the claim a paragraph turns on is bold');
  assert.match(await start.locator('.cr-call-title').innerText(), /The one-line version/);
  assert.ok(await start.locator('.cr-fig[data-ref="sessions/trend/attendance"] svg.cr-line').count(), 'trend exhibit drawn from the frozen history');
  assert.match(await start.locator('.cr-fig figcaption').innerText(), /September undid the summer gains/);
  await start.locator('.cr-ev summary').click();
  assert.ok(await start.locator('.cr-ev .cr-table tbody tr').count() >= 4, 'evidence fold lists the headline measures');
  await start.locator('.cr-call').scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/deck-start-here.png` });
  await start.locator('.cr-fig').screenshot({ path: `${shots}/deck-trend.png` });
  // The month's point on the trend opens its records.
  await start.locator('.cr-pt[data-key=now] circle:not(.cr-hit)').click();
  await page.locator('.deck-record-dialog[open]').waitFor();
  await page.getByRole('button', { name: 'Close source records' }).click();
  // An argued section: thesis as subheading, breakdown chart with the named row drawn in the accent, the full table folded.
  await page.locator('.cr-toc a', { hasText: 'Saturday Barre carried the fall' }).click(); await page.waitForTimeout(700);
  const finding = page.locator('.cr-section', { has: page.locator('h2', { hasText: 'Saturday Barre carried the fall' }) });
  assert.match(await finding.locator('.cr-sub').innerText(), /Barre attendance fell 84 visits/);
  assert.equal(await finding.locator('.cr-fig .cr-bar').count(), 3, 'the breakdown chart draws every format');
  assert.equal(await finding.locator('.cr-fig .cr-bar[data-named=true]').innerText().then(t => t.split('\n')[0]), 'Barre');
  await finding.locator('.cr-ev summary').click();
  assert.equal(await finding.locator('.cr-ev .cr-table tbody tr').count(), 3, 'evidence fold lists every row');
  assert.ok(await finding.locator('.cr-ev .cr-table tbody tr[data-named=true]').count(), 'the named row is marked in the table');
  await page.screenshot({ path: `${shots}/deck-finding.png` });
  await finding.locator('.cr-fig .cr-bar').first().click();
  await page.locator('.deck-record-dialog[open]').waitFor();
  await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/deck-drill.png` });
  await page.getByRole('button', { name: 'Close source records' }).click();
  // A callout and a second chart further down; the scenario table is drawn from the figures.
  const evenings = page.locator('.cr-section', { has: page.locator('h2', { hasText: 'Evenings held up' }) });
  assert.match(await evenings.locator('.cr-call-title').innerText(), /fixable/);
  const next = page.locator('.cr-section', { has: page.locator('h2', { hasText: 'What next month looks like' }) });
  assert.ok(await next.locator('.cr-fig .cr-table tbody tr').count() >= 2, 'scenario table renders');
  // Speaker notes follow the section scrolled into view.
  assert.equal(await page.locator('.deck-drawer').getAttribute('data-open'), 'false', 'notes start closed');
  await page.getByRole('button', { name: 'Notes' }).click();
  assert.equal(await page.locator('.deck-drawer').getAttribute('data-open'), 'true');
  const opener = await page.locator('.deck-notes-opener').innerText();
  await page.locator('.cr-toc a', { hasText: 'Recommendations' }).click();
  await page.waitForURL(/#sessions\/plan$/); // the address follows the section in view
  await page.waitForFunction(previous => document.querySelector('.deck-notes-opener')?.textContent !== previous, opener);
  assert.ok(await page.locator('.deck-notes-qa').count() >= 2, 'notes carry a question bank');
  await page.screenshot({ path: `${shots}/deck-notes.png` });
  // Reading width with notes open, narrower and on a phone.
  for (const width of [1440, 1280, 390]) {
    if (width === 390) await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.setViewportSize({ width, height: 920 }); await page.waitForTimeout(350);
    const overflow = await page.locator('.cr').evaluate(root => root.scrollWidth - root.clientWidth);
    assert.ok(overflow <= 1, `chapter fits its reading panel at ${width}px`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `page fits at ${width}px`);
    await page.screenshot({ path: `${shots}/deck-chapter-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 920 });
  // Recommendations: numbered, owned, reasoning and expected impact.
  const recs = page.locator('.cr-rec');
  assert.equal(await recs.count(), 3, 'chapter closes with its recommendations');
  assert.ok(await recs.first().getByText('Reasoning', { exact: true }).count());
  assert.ok(await recs.first().getByText('Expected impact', { exact: true }).count());
  assert.match(await recs.first().locator('.cr-ro').innerText(), /Instructor management/i);
  await recs.first().scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/deck-recommendations.png` });
  // Method and limitations: the written note, definitions, and the source rows loading only when opened.
  const method = page.locator('.cr-section', { has: page.locator('h2', { hasText: 'Method and limitations' }) });
  assert.match(await method.locator('.cr-body > p').first().innerText(), /frozen when the report was built/);
  await method.locator('.cr-ev summary', { hasText: 'source records' }).click();
  await page.locator('.dk-x-group-row').first().waitFor({ timeout: 20000 });
  assert.ok(await page.locator('.dk-x-group-row').count() >= 2, 'records group by the chapter breakdown');
  await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/deck-method.png` });
  // A report written before documents existed reads in the same shape.
  await page.locator('.deck-tabs button', { hasText: 'Sales' }).first().click();
  await page.locator('.cr-head h1', { hasText: /Sales/ }).waitFor();
  assert.equal(await page.locator('.cr-section h2').first().innerText().then(t => t.toLowerCase()), 'start here');
  assert.match(await page.locator('.cr-section .cr-sub').first().innerText(), /Gross collections steady/);
  await page.locator('.deck-tabs button', { hasText: /Sessions|Schedule|Classes/ }).first().click();
  await page.locator('.cr-head h1', { hasText: /Schedule|Session|Class/ }).waitFor();
  // The downloaded report is the same documents, self-contained.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download HTML' }).click()]);
  const file = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
  assert.match(file, /class="cr-export"/); assert.match(file, /--accent:/, 'theme tokens travel with the file');
  assert.equal((file.match(/class="cr-head"/g) ?? []).length, 4, 'every chapter is in the file');
  assert.ok(file.includes('Saturday Barre carried the fall') && file.includes('cr-line') && file.includes('cr-rec'), 'sections, charts and recommendations exported');
  assert.ok(!file.includes('source records behind this chapter'), 'live-only explorers are left out');
  await (await import('node:fs/promises')).writeFile(`${shots}/deck-export.html`, file);
  // Arrow keys move between chapters.
  await page.locator('.cr-head h1').click();
  const title = await page.locator('.cr-head h1').innerText();
  await page.keyboard.press('ArrowRight'); await page.waitForFunction(t => document.querySelector('.cr-head h1')?.textContent !== t, title);
  assert.equal(await page.locator('#main').evaluate(el => el.scrollTop), 0, 'a new chapter opens at its top');
  await page.keyboard.press('ArrowLeft'); await page.waitForFunction(t => document.querySelector('.cr-head h1')?.textContent === t, title);
  // AI talk track.
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: /Write talk track with AI/ }).click();
  await page.getByText('AI opener for this page.').waitFor();
  // Admin: unlock, edit a subheading, AI-replace one component, save to the database.
  await page.getByRole('button', { name: 'Unlock admin editing' }).click();
  await page.getByLabel('Admin passcode').fill('verify-admin'); await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.locator('.deck-edit-banner').waitFor();
  const headline = page.locator('.cr-section').first().locator('.cr-sub.deck-editable');
  await headline.click(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Edited verdict headline'); await page.locator('.cr-head h1').click();
  await page.locator('[data-slot$=":summary:metrics"] .deck-ai').click();
  await page.locator('.deck-ai-panel textarea').fill('Bar chart of attendance');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await page.getByRole('button', { name: 'Use this' }).click();
  assert.ok(await page.locator('[data-slot$=":summary:metrics"][data-replaced=true] .deck-spec').count(), 'only that component is replaced');
  assert.ok(await page.locator('.cr-section').count() >= 5, 'the rest of the chapter is untouched');
  await page.screenshot({ path: `${shots}/deck-admin.png` });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Changes saved to the database.').waitFor();
  const stored = await (await fetch(`${url}/api/reports/${saved.id}`)).json();
  assert.equal(stored.narratives.sessions.document.sections[0].sub, 'Edited verdict headline', 'edit persisted to the document');
  assert.equal(stored.narratives.sessions.document.sections.length, 4, 'the rest of the document is intact');
  assert.ok(Object.keys(stored.replacements).some(k => k.endsWith(':summary:metrics')), 'replacement persisted');
  assert.ok(Object.keys(stored.speakerNotes ?? {}).length === 1, 'AI talk track persisted');
  await page.reload(); await page.locator('[data-replaced=true]').waitFor();
  // Pin.
  await page.getByRole('button', { name: 'Pin report' }).click(); await page.getByText(/Pinned/).first().waitFor();
  // Dark theme: the same document reads correctly on the app's dark surfaces.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'midnight'));
  await page.locator('#main').evaluate(el => el.scrollTo({ top: 0 })); await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/deck-dark.png` });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'gloss'));
  // Mobile.
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow on mobile');
  await page.screenshot({ path: `${shots}/deck-mobile.png` });
  assert.deepEqual(errors, []);
  console.log('PASS: fixed navbar, one document per chapter (kicker, lede, contents, figures, argued sections with exhibits and evidence folds, recommendations, method), legacy reports in the same shape, scroll-following speaker notes, record drills from charts, AI talk track, admin edit, AI component swap, DB persistence, pinning, retention, mobile.');
} finally { await browser?.close(); await vite.close(); http.closeAllConnections(); await new Promise(r => http.close(r)); }
