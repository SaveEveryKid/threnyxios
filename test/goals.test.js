import test from 'node:test';
import assert from 'node:assert/strict';
import { masteryLevel, masteryNext, seasonWin, weekKey, SEASON } from '../engine/goals.js';
import { CARDS, LIST } from '../engine/cards/index.js';
import { buildPuzzle, puzzleResult } from '../engine/modes.js';
import { makeExpert } from '../engine/battle-ai.js';

test('mastery steps are reached in order', () => {
  assert.equal(masteryLevel({ battles: 0 }), 0);
  assert.equal(masteryLevel({ battles: 3, matchWins: 5 }), 2);
  assert.equal(masteryLevel({ battles: 3, matchWins: 20, kills: 1, dealt: 500 }), 2, 'Feared gates Legend');
  assert.equal(masteryNext({ battles: 3, matchWins: 2 }).progress, 0.4);
});

test('the season track pays each step once and resets weekly', () => {
  let s = null;
  const mon = new Date(2026, 8, 28, 12).getTime();
  const paid = [];
  for (let i = 0; i < 16; i++) {
    const r = seasonWin(s, mon);
    s = r.season;
    paid.push(...r.reached);
  }
  assert.deepEqual(paid, SEASON);
  assert.equal(weekKey(mon), weekKey(mon + 5 * 86400000));
  assert.equal(seasonWin(s, mon + 7 * 86400000).season.wins, 1);
});

test('the daily puzzle always has an answer and the answer finishes them', () => {
  for (const day of [20300, 20301, 20310]) {
    const pz = buildPuzzle({ day, cards: CARDS, list: LIST, makeAgent: (rand) => makeExpert({ cards: CARDS, rand }) });
    assert.ok(pz, 'puzzle for ' + day);
    assert.ok(pz.solutions.length >= 1 && pz.solutions.length <= 4);
    for (const c of pz.solutions) assert.ok(puzzleResult(pz, CARDS, c).won);
  }
});

test('rarer packs: each rank pays once, the third Anomaly win pays a Faction Pack', async () => {
  const { rankRewards, anomalyWin, RANK_REWARDS } = await import('../engine/goals.js');
  const s = { ladder: { tier: 0 }, rankPaid: 0 };
  s.ladder.tier = 2;
  assert.deepEqual(rankRewards(s).map((r) => r.reward), [RANK_REWARDS[1], RANK_REWARDS[2]]);
  assert.equal(rankRewards(s).length, 0, 'paid once');
  s.ladder.tier = 1; // demoted, then back
  s.ladder.tier = 2;
  assert.equal(rankRewards(s).length, 0);
  const t = {};
  const now = new Date(2026, 8, 29, 12).getTime();
  assert.equal(anomalyWin(t, now), null);
  assert.equal(anomalyWin(t, now), null);
  assert.deepEqual(anomalyWin(t, now), { faction: 1 });
  assert.equal(anomalyWin(t, now), null, 'once a week');
  assert.equal(anomalyWin(t, now + 7 * 86400000), null, 'new week starts over');
});
