// Legendaries and Mythics are the chase: crafting never makes the first copy,
// and Mythics Ascend for fewer spares (1, 2, 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshVault, apply } from '../engine/economy.js';
import { grant, ascTier, ASCENSION, CRAFT, ODDS, PITY } from '../engine/collection.js';
import { LIST } from '../engine/cards/index.js';

const myth = LIST.find((c) => c.rarity === 'mythic' && !c.unique).id;
const leg = LIST.find((c) => c.rarity === 'legendary').id;
const epic = LIST.find((c) => c.rarity === 'epic').id;

test('a Legendary or Mythic can only be crafted once you own one', () => {
  let v = freshVault();
  v.profile.embers = 50000;
  assert.throws(() => apply(v, 'craft', { cardId: myth }), /Pull this card first/);
  assert.throws(() => apply(v, 'craft', { cardId: leg }), /Pull this card first/);
  v = apply(v, 'craft', { cardId: epic }).vault; // anything else: craft away
  grant(v.profile, myth, { now: 0 });
  const out = apply(v, 'craft', { cardId: myth }).vault;
  assert.equal(out.profile.copies[myth].length, 2);
  assert.equal(out.profile.embers, 50000 - CRAFT.epic - CRAFT.mythic);
});

test('Mythics Ascend for 1, 2, then 3 spares; others for 2, 4, 8', () => {
  assert.deepEqual([0, 1, 2].map((t) => ascTier(myth, t).copies), [1, 2, 3]);
  assert.deepEqual([0, 1, 2].map((t) => ascTier(epic, t).copies), [2, 4, 8]);
  assert.equal(ascTier(myth, ASCENSION.length), null);
  let v = freshVault();
  grant(v.profile, myth, { now: 0 });
  for (let i = 0; i < 6; i++) grant(v.profile, myth, { now: 0 });
  for (let t = 1; t <= 3; t++) v = apply(v, 'ascend', { cardId: myth }).vault;
  assert.equal(v.profile.ascension[myth], 3);
  assert.equal(v.profile.copies[myth].length, 1, 'six spares spent, the first copy kept');
});

test('published odds add up, and the guarantees are in order', () => {
  for (const o of Object.values(ODDS)) assert.ok(Math.abs(Object.values(o).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(PITY.legendary.hard < PITY.mythic.hard);
  assert.ok(ODDS.rarePlus.legendary > ODDS.rarePlus.mythic);
});

test('Ascension spends plain copies first, then Foils; never Alt Art', async () => {
  const { ascendSpares } = await import('../engine/collection.js');
  let v = freshVault();
  grant(v.profile, myth, { now: 0 });
  grant(v.profile, myth, { now: 0, treatment: 'foil' });
  grant(v.profile, myth, { now: 0, treatment: 'altart' });
  grant(v.profile, myth, { now: 0 });
  assert.equal(ascendSpares(v.profile, myth), 2, 'a plain and a Foil spare; the Alt Art is kept');
  v = apply(v, 'ascend', { cardId: myth }).vault; // tier 1 costs 1: the plain one goes
  const left = v.profile.copies[myth].map((c) => v.profile.items[c].treatment).sort();
  assert.deepEqual(left, ['altart', 'foil', 'standard']);
});

test('the Mythic Pack: a new Mythic first, then copies for the ones still Ascending', () => {
  const myths = LIST.filter((c) => c.rarity === 'mythic' && !c.unique).map((c) => c.id);
  let v = freshVault();
  v.profile.chimes = 10000;
  const seen = new Set();
  for (let i = 0; i < myths.length; i++) {
    v = apply(v, 'buyOffer', { offer: 'mythic1' }, { now: Date.UTC(2026, 9, 5 + i * 7) }).vault;
    const r = apply(v, 'openPack', { type: 'mythic' }, { now: 0, seed: 11 + i });
    v = r.vault;
    assert.equal(r.result.cards.length, 1);
    assert.ok(r.result.cards[0].isNew, 'a Mythic you didn’t have');
    seen.add(r.result.cards[0].cardId);
  }
  assert.equal(seen.size, myths.length, 'all five, no repeats while any are missing');
  // fully Ascend all but one: the next packs only give that one
  for (const id of myths.slice(1)) v.profile.ascension[id] = 3;
  for (let i = 0; i < 3; i++) {
    v = apply(v, 'buyOffer', { offer: 'mythic1' }, { now: Date.UTC(2026, 11, 7 + i * 7) }).vault;
    const r = apply(v, 'openPack', { type: 'mythic' }, { now: 0, seed: 50 + i });
    v = r.vault;
    assert.equal(r.result.cards[0].cardId, myths[0]);
  }
});

test('the Mythic Pack costs 500 Chimes the first time, then 800, 3 a week', () => {
  let v = freshVault();
  v.profile.chimes = 5000;
  const mon = Date.UTC(2026, 9, 5, 12); // a Monday
  const buy = (now) => (v = apply(v, 'buyOffer', { offer: 'mythic1' }, { now }).vault);
  buy(mon);
  assert.equal(v.profile.chimes, 4500);
  buy(mon + 3600000);
  buy(mon + 2 * 86400000);
  assert.equal(v.profile.chimes, 4500 - 1600);
  assert.equal(v.profile.tickets.mythic, 3);
  assert.throws(() => buy(mon + 6 * 86400000), /this week's 3 Mythic Packs/);
  buy(mon + 7 * 86400000); // next Monday
  assert.equal(v.profile.tickets.mythic, 4);
});
