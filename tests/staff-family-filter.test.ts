import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-ignore Server route is JavaScript.
import { intelligenceRoutes } from '../server/intelligence.mjs';

test('server scope excludes Staff/Family Class visits unless asked to include them', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-staff-'));
  await mkdir(path.join(root, '.cache'));
  const columns = ['Member ID', 'Checked In', 'Payment Method Name', 'Date (IST)', 'Location'];
  await writeFile(path.join(root, '.cache/checkins.json'), JSON.stringify({ key: 'checkins', columns, fetchedAt: 1791000000000, rows: [
    ['1', true, 'Staff/Family Class', '2026-09-01', 'Kenkere House'],
    ['2', true, 'Membership', '2026-09-01', 'Kenkere House'],
    ['3', true, 'Package', '2026-09-02', 'Kenkere House'],
  ] }));
  const app = express(); app.use(express.json());
  intelligenceRoutes(app, root, [{ key: 'checkins', columns }]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const url = 'http://127.0.0.1:' + (server.address() as any).port;
  const count = async (filters: object) => {
    const res = await fetch(url + '/api/intelligence/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: 'SELECT COUNT(*) AS n FROM checkins', filters }) });
    const body: any = await res.json(); assert.equal(res.status, 200, JSON.stringify(body)); return Number(body.rows[0].n);
  };
  try {
    assert.equal(await count({}), 2);
    assert.equal(await count({ staffFamily: true }), 3);
  } finally { server.close(); }
});
