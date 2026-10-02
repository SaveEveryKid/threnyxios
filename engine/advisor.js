// OCTAVE ADVISOR — helps a player build the strongest eight from what they own.
//  · score(): each card's proven strength (simulation ratings), the synergies
//    its ability actually asks for (traits, factions, allies it counts), and
//    whether the deck has a strong answer with every Order.
//  · buildBest(): greedy build, then swap until no single swap scores better.
//  · swaps(): the best single changes to the current deck, with their gain.
//  · testOctave(): plays real Expert-vs-Expert matches against a gauntlet and
//    reports the win rate, in small async chunks so a phone stays responsive.
import { createBattle, deploy, command, publicView, cloneState, agentDeploys } from './battle.js';
import { makeExpert } from './battle-ai.js';
import { makeRng } from './rng.js';
import { ORDERS } from './orders.js';

const hasTrait = (c, t) => (c.traits || []).includes(t);

// What a card's ability counts on: [{ kind: 'trait'|'faction', key }]
const needCache = new Map();
export function needsOf(card) {
  let n = needCache.get(card.id);
  if (!n) {
    const txt = JSON.stringify(card.kit || {});
    n = [];
    for (const m of txt.matchAll(/(?:fallenTrait|alliesTrait|octaveTrait|trait):(\w+)/g)) n.push({ kind: 'trait', key: m[1] });
    for (const m of txt.matchAll(/fallenFaction:(\w+)/g)) n.push({ kind: 'faction', key: m[1] });
    if (/"(?:allies|to)":"allies"|per":"allies/.test(txt)) n.push({ kind: 'allies' });
    n = n.filter((x, i) => n.findIndex((y) => y.kind === x.kind && y.key === x.key) === i);
    needCache.set(card.id, n);
  }
  return n;
}

/** Deck score with its parts, for the advisor panel. */
export function score(ids, cards, rating) {
  const deck = ids.map((id) => cards[id]);
  let power = 0, synergy = 0;
  const links = [];
  for (const c of deck) {
    power += ((rating[c.id] ?? 0.5) - 0.5) * 100; // ±4 or so per card
    for (const need of needsOf(c)) {
      const mates = deck.filter((o) => o !== c && (need.kind === 'allies' || (need.kind === 'trait' ? hasTrait(o, need.key) : o.faction === need.key)));
      const k = Math.min(3, mates.length);
      synergy += k * 1.2;
      if (k && need.kind !== 'allies') links.push({ card: c.id, need: need.key, mates: mates.length });
    }
  }
  // a strong answer with every Order: best two stats per Order
  const cover = {};
  let balance = 0;
  for (const o of ORDERS) {
    const top = deck.map((c) => c.stats[o]).sort((a, b) => b - a);
    cover[o] = top[0] || 0;
    balance += (Math.min(9, top[0] || 0) + Math.min(8, top[1] || 0)) * 0.25;
  }
  const hp = deck.reduce((a, c) => a + c.hp, 0) / Math.max(1, deck.length);
  const total = power + synergy + balance + hp * 0.3;
  return { total, power, synergy, balance, cover, hp, links };
}

const uniqueChar = (cards, ids, id) => !ids.some((x) => x !== id && cards[x].char === cards[id].char);

/** The best eight from `pool` (ids you own). `keep`: ids that must stay. */
export function buildBest(pool, cards, rating, { keep = [] } = {}) {
  const S = (ids) => score(ids, cards, rating).total;
  let deck = keep.filter((id) => pool.includes(id)).slice(0, 8);
  while (deck.length < 8) {
    let best = null, bv = -Infinity;
    for (const id of pool) {
      if (deck.includes(id) || !uniqueChar(cards, deck, id)) continue;
      const v = S([...deck, id]);
      if (v > bv) (bv = v), (best = id);
    }
    if (!best) break;
    deck.push(best);
  }
  // swap until no single swap helps
  for (let pass = 0; pass < 12; pass++) {
    let improved = false;
    const cur = S(deck);
    let bestSwap = null, gain = 0.01;
    for (let i = 0; i < deck.length; i++) {
      if (keep.includes(deck[i])) continue;
      for (const id of pool) {
        if (deck.includes(id)) continue;
        const next = deck.slice();
        next[i] = id;
        if (!uniqueChar(cards, next, id)) continue;
        const g = S(next) - cur;
        if (g > gain) (gain = g), (bestSwap = next);
      }
    }
    if (bestSwap) (deck = bestSwap), (improved = true);
    if (!improved) break;
  }
  return deck;
}

/** The best single swaps for the current deck: [{ out, in, gain }]. */
export function swaps(current, pool, cards, rating, k = 3) {
  const base = score(current, cards, rating).total;
  const out = [];
  for (let i = 0; i < current.length; i++) {
    let best = null;
    for (const id of pool) {
      if (current.includes(id)) continue;
      const next = current.slice();
      next[i] = id;
      if (!uniqueChar(cards, next, id)) continue;
      const g = score(next, cards, rating).total - base;
      if (g > 0.5 && (!best || g > best.gain)) best = { out: current[i], in: id, gain: g };
    }
    if (best) out.push(best);
  }
  // one suggestion per incoming card, biggest first
  return out.sort((a, b) => b.gain - a.gain).filter((s, i, a) => a.findIndex((x) => x.in === s.in) === i).slice(0, k);
}

// One Expert-vs-Expert match with the real rules. Returns 1 win, 0 loss, 0.5 draw.
function match(mine, theirs, cards, seed) {
  const st = createBattle([mine, theirs], cards, { seed });
  const agents = [makeExpert({ cards, rand: makeRng(seed ^ 0x51) }), makeExpert({ cards, rand: makeRng(seed ^ 0xa7) })];
  for (let g = 0; g < 40 && st.phase !== 'over'; g++) {
    deploy(st, agentDeploys(st, agents), cards);
    if (st.phase === 'over') break;
    const before = cloneState(st);
    const c = [0, 1].map((s) => agents[s].command(publicView(st, s), s));
    command(st, c, cards);
    for (const s of [0, 1]) agents[s].observe?.(before, s, c[1 - s]);
  }
  return st.winner === 0 ? 1 : st.winner === 1 ? 0 : 0.5;
}

/**
 * Simulated matches against `gauntlet` (a list of opponent decks), `n` in all.
 * Async and chunked; onProgress(done, n, winsSoFar). Resolves { wins, n, rate }.
 */
export function testOctave(ids, gauntlet, cards, { n = 60, seed = 1, onProgress, chunk = 2 } = {}) {
  return new Promise((resolve) => {
    let done = 0, wins = 0;
    const step = () => {
      for (let k = 0; k < chunk && done < n; k++, done++) wins += match(ids, gauntlet[done % gauntlet.length], cards, (seed * 7919 + done * 104729) >>> 0);
      onProgress?.(done, n, wins);
      if (done < n) setTimeout(step, 0);
      else resolve({ wins, n, rate: wins / n });
    };
    setTimeout(step, 0);
  });
}
