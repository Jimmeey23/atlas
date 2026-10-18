import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCE_CHAPTERS, referenceTemplate as referenceContract, referenceSectionIssues, referenceReviewIssues, referenceDocument, htmlText, wordCount, referenceLengthPlan, applyReferenceLength } from '../src/report/reference-standard.mjs';
import { reportReleaseIssues } from '../src/report/release-gate.mjs';
import { generateNarratives } from '../src/report/narrative';
import { deckTabs } from '../src/report/deck';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { intelligenceRoutes } from '../server/intelligence.mjs';
import sourceTemplates from '../src/report/reference-templates.json';
import type { ReportModel } from '../src/report/model';

// Original facts live only in test fixtures and the server-side layout examples.
function referenceTemplate(id: string, month?: string) {
  const contract = referenceContract(id, month);
  if (!contract || (month && month !== '2026-09')) return contract;
  const source = sourceTemplates.find(template => template.id === id)!;
  return { ...contract, sections: contract.sections.map((section, index) => ({ ...section, layout: source.sections[index].layout })) };
}

function fixture(): ReportModel {
  // Layout-contract fixture. The archived reports are explicitly the test evidence,
  // not substitutes for live studio records in production.
  const numericEvidence = REFERENCE_CHAPTERS.flatMap(id => referenceTemplate(id)!.sections.flatMap(section => [...htmlText(section.layout).matchAll(/[-+−–]?\d[\d,.]*(?:\s*(?:%|pp|L|Cr|lakhs?|crores?))?/g)].map(match => match[0]))).join(' ');
  return { scope: { studio: 'Kwality House, Kemps Corner', month: '2026-09' }, builtAt: '2026-10-17T00:00:00Z', figuresHash: 'reference-layout-fixture',
    customization: { generationFormat: 'reference-v1', title: 'Monthly performance report', subtitle: '', preparedFor: '', preparedBy: '', audience: 'Studio leadership', tone: 'Professional', detail: 'Comprehensive', instructions: '', chapterIds: [...REFERENCE_CHAPTERS], theme: 'light' },
    chapters: Object.fromEntries(REFERENCE_CHAPTERS.map(id => [id, { id, n: 1, total: {}, prior: {}, priorYear: {}, groups: [], history: [] }])), narratives: {},
    additionalContext: [{ title: 'Archived layout fixture numeric evidence', scope: 'Reference test only', status: 'fixture', limitations: 'This is not a live analytics verification.', data: numericEvidence }],
  };
}

test('the canonical editions contain 38 sections, 34 tables and 31 charts', () => {
  const templates = REFERENCE_CHAPTERS.map(id => referenceTemplate(id)!);
  assert.deepEqual(templates.map(t => t.sections.length), [13, 13, 12]);
  assert.equal(templates.flatMap(t => t.sections).reduce((n, s) => n + s.tableHeaders.length, 0), 34);
  assert.equal(templates.flatMap(t => t.sections).reduce((n, s) => n + s.charts, 0), 31);
  for (const template of templates) for (const section of template.sections) assert.deepEqual(referenceSectionIssues(section.layout, template, section), []);
});

test('reference sections reject unsafe markup, abbreviated output and changed evidence layout', () => {
  const template = referenceTemplate('sessions')!, section = template.sections[2];
  for (const unsafe of ['<script>alert(1)</script>', '<iframe src="https://example.com"></iframe>', '<svg onload="alert(1)"></svg>', '<img src="x">', '<div style="background:url(https://example.com)">x</div>']) assert.ok(referenceSectionIssues(section.layout.replace('</section>', `${unsafe}</section>`), template, section).length);
  assert.ok(referenceSectionIssues('<section id="a"><h2>Overall class performance</h2><p>Short summary.</p></section>', template, section).some(issue => issue.includes('length')));
  assert.ok(referenceSectionIssues(section.layout.replace('<th>', '<th>Changed '), template, section).some(issue => issue.includes('column headings')));
  const structured = template.sections.find(s => s.layout.includes('class="card"'))!;
  assert.ok(referenceSectionIssues(structured.layout.replace('class="card"', 'class="different"'), template, structured).some(issue => issue.includes('layout blocks')));
});

