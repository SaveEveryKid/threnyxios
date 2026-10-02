import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageBand, accountPolicy, matchPolicy } from '../engine/voice-policy.js';

const ON = { voiceSystemEnabled: true, friendVoiceEnabled: true, rankedVoiceEnabled: true };
const now = new Date('2026-10-01T00:00:00Z');
const adult = (x = {}) => ({ band: 'adult', cardCheck: { ok: true, funding: 'credit' }, idAdult: true, pass: true, prefs: { friend: true, ranked: true }, restriction: null, ...x });

test('age band from birth month and year (the youngest the player could be)', () => {
  assert.equal(ageBand(10, 2008, now), 'teen'); // 17 until the end of October 2026
  assert.equal(ageBand(9, 2008, now), 'adult');
  assert.equal(ageBand(1, 2014, now), 'under13'); // 12 on 1 Oct 2026
  assert.equal(ageBand(9, 2013, now), 'teen'); // 13 by the end of September 2026
  assert.equal(ageBand(10, 2013, now), 'under13'); // might still be 12 in October
  assert.equal(ageBand(12, 2013, now), 'under13');
  assert.equal(ageBand(13, 2000, now), null);
  assert.equal(ageBand(5, 1800, now), null);
});

test('friend voice: card (not prepaid) and not under 18', () => {
  assert.equal(accountPolicy(adult(), ON).friend.ok, true);
  assert.equal(accountPolicy(adult({ cardCheck: { ok: true, funding: 'prepaid' } }), ON).friend.reason, 'card');
  assert.equal(accountPolicy(adult({ cardCheck: null }), ON).friend.reason, 'card');
  assert.equal(accountPolicy(adult({ band: 'teen' }), ON).friend.reason, 'age');
  assert.equal(accountPolicy(adult({ band: 'under13' }), ON).friend.reason, 'age');
  assert.equal(accountPolicy(adult({ band: null }), ON).friend.reason, 'age_unknown');
});

test('ranked voice: ID-verified adult with a Season Pass', () => {
  assert.equal(accountPolicy(adult(), ON).ranked.ok, true);
  assert.equal(accountPolicy(adult({ idAdult: false }), ON).ranked.reason, 'id');
  assert.equal(accountPolicy(adult({ pass: false }), ON).ranked.reason, 'pass');
  assert.equal(accountPolicy(adult({ band: 'teen', idAdult: true }), ON).ranked.reason, 'age', 'a declared minor never gets stranger voice');
  assert.equal(accountPolicy(adult({ cardCheck: null }), ON).ranked.ok, true, 'ranked does not need the card check');
});

test('the player switches, moderation and flags all gate it', () => {
  assert.equal(accountPolicy(adult({ prefs: { friend: false, ranked: true } }), ON).friend.reason, 'setting');
  assert.equal(accountPolicy(adult({ restriction: { ranked: true } }), ON).ranked.reason, 'restricted');
  assert.equal(accountPolicy(adult({ restriction: { ranked: true } }), ON).friend.ok, true);
  assert.equal(accountPolicy(adult(), { ...ON, voiceSystemEnabled: false }).friend.reason, 'off');
  assert.equal(accountPolicy(adult(), { ...ON, rankedVoiceEnabled: false }).ranked.reason, 'off');
  assert.equal(accountPolicy(adult({ restriction: { friend: true }, band: 'under13' }), ON).friend.reason, 'restricted', 'moderation first');
  assert.equal(accountPolicy(adult({ guest: true }), ON).friend.reason, 'account', 'a guest saves their profile first');
});

test('a match: both must qualify, blocks stop it, Echoes never, reasons stay private', () => {
  const ok = matchPolicy({ kind: 'friend', echo: false, accounts: [adult(), adult()], flags: ON, blocked: false }, 0);
  assert.equal(ok.available, true);
  const one = matchPolicy({ kind: 'friend', echo: false, accounts: [adult(), adult({ band: 'teen' })], flags: ON, blocked: false }, 0);
  assert.equal(one.available, false);
  assert.equal(one.mine.ok, true, 'my own side is fine; the opponent’s reason is not given');
  assert.equal(Object.keys(one).sort().join(), 'available,mine');
  assert.equal(matchPolicy({ kind: 'friend', echo: false, accounts: [adult(), adult()], flags: ON, blocked: true }, 0).available, false);
  assert.equal(matchPolicy({ kind: 'ranked', echo: true, accounts: [adult(), adult()], flags: ON, blocked: false }, 0).available, false);
  assert.equal(matchPolicy({ kind: 'ranked', echo: false, accounts: [adult(), adult({ pass: false })], flags: ON, blocked: false }, 1).mine.reason, 'pass');
});
