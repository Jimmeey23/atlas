import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-ignore JavaScript server module.
import { createStore } from '../server/store.mjs';

/** A tiny in-memory stand-in for the Supabase table API the store uses. */
function fakeCloud() {
  const rows = new Map<string, { value: unknown; updated_at: string }>();
  let tick = 0;
  const pause = () => new Promise((r) => setTimeout(r, Math.random() * 4));
  return {
    rows,
    from() {
      const filters: Record<string, unknown> = {};
      let mode = ''; let patch: any;
      const chain: any = {
        select() { if (!mode) mode = 'select'; return chain; },
        eq(column: string, value: unknown) { filters[column] = value; return chain; },
        async maybeSingle() { await pause(); const row = rows.get(filters.key as string); return { data: row ? structuredClone(row) : null, error: null }; },
        async insert(row: any) { await pause(); if (rows.has(row.key)) return { error: { code: '23505', message: 'duplicate' } }; rows.set(row.key, { value: row.value, updated_at: row.updated_at + ++tick }); return { error: null }; },
        update(next: any) { mode = 'update'; patch = next; return chain; },
        upsert(row: any) { rows.set(row.key, { value: row.value, updated_at: row.updated_at + ++tick }); return Promise.resolve({ error: null }); },
        then(resolve: any) {
          // update(...).eq(...).eq(...).select(...) resolves here.
          pause().then(() => {
            const row = rows.get(filters.key as string);
            if (mode === 'update' && row && row.updated_at === filters.updated_at) {
              rows.set(filters.key as string, { value: patch.value, updated_at: patch.updated_at + ++tick });
              resolve({ data: [{ key: filters.key }], error: null });
            } else resolve({ data: [], error: null });
          });
        },
      };
      return chain;
    },
  };
}

test('concurrent read-modify-writes from two server instances lose no update', async () => {
  const cloud = fakeCloud();
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-store-'));
  const a = createStore({ root, cloud }), b = createStore({ root, cloud });
  const key = '.floor/counter.json';
  await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).update(key, (v: any) => ({ n: (v?.n ?? 0) + 1 }))));
  assert.equal((await a.read(key)).n, 12);
});

test('local updates to one key are serialized', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-store-'));
  const store = createStore({ root });
  await Promise.all(Array.from({ length: 20 }, () => store.update('.cache/c.json', (v: any) => ({ n: (v?.n ?? 0) + 1 }))));
  assert.equal((await store.read('.cache/c.json')).n, 20);
});