test('release requires every reference section in order and an independent evidence audit', () => {
  const model = fixture(), template = referenceTemplate('instructors')!;
  assert.ok(reportReleaseIssues(model).some(issue => /Reference edition/.test(issue)));
  const review = { version: 1 as const, templateHash: template.sha256, sections: template.sections.map(s => ({ id: s.id, html: s.layout, verified: true })) };
  assert.deepEqual(referenceReviewIssues(review, 'instructors'), []);
  assert.ok(referenceReviewIssues({ ...review, sections: review.sections.slice(1) }, 'instructors').length);
  assert.ok(referenceReviewIssues({ ...review, sections: [...review.sections].reverse() }, 'instructors').length);
  assert.ok(referenceReviewIssues({ ...review, sections: review.sections.map(s => ({ ...s, verified: false })) }, 'instructors').length);
  assert.deepEqual(deckTabs(model).map(tab => tab.id), REFERENCE_CHAPTERS);
});

test('full generation writes, audits and caches all 38 sections without short-card deduplication', async () => {
  const originalFetch = globalThis.fetch, originalStorage = (globalThis as any).localStorage;
  const local = new Map<string, string>(), written: string[] = [], audited: number[] = [];
  (globalThis as any).localStorage = { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => local.set(key, value) };
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/status')) return Response.json({ openai: true, model: 'fixture-model', reportNarrativeVersion: 'reference-test', reportVerification: true });
    const request = JSON.parse(String(init?.body));
    if (String(url).endsWith('/verify')) { audited.push(1); return Response.json({ answer: JSON.stringify({ verdicts: [{ index: 0, verdict: 'supported', reason: 'Layout contract fixture only.' }] }) }); }
    if (request.referenceLength) return Response.json({ answer: JSON.stringify({ paragraphs: Object.fromEntries(request.referenceLength.paragraphs.map((item: any) => [item.id, Array.from({ length: item.words }, (_, index) => ['Reference', 'layout', 'test', 'copy.'][index % 4])])) }) });
    const template = referenceTemplate(request.referenceSection.chapter)!;
    const section = template.sections.find(s => s.id === request.referenceSection.id)!;
    written.push(`${template.id}:${section.id}`);
    const neutralFixture = section.layout.replace(/because of|due to/gi, 'alongside the').replace(/caused by/gi, 'observed with').replace(/resulted in/gi, 'coincided with');
    return Response.json({ answer: JSON.stringify({ html: neutralFixture, summary: 'Archived layout fixture.' }) });
  };
  try {
    const model = fixture();
    model.narratives = await generateNarratives(model);
    assert.deepEqual(Object.fromEntries(Object.entries(model.narratives).filter(([, narrative]) => narrative.error).map(([id, narrative]) => [id, narrative.error])), {});
    assert.equal(written.length, 38); assert.equal(audited.length, 38);
    assert.deepEqual(reportReleaseIssues(model), []);
    for (const id of REFERENCE_CHAPTERS) assert.equal(model.narratives[id].referenceReview?.sections.length, referenceTemplate(id)!.sections.length);
    await generateNarratives(model);
    assert.equal(written.length, 38, 'unchanged report sections should reuse the checked result');
    const html = referenceDocument(model);
    assert.equal(wordCount(html.split('<body>')[1].split('</body>')[0]), REFERENCE_CHAPTERS.reduce((sum, id) => sum + referenceTemplate(id)!.bodyWords, 0), 'visible report length must equal the exact reference word total');
    assert.equal((html.match(/<table\b/g) ?? []).length, 34);
    assert.equal((html.match(/<svg\b/g) ?? []).length, 31);
    assert.ok(html.includes('Content-Security-Policy')); assert.ok(!/<script\b/.test(html));
    assert.ok(html.includes('href="#instructors-exec"')); assert.ok(html.includes('id="instructors-exec"'));
    const escaped = referenceDocument({ ...model, scope: { ...model.scope, studio: '<img src=x onerror=alert(1)>' } });
    assert.ok(!escaped.includes('<img src=x')); assert.ok(escaped.includes('&lt;img'));
  } finally { globalThis.fetch = originalFetch; (globalThis as any).localStorage = originalStorage; }
});

