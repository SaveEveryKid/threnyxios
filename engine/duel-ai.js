// Duel AI. The Duel is open (both hands visible, everything deterministic), so
// the AI searches it exactly one duel deep and judges the result with a value
// function: Voice (with a danger curve near 0), the strength still to come in
// hand and Reserve, Focus and READs, weighted toward the end of the match.
//   skill 1   the Expert: best move, small random tie-breaks
//   skill 0.5 a decent player: noisy, sometimes just sends its biggest number
//   skill 0   a beginner: mostly the biggest number, Focus on a whim
import { CARDS } from './cards/index.js';
import { cloneDuel, playDuel, duelStats, canRead, isFinalDuel } from './duel.js';

function worth(st, s) {
  const me = st.sides[s];
  const left = st.rules.duels - st.duel + 1; // duels still to play, this one included
  let w = 0;
  for (const id of [...me.hand, ...me.reserve]) {
    const d = duelStats(id), b = me.buff[id];
    const hpf = me.hp[id] / me.maxHp[id];
    w += ((d.strike + b.strike) * 0.55 + (d.guard + b.guard) * 0.45 + (d.scheme + b.scheme) * 0.9) * (0.5 + 0.5 * hpf);
  }
  // champions only matter while there are duels left to send them into
  return w * Math.min(1, left / 4);
}
export function evaluate(st, s) {
  if (st.over) return st.winner === s ? 1000 : st.winner == null ? 0 : -1000;
  const me = st.sides[s], them = st.sides[1 - s];
  const danger = (v) => (v <= 6 ? (6 - v) * 1.6 : 0);
  const fin = isFinalDuel(st) ? 2 : 1;
  return (me.voice - them.voice) - danger(me.voice) + danger(them.voice) + 0.45 * (worth(st, s) - worth(st, 1 - s)) + 1.1 * fin * (me.focus - them.focus) + 1.4 * (me.reads - them.reads);
}
const after = (st, choice) => playDuel(cloneDuel(st), choice);

// The Lead's best finish (Focus last, maybe a READ switch) once the Answer is down.
function bestFinish(st, lead, answer, answerFocus) {
  const L = st.lead;
  const opts = [{ leadFocus: false, switchTo: null }];
  if (st.sides[L].focus > 0) opts.push({ leadFocus: true, switchTo: null });
  if (canRead(st, answer)) for (const x of st.sides[L].hand) if (x !== lead) { opts.push({ leadFocus: false, switchTo: x }); if (st.sides[L].focus > 0) opts.push({ leadFocus: true, switchTo: x }); }
  let best = opts[0], bv = -Infinity;
  for (const o of opts) {
    // a READ or Focus is only worth spending for a clear gain
    const v = evaluate(after(st, { lead, answer, answerFocus, ...o }), L) - (o.switchTo ? 1.5 : 0) - (o.leadFocus ? 0.4 : 0);
    if (v > bv) (bv = v), (best = o);
  }
  return { finish: best, value: bv };
}
function answerCands(st) {
  const A = 1 - st.lead;
  return st.sides[A].hand.flatMap((id) => [{ answer: id, answerFocus: false }, ...(st.sides[A].focus > 0 ? [{ answer: id, answerFocus: true }] : [])]);
}
// value of an Answer, from the Answer's side, assuming the Lead finishes well
function answerValue(st, lead, a) {
  const f = bestFinish(st, lead, a.answer, a.answerFocus);
  return -f.value - (a.answerFocus ? 0.4 : 0);
}

export function makeDuelAI({ skill = 1, rand = Math.random } = {}) {
  const noise = () => (rand() - 0.5) * (0.6 + (1 - skill) * 7);
  const naive = () => rand() < (1 - skill) * 0.6; // a beginner's instinct
  const biggest = (ids, k) => [...ids].sort((a, b) => duelStats(b)[k] - duelStats(a)[k])[0];
  return {
    lead(st) {
      const L = st.lead, hand = st.sides[L].hand;
      if (naive()) return biggest(hand, 'strike');
      let best = hand[0], bv = -Infinity;
      for (const l of hand) {
        // the Answer will reply as well as it can
        let worst = Infinity;
        for (const a of answerCands(st)) worst = Math.min(worst, -answerValue(st, l, a));
        const v = worst + noise();
        if (v > bv) (bv = v), (best = l);
      }
      return best;
    },
    answer(st, lead) {
      if (naive()) { const A = 1 - st.lead; return { answer: biggest(st.sides[A].hand, 'guard'), answerFocus: st.sides[A].focus > 0 && rand() < 0.3 }; }
      let best = null, bv = -Infinity;
      for (const a of answerCands(st)) {
        const v = answerValue(st, lead, a) + noise();
        if (v > bv) (bv = v), (best = a);
      }
      return best;
    },
    finish(st, lead, answer, answerFocus) {
      if (naive()) return { leadFocus: st.sides[st.lead].focus > 0 && rand() < 0.3, switchTo: null };
      return bestFinish(st, lead, answer, answerFocus).finish;
    },
  };
}

/** Play a whole match between two AIs (for sims and Echoes). Returns the final state. */
export function playOut(st, ais) {
  for (let g = 0; g < 20 && !st.over; g++) {
    const L = st.lead;
    const lead = ais[L].lead(st);
    const a = ais[1 - L].answer(st, lead);
    const f = ais[L].finish(st, lead, a.answer, a.answerFocus);
    playDuel(st, { lead, ...a, ...f });
  }
  return st;
}
