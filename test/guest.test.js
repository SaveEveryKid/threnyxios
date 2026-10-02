import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestStatus, startGuestDuel, finishGuestDuel, isGuestUser, profileProblem, GUEST_MAX_DUELS, GUEST_PLAY_DURATION_MINUTES, GUEST_DUEL_GRACE_MINUTES } from '../engine/guest.js';

const MIN = 60000, t0 = Date.parse('2026-10-02T12:00:00Z');

test('who is a guest', () => {
  assert.equal(isGuestUser({ is_anonymous: true }), true);
  assert.equal(isGuestUser({ is_anonymous: true, app_metadata: { threnyx_account: true } }), false, 'a saved profile is not a guest');
  assert.equal(isGuestUser({ is_anonymous: false }), false);
  assert.equal(isGuestUser(null), false);
});

test('the clock starts with the first Duel, not with training', () => {
  const s = guestStatus(null, t0);
  assert.equal(s.allowed, true);
  assert.equal(s.started, false);
  assert.equal(s.minutesLeft, GUEST_PLAY_DURATION_MINUTES);
  const r = startGuestDuel(null, t0);
  assert.equal(r.ok, true);
  assert.equal(r.guest.since, t0);
});

test(`${GUEST_MAX_DUELS} Duels, then the gate`, () => {
  let g = null, t = t0;
  for (let i = 0; i < GUEST_MAX_DUELS; i++) {
    const s = startGuestDuel(g, t);
    assert.equal(s.ok, true, 'duel ' + (i + 1) + ' starts');
    const f = finishGuestDuel(s.guest, t + MIN);
    assert.equal(f.ok, true);
    g = f.guest;
    t += 2 * MIN;
  }
  assert.equal(g.duels, GUEST_MAX_DUELS);
  assert.equal(guestStatus(g, t).allowed, false);
  assert.equal(startGuestDuel(g, t).ok, false);
});

test(`${GUEST_PLAY_DURATION_MINUTES} minutes, then the gate; a Duel already started still counts`, () => {
  const s = startGuestDuel(null, t0);
  const late = t0 + (GUEST_PLAY_DURATION_MINUTES - 1) * MIN;
  const s2 = startGuestDuel(finishGuestDuel(s.guest, t0 + MIN).guest, late);
  assert.equal(s2.ok, true, 'started at minute 29');
  const after = late + 15 * MIN;
  assert.equal(guestStatus(s2.guest, after).allowed, false, 'the time is up');
  const f = finishGuestDuel(s2.guest, after);
  assert.equal(f.ok, true, 'the Duel that was running still finishes and pays');
  assert.equal(startGuestDuel(f.guest, after).ok, false, 'but no new one');
});

test('no result without a Duel started for it, and none after the grace period', () => {
  assert.equal(finishGuestDuel(null, t0).ok, false);
  const s = startGuestDuel(null, t0);
  assert.equal(finishGuestDuel(s.guest, t0 + (GUEST_DUEL_GRACE_MINUTES + 1) * MIN).ok, false);
  const f = finishGuestDuel(s.guest, t0 + MIN);
  assert.equal(finishGuestDuel(f.guest, t0 + 2 * MIN).ok, false, 'one start pays once');
});

test('abandoning Duels can’t stretch the allowance', () => {
  let g = null;
  let started = 0;
  for (let i = 0; i < 20; i++) {
    const s = startGuestDuel(g, t0 + i * 1000);
    if (s.ok) started++;
    g = s.guest;
  }
  assert.ok(started <= GUEST_MAX_DUELS + 1, `started ${started}`);
});

test('profile checks', () => {
  assert.equal(profileProblem({ username: 'Ann_1', password: 'longenough' }), null);
  assert.ok(profileProblem({ username: 'a', password: 'longenough' }));
  assert.ok(profileProblem({ username: 'Ann', password: 'short' }));
});
