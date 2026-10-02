import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, LIST } from '../engine/cards/index.js';
import { createDuel } from '../engine/duel.js';
import { newRun, choose, afterDuel, visit, take, playerMods, enemyMods, FLOORS, LIVES, RELICS } from '../engine/road.js';

const DECK = LIST.slice(0, 8).map((c) => c.id);

test('a run maps nine stops, the last a boss, the first a duel', () => {
  const run = newRun(DECK, 7);
  assert.equal(run.map.length, FLOORS);
  assert.deepEqual(run.map.at(-1).map((n) => n.kind), ['boss']);
  assert.ok(run.map[0].every((n) => n.kind === 'fight'));
  assert.deepEqual(newRun(DECK, 7).map, run.map, 'seeded');
});

test('a win offers hero / upgrade / relic and taking them changes the deck and mods', () => {
  const run = newRun(DECK, 3);
  choose(run, 0);
  afterDuel(run, true, CARDS);
  assert.equal(run.floor, 1);
  assert.deepEqual(run.pending.map((c) => c.type), ['hero', 'upgrade', 'relic']);
  const hero = run.pending[0].id;
  assert.ok(!DECK.includes(hero));
  take(run, 0, DECK[2]);
  assert.equal(run.deck[2], hero);
  run.pending = [{ type: 'upgrade', id: DECK[0], stat: 'strike', n: 2 }];
  take(run, 0);
  run.pending = [{ type: 'relic', id: 'banner' }, { type: 'relic', id: 'bellows' }];
  take(run, 0);
  run.pending = [{ type: 'relic', id: 'bellows' }];
  take(run, 0);
  const m = playerMods(run);
  assert.equal(m.voice, RELICS.bellows.mod.voice);
  assert.equal(m.buffs[DECK[0]].strike, 3, 'upgrade + banner');
  const st = createDuel([run.deck, DECK], { seed: 1, mods: [m, null] });
  assert.equal(st.sides[0].voice, st.sides[1].voice + 4);
  assert.equal(st.sides[0].buff[DECK[0]].strike, 3);
});

test('losses cost lives; the boss is fought again; zero lives ends the run', () => {
  const run = newRun(DECK, 5);
  choose(run, 0);
  afterDuel(run, false, CARDS);
  assert.equal(run.lives, LIVES - 1);
  assert.equal(run.floor, 1);
  assert.equal(run.pending, null);
  run.floor = FLOORS - 1;
  choose(run, 0);
  afterDuel(run, false, CARDS);
  assert.equal(run.floor, FLOORS - 1, 'boss again');
  choose(run, 0);
  afterDuel(run, false, CARDS);
  assert.equal(run.done, 'fallen');
});

test('beating the boss wins the run; rests and shrines pay at once', () => {
  const run = newRun(DECK, 9);
  run.floor = FLOORS - 1;
  choose(run, 0);
  afterDuel(run, true, CARDS);
  assert.equal(run.done, 'victory');
  const r2 = newRun(DECK, 9);
  r2.lives = 1;
  r2.floor = 2;
  r2.at = { kind: 'rest' };
  visit(r2);
  take(r2, 0);
  assert.equal(r2.lives, 2);
  assert.equal(r2.floor, 3);
  r2.at = { kind: 'shrine' };
  visit(r2);
  assert.equal(r2.pending.length, 2);
  assert.ok(r2.pending.every((c) => c.type === 'relic'));
});

test('enemies grow along the road', () => {
  const their = LIST.slice(10, 18).map((c) => c.id);
  assert.equal(enemyMods({ kind: 'fight' }, 0, their).voice, 0);
  assert.ok(enemyMods({ kind: 'fight' }, 7, their).voice > 0);
  const boss = enemyMods({ kind: 'boss' }, 8, their);
  assert.equal(boss.buffs[their[0]].strike, 1);
  const st = createDuel([DECK, their], { seed: 2, mods: [null, boss] });
  assert.equal(st.sides[1].reads, st.sides[0].reads + 1);
  assert.equal(st.sides[1].voice, st.sides[0].voice + 6);
});
