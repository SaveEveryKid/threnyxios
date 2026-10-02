// THE DAILIES, for the Duel.
//
// DAILY DUEL — the same match for everyone today: the same two Octaves (each
// built around a style by engine/deckbuild.js), the same shuffle, the same
// opponent. Played once a day for the streak (economy action `dailyRead`).
//
// DAILY PUZZLE — "Final duel. Win it." A real final-duel position from a
// self-played match, kept only if the solver proves it can be won against
// the opponent's best replies, and the obvious move (your biggest number)
// does not win. The opponent always plays its best reply (puzzleScript).
import { CARDS, LIST } from './cards/index.js';
import { createDuel, cloneDuel, playDuel, canRead, duelStats, isFinalDuel } from './duel.js';
import { makeDuelAI } from './duel-ai.js';
import { buildFor } from './deckbuild.js';
import { ARCHETYPES } from './archetypes.js';
import { makeRng } from './rng.js';
import PUZZLE_DAYS from './data/puzzle-days.js';

const pickOf = (rand, arr) => arr[Math.floor(rand() * arr.length)];

/** Today's two Octaves and seed: { day, seed, mine, theirs, styles: [a, b] }. */
export function dailyDuel(day) {
  const rand = makeRng((day * 2654435761) >>> 0 || 1);
  const all = LIST.map((c) => c.id);
  const a = pickOf(rand, ARCHETYPES).id;
  let b = pickOf(rand, ARCHETYPES).id;
  if (b === a) b = ARCHETYPES[(ARCHETYPES.findIndex((x) => x.id === a) + 5) % ARCHETYPES.length].id;
  // two different halves of the set, so the Octaves never share a Champion
  const shuffled = all.slice().sort(() => rand() - 0.5);
  const half = [shuffled.filter((_, i) => i % 2 === 0), shuffled.filter((_, i) => i % 2 === 1)];
  const mine = buildFor(half[0], CARDS, a) || buildFor(half[0], CARDS);
  const theirs = buildFor(half[1], CARDS, b) || buildFor(half[1], CARDS);
  return { day, seed: (day * 7919 + 13) >>> 0, mine, theirs, styles: [a, b] };
}

// ---- the puzzle solver: exact, the opponent plays its best reply -----------------
const after = (st, choice) => playDuel(cloneDuel(st), choice);
const won = (st) => st.over && st.winner === 0;
function finishes(st, lead, answer) {
  const L = st.lead, me = st.sides[L];
  const out = [{ leadFocus: false, switchTo: null }];
  if (me.focus > 0) out.push({ leadFocus: true, switchTo: null });
  if (canRead(st, answer)) for (const x of me.hand) if (x !== lead) { out.push({ leadFocus: false, switchTo: x }); if (me.focus > 0) out.push({ leadFocus: true, switchTo: x }); }
  return out;
}
const answers = (st) => st.sides[1 - st.lead].hand.flatMap((id) => [{ answer: id, answerFocus: false }, ...(st.sides[1 - st.lead].focus > 0 ? [{ answer: id, answerFocus: true }] : [])]);

/** You Lead: does sending `lead` win against every Answer (you finishing best)? */
function leadWins(st, lead) {
  return answers(st).every((a) => finishes(st, lead, a.answer).some((f) => won(after(st, { lead, ...a, ...f }))));
}
/** They Lead `lead`: does Answer `a` win against every finish of theirs? */
function answerWins(st, lead, a) {
  return finishes(st, lead, a.answer).every((f) => won(after(st, { lead, ...a, ...f })));
}

/** The opponent's best replies (a script for the Duel screen). */
export function puzzleScript() {
  return {
    // their Lead: one you can't beat, if there is one; else the one with fewest answers
    lead(st) {
      const hand = st.sides[st.lead].hand;
      let best = hand[0], fewest = Infinity;
      for (const l of hand) {
        const n = answers(st).filter((a) => answerWins(st, l, a)).length;
        if (n < fewest) (fewest = n), (best = l);
      }
      return best;
    },
    // their Answer: one your Lead can't beat with any finish, if there is one
    answer(st, lead) {
      const all = answers(st);
      return all.find((a) => !finishes(st, lead, a.answer).some((f) => won(after(st, { lead, ...a, ...f })))) || all[0];
    },
    // their finish: one that stops your win, if there is one
    finish(st, lead, answer, answerFocus) {
      const fs = finishes(st, lead, answer);
      return fs.find((f) => !won(after(st, { lead, answer, answerFocus, ...f }))) || fs[0];
    },
  };
}

/**
 * Today's puzzle: { day, state (you are side 0, the final duel), youLead, solutions, obvious }.
 * Tries seeds until one is fair and not obvious. null if none was found.
 */
export function buildDuelPuzzle(day, { attempts = 120 } = {}) {
  // the attempt that works was found ahead of time (sim/puzzles.js): build only that one
  const known = PUZZLE_DAYS[day];
  if (known != null) return puzzleAttempt(day, known) || null;
  for (let k = 0; k < attempts; k++) {
    const pz = puzzleAttempt(day, k);
    if (pz) return { ...pz, k };
  }
  return null;
}

/** One try at day's puzzle (seed index k): the puzzle, or null if this one isn't fair or is obvious. */
export function puzzleAttempt(day, k) {
  const base = (day * 40503) >>> 0 || 1;
  {
    const seed = (base + k * 7919) >>> 0;
    const rand = makeRng(seed);
    const pool = LIST.map((c) => c.id).sort(() => rand() - 0.5);
    const decks = [pool.slice(0, 60), pool.slice(60)].map((p, i) => buildFor(p, CARDS, pickOf(rand, ARCHETYPES).id) || buildFor(p, CARDS));
    if (!decks[0] || !decks[1]) return null;
    const st = createDuel(decks, { seed });
    const ais = [makeDuelAI({ skill: 0.7, rand }), makeDuelAI({ skill: 0.7, rand })];
    while (!st.over && !isFinalDuel(st)) {
      const L = st.lead, lead = ais[L].lead(st);
      const a = ais[1 - L].answer(st, lead);
      playDuel(st, { lead, ...a, ...ais[L].finish(st, lead, a.answer, a.answerFocus) });
    }
    if (st.over || !isFinalDuel(st)) return null;
    // close enough to be a puzzle: you're behind or level
    const gap = st.sides[1].voice - st.sides[0].voice;
    if (gap < 0 || gap > 12) return null;
    const big = (ids, k) => [...ids].sort((x, y) => duelStats(y)[k] - duelStats(x)[k])[0];
    if (st.lead === 0) {
      const good = st.sides[0].hand.filter((l) => leadWins(st, l));
      const obvious = big(st.sides[0].hand, 'strike');
      if (good.length !== 1 || good.includes(obvious)) return null;
      return { day, state: cloneDuel(st), youLead: true, solutions: good, obvious };
    }
    const lead = puzzleScript().lead(st);
    const good = answers(st).filter((a) => answerWins(st, lead, a));
    const obvious = big(st.sides[0].hand, 'guard');
    if (!good.length || good.length > 2 || good.some((a) => a.answer === obvious && !a.answerFocus)) return null;
    return { day, state: cloneDuel(st), youLead: false, theirLead: lead, solutions: good, obvious };
  }
}
