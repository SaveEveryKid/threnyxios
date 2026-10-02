// Opponent AI in a Web Worker so the battle UI never stutters while the AI
// solves its lane games. Personas add human habits the player can learn:
//   skill  0..1   share of decisions made by the Expert (the rest: Novice)
//   bias   { order: 'strike'|'guard'|'scheme'|'highest', p }  a fallback habit
//   exploit       how hard the Expert leans on what it has learned about you
import { CARDS } from '../../../engine/cards/index.js';
import '../../../engine/kitdsl.js';
import { makeExpert, makeNovice } from '../../../engine/battle-ai.js';
import { allowedOrders } from '../../../engine/battle.js';
import { makeRng } from '../../../engine/rng.js';

const matches = new Map();

function agentFor(matchId, persona, seed) {
  let m = matches.get(matchId);
  if (!m) {
    const rand = makeRng(seed ^ 0x5bd1e995);
    m = {
      rand,
      persona,
      expert: makeExpert({ cards: CARDS, rand, exploit: persona?.exploit ?? 0.5 }),
      novice: makeNovice({ cards: CARDS, rand }),
    };
    matches.set(matchId, m);
  }
  return m;
}

function applyBias(m, view, side, cmd) {
  const b = m.persona?.bias;
  if (!b) return cmd;
  const P = view.p[side];
  const orders = cmd.orders.map((o, l) => {
    const u = P.lanes[l];
    if (!u || m.rand() >= b.p) return o;
    const want = b.order === 'highest' ? ['strike', 'guard', 'scheme'].sort((x, y) => u.stats[y] + u.buff[y] - (u.stats[x] + u.buff[x]))[0] : b.order;
    return allowedOrders(view, side, l).includes(want) ? want : o;
  });
  return { ...cmd, orders };
}

// A persona's learnable habit, applied over the AI's choice (see store.js).
const highest = (u) => ['strike', 'guard', 'scheme'].sort((x, y) => u.stats[y] + u.buff[y] - (u.stats[x] + u.buff[x]))[0];
function applyHabit(m, view, side, cmd) {
  const h = m.persona?.habit;
  if (!h) return cmd;
  const P = view.p[side], T = view.p[1 - side];
  const orders = cmd.orders.map((o, l) => {
    const u = P.lanes[l];
    if (!u || !o) return o;
    const ok = allowedOrders(view, side, l);
    let want = null;
    if (h.when === 'hurt' && u.hp <= u.maxHp / 2) want = h.order;
    else if (h.when === 'behind' && P.voice < T.voice) want = h.order;
    else if (h.when === 'ahead' && P.voice > T.voice) want = h.order;
    else if (h.when === 'always') want = h.order === 'highest' ? highest(u) : h.order;
    else if (h.when === 'mirror') want = m.theirLast?.[l] || null;
    else if (h.when === 'never2' && m.myLast?.[l] === o) {
      const alt = ok.filter((x) => x !== o);
      want = alt[Math.floor(m.rand() * alt.length)];
    }
    return want && ok.includes(want) && m.rand() < h.p ? want : o;
  });
  return { ...cmd, orders };
}

self.onmessage = (e) => {
  const { id, kind, matchId, persona, seed, view, side, before, oppCmd } = e.data;
  const m = agentFor(matchId, persona, seed);
  const expert = () => m.rand() < (persona?.skill ?? 0.9);
  let choice = null;
  try {
    if (kind === 'deploy') choice = (expert() ? m.expert : m.novice).deploy(view, side, e.data.opts || {});
    else if (kind === 'command') {
      choice = applyHabit(m, view, side, applyBias(m, view, side, (expert() ? m.expert : m.novice).command(view, side)));
      m.myLast = choice.orders.slice();
    } else if (kind === 'observe') {
      m.expert.observe(before, side, oppCmd);
      m.theirLast = oppCmd.orders.slice();
    }
    else if (kind === 'end') matches.delete(matchId);
  } catch (err) {
    console.error('ai error', err);
    choice = kind === 'deploy' ? [] : kind === 'command' ? { orders: view.p[side].lanes.map((u) => (u ? 'guard' : null)), focus: null, read: null } : null;
  }
  self.postMessage({ id, choice });
};
