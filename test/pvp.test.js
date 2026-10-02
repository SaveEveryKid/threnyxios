import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, LIST } from '../engine/cards/index.js';
import { createDuel, playDuel } from '../engine/duel.js';
import { makeDuelAI } from '../engine/duel-ai.js';
import { makeRng } from '../engine/rng.js';
import { createMatch, submitMove, expire, resign, viewFor, waitingOn, mirrorState, validDeck, elo, CLOCK, FORFEIT_AFTER, markSeen, dropCheck, DROP_AFTER } from '../engine/pvp.js';

const decks = (k) => {
  const r = makeRng(k);
  const out = [];
  for (const f of ['crown', 'vigil']) {
    const d = [];
    for (const c of LIST.filter((c) => c.faction === f).sort(() => r() - 0.5)) if (d.length < 8 && !d.some((x) => CARDS[x].char === c.char)) d.push(c.id);
    out.push(d);
  }
  return out;
};

// Two AI players, each acting only on its own view, through the PvP API.
function playThrough(seed) {
  const [d0, d1] = decks(seed);
  const m = createMatch({ seed, decks: [d0, d1], now: 0 });
  const ag = [makeDuelAI({ rand: makeRng(seed + 1) }), makeDuelAI({ rand: makeRng(seed + 2) })];
  let t = 0, guard = 0;
  while (!m.over && guard++ < 100) {
    const who = waitingOn(m)[0];
    const v = viewFor(m, who);
    const st = v.state, turn = v.turn; // the player sees itself as side 0
    let mv;
    if (turn.phase === 'lead') mv = { lead: ag[who].lead(st) };
    else if (turn.phase === 'answer') mv = ag[who].answer(st, turn.lead);
    else mv = ag[who].finish(st, turn.lead, turn.answer.answer, turn.answer.answerFocus);
    const r = submitMove(m, who, mv, (t += 1000));
    assert.equal(r.ok, true, r.error);
  }
  return m;
}

test('a full match plays through the PvP API, each side acting on its own view', () => {
  for (const seed of [11, 12, 13, 14]) {
    const m = playThrough(seed);
    assert.ok(m.over, 'finished');
    assert.equal(m.results.at(-1).kind, 'end');
    // replaying the logged duels on a fresh engine gives the same result
    const [d0, d1] = decks(seed);
    const st = createDuel([d0, d1], { seed, names: ['A', 'B'] });
    for (const r of m.results) if (r.kind === 'duel') playDuel(st, r.choice);
    assert.equal(st.winner, m.winner);
    assert.deepEqual([st.sides[0].voice, st.sides[1].voice], [m.state.sides[0].voice, m.state.sides[1].voice]);
  }
});

test('views: always from your own side, draw order hidden', () => {
  const m = playThrough(21);
  const v1 = viewFor(m, 1);
  assert.deepEqual(v1.state.sides[0].deck, m.state.sides[1].deck, 'side 1 sees itself as side 0');
  assert.equal(v1.state.seed, 0);
  assert.deepEqual(mirrorState(mirrorState(m.state)).sides[0].voice, m.state.sides[0].voice);
  const d = v1.results.find((r) => r.kind === 'duel');
  const raw = m.results.find((r) => r.kind === 'duel');
  assert.deepEqual(d.voice, [raw.voice[1], raw.voice[0]]);
  assert.equal(d.lead, 1 - raw.lead);
  const c = d.events.find((e) => e.t === 'clash'), rc = raw.events.find((e) => e.t === 'clash');
  if (c) assert.deepEqual(c.power[0], rc.power[1]);
  assert.equal(v1.winner, m.winner == null ? null : 1 - m.winner);
});

test('turns: Lead, then Answer, then the Lead finishes; nobody moves out of turn', () => {
  const [d0, d1] = decks(31);
  const m = createMatch({ seed: 31, decks: [d0, d1], now: 0 });
  const L = m.state.lead, A = 1 - L;
  assert.deepEqual(waitingOn(m), [L]);
  assert.equal(submitMove(m, A, { lead: m.state.sides[A].hand[0] }, 1).ok, false);
  const lead = m.state.sides[L].hand[0];
  assert.ok(submitMove(m, L, { lead }, 2).ok);
  assert.equal(viewFor(m, A).turn.lead, lead, 'the Answer sees who was sent');
  assert.deepEqual(waitingOn(m), [A]);
  assert.ok(submitMove(m, A, { answer: m.state.sides[A].hand[0], answerFocus: true }, 3).ok);
  assert.equal(viewFor(m, L).turn.phase, 'finish');
  assert.equal(submitMove(m, L, { switchTo: 'nobody' }, 4).ok, false);
  assert.ok(submitMove(m, L, { leadFocus: true }, 5).ok);
  assert.equal(m.results.at(-1).kind, 'duel');
  assert.equal(m.state.duel, 2);
});

