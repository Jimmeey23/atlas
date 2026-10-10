import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sendSnapshot } from '../server/snapshot-response.mjs';
import { kraRoutes } from '../server/kra.mjs';

test('saved snapshots stream exact bytes, return bodyless 304 and reject mismatched metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-snapshot-'));
  await mkdir(path.join(root, '.cache'));
  const file = path.join(root, '.cache/sales.json');
  const bytes = JSON.stringify({ key: 'sales', rows: [['₹1,500', 'Member voice']], hash: 'first', fetchedAt: 123 });
  await writeFile(file, bytes);
  const info = await stat(file);
  const metadata = { hash: 'first', fetchedAt: 123, revision: 'revision-1', fileSize: info.size, fileMtime: info.mtimeMs };
  const app = express();
  app.get('/snapshot', async (req, res, next) => {
    try { if (!await sendSnapshot(req, res, root, { key: 'sales' }, metadata)) res.status(409).end(); }
    catch (error) { next(error); }
  });
  app.get('/missing', async (req, res) => { if (!await sendSnapshot(req, res, root, { key: 'missing' }, metadata)) res.status(404).end(); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const full = await fetch(base + '/snapshot');
    assert.equal(full.status, 200);
    assert.equal(await full.text(), bytes);
    assert.equal(full.headers.get('cache-control'), 'private, no-cache');
    const unchanged = await fetch(base + '/snapshot', { headers: { 'If-None-Match': '"first"' } });
    assert.equal(unchanged.status, 304);
    assert.equal(await unchanged.text(), '');
    assert.equal(unchanged.headers.get('x-snapshot-fetched-at'), '123');
    assert.equal(unchanged.headers.get('x-snapshot-revision'), 'revision-1');
    await writeFile(file, JSON.stringify({ hash: 'second', rows: [] }));
    assert.equal((await fetch(base + '/snapshot', { headers: { 'If-None-Match': '"first"' } })).status, 409);
    assert.equal((await fetch(base + '/missing')).status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test('concurrent KRA refreshes share one computation and fresh results are reused', async () => {
  const docs = new Map();
  const store = { read: async (key: string) => docs.get(key) ?? null, write: async (key: string, value: any) => { docs.set(key, value); return value; } };
  const keys = ['sales', 'leads', 'bookings', 'lapsed', 'new'];
  let loads = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const app = express();
  let arrivals = 0;
  let allArrived!: () => void;
  const entered = new Promise<void>(resolve => { allArrived = resolve; });
  app.use((_req, _res, next) => { if (++arrivals === 4) allArrived(); next(); });
  kraRoutes(app, tmpdir(), keys.map(key => ({ key })), async (source: any) => {
    loads++;
    await pending;
    return { key: source.key, columns: [], rows: [], status: 'ok', fetchedAt: Date.now() };
  }, store);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/kra/performance`;
  try {
    const requests = Array.from({ length: 4 }, () => fetch(base + '?refresh=true'));
    await entered;
    await new Promise(resolve => setImmediate(resolve));
    release();
    const results = await Promise.all(requests);
    for (const result of results) { assert.equal(result.status, 200); await result.json(); }
    assert.equal(loads, 5);
    assert.equal((await fetch(base)).status, 200);
    assert.equal(loads, 5);
    docs.get('.floor/kra-result-direct.json').computedAt = 0;
    assert.equal((await fetch(base)).status, 200);
    assert.equal(loads, 10, 'expired results must recompute before responding');
  } finally { release(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('expired KRA results are reused while every workbook revision is unchanged', async () => {
  const docs = new Map();
  const store = { read: async (key: string) => docs.get(key) ?? null, write: async (key: string, value: any) => { docs.set(key, value); return value; } };
  const keys = ['sales', 'leads', 'bookings', 'lapsed', 'new'];
  let revision = 'r1';
  let loads = 0;
  const freshness = { revisions: async (sources: any[]) => new Map(sources.map(s => [s.id, { id: s.id, revision }])) };
  const app = express();
  kraRoutes(app, tmpdir(), keys.map(key => ({ key, id: 'book-' + key })), async (source: any) => {
    loads++;
    return { key: source.key, columns: [], rows: [], status: 'ok', fetchedAt: Date.now(), revision };
  }, store, freshness as any);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/kra/performance`;
  try {
    assert.equal((await fetch(base)).status, 200);
    assert.equal(loads, 5);
    docs.get('.floor/kra-result-direct.json').computedAt = Date.now() - 60 * 60 * 1000;
    assert.equal((await fetch(base)).status, 200);
    assert.equal(loads, 5, 'unchanged workbooks must not recompute');
    revision = 'r2';
    assert.equal((await fetch(base)).status, 200);
    assert.equal(loads, 10, 'an edited workbook must recompute');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('a revision snapshot is gzipped and CDN-cacheable; ordinary snapshots stay private', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-shared-'));
  await mkdir(path.join(root, '.cache'));
  const bytes = JSON.stringify({ key: 'bookings', rows: Array.from({ length: 2000 }, (_, i) => ['Member ' + i, 'Barre 57']), hash: 'h', fetchedAt: 1 });
  await writeFile(path.join(root, '.cache/bookings.json'), bytes);
  const app = express();
  app.get('/:mode', async (req, res) => { await sendSnapshot(req, res, root, { key: 'bookings' }, { hash: 'h', fetchedAt: 1 }, { shared: req.params.mode === 'shared' }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const shared = await fetch(base + '/shared', { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(shared.headers.get('content-encoding'), 'gzip');
    assert.equal(shared.headers.get('vercel-cdn-cache-control'), 'max-age=31536000, immutable');
    assert.doesNotMatch(shared.headers.get('cache-control')!, /private|no-cache|no-store/);
    assert.equal(await shared.text(), bytes, 'decompresses to the exact snapshot');
    const own = await fetch(base + '/own', { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(own.headers.get('cache-control'), 'private, no-cache');
    assert.equal(own.headers.get('vercel-cdn-cache-control'), null);
    assert.equal(own.headers.get('content-encoding'), null);
    assert.equal(await own.text(), bytes);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
