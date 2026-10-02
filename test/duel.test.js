import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDuel, cloneDuel, playDuel, preview, canRead, duelStats, isFinalDuel, DUEL_RULES } from '../engine/duel.js';
import { makeDuelAI, playOut } from '../engine/duel-ai.js';
import { CARDS } from '../engine/cards/index.js';
import { makeRng } from '../engine/rng.js';

const A = ['orla', 'hadric', 'mira', 'iver', 'doran', 'dunstan', 'caska', 'ebb'];
const B = ['pip', 'corwin', 'lina', 'tallis', 'maren', 'horne', 'corbel', 'sera'];
const ALL = Object.keys(CARDS);

test('a new Duel deals 3 to each hand and keeps the rest in Reserve', () => {
  const st = createDuel([A, B], { seed: 7 });
  for (const s of [0, 1]) {
    assert.equal(st.sides[s].hand.length, DUEL_RULES.hand);
    assert.equal(st.sides[s].hand.length + st.sides[s].reserve.length, 8);
    assert.equal(st.sides[s].voice, DUEL_RULES.voice);
  }
  assert.equal(st.duel, 1);
  assert.ok(st.lead === 0 || st.lead === 1);
  assert.equal(createDuel([A, B], { seed: 7, lead: 1 }).lead, 1);
});

test('every card has Duel stats', () => {
  for (const id of ALL) {
    const d = duelStats(id);
    for (const k of ['strike', 'guard', 'scheme', 'hp']) assert.ok(Number.isFinite(d[k]), `${id}.${k}`);
    assert.ok(d.hp >= 1, id);
  }
});

test('the same seed and choices give the same match (deterministic)', () => {
  const run = () => playOut(createDuel([A, B], { seed: 99 }), [makeDuelAI({ rand: makeRng(1) }), makeDuelAI({ rand: makeRng(2) })]);
  assert.deepEqual(run().history, run().history);
});

test('preview is exact and does not touch the state', () => {
  const st = createDuel([A, B], { seed: 3 });
  const snap = JSON.stringify(st);
  const L = st.lead;
  const choice = { lead: st.sides[L].hand[0], answer: st.sides[1 - L].hand[0] };
  const pv = preview(st, choice, 0);
  assert.equal(JSON.stringify(st), snap);
  const after = playDuel(cloneDuel(st), choice);
  assert.deepEqual(pv.lost, [20 - after.sides[0].voice, 20 - after.sides[1].voice]);
  assert.ok(['likely win', 'even', 'likely loss'].includes(pv.outlook));
});

test('a card must be in hand', () => {
  const st = createDuel([A, B], { seed: 3 });
  assert.throws(() => playDuel(st, { lead: 'nobody', answer: st.sides[1 - st.lead].hand[0] }));
});

test('Focus adds power and is spent', () => {
  const st = createDuel([A, B], { seed: 5 });
  const L = st.lead, choice = { lead: st.sides[L].hand[0], answer: st.sides[1 - L].hand[0] };
  const plain = playDuel(cloneDuel(st), choice).events.find((e) => e.t === 'clash');
  const f = playDuel(cloneDuel(st), { ...choice, leadFocus: true });
  const focused = f.events.find((e) => e.t === 'clash');
  if (plain && focused) assert.equal(focused.power[L].total - plain.power[L].total, DUEL_RULES.focusPower);
  assert.equal(f.sides[L].focus, DUEL_RULES.focus - 1);
});

test('READ lets the Lead switch after the Answer, once', () => {
  const st = createDuel([A, B], { seed: 11 });
  const L = st.lead, [x, y] = st.sides[L].hand, ans = st.sides[1 - L].hand[0];
  assert.ok(canRead(st, ans));
  playDuel(st, { lead: x, answer: ans, switchTo: y });
  assert.equal(st.history[0].ids[L], y);
  assert.ok(st.sides[L].hand.includes(x));
  assert.equal(st.sides[L].reads, DUEL_RULES.reads - 1);
});

test('a match lasts at most 8 duels and always ends', () => {
  const rand = makeRng(42);
  for (let i = 0; i < 40; i++) {
    const pick = () => Array.from({ length: 8 }, () => ALL[(rand() * ALL.length) | 0]);
    const st = playOut(createDuel([pick(), pick()], { seed: i + 1 }), [makeDuelAI({ skill: rand(), rand }), makeDuelAI({ skill: rand(), rand })]);
    assert.ok(st.over);
    assert.ok(st.history.length <= DUEL_RULES.duels);
    assert.ok(st.winner === 0 || st.winner === 1 || st.winner === null);
  }
});

test('the final duel is flagged', () => {
  const st = createDuel([A, B], { seed: 1, rules: { duels: 2 } });
  assert.equal(isFinalDuel(st), false);
  const ai = [makeDuelAI({ rand: makeRng(1) }), makeDuelAI({ rand: makeRng(2) })];
  const L = st.lead, lead = ai[L].lead(st), a = ai[1 - L].answer(st, lead);
  playDuel(st, { lead, ...a, ...ai[L].finish(st, lead, a.answer, a.answerFocus) });
  if (!st.over) assert.equal(isFinalDuel(st), true);
});
