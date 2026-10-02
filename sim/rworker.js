// Worker for Reckoning set simulations. Receives { task, from, to, seed, opts }
// and returns tallies. Tasks: 'octaves' (random 8-of-120 Octaves),
// 'decks' (fixed Octaves round robin), 'skill' (agent matchups).
import { parentPort, workerData } from 'node:worker_threads';
import { CARDS, LIST } from '../engine/cards/index.js';
import { agentDeploys, createBattle, deploy, command, publicView, cloneState } from '../engine/battle.js';
import { makeExpert, makeNovice, makeGreedy, makeRandom } from '../engine/battle-ai.js';
import { makeRng, shuffleInPlace } from '../engine/rng.js';

const AGENTS = {
  expert: (rand, o) => makeExpert({ cards: CARDS, rand, ...o }),
  novice: (rand) => makeNovice({ cards: CARDS, rand }),
  greedy: () => makeGreedy({ cards: CARDS }),
  random: (rand) => makeRandom({ rand }),
};

export function play(agents, octaves, seed, rules = {}) {
  const st = createBattle(octaves, CARDS, { seed, rules });
  const seen = [new Set(), new Set()];
  let n = 0;
  const stats = { rounds: 0, falls: 0, hits: 0, voice: 0, orders: { strike: 0, guard: 0, scheme: 0 }, focus: 0, reads: 0, readsHit: 0, behindAt3: null };
  while (st.phase !== 'over' && n++ < 40) {
    const d = agentDeploys(st, agents);
    deploy(st, d, CARDS);
    for (const e of st.events) {
      if (e.t === 'deploy') seen[e.side].add(e.card);
      if (e.t === 'fall') stats.falls++;
    }
    if (st.phase === 'over') break;
    const before = cloneState(st);
    const c = [0, 1].map((s) => agents[s].command(publicView(st, s), s));
    for (const x of c) {
      for (const o of x.orders) if (o) stats.orders[o]++;
      if (x.focus != null) stats.focus++;
    }
    command(st, c, CARDS);
    for (const e of st.events) if (e.t === 'read') (stats.reads++, e.hit && stats.readsHit++);
    if (before.round === 3 && st.phase !== 'over') stats.behindAt3 = st.p[0].voice - st.p[1].voice;
    for (const e of st.events) {
      if (e.t === 'fall') stats.falls++;
      if (e.t === 'hit') stats.hits++;
      if (e.t === 'voice') stats.voice += e.n;
    }
    for (const s of [0, 1]) agents[s].observe?.(before, s, c[1 - s]);
    stats.rounds = before.round;
  }
  return { winner: st.winner, played: seen.map((x) => [...x]), stats, voice: [st.p[0].voice, st.p[1].voice], by: st.events.find((e) => e.t === 'end')?.by };
}

function run({ task, from, to, seed, opts = {} }) {
  const ids = LIST.map((c) => c.id);
  const out = { n: 0, cards: {}, pairs: {}, rounds: 0, falls: 0, hits: 0, voice: 0, orders: { strike: 0, guard: 0, scheme: 0 }, focus: 0, reads: 0, readsHit: 0, silence: 0, behind: 0, comeback: 0 };
  const tally = (id, win, playedIt) => {
    const t = (out.cards[id] ||= [0, 0, 0, 0]); // octave appearances, octave wins, played, played wins
    t[0]++;
    t[1] += win;
    if (playedIt) (t[2]++, (t[3] += win));
  };
  for (let i = from; i < to; i++) {
    const rand = makeRng(seed * 1000003 + i * 7919);
    let oct, agents, key;
    if (task === 'octaves') {
      const pool = opts.pool || ids;
      const sh = shuffleInPlace(pool.slice(), rand);
      oct = [sh.slice(0, 8), sh.slice(8, 16)];
      agents = [AGENTS.expert(rand), AGENTS.expert(rand)];
    } else if (task === 'factions') {
      // random 8-of-24 mono-faction Octaves
      const { a, b } = opts.pairs[i % opts.pairs.length];
      const fa = shuffleInPlace(LIST.filter((c) => c.faction === a).map((c) => c.id), rand).slice(0, 8);
      const fb = shuffleInPlace(LIST.filter((c) => c.faction === b).map((c) => c.id), rand).slice(0, 8);
      oct = [fa, fb];
      key = a + '|' + b;
      agents = [AGENTS.expert(rand), AGENTS.expert(rand)];
      if (Math.floor(i / opts.pairs.length) % 2) ((oct = [oct[1], oct[0]]), (key = b + '|' + a));
    } else if (task === 'decks') {
      const { a, b } = opts.pairs[i % opts.pairs.length];
      oct = [opts.decks[a], opts.decks[b]];
      key = a + '|' + b;
      agents = [AGENTS.expert(rand), AGENTS.expert(rand)];
      if (Math.floor(i / opts.pairs.length) % 2) ((oct = [oct[1], oct[0]]), (key = b + '|' + a));
    } else if (task === 'skill') {
      const [a, b] = opts.agents;
      const sh = shuffleInPlace(ids.slice(), rand);
      oct = [sh.slice(0, 8), sh.slice(8, 16)];
      agents = [AGENTS[a](rand, opts.aOpts || {}), AGENTS[b](rand, opts.bOpts || {})];
      if (i % 2) ((agents = [agents[1], agents[0]]), (key = 'flip'));
    }
    const r = play(agents, oct, seed + i, opts.rules || {});
    out.n++;
    out.rounds += r.stats.rounds;
    out.falls += r.stats.falls;
    out.hits += r.stats.hits;
    out.voice += r.stats.voice;
    for (const o in r.stats.orders) out.orders[o] += r.stats.orders[o];
    out.focus += r.stats.focus;
    out.reads += r.stats.reads;
    out.readsHit += r.stats.readsHit;
    if (r.by === 'silence') out.silence++;
    const b3 = r.stats.behindAt3;
    if (b3 != null && Math.abs(b3) >= 6) {
      out.behind++;
      if ((b3 < 0 && r.winner === 0) || (b3 > 0 && r.winner === 1)) out.comeback++;
    }
    if (task === 'octaves') {
      for (const s of [0, 1]) for (const id of oct[s]) tally(id, r.winner === s ? 1 : 0, r.played[s].includes(id));
    } else if (task === 'decks' || task === 'factions') {
      const [a, b] = key.split('|');
      const k = a + '|' + b;
      (out.pairs[k] ||= [0, 0])[0]++;
      out.pairs[k][1] += r.winner === 0 ? 1 : 0;
    } else {
      const firstWon = key === 'flip' ? r.winner === 1 : r.winner === 0;
      (out.pairs.skill ||= [0, 0])[0]++;
      out.pairs.skill[1] += firstWon ? 1 : 0;
    }
  }
  return out;
}

if (parentPort) parentPort.postMessage(run(workerData));
