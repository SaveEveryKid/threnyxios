// The Reckoning: core rules, abilities and determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, deploy, command, isLegalCommand, LANES, deployOrder, agentDeploys, publicView } from '../engine/battle.js';
import { CARDS } from '../engine/cards/index.js';
import { makeExpert } from '../engine/battle-ai.js';
import { makeRng } from '../engine/rng.js';

// Vanilla test Champions (no abilities).
const V = {
  brute: { id: 'brute', stats: { strike: 6, guard: 2, scheme: 2 }, hp: 8 },
  wall: { id: 'wall', stats: { strike: 2, guard: 5, scheme: 2 }, hp: 9 },
  sneak: { id: 'sneak', stats: { strike: 2, guard: 2, scheme: 5 }, hp: 5 },
  glass: { id: 'glass', stats: { strike: 4, guard: 1, scheme: 1 }, hp: 3 },
};
const OCT = ['brute', 'wall', 'sneak', 'glass', 'brute', 'wall', 'sneak', 'glass'];
const CLASSIC = { voice: 30, rounds: 9, terrain: false, lastStand: false, ults: 0, counterDeploy: false };

function duel(a, b, oa, ob, extra = {}) {
  // classic rules for the core tests: the newer rules have their own tests
  const st = createBattle([OCT, OCT], V, { seed: 1, initiative: 0, rules: CLASSIC, ...extra });
  st.p[0].hand = [a];
  st.p[1].hand = b ? [b] : [];
  deploy(st, [[{ card: a, lane: 1 }], b ? [{ card: b, lane: 1 }] : []], V);
  const cmd = (o) => ({ orders: [null, o, null], focus: null, read: null });
  return { st, go: (ca = cmd(oa), cb = cmd(ob)) => command(st, [ca, cb], V) };
}
const unit = (st, s) => st.p[s].lanes[1];

test('STRIKE vs SCHEME with a kill: overkill spills into the Voice', () => {
  const { st, go } = duel('brute', 'sneak', 'strike', 'scheme');
  go();
  assert.equal(st.p[1].lanes[1], null, 'sneak fell');
  assert.equal(st.p[1].voice, 30 - 1, '6 damage into 5 health spills 1');
  assert.equal(st.p[0].voice, 30, 'the scheme was cancelled');
});

test('SCHEME beats GUARD: the Voice is hit and no shield is raised', () => {
  const { st, go } = duel('sneak', 'wall', 'scheme', 'guard');
  go();
  assert.equal(st.p[1].voice, 30 - 5);
  assert.equal(unit(st, 1).ward, 0);
});

test('GUARD beats STRIKE: the striker takes the riposte, the guard takes nothing', () => {
  const { st, go } = duel('brute', 'wall', 'strike', 'guard');
  go();
  assert.equal(unit(st, 0).hp, 8 - 5);
  assert.equal(unit(st, 1).hp, 9);
});

test('STRIKE mirror: both Champions are hit', () => {
  const { st, go } = duel('brute', 'wall', 'strike', 'strike');
  go();
  assert.equal(unit(st, 0).hp, 8 - 2);
  assert.equal(unit(st, 1).hp, 9 - 6);
});

test('an unchallenged GUARD raises a shield equal to its Power, and shields do not stack', () => {
  const { st, go } = duel('wall', 'sneak', 'guard', 'guard');
  go();
  assert.equal(unit(st, 0).ward, 5);
  const cmd = (o) => ({ orders: [null, o, null], focus: null, read: null });
  deploy(st, [[], []], V);
  command(st, [cmd('guard'), cmd('guard')], V);
  assert.equal(unit(st, 0).ward, 5);
});

test('shields absorb damage before health', () => {
  const { st, go } = duel('wall', 'brute', 'guard', 'guard');
  go(); // wall ward 5
  const cmd = (o) => ({ orders: [null, o, null], focus: null, read: null });
  deploy(st, [[], []], V);
  command(st, [cmd('strike'), cmd('strike')], V); // brute hits wall for 6: 5 warded, 1 to health
  assert.equal(unit(st, 0).ward, 0);
  assert.equal(unit(st, 0).hp, 8);
});

test('a Champion with nobody opposite hits the Voice with STRIKE or SCHEME', () => {
  const { st, go } = duel('brute', null, 'strike', null);
  go({ orders: [null, 'strike', null], focus: null, read: null }, { orders: [null, null, null], focus: null, read: null });
  assert.equal(st.p[1].voice, 30 - 6);
});

test('READ: correct cancels their Order and gives +3; a miss costs -2', () => {
  const hit = duel('sneak', 'brute', 'scheme', 'strike');
  hit.go({ orders: [null, 'scheme', null], focus: null, read: { lane: 1, order: 'strike' } }, undefined);
  assert.equal(hit.st.p[1].voice, 30 - (5 + 3), 'scheme 5 + READ 3, their STRIKE cancelled');
  assert.equal(unit(hit.st, 0).hp, 5);
  const miss = duel('sneak', 'wall', 'scheme', 'guard');
  miss.go({ orders: [null, 'scheme', null], focus: null, read: { lane: 1, order: 'strike' } }, undefined);
  assert.equal(miss.st.p[1].voice, 30 - (5 - 2));
});

