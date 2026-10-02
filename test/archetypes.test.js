import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, LIST } from '../engine/cards/index.js';
import { ARCHETYPES, archetypesOf, bondsOf, bondMap, BOND_AT } from '../engine/archetypes.js';
import { buildFor, buildMany, score, swaps, MYTHIC_MAX } from '../engine/deckbuild.js';
import { createDuel, playDuel } from '../engine/duel.js';
import { deckProblem } from '../engine/pvp.js';

const legal = (ids) => !deckProblem(ids, CARDS);
const ALL = LIST.map((c) => c.id);

test('every Champion has one or two styles, and every style has enough Champions to Bond', () => {
  for (const c of LIST) {
    const a = archetypesOf(c);
    assert.ok(a.length >= 1 && a.length <= 2, `${c.id}: ${a}`);
  }
  for (const a of ARCHETYPES) assert.ok(LIST.filter((c) => archetypesOf(c).includes(a.id)).length >= BOND_AT + 2, a.id);
});

test('a Bond needs BOND_AT of one style, and gives every member a bonus', () => {
  const knights = ALL.filter((id) => archetypesOf(CARDS[id]).includes('knights'));
  const three = knights.slice(0, BOND_AT - 1);
  const others = ALL.filter((id) => !archetypesOf(CARDS[id]).includes('knights') && !three.some((k) => CARDS[k].char === CARDS[id].char));
  assert.ok(!bondsOf([...three, ...others.slice(0, 5)], CARDS).some((b) => b.id === 'knights'));
  const deck = buildFor(ALL, CARDS, 'knights');
  assert.ok(bondsOf(deck, CARDS).some((b) => b.id === 'knights' && b.n >= BOND_AT));
  const map = bondMap(deck, CARDS);
  for (const id of deck.filter((id) => archetypesOf(CARDS[id]).includes('knights'))) assert.ok(map[id] && map[id].lead + map[id].answer >= 1, id);
});

test('the Bond bonus is in the clash', () => {
  const deck = buildFor(ALL, CARDS, 'knights');
  const other = buildFor(ALL.filter((id) => !deck.includes(id)), CARDS, 'readers');
  const on = createDuel([deck, other], { seed: 4, lead: 0 });
  const off = createDuel([deck, other], { seed: 4, lead: 0, rules: { bonds: false } });
  const lead = on.sides[0].hand.find((id) => on.sides[0].bond[id]);
  if (!lead) return; // no bonded card in this opening hand
  const choice = { lead, answer: on.sides[1].hand[0] };
  const p1 = playDuel(on, choice).events.find((e) => e.t === 'clash');
  const p0 = playDuel(off, choice).events.find((e) => e.t === 'clash');
  if (p1 && p0) assert.equal(p1.power[0].total - p0.power[0].total, on.sides[0].bond[lead].lead);
});

test('the builder: legal Octaves, several real choices, useful swaps', () => {
  for (const a of ARCHETYPES) {
    const d = buildFor(ALL, CARDS, a.id);
    assert.ok(d && d.length === 8 && legal(d), `${a.id}: ${d}`);
    assert.ok(d.filter((id) => CARDS[id].rarity === 'mythic').length <= MYTHIC_MAX);
  }
  const many = buildMany(ALL, CARDS, { max: 4 });
  assert.equal(many.length, 4);
  for (let i = 0; i < many.length; i++) for (let j = i + 1; j < many.length; j++) assert.ok(many[i].ids.filter((x) => many[j].ids.includes(x)).length < 6, 'builds differ');
  assert.ok(new Set(many.map((b) => b.arch)).size === many.length, 'each around a different style');
  // a small collection still gets an Octave
  const commons = ALL.filter((id) => CARDS[id].rarity === 'common');
  assert.ok(legal(buildFor(commons, CARDS)));
  // swaps improve the score
  const weak = commons.filter((id, i, arr) => arr.findIndex((x) => CARDS[x].char === CARDS[id].char) === i).slice(0, 8);
  const sw = swaps(weak, ALL, CARDS);
  if (sw.length) {
    const next = weak.map((id) => (id === sw[0].out ? sw[0].in : id));
    assert.ok(score(next, CARDS).total > score(weak, CARDS).total);
  }
});

test('one Mythic per Octave', () => {
  const myths = ALL.filter((id) => CARDS[id].rarity === 'mythic');
  const rest = ALL.filter((id) => !myths.includes(id));
  const two = [myths[0], myths[1]];
  for (const id of rest) if (two.length < 8 && !two.some((x) => CARDS[x].char === CARDS[id].char)) two.push(id);
  assert.match(deckProblem(two, CARDS), /Mythic/);
  assert.equal(deckProblem([myths[0], ...two.slice(2), rest.find((id) => !two.includes(id) && !two.some((x) => CARDS[x].char === CARDS[id].char))], CARDS), null);
});