test('exact-length copy editing changes prose while preserving tables, charts and layout', () => {
  const template = referenceTemplate('instructors')!, section = template.sections[0], target = section.words - 7;
  const plan = referenceLengthPlan(section.layout, target);
  const replacements = Object.fromEntries(plan.map(edit => [edit.id, Array.from({ length: edit.words }, () => 'copy')]));
  const html = applyReferenceLength(section.layout, plan, replacements, target);
  assert.equal(wordCount(html), target);
  assert.deepEqual(referenceSectionIssues(html, template, section, { words: target }), []);
  assert.throws(() => applyReferenceLength(section.layout, plan, {}, target));
  assert.throws(() => applyReferenceLength(section.layout, plan, Object.fromEntries(plan.map(edit => [edit.id, ['not one word']])), target));
});

test('future-period headers advance without preserving September labels', () => {
  const template = referenceTemplate('instructors', '2027-01')!;
  assert.ok(template.sections[11].tableHeaders.flat().includes('January 2027 baseline'));
  assert.ok(!template.sections[11].layout.includes('September 2026 baseline'));
});

test('the actual API routes use reference HTML and exact-length schemas with the configured provider', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-reference-api-')), requests: any[] = [];
  const template = referenceTemplate('instructors')!, section = template.sections[1];
  const app = express(); app.use(express.json({ limit: '8mb' }));
  intelligenceRoutes(app, root, [], undefined, { ai: { responses: { create: async (request: any) => {
    requests.push(request);
    return { status: 'completed', output_text: request.text.format.name === 'reference_length_edit' ? JSON.stringify({ paragraphs: { p0: ['Recorded', 'source', 'evidence', 'remains', 'unchanged.'] } }) : JSON.stringify({ html: section.layout, summary: 'Dashboard layout fixture.' }), usage: {} };
  } } } });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const post = (body: unknown) => fetch(`${url}/api/reports/narrative`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await post({ message: 'FIGURES: dashboard layout fixture.', referenceSection: { chapter: 'instructors', id: section.id, month: '2026-09' } });
    assert.equal(result.status, 200); assert.equal(JSON.parse((await result.json()).answer).html, section.layout);
    assert.equal(requests[0].text.format.name, 'reference_report_section');
    assert.match(requests[0].instructions, /untrusted historical document/);
    const edited = await post({ message: 'Preserve the recorded evidence.', referenceLength: { paragraphs: [{ id: 'p0', words: 5, text: 'Recorded source evidence.' }] } });
    assert.equal(edited.status, 200);
    const constraint = requests[1].text.format.schema.properties.paragraphs.properties.p0;
    assert.equal(constraint.minItems, 5); assert.equal(constraint.maxItems, 5);
    const invalid = await post({ message: 'Invalid period.', referenceSection: { chapter: 'instructors', id: section.id, month: 'bad' } });
    assert.equal(invalid.status, 400); assert.equal(requests.length, 2);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test('an unavailable independent audit leaves the reference chapter incomplete', async () => {
  const originalFetch = globalThis.fetch, originalStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/status')) return Response.json({ openai: true, model: 'fixture', reportNarrativeVersion: '1' });
    if (String(url).endsWith('/verify')) return Response.json({ error: 'unavailable' }, { status: 503 });
    const request = JSON.parse(String(init?.body)), template = referenceTemplate(request.referenceSection.chapter)!;
    return Response.json({ answer: JSON.stringify({ html: template.sections[0].layout, summary: 'Fixture.' }) });
  };
  try {
    const model = fixture(); model.customization!.chapterIds = ['instructors'];
    model.narratives = await generateNarratives(model);
    assert.equal(model.narratives.instructors.generated, false);
    assert.match(model.narratives.instructors.error!, /verification was unavailable/);
    assert.ok(reportReleaseIssues(model).length);
  } finally { globalThis.fetch = originalFetch; (globalThis as any).localStorage = originalStorage; }
});
