// AIs for the Reckoning. Every agent sees only a public view (publicView):
// its own hand, both boards, the opponent's Octave and how many cards they
// hold, never which ones.
//
// Expert: each lane is a small simultaneous game. Payoffs come from laneClash
// (the engine's own resolution), scored by a value function over Voice and
// Champion worth, and solved exactly (mixed strategy, LP). Focus and READ are
// spent where they raise that value most; deploys are chosen by solving a
// reduced deploy-vs-deploy game over the resulting boards. Opponent modelling
// blends the equilibrium with observed habits.

import { ORDERS } from './orders.js';
import { solveGame } from './solver.js';
import { LANES, laneClash, powerFor, mendFor, cloneState, placements, deploysAllowed, allowedOrders, kitFor, deploy as engineDeploy, lastStandActive, ultCharged } from './battle.js';
import { kitOf } from './kit.js';

// ---------------------------------------------------------------------------
// Value function
// ---------------------------------------------------------------------------

// Tunable weights (sim/aitune.js searches these against the current default).
export const DEFAULT_W = { low: 10, lowK: 0.3, dead: 60, rlK: 0.3, rlCap: 2.6, hi: 0.5, lo: 0.1, g: 0, floor: 0.3, hold: 1.2, persist: 0.8, voiceW: 0.35, handW: 0.4, wardW: 1.2 };
let W = DEFAULT_W;
// Evaluate `fn` with a specific weight set (agents carry their own).
function withW(w, fn) {
  const prev = W;
  W = w;
  try {
    return fn();
  } finally {
    W = prev;
  }
}

export function voiceScore(v) {
  if (v <= 0) return -W.dead;
  const low = Math.max(0, W.low - v);
  return v - W.lowK * low * low;
}

function roundsLeft(state) {
  return Math.max(1, state.rules.rounds - state.round + 1);
}

// Worth of a Champion on the board, in Voice-equivalent points.
export function unitWorth(u, hp, rl) {
  if (!u || hp <= 0) return 0;
  const s = u.stats, b = u.buff;
  const S = s.strike + b.strike, G = s.guard + b.guard, C = s.scheme + b.scheme;
  const threat = W.hi * Math.max(S, C) + W.lo * Math.min(S, C) + W.g * G;
  const frac = Math.min(1, hp / u.maxHp);
  return Math.min(W.rlCap, rl * W.rlK) * threat * (W.floor + (1 - W.floor) * frac) + W.hold; // hold: keeping the lane
}

// ---------------------------------------------------------------------------
// Lane games
// ---------------------------------------------------------------------------

export function laneSide(state, cards, u, lane, order, focus, read, cancelled, oppOrder, ult = false) {
  if (!u) return null;
  const power = powerFor(state, cards, u, lane, order, { focus, read, oppOrder, ult });
  return { order, power, hp: u.hp, ward: u.ward, mend: mendFor(state.rules, power, kitFor(u, cards)?.flags?.mend), cancelled: cancelled && !ult, unstoppable: ult };
}

// Score of one lane outcome from `side`'s point of view.
function scoreOutcome(state, side, lane, r) {
  const rl = roundsLeft(state);
  const me = state.p[side], them = state.p[1 - side];
  const mu = me.lanes[lane], tu = them.lanes[lane];
  let v = 0;
  const myV = Math.min(me.maxVoice ?? state.rules.voice, me.voice + r.rally[side]) - r.voiceDmg[side];
  const thV = Math.min(them.maxVoice ?? state.rules.voice, them.voice + r.rally[1 - side]) - r.voiceDmg[1 - side];
  v += voiceScore(myV) - voiceScore(me.voice);
  v -= voiceScore(thV) - voiceScore(them.voice);
  if (mu) {
    const hp = Math.min(mu.maxHp, mu.hp - Math.max(0, r.unitDmg[side] - mu.ward) + r.mend[side]);
    v += unitWorth(mu, hp, rl) - unitWorth(mu, mu.hp, rl);
    if (r.ward[side] > mu.ward) v += W.wardW * (r.ward[side] - mu.ward);
  }
  if (tu) {
    const hp = Math.min(tu.maxHp, tu.hp - Math.max(0, r.unitDmg[1 - side] - tu.ward) + r.mend[1 - side]);
    v -= unitWorth(tu, hp, rl) - unitWorth(tu, tu.hp, rl);
    if (r.ward[1 - side] > tu.ward) v -= W.wardW * (r.ward[1 - side] - tu.ward);
  }
  return v;
}

