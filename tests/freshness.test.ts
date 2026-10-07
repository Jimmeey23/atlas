import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreshness } from '../server/freshness.mjs';

const credentials = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REFRESH_TOKEN: 'token' };
function stubClient(getRequestHeaders = async () => ({ authorization: 'Bearer test' })) {
  return { getRequestHeaders };
}

/** A freshness probe wired to a counted fake Drive. */
function harness(responder: (url: string) => any) {
  const calls: string[] = [];
  const request = async (url: string) => { calls.push(url); return responder(url); };
  const probe = createFreshness({
    env: credentials as any,
    request: request as any,
    client: stubClient(),
  });
  return { probe, calls };
}

const ok = (modifiedTime: string) => ({ ok: true, status: 200, json: async () => ({ modifiedTime }) });

test('one workbook edit time is fetched once and shared by every source on it', async () => {
  const { probe, calls } = harness(() => ok('2026-10-07T09:00:00.000Z'));
  const sources = [
    { key: 'sessions', id: 'book-a' },
    { key: 'recurring', id: 'book-a' },
    { key: 'sales', id: 'book-b' },
  ];
  const revisions = await probe.revisions(sources as any);
  assert.equal(calls.length, 2, 'three sources across two workbooks means two calls');
  assert.equal(revisions.get('book-a')!.revision, '2026-10-07T09:00:00.000Z');

  // A second probe inside the window reuses the answer rather than asking again.
  await probe.revisions(sources as any);
  assert.equal(calls.length, 2);
  // Asking for a guaranteed-current reading bypasses it.
  await probe.revision('book-a', { maxAge: 0 });
  assert.equal(calls.length, 3);
});

test('a probe that cannot read Drive degrades instead of failing', async () => {
  for (const [status, label] of [[403, 'forbidden'], [500, 'server error']] as const) {
    const { probe } = harness(() => ({ ok: false, status, json: async () => ({}) }));
    const result = await probe.revision('book-a');
    assert.equal(result.revision, null, `${label} yields no revision`);
    assert.match(result.reason!, /\d{3}/);
  }
  const broken = createFreshness({ env: {} as any, request: (async () => ok('x')) as any });
  const result = await broken.revision('book-a');
  assert.equal(result.revision, null, 'no credentials means no revision, not a crash');
  assert.match(result.reason!, /credentials/i);
});