test('READ is only legal in a lane where both players have a Champion', () => {
  const { st } = duel('brute', null, 'strike', null);
  assert.equal(isLegalCommand(st, 1, { orders: [null, null, null], focus: null, read: { lane: 1, order: 'strike' } }), false);
});

test('Focus: +2 Power, one per round, three per match', () => {
  const { st, go } = duel('brute', null, 'strike', null);
  go({ orders: [null, 'strike', null], focus: 1, read: null }, { orders: [null, null, null], focus: null, read: null });
  assert.equal(st.p[1].voice, 30 - 8);
  assert.equal(st.p[0].focus, 2);
});

test('a Voice at 0 ends the match; after the last round the higher Voice wins', () => {
  const { st, go } = duel('brute', null, 'strike', null);
  st.p[1].voice = 5;
  go({ orders: [null, 'strike', null], focus: null, read: null }, { orders: [null, null, null], focus: null, read: null });
  assert.equal(st.phase, 'over');
  assert.equal(st.winner, 0);
  const b = duel('wall', 'wall', 'guard', 'guard', { rules: { rounds: 1 } });
  b.st.p[1].voice = 20;
  b.go();
  assert.equal(b.st.phase, 'over');
  assert.equal(b.st.winner, 0);
});

// ---- abilities (real cards)
function real(a, b) {
  const oct = Object.keys(CARDS).slice(0, 8);
  const st = createBattle([oct, oct], CARDS, { seed: 3, initiative: 0, rules: CLASSIC });
  st.p[0].hand = [a];
  st.p[1].hand = [b];
  deploy(st, [[{ card: a, lane: 0 }], [{ card: b, lane: 0 }]], CARDS);
  return st;
}

test('Imperial Decree: On Reveal forbids GUARD and deals 2 to the enemy opposite', () => {
  const st = real('maelis', 'garrick');
  const g = st.p[1].lanes[0];
  assert.deepEqual(g.tags.forbid, ['guard']);
  assert.equal(g.ward + g.hp, CARDS.garrick.hp + 3 - 2, 'shield 3 absorbs the 2 first');
  assert.equal(isLegalCommand(st, 1, { orders: ['guard', null, null], focus: null, read: null }), false);
});

test('Last Words: The Last Ember deals 4 to the enemy opposite when Tamsin falls', () => {
  const st = real('tamsin', 'brannoc');
  st.p[0].lanes[0].hp = 1;
  const before = st.p[1].lanes[0].hp;
  command(st, [{ orders: ['scheme', null, null], focus: null, read: null }, { orders: ['strike', null, null], focus: null, read: null }], CARDS);
  assert.equal(st.p[0].lanes[0], null);
  assert.equal(st.p[1].lanes[0].hp, before - 4, 'Brannoc heals on his hit first (already full), then takes the 4');
});

test('No Name to Read: READs against the Hollow King always miss', () => {
  const st = real('lysander', 'hollowKing');
  command(st, [{ orders: ['scheme', null, null], focus: null, read: { lane: 0, order: 'guard' } }, { orders: ['guard', null, null], focus: null, read: null }], CARDS);
  assert.equal(st.p[0].stats.readsHit, 0);
});

test('every card compiles and the set validates', async () => {
  const { validateSet } = await import('../engine/cards/index.js');
  assert.deepEqual(validateSet(), []);
});

test('matches are deterministic for the same seed and choices', () => {
  const run = () => {
    const ids = Object.keys(CARDS);
    const rand = makeRng(42);
    const a = [makeExpert({ cards: CARDS, rand }), makeExpert({ cards: CARDS, rand })];
    const st = createBattle([ids.slice(0, 8), ids.slice(8, 16)], CARDS, { seed: 9 });
    const { publicView } = { publicView: (s) => s };
    let n = 0;
    while (st.phase !== 'over' && n++ < 40) {
      deploy(st, [0, 1].map((s) => a[s].deploy(JSON.parse(JSON.stringify(st)), s)), CARDS);
      if (st.phase === 'over') break;
      command(st, [0, 1].map((s) => a[s].command(JSON.parse(JSON.stringify(st)), s)), CARDS);
    }
    return JSON.stringify([st.winner, st.p[0].voice, st.p[1].voice, st.round]);
  };
  assert.equal(run(), run());
});

// ---------------------------------------------------------------------------
// Terrain, Last Stand, Ultimates, side mods, counter-deploy
// ---------------------------------------------------------------------------
const cmd1 = (o, extra = {}) => ({ orders: [null, o, null], focus: null, read: null, ...extra });