/**
 * What one of my Orders does against each Order the enemy opposite could give,
 * with the real numbers (abilities, ground, Focus, Last Stand, Ultimate, READ).
 * The enemy's own Focus/READ stay hidden, so they are left out. For the
 * "hold an Order to preview" panel. Returns [{ their, power, theirPower, r }].
 */
export function previewOrder(state, cards, side, lane, order, { focus = false, ult = false, read = null } = {}) {
  const R = state.rules;
  const mu = state.p[side].lanes[lane], tu = state.p[1 - side].lanes[lane];
  if (!mu) return [];
  const cols = tu ? allowedOrders(state, 1 - side, lane) : [null];
  return cols.map((b) => {
    let myRead = 0, cancelled = false;
    if (read && tu) {
      if (b === read) (cancelled = true), (myRead = R.readHit);
      else if (!state.p[side].mods?.freeMiss) myRead = -R.readMiss * (lastStandActive(state) ? 2 : 1);
    }
    const sides = [];
    sides[side] = laneSide(state, cards, mu, lane, order, focus, myRead, false, b, ult);
    sides[1 - side] = laneSide(state, cards, tu, lane, b, false, 0, cancelled, order);
    return { their: b, power: sides[side].power, theirPower: sides[1 - side]?.power ?? 0, r: laneClash(R, sides), hp: [mu.hp + mu.ward, tu ? tu.hp + tu.ward : 0] };
  });
}

/**
 * Payoff matrix for `side` in `lane`: rows = my orders, cols = their orders.
 * opts: { focus: bool (mine), oppFocus: bool, readHit: order|null (my READ on
 * their order: if they play it, it's cancelled and I get +readHit), readMiss }
 */
export function laneMatrix(state, cards, side, lane, opts = {}) {
  const R = state.rules;
  const mu = state.p[side].lanes[lane], tu = state.p[1 - side].lanes[lane];
  const rows = mu ? allowedOrders(state, side, lane) : [null];
  const cols = tu ? allowedOrders(state, 1 - side, lane) : [null];
  const M = rows.map((a) =>
    cols.map((b) => {
      let myRead = 0, theirCancelled = false;
      if (opts.read && tu) {
        if (b === opts.read) {
          theirCancelled = true;
          myRead = R.readHit;
        } else if (!state.p[side].mods?.freeMiss) myRead = -R.readMiss * (lastStandActive(state) ? 2 : 1);
      }
      const sides = [];
      sides[side] = laneSide(state, cards, mu, lane, a, !!opts.focus, myRead, false, b, !!opts.ult);
      sides[1 - side] = laneSide(state, cards, tu, lane, b, !!opts.oppFocus, 0, theirCancelled, a);
      return scoreOutcome(state, side, lane, laneClash(R, sides));
    }),
  );
  return { rows, cols, M };
}

export function solveLane(state, cards, side, lane, opts) {
  const g = laneMatrix(state, cards, side, lane, opts);
  const sol = solveGame(g.M);
  return { ...g, ...sol };
}

// Value of a whole board for `side`: sum of lane game values (no Focus/READ).
export function boardValue(state, cards, side) {
  let v = 0;
  const rl = roundsLeft(state);
  for (let l = 0; l < LANES; l++) {
    const mu = state.p[side].lanes[l], tu = state.p[1 - side].lanes[l];
    if (!mu && !tu) continue;
    v += solveLane(state, cards, side, l).value;
    // what stays on the board after this round keeps threatening later rounds
    v += unitWorth(mu, mu?.hp ?? 0, rl) * W.persist - unitWorth(tu, tu?.hp ?? 0, rl) * W.persist;
  }
  return v + W.voiceW * (voiceScore(state.p[side].voice) - voiceScore(state.p[1 - side].voice));
}

// ---------------------------------------------------------------------------
// Opponent profile: how often they pick their highest / middle / lowest Order,
// and how often they STRIKE / GUARD / SCHEME.
// ---------------------------------------------------------------------------

export function newProfile() {
  return { rank: [1, 1, 1], order: { strike: 1, guard: 1, scheme: 1 }, n: 0 };
}

function rankOf(u, order) {
  const vals = ORDERS.map((o) => u.stats[o] + u.buff[o]);
  const v = u.stats[order] + u.buff[order];
  const higher = vals.filter((x) => x > v).length;
  return Math.min(2, higher);
}