test('shot clock: a late side is played for; three in a row forfeit', () => {
  const [d0, d1] = decks(41);
  const m = createMatch({ seed: 41, decks: [d0, d1], now: 0 });
  assert.equal(expire(m, null, CLOCK.move - 1), false, 'not yet');
  let now = 0, n = 0;
  while (!m.over && n++ < 40) expire(m, null, (now += 60000));
  assert.ok(m.over);
  assert.ok(m.by === 'timeout' || m.by === 'play');
  assert.ok(m.results.some((r) => r.kind === 'timeout'));
});

test('resign, deck checks and rating', () => {
  const [d0, d1] = decks(51);
  const m = createMatch({ seed: 51, decks: [d0, d1] });
  resign(m, 0);
  assert.equal(m.winner, 1);
  assert.equal(viewFor(m, 1).winner, 0, 'from side 1, side 1 is "you" (0) and won');
  assert.ok(validDeck(d0, CARDS));
  assert.equal(validDeck(d0.slice(0, 7), CARDS), false);
  assert.equal(validDeck([...d0.slice(0, 7), d0[0]], CARDS), false);
  const [a, b] = elo(1000, 1000, 1);
  assert.equal(a, 1016);
  assert.equal(b, 984);
});

test('connection: a player silent for 60 seconds forfeits; an Echo never drops', () => {
  const [d0, d1] = decks(5);
  const m = createMatch({ seed: 9, decks: [d0, d1], now: 0 });
  markSeen(m, 0, 50000);
  assert.equal(dropCheck(m, 59000), false, 'under a minute: still playing');
  assert.equal(dropCheck(m, DROP_AFTER + 1000), true, 'side 1 silent past the limit');
  assert.ok(m.over && m.winner === 0 && m.by === 'disconnect');
  const e = createMatch({ seed: 9, decks: [d0, d1], now: 0 });
  markSeen(e, 0, DROP_AFTER);
  assert.equal(dropCheck(e, DROP_AFTER + 5000, [1]), false, 'the Echo side is always present');
  const both = createMatch({ seed: 9, decks: [d0, d1], now: 0 });
  assert.equal(dropCheck(both, DROP_AFTER * 2), false, 'both gone: nobody wins until one returns');
  markSeen(both, 1, DROP_AFTER * 2);
  assert.ok(dropCheck(both, DROP_AFTER * 2 + 1) && both.winner === 1, 'the first back wins');
});

test('emotes: a fixed set, one every few seconds, a cap per match, each side sees whose', async () => {
  const { addEmote, EMOTES, EMOTE_GAP, EMOTE_MAX } = await import('../engine/pvp.js');
  const [d0, d1] = decks(6);
  const m = createMatch({ seed: 3, decks: [d0, d1], now: 0 });
  const v0 = m.version;
  assert.equal(addEmote(m, 0, 'nope', 0).ok, false, 'only the preset emotes');
  assert.equal(addEmote(m, 0, 'gl', 1000).ok, true);
  assert.equal(addEmote(m, 0, 'wp', 2000).ok, false, `one every ${EMOTE_GAP / 1000} seconds`);
  assert.equal(addEmote(m, 1, 'gl', 2000).ok, true, 'each player has their own pace');
  assert.equal(m.version, v0, 'emotes never touch the match itself');
  const view1 = viewFor(m, 1);
  assert.deepEqual(view1.emotes.map((e) => [e.id, e.mine]), [['gl', false], ['gl', true]]);
  let t = 10000, sent = 1;
  while (addEmote(m, 0, EMOTES[0].id, (t += EMOTE_GAP)).ok) sent++;
  assert.equal(sent, EMOTE_MAX, `at most ${EMOTE_MAX} a match`);
  assert.ok(m.emotes.length <= 12, 'only the recent ones are kept');
});