test('terrain: a Rampart adds +2 GUARD in its lane', () => {
  const { st, go } = duel('brute', 'wall', 'strike', 'guard', { terrain: ['field', 'rampart', 'field'] });
  go();
  assert.equal(unit(st, 0).hp, 8 - 7, 'riposte hits for 5 + 2');
});

test('terrain: an Ash Mire takes 1 from every Order', () => {
  const { st, go } = duel('sneak', 'wall', 'scheme', 'guard', { terrain: ['field', 'mire', 'field'] });
  go();
  assert.equal(st.p[1].voice, 30 - 4);
});

test('Last Stand (comeback): only a side at 10 Voice or less gets +2 before the final round', () => {
  const { st, go } = duel('brute', 'brute', 'strike', 'strike', { rules: { ...CLASSIC, lastStand: true } });
  st.p[1].voice = 10;
  go();
  assert.equal(st.p[0].lanes[1], null, 'the side at 10 Voice hits for 6 + 2: the 8-health brute falls');
  assert.equal(unit(st, 1).hp, 8 - 6, 'the side ahead hits for a plain 6');
});

test('Last Stand: in the final round every Champion gets +2 and a MISREAD costs double', () => {
  const { st, go } = duel('sneak', 'wall', 'scheme', 'strike', { rules: { ...CLASSIC, lastStand: true, rounds: 1 } });
  go(cmd1('scheme', { read: { lane: 1, order: 'guard' } }), cmd1('strike'));
  // wall STRIKEs (2 + 2) into the sneak; sneak's SCHEME is beaten by STRIKE; the misread cost the sneak 4
  assert.equal(st.events[0].t, 'lastStand');
  assert.equal(unit(st, 0)?.hp ?? 0, 5 - 4);
});

test('Ultimate: needs a charged Champion, is unbeatable and unreadable, +1 Power, once a match', () => {
  const { st, go } = duel('sneak', 'brute', 'scheme', 'strike', { rules: { ...CLASSIC, ults: 1, ultCharge: 0 } });
  assert.ok(isLegalCommand(st, 0, cmd1('scheme', { ult: 1 })));
  go(cmd1('scheme', { ult: 1 }), cmd1('strike', { read: { lane: 1, order: 'scheme' } }));
  assert.equal(st.p[1].voice, 30 - 6, 'SCHEME 5 + 1 lands although STRIKE beats SCHEME and it was read');
  assert.equal(st.p[0].ults, 0);
  deploy(st, [[], []], V);
  assert.ok(!isLegalCommand(st, 0, cmd1('scheme', { ult: 1 })), 'only once a match');
});

test('Ultimate: not before the Champion has stood ultCharge rounds', () => {
  const { st } = duel('sneak', 'brute', 'scheme', 'strike', { rules: { ...CLASSIC, ults: 1, ultCharge: 2 } });
  assert.ok(!isLegalCommand(st, 0, cmd1('scheme', { ult: 1 })));
});

test('side mods: extra Voice, upgrades and deploy shields apply to one side only', () => {
  const st = createBattle([OCT, OCT], V, { seed: 1, initiative: 0, rules: CLASSIC, mods: [{ voice: 4, shield: 2, buffs: { brute: { strike: 1, hp: 2 } } }, {}] });
  st.p[0].hand = ['brute'];
  st.p[1].hand = ['brute'];
  deploy(st, [[{ card: 'brute', lane: 0 }], [{ card: 'brute', lane: 0 }]], V);
  assert.equal(st.p[0].voice, 34);
  assert.equal(st.p[1].voice, 30);
  assert.deepEqual([st.p[0].lanes[0].stats.strike, st.p[0].lanes[0].hp, st.p[0].lanes[0].ward], [7, 10, 2]);
  assert.deepEqual([st.p[1].lanes[0].stats.strike, st.p[1].lanes[0].hp, st.p[1].lanes[0].ward], [6, 8, 0]);
});

test('counter-deploy: the side without Initiative places first; Experts play a full match under all rules', () => {
  const rand = makeRng(5);
  const ids = Object.keys(CARDS);
  const st = createBattle([ids.slice(0, 8), ids.slice(8, 16)], CARDS, { seed: 11 });
  assert.deepEqual(deployOrder(st), [1 - st.initiative, st.initiative]);
  const agents = [makeExpert({ cards: CARDS, rand }), makeExpert({ cards: CARDS, rand })];
  let n = 0;
  while (st.phase !== 'over' && n++ < 20) {
    deploy(st, agentDeploys(st, agents), CARDS);
    if (st.phase === 'over') break;
    const c = [0, 1].map((s) => agents[s].command(publicView(st, s), s));
    for (const s of [0, 1]) assert.ok(isLegalCommand(st, s, c[s]), 'legal command');
    command(st, c, CARDS);
  }
  assert.equal(st.phase, 'over');
  assert.ok(st.round <= 7);
});