export function observeRound(profile, before, side, cmd) {
  // before: state before command resolution; cmd: the opponent's command
  const P = before.p[side];
  for (let l = 0; l < LANES; l++) {
    const u = P.lanes[l];
    const o = cmd.orders[l];
    if (!u || !o) continue;
    profile.rank[rankOf(u, o)] += 1;
    profile.order[o] += 1;
    profile.n++;
  }
}

function predictFromProfile(profile, u) {
  const rt = profile.rank[0] + profile.rank[1] + profile.rank[2];
  const p = {};
  let tot = 0;
  for (const o of ORDERS) {
    p[o] = (profile.rank[rankOf(u, o)] / rt) * (profile.order[o] / (profile.n + 3)) + 1e-3;
    tot += p[o];
  }
  for (const o of ORDERS) p[o] /= tot;
  return p;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

function sample(probs, rand) {
  let r = rand();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r <= 0) return i;
  }
  return probs.length - 1;
}

export function makeExpert({ cards, rand, name = 'Expert', exploit = 0.35, focusBar = 1.2, readBar = 1.6, ultBar = 2, deployWidth = 7, weights = null } = {}) {
  const profile = newProfile();
  const w0 = weights ? { ...DEFAULT_W, ...weights } : DEFAULT_W;
  const agent = {
    name,
    profile,
    // opts: { first: true } when placing first face-up, { known: list } when answering
    deploy(view, side, opts = {}) {
      return withW(w0, () => chooseDeploy(view, cards, side, rand, deployWidth, opts));
    },
    command(view, side) {
      return withW(w0, () => commandImpl(view, side));
    },
    observe(before, side, oppCmd) {
      observeRound(profile, before, 1 - side, oppCmd);
    },
  };
  function commandImpl(view, side) {
      const state = view;
      const me = state.p[side];
      const orders = new Array(LANES).fill(null);
      const sols = [];
      const w = exploit * Math.min(1, profile.n / 8);
      const pick = (s, l) => {
        const tu = state.p[1 - side].lanes[l];
        if (!tu || w <= 0 || s.cols.length < 2) return s.rows[sample(s.row, rand)];
        // lean toward the best response to what they are likely to do
        const pred = predictFromProfile(profile, tu);
        const q = s.cols.map((o, j) => (1 - w) * s.col[j] + w * pred[o]);
        let bi = 0, bv = -Infinity;
        s.M.forEach((r, i) => {
          const e = r.reduce((a, x, j) => a + x * q[j], 0);
          if (e > bv) ((bv = e), (bi = i));
        });
        const mix = s.row.map((x, i) => (1 - w) * x + (i === bi ? w : 0));
        return s.rows[sample(mix, rand)];
      };
      for (let l = 0; l < LANES; l++) {
        if (!me.lanes[l]) continue;
        const s = solveLane(state, cards, side, l);
        sols[l] = s;
        orders[l] = pick(s, l);
      }
      // Focus: lane where +Power raises the lane value most
      let focus = null;
      if (me.focus > 0 && !me.noFocusRound) {
        const rl = roundsLeft(state);
        const bar = focusBar * Math.max(0.35, Math.min(1.6, rl / (me.focus * 2.2)));
        let best = bar;
        for (let l = 0; l < LANES; l++) {
          if (!sols[l] || me.lanes[l].tags.noFocus) continue;
          const f = solveLane(state, cards, side, l, { focus: true });
          const gain = f.value - sols[l].value;
          if (gain > best) {
            best = gain;
            focus = l;
          }
        }
        if (focus != null) {
          orders[focus] = pick(solveLane(state, cards, side, focus, { focus: true }), focus);
        }
      }
      // Ultimate: the charged Champion whose lane gains most from +Power and
      // an Order that can't be beaten; saved unless it clears a bar that
      // falls as the match runs out.
      let ult = null;
      if (me.ults > 0) {
        const rl = roundsLeft(state);
        let best = ultBar * Math.max(0.25, Math.min(1.5, rl / 3));
        for (let l = 0; l < LANES; l++) {
          if (!sols[l] || !ultCharged(state, me.lanes[l])) continue;
          const base = focus === l ? solveLane(state, cards, side, l, { focus: true }) : sols[l];
          const u = solveLane(state, cards, side, l, { focus: focus === l, ult: true });
          const gain = u.value - base.value;
          if (gain > best) ((best = gain), (ult = l));
        }
        if (ult != null) orders[ult] = pick(solveLane(state, cards, side, ult, { focus: focus === ult, ult: true }), ult);
      }
      // READ: predict an enemy Champion's Order; spend it where it pays.
      let read = null;
      if (me.reads > 0 && !me.noReadRound) {
        const them = state.p[1 - side];
        let best = readBar * (roundsLeft(state) <= 2 ? 0.5 : 1);
        for (let l = 0; l < LANES; l++) {
          const tu = them.lanes[l];
          if (!tu || !me.lanes[l] || kitFor(tu, cards)?.flags?.readImmune) continue;
          // their likely mix: equilibrium from their side, blended with habits
          const theirs = solveLane(state, cards, 1 - side, l);
          const pred = predictFromProfile(profile, tu);
          const q = {};
          theirs.rows.forEach((o, i) => (q[o] = (1 - w) * theirs.row[i] + w * pred[o]));
          for (const o of theirs.rows) {
            const withRead = laneMatrix(state, cards, side, l, { read: o, focus: focus === l });
            const without = laneMatrix(state, cards, side, l, { focus: focus === l });
            const ai = orders[l] ? withRead.rows.indexOf(orders[l]) : 0;
            let ev = 0;
            withRead.cols.forEach((b, j) => (ev += (q[b] ?? 0) * (withRead.M[ai][j] - without.M[ai][j])));
            if (ev > best) {
              best = ev;
              read = { lane: l, order: o };
            }
          }
        }
      }
      return { orders, focus, read, ult };
  }
  return agent;
}

