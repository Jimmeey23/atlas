import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSource } from '../src/data/source-preparation';

test('a saved snapshot is published while the freshness probe is still pending', async () => {
  let resolveRevision!: (value: string | null) => void;
  const probe = new Promise<string | null>(resolve => { resolveRevision = resolve; });
  let data = false;
  let published!: () => void;
  const snapshotPublished = new Promise<void>(resolve => { published = resolve; });
  let finished = false;
  const job = prepareSource({ force: false, hasData: () => data, revision: () => probe,
    loadSnapshot: async () => { data = true; published(); },
  }).then(value => { finished = true; return value; });
  await snapshotPublished;
  assert.equal(data, true);
  assert.equal(finished, false, 'freshness checking continues after snapshot is usable');
  resolveRevision('r1');
  assert.equal(await job, 'r1');
});

test('cold sources do not wait for a slow freshness probe, but force requests do', async () => {
  let resolveRevision!: (value: string | null) => void;
  const probe = new Promise<string | null>(resolve => { resolveRevision = resolve; });
  const options = { hasData: () => false, revision: () => probe, loadSnapshot: async () => {} };
  assert.equal(await prepareSource({ ...options, force: false }), null);
  let done = false;
  const forced = prepareSource({ ...options, force: true }).then(result => { done = true; return result; });
  await Promise.resolve();
  assert.equal(done, false);
  resolveRevision('r2');
  assert.equal(await forced, 'r2');
});
