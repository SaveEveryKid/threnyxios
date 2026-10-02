// Reckoning prototype harness: vanilla generated Champions, agent matchups,
// impact / length / skill metrics. Usage: node sim/reckon.js [matches] [rulesJSON] [statModel]
import { agentDeploys, createBattle, deploy, command, publicView, cloneState } from '../engine/battle.js';
import { makeExpert, makeNovice, makeGreedy, makeRandom } from '../engine/battle-ai.js';
import { makeRng } from '../engine/rng.js';

export function genCards(n, rand, model = {}) {
  const { budget = 22, lo = 1, hi = 9, hpLo = 3, hpHi = 10 } = model;
  const cards = {};
  for (let i = 0; i < n; i++) {
    let s, g, c, hp;
    for (;;) {
      hp = hpLo + Math.floor(rand() * (hpHi - hpLo + 1));
      const rest = budget - hp;
      const w = [rand() ** 1.6, rand() ** 1.6, rand() ** 1.6];
      const t = w[0] + w[1] + w[2];
      s = Math.round((w[0] / t) * rest); g = Math.round((w[1] / t) * rest); c = rest - s - g;
      if ([s, g, c].every((x) => x >= lo && x <= hi)) break;
    }
    cards['c' + i] = { id: 'c' + i, stats: { strike: s, guard: g, scheme: c }, hp };
  }
  return cards;
}

export function playMatch(agents, octaves, cards, seed, rules, log = null) {
  let st = createBattle(octaves, cards, { seed, rules });
  const m = { rounds: 0, hits: 0, falls: 0, voiceDmg: 0, reads: 0, readsHit: 0, focus: 0, orders: { strike: 0, guard: 0, scheme: 0 }, mends: 0, behindAt3: null, events: [] };
  let guard = 0;
  while (st.phase !== 'over' && guard++ < 50) {
    const d = agentDeploys(st, agents);
    deploy(st, d, cards);
    for (const e of st.events) tally(m, e);
    if (st.phase === 'over') break;
    const before = cloneState(st);
    const c = [0, 1].map((s) => agents[s].command(publicView(st, s), s));
    for (const s of [0, 1]) for (const o of c[s].orders) if (o) m.orders[o]++;
    command(st, c, cards);
    for (const e of st.events) tally(m, e);
    for (const s of [0, 1]) agents[s].observe?.(before, s, c[1 - s]);
    m.rounds = before.round;
    if (before.round === 3 && st.phase !== 'over') m.behindAt3 = st.p[0].voice - st.p[1].voice;
  }
  m.winner = st.winner;
  m.voice = [st.p[0].voice, st.p[1].voice];
  m.by = st.events.find((e) => e.t === 'end')?.by;
  m.initiativeStart = null;
  return m;
}
function tally(m, e) {
  if (e.t === 'hit') m.hits++;
  if (e.t === 'fall') m.falls++;
  if (e.t === 'voice') m.voiceDmg += e.n;
  if (e.t === 'read') (m.reads++, e.hit && m.readsHit++);
  if (e.t === 'mend') m.mends++;
  if (e.t === 'orders') m.focus += e.focus.filter((x) => x != null).length;
}

export function runPair(mk, N, rules, model, seed0 = 1) {
  const agg = { n: 0, w0: 0, rounds: 0, hits: 0, falls: 0, voiceDmg: 0, reads: 0, readsHit: 0, focus: 0, orders: { strike: 0, guard: 0, scheme: 0 }, silence: 0, comeback: 0, behind: 0, margin: 0 };
  for (let i = 0; i < N; i++) {
    const rand = makeRng(seed0 * 7919 + i * 104729);
    const cards = genCards(16, rand, model);
    const ids = Object.keys(cards);
    const flip = i % 2 === 1; // alternate seats
    const agents = mk(cards, rand);
    const seats = flip ? [agents[1], agents[0]] : agents;
    const oct = [ids.slice(0, 8), ids.slice(8)];
    const m = playMatch(seats, flip ? [oct[1], oct[0]] : oct, cards, seed0 * 31 + i, rules);
    const winA = flip ? m.winner === 1 : m.winner === 0; // agent[0] won
    agg.n++;
    agg.w0 += winA ? 1 : 0;
    agg.rounds += m.rounds; agg.hits += m.hits; agg.falls += m.falls; agg.voiceDmg += m.voiceDmg; agg.reads += m.reads; agg.readsHit += m.readsHit; agg.focus += m.focus;
    for (const o in m.orders) agg.orders[o] += m.orders[o];
    if (m.by === 'silence') agg.silence++;
    agg.margin += Math.abs(m.voice[0] - m.voice[1]);
    if (m.behindAt3 != null) {
      const aBehind = flip ? m.behindAt3 > 5 : m.behindAt3 < -5; // agent A behind by 6+
      const bBehind = flip ? m.behindAt3 < -5 : m.behindAt3 > 5;
      if (aBehind) (agg.behind++, winA && agg.comeback++);
      if (bBehind) (agg.behind++, !winA && agg.comeback++);
    }
  }
  const n = agg.n, ot = agg.orders.strike + agg.orders.guard + agg.orders.scheme;
  return {
    winA: +((100 * agg.w0) / n).toFixed(1),
    rounds: +(agg.rounds / n).toFixed(2),
    silence: +((100 * agg.silence) / n).toFixed(0),
    hitsPerRound: +(agg.hits / agg.rounds).toFixed(2),
    fallsPerMatch: +(agg.falls / n).toFixed(2),
    voiceDmgPerRound: +(agg.voiceDmg / agg.rounds).toFixed(2),
    focusPerMatch: +(agg.focus / n).toFixed(2),
    readsPerMatch: +(agg.reads / n).toFixed(2),
    readHit: agg.reads ? +((100 * agg.readsHit) / agg.reads).toFixed(0) : null,
    orders: Object.fromEntries(Object.entries(agg.orders).map(([k, v]) => [k, +((100 * v) / ot).toFixed(0)])),
    comebackFromMinus6AtR3: agg.behind ? +((100 * agg.comeback) / agg.behind).toFixed(0) + '% of ' + agg.behind : null,
    avgMargin: +(agg.margin / n).toFixed(1),
  };
}

