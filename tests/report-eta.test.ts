import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingSeconds } from '../src/report/eta';

test('report ETA starts from the planned estimate and then follows observed chapter pace', () => {
 // Before any chapter is written, the planned estimate counts down.
 assert.equal(remainingSeconds({ estimatedSeconds: 300, elapsed: 100, pending: 5, chapterSeconds: [] }), 200);
 // Once chapters finish, remaining time is the observed average per chapter times what is left.
 assert.equal(remainingSeconds({ estimatedSeconds: 300, elapsed: 100, pending: 4, chapterSeconds: [20, 40] }), 120);
 // A run slower than planned never shows a negative or stale countdown.
 assert.equal(remainingSeconds({ estimatedSeconds: 60, elapsed: 500, pending: 2, chapterSeconds: [90, 110] }), 200);
 // Nothing left to write.
 assert.equal(remainingSeconds({ estimatedSeconds: 60, elapsed: 500, pending: 0, chapterSeconds: [90] }), 0);
});
