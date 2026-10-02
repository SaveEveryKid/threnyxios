// DECK BUILDER — "Pick for me", for the Duel.
//  · score(): each card's proven Duel strength (engine/data/duel-ratings.json,
//    win rates in random Octaves from `node sim/archetypes.js --ratings`), the
//    Bonds the Octave makes (engine/archetypes.js), and a sound shape: strong
//    Strikes to Lead with, strong Guards to Answer with, Scheme to finish.
//  · buildFor(): the best Octave built around one archetype (or none).
//  · buildMany(): one build per archetype the collection can bond, best
//    first, near-duplicates dropped — several real choices, not one answer.
//  · Rules every Octave keeps: 8 Champions, one per character, at most
//    MYTHIC_MAX Mythics (engine/collection.js `octaveProblem`).
import { ARCHETYPES, ARCH, archetypesOf, bondsOf, bondMap, BOND_AT } from './archetypes.js';
import { duelStats } from './duel.js';
import RATINGS from './data/duel-ratings.js';

export const MYTHIC_MAX = 1;

const rating = (id) => RATINGS[id] ?? 50;

/** Deck score with its parts, for the advisor panel. Higher is better. */
export function score(ids, cards) {
  const power = ids.reduce((a, id) => a + (rating(id) - 50) * 0.6, 0);
  const bonds = bondMap(ids, cards);
  const bond = Object.values(bonds).reduce((a, n) => a + (n.lead + n.answer) * 1.6, 0);
  // shape: two good Leads, two good Answers, some Scheme
  const st = ids.map((id) => duelStats(id));
  const top = (k, i) => st.map((x) => x[k]).sort((a, b) => b - a)[i] || 0;
  const shape = (top('strike', 0) + top('strike', 1) + top('guard', 0) + top('guard', 1)) * 0.5 + (top('scheme', 0) + top('scheme', 2)) * 0.35;
  return { total: power + bond + shape, power, bond, shape, bonds: bondsOf(ids, cards), bonded: bonds };
}

const legal = (cards, ids, id) => !ids.some((x) => cards[x].char === cards[id].char) && !(cards[id].rarity === 'mythic' && ids.filter((x) => cards[x].rarity === 'mythic').length >= MYTHIC_MAX);

/**
 * The best Octave from `pool` (owned card ids), built around `arch` if given:
 * its archetype's Champions first, then whatever fits best. Greedy, then
 * single swaps until none helps. Returns ids, or null if the pool is too small.
 */
export function buildFor(pool, cards, arch = null, { keep = [] } = {}) {
  const ids = [...new Set(pool)].filter((id) => cards[id]);
  const inArch = (id) => !arch || archetypesOf(cards[id]).includes(arch);
  let deck = keep.filter((id) => ids.includes(id)).slice(0, 8);
  // the archetype's core: its strongest members, at least BOND_AT of them
  if (arch) {
    const core = ids.filter(inArch).sort((a, b) => rating(b) + bonusGuess(cards, b) - (rating(a) + bonusGuess(cards, a)));
    for (const id of core) if (deck.length < 6 && legal(cards, deck, id)) deck.push(id);
  }
  // fill: whatever raises the score most
  while (deck.length < 8) {
    let best = null, bv = -Infinity;
    for (const id of ids) {
      if (deck.includes(id) || !legal(cards, deck, id)) continue;
      const v = score([...deck, id], cards).total;
      if (v > bv) (bv = v), (best = id);
    }
    if (!best) return null;
    deck.push(best);
  }
  // improve: single swaps, keeping the archetype bonded
  for (let pass = 0; pass < 6; pass++) {
    let cur = score(deck, cards).total, better = null;
    for (let i = 0; i < 8; i++) {
      if (keep.includes(deck[i])) continue;
      for (const id of ids) {
        if (deck.includes(id)) continue;
        const next = deck.slice();
        next[i] = id;
        if (!legal(cards, next.filter((_, j) => j !== i), id)) continue;
        if (arch && !bondsOf(next, cards).some((b) => b.id === arch)) continue;
        const v = score(next, cards).total;
        if (v > cur + 0.01) (cur = v), (better = next);
      }
    }
    if (!better) break;
    deck = better;
  }
  return deck;
}
const bonusGuess = (cards, id) => ({ common: 0, rare: 3, epic: 4, legendary: 6, mythic: 6 })[cards[id].rarity] || 0;