export const PAIRS = {
  mirror: (cards, rand) => [makeExpert({ cards, rand }), makeExpert({ cards, rand })],
  novice: (cards, rand) => [makeExpert({ cards, rand }), makeNovice({ cards, rand })],
  greedy: (cards, rand) => [makeExpert({ cards, rand }), makeGreedy({ cards })],
  random: (cards, rand) => [makeExpert({ cards, rand }), makeRandom({ rand })],
  noviceVsRandom: (cards, rand) => [makeNovice({ cards, rand }), makeRandom({ rand })],
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const N = +(process.argv[2] || 100);
  const rules = JSON.parse(process.argv[3] || '{}');
  const model = JSON.parse(process.argv[4] || '{}');
  const which = (process.argv[5] || 'mirror,novice,greedy').split(',');
  for (const k of which) {
    const t = Date.now();
    const r = runPair(PAIRS[k], N, rules, model);
    console.log(k.padEnd(8), JSON.stringify(r), ((Date.now() - t) / N).toFixed(0) + 'ms/match');
  }
}

// Which stats win? Per generated card: appearances on the board and wins.
export function statRegression(N, rules, model) {
  const rows = [];
  for (let i = 0; i < N; i++) {
    const rand = makeRng(99991 + i * 7);
    const cards = genCards(16, rand, model);
    const ids = Object.keys(cards);
    const a = [makeExpert({ cards, rand }), makeExpert({ cards, rand })];
    const m = playMatch(a, [ids.slice(0, 8), ids.slice(8)], cards, i + 5, rules);
    for (const [k, id] of ids.entries()) rows.push({ c: cards[id], win: (k < 8 ? m.winner === 0 : m.winner === 1) ? 1 : 0 });
  }
  // simple per-stat bucket win rates
  const out = {};
  for (const key of ['strike', 'guard', 'scheme', 'hp']) {
    const b = {};
    for (const r of rows) {
      const v = key === 'hp' ? r.c.hp : r.c.stats[key];
      const k2 = v <= 2 ? 'lo(<=2)' : v <= 5 ? 'mid(3-5)' : 'hi(6+)';
      (b[k2] ||= [0, 0])[0] += r.win;
      b[k2][1]++;
    }
    out[key] = Object.fromEntries(Object.entries(b).map(([k, [w, n]]) => [k, +((100 * w) / n).toFixed(1)]));
  }
  return out;
}

// Marginal value of +1 in one stat on every card of side A (Expert mirror).
export function statValue(N, rules, model, key, delta = 1) {
  let w = 0;
  for (let i = 0; i < N; i++) {
    const rand = makeRng(424242 + i * 13);
    const base = genCards(8, rand, model);
    const ids = Object.keys(base);
    const cards = {};
    for (const id of ids) {
      cards[id] = base[id];
      const b = JSON.parse(JSON.stringify(base[id]));
      b.id = id + 'x';
      if (key === 'hp') b.hp += delta; else b.stats[key] += delta;
      cards[id + 'x'] = b;
    }
    const flip = i % 2;
    const oA = ids.map((x) => x + 'x'), oB = ids.slice();
    const agents = [makeExpert({ cards, rand }), makeExpert({ cards, rand })];
    const m = playMatch(agents, flip ? [oB, oA] : [oA, oB], cards, i + 11, rules);
    if (m.winner === (flip ? 1 : 0)) w++;
  }
  return +((100 * w) / N).toFixed(1);
}
