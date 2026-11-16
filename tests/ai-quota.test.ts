import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore JavaScript server module.
import { aiQuota } from '../server/ai-quota.mjs';

const run = (mw: any, user = 'a') => {
  let status = 200; let nexted = false;
  const res: any = { set() { return res; }, status(code: number) { status = code; return res; }, json() { return res; } };
  mw({ atlasUser: { id: user } }, res, () => { nexted = true; });
  return nexted ? 200 : status;
};

test('AI routes are limited per user per minute and per day', () => {
  let t = Date.parse('2026-11-16T06:00:00Z');
  const quota = aiQuota({ env: { ATLAS_AI_CHAT_PER_MINUTE: '2', ATLAS_AI_CHAT_PER_DAY: '3' }, now: () => t });
  const chat = quota('chat');
  assert.equal(run(chat), 200); assert.equal(run(chat), 200);
  assert.equal(run(chat), 429, 'third call in a minute is refused');
  assert.equal(run(chat, 'b'), 200, 'other users keep their own allowance');
  t += 61000;
  assert.equal(run(chat), 200);
  t += 61000;
  assert.equal(run(chat), 429, 'daily allowance used');
  t += 24 * 3600000;
  assert.equal(run(chat), 200, 'resets the next India business day');
});

test('a limit of 0 disables it', () => {
  const chat = aiQuota({ env: { ATLAS_AI_CHAT_PER_MINUTE: '0', ATLAS_AI_CHAT_PER_DAY: '0' } })('chat');
  for (let i = 0; i < 50; i++) assert.equal(run(chat), 200);
});
