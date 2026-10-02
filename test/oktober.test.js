import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OKTOBER, phase, freshEntry, scoreQualifying, rankQualifying, scoreFinals, rankFinals, championOf } from '../engine/oktober.js';

const T = Date.parse('2026-10-10T18:00:00Z');

test('Oktoberfest phases follow US Central time', () => {
  assert.equal(phase(Date.parse('2026-09-30T23:00:00Z')), 'soon');
  assert.equal(phase(Date.parse('2026-10-01T05:00:00Z')), 'qualifying');
  assert.equal(phase(Date.parse('2026-10-31T04:59:59Z')), 'qualifying', 'Friday 30 Oct, 11:59 pm Central');
  assert.equal(phase(Date.parse('2026-10-31T05:00:00Z')), 'finals', 'Saturday 31 Oct, midnight Central');
  assert.equal(phase(Date.parse('2026-11-02T05:59:59Z')), 'finals', 'Sunday 1 Nov, 11:59 pm Central (standard time)');
  assert.equal(phase(Date.parse('2026-11-02T06:00:00Z')), 'over');
});

test('qualifying: wins 3, losses 1, Echoes a little, one opponent only a few times a day', () => {
  let e = freshEntry('u', 'Ann');
  const play = (args) => ((e = scoreQualifying(e, { now: T, ...args }).entry), e.points);
  assert.equal(play({ won: true, opp: 'bo' }), 3);
  assert.equal(play({ won: false, opp: 'bo' }), 4, 'a loss still earns a point for showing up');
  assert.equal(play({ won: true, opp: 'bo' }), 7);
  assert.equal(play({ won: true, opp: 'bo' }), 7, `the same opponent scores ${OKTOBER.sameOpponentPerDay} times a day`);
  assert.equal(play({ won: true, opp: 'cy' }), 10, 'a different opponent still counts');
  for (let i = 0; i < 5; i++) play({ won: true, opp: 'echo', echo: true });
  assert.equal(e.points, 10 + OKTOBER.echoPointsPerDay, 'Echo wins: a point each, a few a day');
  assert.equal(e.wins, 9, 'every win is counted, scoring or not');
  e = scoreQualifying(e, { won: true, opp: 'bo', now: T + 86400000 }).entry;
  assert.equal(e.points, 16, 'the next day the caps reset');
});

test('qualifying order: points, then wins, then who got there first', () => {
  const r = rankQualifying([
    { user_id: 'a', points: 10, wins: 2, updated_at: '2026-10-05' },
    { user_id: 'b', points: 12, wins: 1, updated_at: '2026-10-09' },
    { user_id: 'c', points: 10, wins: 3, updated_at: '2026-10-08' },
    { user_id: 'd', points: 10, wins: 3, updated_at: '2026-10-02' },
  ]);
  assert.deepEqual(r.map((x) => x.user_id), ['b', 'd', 'c', 'a']);
});

test('finals: Elo between finalists, a pair counts a few times, enough matches to win', () => {
  let a = { ...freshEntry('a', 'Ann') }, b = { ...freshEntry('b', 'Bo') }, c = { ...freshEntry('c', 'Cy') };
  for (let i = 0; i < OKTOBER.finals.perPair; i++) [a, b] = scoreFinals(a, b, true);
  assert.equal(a.wins, OKTOBER.finals.perPair);
  assert.ok(a.rating > 1000 && a.rating + b.rating === 2000);
  assert.equal(scoreFinals(a, b, true), null, `a pair counts ${OKTOBER.finals.perPair} finals matches`);
  [c, b] = scoreFinals(c, b, true); // Cy beats Bo once: a high rating, too few matches
  const order = rankFinals([b, c, a]).map((x) => x.user_id);
  assert.equal(order[0], 'a', `the champion needs ${OKTOBER.finals.minMatches} finals matches`);
});

test('the champion, by the Official Rules, even if nobody played enough', () => {
  const f = (id, o) => ({ ...freshEntry(id, id), ...o });
  assert.equal(championOf([f('a', { matches: 3, rating: 1010, extra: { seed: 2 } }), f('b', { matches: 3, rating: 1010, wins: 2, extra: { seed: 1 } })]).user_id, 'b', 'a rating tie: most wins');
  assert.equal(championOf([f('a', { matches: 3, rating: 1010, wins: 2, extra: { seed: 2 } }), f('b', { matches: 3, rating: 1010, wins: 2, extra: { seed: 1 } })]).user_id, 'b', 'then the higher seed');
  assert.equal(championOf([f('a', { matches: 2, wins: 1, extra: { seed: 1 } }), f('b', { matches: 2, wins: 2, extra: { seed: 5 } })]).user_id, 'b', 'nobody eligible: most finals wins');
  assert.equal(championOf([f('a', { extra: { seed: 3 } }), f('b', { extra: { seed: 1 } })]).user_id, 'b', 'no finals played: the top qualifier');
});