// Deploy: build my candidate deploy lists and theirs, score each pairing by
// the resulting board, solve the small game, sample.
function deployLists(state, side, cards, max, known) {
  const n = deploysAllowed(state, side);
  const P = state.p[side];
  const pool = known ? P.hand.slice() : (P.unplayed || []).slice();
  const empty = [];
  for (let l = 0; l < LANES; l++) if (!P.lanes[l]) empty.push(l);
  const singles = [];
  const seen = new Set();
  for (const card of pool) {
    if (seen.has(card)) continue;
    seen.add(card);
    for (const lane of empty) singles.push([{ card, lane }]);
  }
  let lists = [[], ...singles];
  if (n >= 2) {
    const pairs = [];
    for (let i = 0; i < singles.length; i++)
      for (let j = i + 1; j < singles.length; j++) {
        const a = singles[i][0], b = singles[j][0];
        if (a.card !== b.card && a.lane !== b.lane) pairs.push([a, b]);
      }
    lists = lists.concat(pairs);
  }
  return lists;
}

function applyDeploy(state, side, list, cards) {
  for (const d of list) {
    const c = cards[d.card];
    state.p[side].lanes[d.lane] = { uid: -1, id: d.card, side, hp: c.hp, maxHp: c.hp, stats: { ...c.stats }, buff: { strike: 0, guard: 0, scheme: 0 }, temp: { strike: 0, guard: 0, scheme: 0 }, ward: 0, tags: {} };
  }
}

// Board after both deploys, On-Reveal effects included (runs the real engine
// on a copy; the opponent's cards are hypothetical).
function afterDeploy(view, cards, side, mine, theirs) {
  const s = cloneState(view);
  const lists = [];
  lists[side] = mine;
  lists[1 - side] = theirs;
  try {
    engineDeploy(s, lists, cards, { hypothetical: true });
  } catch {
    applyDeploy(s, side, mine, cards);
    applyDeploy(s, 1 - side, theirs, cards);
  }
  return s;
}

function prune(view, cards, side, lists, width, rand) {
  // score each list against "they deploy nothing", keep the best `width`
  const scored = lists.map((list) => {
    const s = afterDeploy(view, cards, side, list, []);
    return { list, v: boardValue(s, cards, side) + (rand() - 0.5) * 0.3 };
  });
  scored.sort((a, b) => b.v - a.v);
  const keep = scored.slice(0, width).map((x) => x.list);
  if (!keep.some((l) => l.length === 0)) keep.push([]);
  return keep;
}

export function chooseDeploy(view, cards, side, rand, width = 7, { first = false, known = null } = {}) {
  const mine = deployLists(view, side, cards, width, true);
  if (mine.length === 1) return [];
  const theirs = known ? [known] : deployLists(view, 1 - side, cards, width, false);
  const A = prune(view, cards, side, mine, width, rand);
  const B = known ? [known] : theirs.length > 1 ? prune(view, cards, 1 - side, theirs, width, rand) : [[]];
  const M = A.map((a) =>
    B.map((b) => {
      const s = afterDeploy(view, cards, side, a, b);
      if (s.phase === 'over') return s.winner === side ? 100 : -100;
      // cards left in hand keep options open
      return boardValue(s, cards, side) + W.handW * (view.p[side].hand.length - a.length);
    }),
  );
  // Answering a face-up deploy: best response. Placing first, face-up: assume
  // they answer as well as they can (max-min). Otherwise, the mixed game.
  if (known || first) {
    const worst = M.map((r) => Math.min(...r));
    let bi = 0;
    worst.forEach((v, i) => v + (rand() - 0.5) * 0.2 > worst[bi] && (bi = i));
    return A[bi];
  }
  const sol = solveGame(M);
  return A[sample(sol.row, rand)];
}

