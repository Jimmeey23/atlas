import { test } from 'node:test';
import assert from 'node:assert/strict';
const first = await import('../server/report-admin.mjs?instance=first');
const second = await import('../server/report-admin.mjs?instance=second');
const env = { ATLAS_ADMIN_PASSCODE: 'test-admin', SUPABASE_SERVICE_ROLE_KEY: 'test-server-only-credential' };

test('admin tokens survive independent server instances with configured database credentials', () => {
  const { token } = first.unlockAdmin('test-admin', env);
  assert.equal(second.verifyAdmin(token, env), true);
  assert.equal(second.verifyAdmin(token + 'tampered', env), false);
  assert.equal(second.verifyAdmin(token, { ...env, SUPABASE_SERVICE_ROLE_KEY: 'different-server' }), false);
  assert.throws(() => first.unlockAdmin('wrong', env));
  assert.throws(() => second.requireAdmin({ headers: {} }, env), /Unlock admin/);
});

test('explicit signing credentials keep precedence over database-derived keys', () => {
  const configured = { ...env, ATLAS_ADMIN_SECRET: 'explicit-test-signing-secret' };
  const { token } = first.unlockAdmin('test-admin', configured);
  assert.equal(second.verifyAdmin(token, { ...configured, SUPABASE_SERVICE_ROLE_KEY: 'rotated-database-key' }), true);
});

test('client carries a verified unlock into imports, including when browser storage is blocked', async () => {
  const events = new EventTarget();
  const values = new Map<string, string>();
  let blocked = false, reject = false, unlockedEvents = 0, unlockPrompts = 0;
  events.addEventListener('p57-report-admin-session', () => unlockedEvents++);
  events.addEventListener('p57-unlock-report', () => unlockPrompts++);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => { if (blocked) throw new Error('blocked'); return values.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (blocked) throw new Error('blocked'); values.set(key, value); },
    removeItem: (key: string) => values.delete(key),
  } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (url === '/api/reports/admin') return Response.json(first.unlockAdmin(JSON.parse(String(init?.body)).passcode, env));
    const token = new Headers(init?.headers).get('x-atlas-admin');
    if (reject || !second.verifyAdmin(token, env)) return Response.json({ error: 'Unlock admin editing to change this report.' }, { status: 403 });
    return Response.json({ summary: 'Content accepted', operations: [] });
  }) as typeof fetch;
  const client = await import('../src/report/storage');
  try {
    for (const storageBlocked of [false, true]) {
      client.lockAdmin(); blocked = storageBlocked;
      await client.unlockAdmin('test-admin');
      assert.ok(client.adminToken());
      const result = await client.importReportContent({ context: '{}', prompt: '', text: 'New content', chapterId: '', sectionId: '' });
      assert.equal(result.summary, 'Content accepted');
    }
    assert.ok(unlockedEvents >= 4);
    reject = true;
    await assert.rejects(client.importReportContent({ context: '{}', prompt: '', text: 'New content', chapterId: '', sectionId: '' }), /Unlock admin/);
    assert.equal(client.adminToken(), '');
    assert.equal(unlockPrompts, 1);
  } finally { client.lockAdmin(); globalThis.fetch = originalFetch; }
});
