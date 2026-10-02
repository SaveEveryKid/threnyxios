import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REFERRAL, progress, owed, cleanCode, makeCode } from '../engine/referral.js';
import { apply, freshVault } from '../engine/economy.js';

test('a friend counts after 5 Duels on a saved profile', () => {
  assert.equal(progress({ duels: 4 }).ok, false);
  assert.equal(progress({ duels: REFERRAL.duels }).ok, true);
  assert.equal(progress({ duels: 50, guest: true }).ok, false, 'not while still a guest');
});
test('every Duel counts, training doesn’t', () => {
  let v = freshVault(Date.now());
  v = apply(v, 'matchEnd', { mode: 'tutorial', won: true, fought: [] }, { now: Date.now() }).vault;
  assert.equal(v.econ.duels || 0, 0);
  v = apply(v, 'matchEnd', { mode: 'ladder', won: false, fought: [] }, { now: Date.now() + 60000 }).vault;
  v = apply(v, 'matchEnd', { mode: 'pvp', won: false, fought: [] }, { now: Date.now() + 120000 }).vault;
  assert.equal(v.econ.duels, 2, 'wins, losses, AI and online all count');
});
test('rewards stop at the cap', () => {
  const all = owed(500, 0);
  assert.equal(all.newly, REFERRAL.cap);
  assert.deepEqual(owed(3, 3), { packs: {}, newly: 0 });
  assert.equal(owed(3, 2).packs.collector, 1);
});
test('codes', () => {
  assert.match(makeCode(), /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(cleanCode(' ab-c1 '), 'ABC1');
});
test('share bonus once; referral payouts are server-only', () => {
  let v = freshVault(Date.now());
  const c0 = v.profile.chimes || 0;
  v = apply(v, 'shareBonus', {}).vault;
  v = apply(v, 'shareBonus', {}).vault;
  assert.equal(v.profile.chimes, c0 + 120);
});