// ---------------------------------------------------------------------------
// Simple agents
// ---------------------------------------------------------------------------

function highestOrder(u) {
  let best = ORDERS[0];
  for (const o of ORDERS) if (u.stats[o] + u.buff[o] > u.stats[best] + u.buff[best]) best = o;
  return best;
}

export function makeNovice({ cards, rand, name = 'Novice', bias = 0.6, focusRate = 0.3, readRate = 0.12 } = {}) {
  return {
    name,
    deploy(view, side) {
      const out = [];
      const P = view.p[side];
      const hand = P.hand.slice();
      const lanes = [0, 1, 2].filter((l) => !P.lanes[l]);
      for (let k = 0; k < deploysAllowed(view, side) && hand.length && lanes.length; k++) {
        const ci = Math.floor(rand() * hand.length);
        // likes to meet an enemy head-on half the time
        const facing = lanes.filter((l) => view.p[1 - side].lanes[l]);
        const pool = facing.length && rand() < 0.5 ? facing : lanes;
        const lane = pool[Math.floor(rand() * pool.length)];
        out.push({ card: hand.splice(ci, 1)[0], lane });
        lanes.splice(lanes.indexOf(lane), 1);
      }
      return out;
    },
    command(view, side) {
      const P = view.p[side];
      const orders = P.lanes.map((u, l) => {
        if (!u) return null;
        const ok = allowedOrders(view, side, l);
        const h = highestOrder(u);
        return rand() < bias && ok.includes(h) ? h : ok[Math.floor(rand() * ok.length)];
      });
      const mine = [0, 1, 2].filter((l) => P.lanes[l]);
      const focus = P.focus > 0 && !P.noFocusRound && mine.length && rand() < focusRate ? mine[Math.floor(rand() * mine.length)] : null;
      let read = null;
      const theirs = [0, 1, 2].filter((l) => view.p[1 - side].lanes[l] && P.lanes[l]);
      if (P.reads > 0 && !P.noReadRound && theirs.length && view.round >= 2 && rand() < readRate) {
        const l = theirs[Math.floor(rand() * theirs.length)];
        read = { lane: l, order: highestOrder(view.p[1 - side].lanes[l]) };
      }
      return { orders, focus, read };
    },
  };
}

export function makeGreedy({ cards, name = 'Greedy' } = {}) {
  return {
    name,
    deploy(view, side) {
      const P = view.p[side];
      const hand = P.hand.slice().sort((a, b) => total(cards[b]) - total(cards[a]));
      const lanes = [0, 1, 2].filter((l) => !P.lanes[l]);
      const out = [];
      for (let k = 0; k < deploysAllowed(view, side) && hand.length && lanes.length; k++) {
        const facing = lanes.filter((l) => view.p[1 - side].lanes[l]);
        const lane = (facing.length ? facing : lanes)[0];
        out.push({ card: hand.shift(), lane });
        lanes.splice(lanes.indexOf(lane), 1);
      }
      return out;
    },
    command(view, side) {
      const P = view.p[side];
      const orders = P.lanes.map((u, l) => (u ? (allowedOrders(view, side, l).includes(highestOrder(u)) ? highestOrder(u) : allowedOrders(view, side, l)[0]) : null));
      const mine = [0, 1, 2].filter((l) => P.lanes[l]);
      return { orders, focus: P.focus > 0 && !P.noFocusRound && mine.length ? mine[0] : null, read: null };
    },
  };
}

function total(c) {
  return c.stats.strike + c.stats.guard + c.stats.scheme + c.hp;
}

export function makeRandom({ rand, name = 'Random' } = {}) {
  return {
    name,
    deploy(view, side) {
      const opts = placements(view, side);
      if (!opts.length || rand() < 0.15) return [];
      return [opts[Math.floor(rand() * opts.length)]];
    },
    command(view, side) {
      const P = view.p[side];
      return { orders: P.lanes.map((u, l) => (u ? allowedOrders(view, side, l)[Math.floor(rand() * allowedOrders(view, side, l).length)] : null)), focus: null, read: null };
    },
  };
}
