// The shared friends-and-trading rules (engine/social.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, PRESET, presetText, copyLock, tradeBlock, sideProblem, sealOf, meetsWant, swapVaults, played } from '../engine/social.js';
import { freshVault } from '../engine/economy.js';
import { grant } from '../engine/collection.js';

const DAY = 86400000;
const now = Date.now();

test('messages are a fixed list of short, safe lines', () => {
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
  for (const p of PRESETS) {
    assert.match(p.id, /^[a-z]{1,12}$/); // what the database accepts
    assert.ok(p.text.length <= 40);
    assert.doesNotMatch(p.text, /https?:|www\.|@|\d{3}/); // no links, handles or numbers
  }
  assert.equal(PRESET.duel.code, true);
  assert.equal(presetText('who'), 'You sending the invite or am I?');
  assert.equal(presetText('<script>'), '');
});

test('trading is open: no account age, no Duel count, no daily limit, no wait, no fee', () => {
  const v = freshVault(now);
  assert.equal(tradeBlock({ createdAt: new Date(now - 60000).toISOString(), vault: v, tradesToday: 500, now }), null);
  const fresh = grant(v.profile, 'pip', { now });
  assert.equal(copyLock(v.profile.items[fresh], now), null);
  assert.equal(sealOf([v.profile.items[fresh], { cardId: 'vega', treatment: 'immortal' }]), 0);
  assert.equal(sideProblem(v, [fresh, fresh], now), 'That offer doesn’t work.');
  assert.match(sideProblem(v, ['nope'], now), /no longer own/);
  assert.equal(played({ econ: { duels: 3 }, ladder: { wins: 10, losses: 12 } }), 22);
});

test('a Trade Board post wants exactly one copy of each card', () => {
  assert.ok(meetsWant(['a', 'b'], [{ cardId: 'b' }, { cardId: 'a' }]));
  assert.ok(!meetsWant(['a', 'b'], [{ cardId: 'a' }, { cardId: 'a' }]));
  assert.ok(!meetsWant(['a'], [{ cardId: 'a' }, { cardId: 'c' }]));
  assert.ok(!meetsWant([], []));
});

test('the swap: copies, Legacy and the seal move; clashing ids are renamed', () => {
  const a = freshVault(now, 'You');
  const b = freshVault(now, 'You');
  const x = grant(a.profile, 'vega', { now: now - 9 * DAY });
  const y = grant(b.profile, 'pip', { now: now - 9 * DAY });
  grant(a.profile, 'pip', { now: now - 9 * DAY }); // b's copy id may already exist in a
  a.profile.embers = b.profile.embers = 200;
  const seal = sealOf([a.profile.items[x], b.profile.items[y]]);
  const out = swapVaults(a, b, [x], [y], { now, seal, nameA: 'Alice', nameB: 'Bob' });
  assert.ok(!out.a.profile.items[x] && out.b.profile.items[out.moved.a[0]]);
  const got = out.a.profile.items[out.moved.b[0]];
  assert.equal(got.cardId, 'pip');
  assert.equal(Object.values(out.a.profile.items).filter((it) => it.cardId === 'pip').length, 2, 'both pips kept, ids distinct');
  assert.equal(got.history.at(-1).text, 'Traded from Bob to Alice.');
  assert.equal(got.owners.at(-1).name, 'Alice');
  assert.equal(out.a.profile.embers, 200 - seal);
  assert.ok(a.profile.items[x], 'the originals are untouched');
});