const overlap = (a, b) => a.filter((x) => b.includes(x)).length;

/**
 * Several good Octaves from what you own: one per archetype the pool can bond,
 * plus the best with no plan. Best first; builds sharing 6+ Champions with a
 * better one are dropped. [{ arch, name, text, ids, score }]
 */
export function buildMany(pool, cards, { max = 4 } = {}) {
  const out = [];
  const tries = [null, ...ARCHETYPES.map((a) => a.id).filter((a) => pool.filter((id) => cards[id] && archetypesOf(cards[id]).includes(a)).length >= BOND_AT)];
  for (const arch of tries) {
    const ids = buildFor(pool, cards, arch);
    if (!ids) continue;
    const sc = score(ids, cards);
    const main = sc.bonds[0]?.id || null;
    out.push({ arch: arch || main, name: arch ? ARCH[arch].name : main ? ARCH[main].name : 'Best of everything', text: arch ? ARCH[arch].text : main ? `${ARCH[main].text} Your strongest eight.` : 'The strongest eight you own, no plan needed.', ids, score: sc.total, bonds: sc.bonds });
  }
  out.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const b of out) if (!kept.some((k) => overlap(k.ids, b.ids) >= 6 || (b.arch && k.arch === b.arch))) kept.push(b);
  return kept.slice(0, max);
}

/** The best single changes to `current`, with what each gains. */
export function swaps(current, pool, cards, k = 3) {
  const base = score(current, cards).total;
  const out = [];
  for (let i = 0; i < current.length; i++) {
    let best = null;
    for (const id of new Set(pool)) {
      if (current.includes(id) || !cards[id]) continue;
      const next = current.slice();
      next[i] = id;
      if (!legal(cards, next.filter((_, j) => j !== i), id)) continue;
      const g = score(next, cards).total - base;
      if (g > 0.5 && (!best || g > best.gain)) best = { out: current[i], in: id, gain: g };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.gain - a.gain).slice(0, k);
}

/**
 * Simulated Duels against `gauntlet` (a list of opponent decks), `n` in all,
 * good play on both sides. Async and chunked so a phone stays responsive;
 * onProgress(done, n, winsSoFar). Resolves { wins, n, rate }.
 */
export function testOctave(ids, gauntlet, { n = 60, seed = 1, onProgress, chunk = 2 } = {}) {
  return Promise.all([import('./duel.js'), import('./duel-ai.js'), import('./rng.js')]).then(([{ createDuel }, { makeDuelAI, playOut }, { makeRng }]) => new Promise((resolve) => {
    let done = 0, wins = 0;
    const one = (k) => {
      const s = (seed * 7919 + k * 104729) >>> 0;
      const rand = makeRng(s);
      const me = k % 2; // both seats
      const decks = me ? [gauntlet[k % gauntlet.length], ids] : [ids, gauntlet[k % gauntlet.length]];
      const st = playOut(createDuel(decks, { seed: s, lead: (k >> 1) % 2 }), [makeDuelAI({ skill: 0.9, rand }), makeDuelAI({ skill: 0.9, rand })]);
      return st.winner === me ? 1 : st.winner == null ? 0.5 : 0;
    };
    const step = () => {
      for (let k = 0; k < chunk && done < n; k++, done++) wins += one(done);
      onProgress?.(done, n, wins);
      if (done < n) setTimeout(step, 0);
      else resolve({ wins, n, rate: wins / n });
    };
    setTimeout(step, 0);
  }));
}
