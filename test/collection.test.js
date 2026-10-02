import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIST, CARDS } from '../engine/cards/index.js';
import { newProfile, openPack, owned, grant, burn, craft, ascend, validateTrade, executeTrade, recordBattle, PITY, CRAFT } from '../engine/collection.js';

const rarityOf = (id) => CARDS[id].rarity;
const DAY = 86400000;

test('every pack has the right size and a Rare-or-better slot', () => {
  let p = newProfile('T');
  const rng = { seed: 1 };
  for (let i = 0; i < 300; i++) {
    const r = openPack(p, 'standard', LIST, rng);
    p = r.profile;
    assert.equal(r.cards.length, 3);
    assert.ok(r.cards.some((c) => c.rarity !== 'common'), 'Rare+ slot');
  }
  const c = openPack(p, 'collector', LIST, rng);
  assert.equal(c.cards.length, 4, 'collector: 4 cards + showcase treatment');
  assert.ok(c.cards.some((x) => x.treatment !== 'standard'), 'showcase applied');
});

test('Legendary pity: never more than 25 packs without Legendary+', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let p = newProfile('T');
    const rng = { seed };
    let dry = 0;
    for (let i = 0; i < 200; i++) {
      const r = openPack(p, 'standard', LIST, rng);
      p = r.profile;
      if (r.cards.some((c) => c.rarity === 'legendary' || c.rarity === 'mythic')) dry = 0;
      else dry++;
      assert.ok(dry < PITY.legendary.hard, `dry streak ${dry}`);
    }
  }
});

test('Mythic pity: guaranteed within 90 packs', () => {
  for (let seed = 1; seed <= 20; seed++) {
    let p = newProfile('T');
    const rng = { seed: seed * 7 };
    let dry = 0;
    for (let i = 0; i < 400; i++) {
      const r = openPack(p, 'standard', LIST, rng);
      p = r.profile;
      if (r.cards.some((c) => c.rarity === 'mythic')) dry = 0;
      else dry++;
      assert.ok(dry < PITY.mythic.hard);
    }
  }
});

test('no duplicate Legendary until all 15 are owned', () => {
  let p = newProfile('T');
  const rng = { seed: 5 };
  const seen = [];
  while (seen.length < 15) {
    const r = openPack(p, 'standard', LIST, rng);
    p = r.profile;
    for (const c of r.cards) if (c.rarity === 'legendary') {
      assert.ok(!seen.includes(c.cardId), 'dupe before completion: ' + c.cardId);
      seen.push(c.cardId);
    }
  }
});

test('burn / craft / ascend keep the oldest copy and never create power', () => {
  let p = newProfile('T');
  for (let i = 0; i < 5; i++) grant(p, 'pip');
  const first = p.copies.pip[0];
  p = burn(p, p.copies.pip[4], rarityOf);
  assert.equal(p.embers, 5);
  p = ascend(p, 'pip');
  assert.equal(p.ascension.pip, 1);
  assert.equal(p.copies.pip[0], first, 'oldest copy kept');
  p.embers = CRAFT.mythic;
  p = craft(p, 'lirae', 'mythic');
  assert.equal(owned(p, 'lirae'), 1);
  assert.equal(p.embers, 0);
});

test('trading moves Legacy with the copy, enforces safeguards and seals', () => {
  const now = Date.now();
  const a = newProfile('Ana', now - 30 * DAY);
  const b = newProfile('Bo', now - 30 * DAY);
  const hk = grant(a, 'hollowKing', { now: now - 10 * DAY });
  recordBattle(a, hk, { clashes: 1, clashWins: 1, readsHit: 1, finalWon: true, matchWon: true });
  const nyx = grant(b, 'nyx', { now: now - 10 * DAY });
  const vega = grant(b, 'vega', { now: now - 10 * DAY });
  a.embers = 1000;
  b.embers = 1000;
  const bad = validateTrade(a, b, [hk], [nyx, vega], { now, matchesPlayed: [5, 50], rarityOf });
  assert.ok(!bad.ok, 'minimum matches enforced');
  const v = validateTrade(a, b, [hk], [nyx, vega], { now, matchesPlayed: [50, 50], rarityOf });
  assert.ok(v.ok, v.errs.join());
  assert.equal(v.seal, 400, 'seal set by the rarest item (Mythic)');
  const { a: a2, b: b2 } = executeTrade(a, b, [hk], [nyx, vega], { now, seal: v.seal });
  const moved = b2.items[hk];
  assert.equal(moved.firstOwner, 'Ana');
  assert.deepEqual(moved.owners.map((o) => o.name), ['Ana', 'Bo']);
  assert.equal(moved.stats.finalsWon, 1, 'history travels');
  assert.equal(owned(a2, 'nyx'), 1);
  assert.equal(a2.embers, 600);
  const fresh = grant(a2, 'pip', { now });
  const locked = validateTrade(a2, b2, [fresh], [], { now, matchesPlayed: [50, 50], rarityOf });
  assert.ok(locked.errs.some((e) => /48h/.test(e)), 'new-copy lock');
});
