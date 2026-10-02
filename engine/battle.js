// THRENYX combat: the Reckoning.
//
// Two players, three lanes each, facing each other. Each round:
//   1. DEPLOY  (simultaneous, hidden) play a Champion from hand into an empty lane
//   2. COMMAND (simultaneous, hidden) give every Champion you have in play an
//              Order; optionally Focus one of them; optionally spend your READ
//   3. RESOLVE lane by lane. The Order that wins the triangle happens, the one it
//              beats is cancelled, and mirrors both happen:
//                STRIKE  hits the Champion opposite (overkill spills into Voice)
//                SCHEME  hits the enemy's Voice directly
//                GUARD   ripostes a STRIKE; otherwise mends the Champion
//              A Champion with nobody opposite hits the Voice with STRIKE or SCHEME.
//   4. AFTERMATH  Champions at 0 health Fall. Round-end effects.
// A player whose Voice reaches 0 loses. After the last round, the higher Voice wins.
//
// Also (all rules below are switchable in DEFAULT_RULES / createBattle rules):
//   TERRAIN      each lane rolls a ground that favours one Order (or dampens all)
//   LAST STAND   the final round, or any Voice at/below lastStandAt: every
//                Champion gets +lastStandPower and a MISREAD costs double
//   ULTIMATE     a Champion that has survived `ultCharge` rounds is charged; once
//                a match a side may unleash one: +ultPower and its Order cannot
//                be beaten or cancelled that round
//   COUNTER-DEPLOY  (a turn-order rule the client and AIs follow) the side
//                without Initiative places first, face-up; Initiative answers
//   SIDE MODS    per-side modifiers (Long Road relics and upgrades)
//
// State is plain JSON (replays and saves are exact); randomness comes from the
// seeded RNG stored in the state. Every visible thing that happens is pushed to
// `events` so the client can animate the round beat by beat.

import { ORDERS, BEATS } from './orders.js';
import { nextRandom, shuffleInPlace } from './rng.js';
import { kitOf } from './kit.js';

export const LANES = 3;
export const DEFAULT_RULES = {
  voice: 30, // starting Voice (life)
  rounds: 7, // after this round, the higher Voice wins
  hand: 3, // opening hand
  handMax: 5,
  deploysFirst: 2, // deploys allowed in round 1
  deploysPer: 1, // deploys allowed in later rounds
  focus: 3, // Focus per match (never more than this)
  focusPower: 2,
  focusPerRound: 1,
  reads: 1,
  readHit: 3, // bonus to your Champion opposite a correct READ
  readMiss: 2, // penalty to your Champion opposite a MISREAD
  guardMode: 'ward', // an unchallenged GUARD raises a shield equal to its Power (no stacking)
  mend: 2, // (guardMode 'mend' only)
  spill: true, // STRIKE overkill carries into the Voice
  terrain: true, // roll a ground for each lane
  lastStand: true,
  lastStandAt: 10, // a Voice at or below this triggers that side's Last Stand
  lastStandPower: 2,
  ults: 1, // Ultimates per side per match
  ultCharge: 3, // rounds a Champion must survive to charge
  ultPower: 1,
  counterDeploy: true, // the side without Initiative places first, face-up
};

// Grounds. `mod` adds to a Champion's Power for that Order in that lane.
export const TERRAIN = {
  field: { name: 'Open Field', text: 'No advantage', mod: {} },
  rampart: { name: 'Rampart', text: '+2 GUARD', mod: { guard: 2 } },
  bridge: { name: 'Narrow Bridge', text: '+2 STRIKE', mod: { strike: 2 } },
  gallery: { name: 'Whispering Gallery', text: '+2 SCHEME', mod: { scheme: 2 } },
  mire: { name: 'Ash Mire', text: '−1 to every Order', mod: { strike: -1, guard: -1, scheme: -1 } },
};
const TERRAIN_ROLL = [['field', 0.34], ['rampart', 0.17], ['bridge', 0.17], ['gallery', 0.17], ['mire', 0.15]];

// Last Stand: in the final round both sides fight harder; before that, only a
// side whose Voice has fallen to lastStandAt (a comeback rule).
export function lastStandActive(state, side = null) {
  const R = state.rules;
  if (!R.lastStand) return false;
  if (state.round >= R.rounds) return true;
  if (side == null) return state.p[0].voice <= R.lastStandAt || state.p[1].voice <= R.lastStandAt;
  return state.p[side].voice <= R.lastStandAt;
}

// Rounds a Champion has stood; charged when it reaches ultCharge.
export const ultCharged = (state, u) => !!u && state.round - u.born >= state.rules.ultCharge;

const opp = (s) => 1 - s;
const rnd = (state) => nextRandom(state.rng);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * @param octaves [[cardId x8], [cardId x8]]
 * @param cards   id -> card definition ({ stats: {strike, guard, scheme}, hp, kit? })
 */
export function createBattle(octaves, cards, { seed = 1, rules = {}, initiative = null, terrain = null, mods = null } = {}) {
  const R = { ...DEFAULT_RULES, ...rules };
  const M = [mods?.[0] || {}, mods?.[1] || {}];
  const state = {
    rules: R,
    rng: { seed: seed >>> 0 },
    round: 1,
    phase: 'deploy',
    initiative: 0,
    winner: null,
    nextUid: 1,
    terrain: null,
    p: [0, 1].map((side) => ({
      voice: R.voice + (M[side].voice || 0),
      maxVoice: R.voice + (M[side].voice || 0),
      mods: M[side],
      octave: octaves[side].slice(),
      hand: [],
      reserve: [],
      lanes: new Array(LANES).fill(null),
      fallen: [],
      focus: R.focus + (M[side].focus || 0),
      reads: R.reads + (M[side].reads || 0),
      ults: R.ults ? R.ults + (M[side].ults || 0) : 0,
      stats: { dealt: 0, taken: 0, kills: 0, readsHit: 0, readsUsed: 0, focusUsed: 0 },
      lastRound: null, // 'won' | 'lost' | 'even' (by Voice lost that round)
      streak: 0,
      fellThis: 0,
      fellLast: 0,
    })),
    history: [],
    events: [],
  };
  state.initiative = initiative ?? (rnd(state) < 0.5 ? 0 : 1);
  state.terrain = terrain ? terrain.slice() : R.terrain ? rollTerrain(state) : ['field', 'field', 'field'];
  for (const side of [0, 1]) {
    const P = state.p[side];
    const deck = shuffleInPlace(P.octave.slice(), () => rnd(state));
    P.hand = deck.slice(0, R.hand);
    P.reserve = deck.slice(R.hand);
  }
  return state;
}

function rollTerrain(state) {
  return [0, 1, 2].map(() => {
    let r = rnd(state);
    for (const [k, w] of TERRAIN_ROLL) if ((r -= w) <= 0) return k;
    return 'field';
  });
}

export function cloneState(s) {
  return JSON.parse(JSON.stringify(s));
}

function makeUnit(state, side, id, cards) {
  const c = cards[id];
  const m = state.p[side].mods || {};
  const up = m.buffs?.[id] || {}; // Long Road upgrades
  const hp = c.hp + (up.hp || 0);
  return {
    uid: state.nextUid++,
    id,
    side,
    hp,
    maxHp: hp,
    stats: { strike: c.stats.strike + (up.strike || 0), guard: c.stats.guard + (up.guard || 0), scheme: c.stats.scheme + (up.scheme || 0) },
    buff: { strike: 0, guard: 0, scheme: 0 }, // permanent changes from abilities
    temp: { strike: 0, guard: 0, scheme: 0 }, // this round only
    ward: m.shield || 0, // damage to absorb before health
    tags: {}, // ability bookkeeping
    born: state.round,
  };
}

export function unitPower(u, order) {
  return Math.max(0, u.stats[order] + u.buff[order] + u.temp[order]);
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

export function deploysAllowed(state, side = null) {
  const base = state.round === 1 ? state.rules.deploysFirst : state.rules.deploysPer;
  return base + (side != null && state.round === 1 ? state.p[side].mods?.deploysFirst || 0 : 0);
}

// Counter-deploy: who places first this round (face-up), who answers.
export function deployOrder(state) {
  if (!state.rules.counterDeploy) return null;
  return [1 - state.initiative, state.initiative];
}

// Legal single placements for a side: [{ card, lane }]
export function placements(state, side) {
  const P = state.p[side];
  const out = [];
  const seen = new Set();
  for (const card of P.hand) {
    if (seen.has(card)) continue;
    seen.add(card);
    for (let l = 0; l < LANES; l++) if (!P.lanes[l]) out.push({ card, lane: l });
  }
  return out;
}

export function isLegalDeploy(state, side, list) {
  if (!Array.isArray(list) || list.length > deploysAllowed(state, side)) return false;
  const P = state.p[side];
  const hand = P.hand.slice();
  const lanes = new Set();
  for (const d of list) {
    const i = hand.indexOf(d.card);
    if (i < 0 || lanes.has(d.lane) || d.lane < 0 || d.lane >= LANES || P.lanes[d.lane]) return false;
    hand.splice(i, 1);
    lanes.add(d.lane);
  }
  return true;
}

/** Both sides' deploy lists at once. Reveals, then On-Reveal effects (Initiative first). */
export function deploy(state, lists, cards, { hypothetical = false, noTriggers = false } = {}) {
  if (state.phase !== 'deploy') throw new Error('not deploy phase');
  state.events = [];
  for (const side of [0, 1]) {
    if (!hypothetical && !isLegalDeploy(state, side, lists[side] || [])) throw new Error(`illegal deploy for ${side}: ${JSON.stringify(lists[side])}`);
  }
  const placed = [];
  for (const side of [0, 1]) {
    const P = state.p[side];
    for (const d of lists[side] || []) {
      const hi = P.hand.indexOf(d.card);
      if (hi >= 0) P.hand.splice(hi, 1); // hypothetical enemy cards aren't in the (hidden) hand
      const u = makeUnit(state, side, d.card, cards);
      P.lanes[d.lane] = u;
      placed.push([side, d.lane]);
      state.events.push({ t: 'deploy', side, lane: d.lane, card: d.card, uid: u.uid });
    }
  }
  const first = state.initiative;
  placed.sort((a, b) => (a[0] === first ? 0 : 1) - (b[0] === first ? 0 : 1) || a[1] - b[1]);
  if (!noTriggers)
    for (const [side, lane] of placed) {
      const u = state.p[side].lanes[lane];
      if (u) trigger(state, cards, u, 'reveal', { lane });
    }
  cleanupFallen(state, cards);
  if (!hypothetical) state.history.push({ round: state.round, deploy: lists.map((l) => (l || []).map((d) => ({ ...d }))) });
  if (!checkEnd(state)) state.phase = 'command';
  return state;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function unitsInPlay(state, side) {
  return state.p[side].lanes.map((u, l) => (u ? l : -1)).filter((l) => l >= 0);
}

// Orders a unit may choose this round (abilities can forbid some).
export function allowedOrders(state, side, lane) {
  const u = state.p[side].lanes[lane];
  if (!u) return [];
  const no = u.tags.forbid || [];
  const ok = ORDERS.filter((o) => !no.includes(o));
  return ok.length ? ok : ORDERS.slice();
}

/**
 * cmd = { orders: [order|null x3], focus: lane|null, read: { lane, order } | null }
 */
export function isLegalCommand(state, side, cmd) {
  const P = state.p[side];
  if (!cmd || !Array.isArray(cmd.orders) || cmd.orders.length !== LANES) return false;
  for (let l = 0; l < LANES; l++) {
    if (!P.lanes[l]) {
      if (cmd.orders[l] != null) return false;
    } else if (!allowedOrders(state, side, l).includes(cmd.orders[l])) return false;
  }
  if (cmd.focus != null) {
    if (P.focus <= 0 || P.noFocusRound || !P.lanes[cmd.focus]) return false;
  }
  if (cmd.ult != null) {
    if (P.ults <= 0 || !ultCharged(state, P.lanes[cmd.ult])) return false;
  }
  if (cmd.read) {
    if (P.reads <= 0 || P.noReadRound) return false;
    // READ is a duel between two Champions: only a lane where both stand.
    if (!state.p[opp(side)].lanes[cmd.read.lane] || !P.lanes[cmd.read.lane]) return false;
    if (!ORDERS.includes(cmd.read.order)) return false;
  }
  return true;
}

/** Both sides' commands. Resolves the round and returns state (events inside). */
export function command(state, cmds, cards) {
  if (state.phase !== 'command') throw new Error('not command phase');
  state.events = [];
  for (const side of [0, 1]) if (!isLegalCommand(state, side, cmds[side])) throw new Error(`illegal command for ${side}: ${JSON.stringify(cmds[side])}`);
  const R = state.rules;
  const voice0 = [state.p[0].voice, state.p[1].voice];
  const lastStand = lastStandActive(state);
  if (lastStand) state.events.push({ t: 'lastStand', sides: [0, 1].filter((s) => lastStandActive(state, s)), final: state.round >= R.rounds });

  // Orders, Focus and READ are revealed together.
  for (const side of [0, 1]) {
    const P = state.p[side];
    const c = cmds[side];
    for (let l = 0; l < LANES; l++) if (P.lanes[l]) P.lanes[l].order = c.orders[l];
    if (c.focus != null) {
      P.focusThisRound = true;
      P.focus--;
      P.stats.focusUsed++;
      const u = P.lanes[c.focus];
      u.focused = true;
    }
    if (c.ult != null) {
      P.ults--;
      P.lanes[c.ult].ult = true;
      P.stats.ults = (P.stats.ults || 0) + 1;
    }
  }
  state.events.push({ t: 'orders', orders: [cmds[0].orders.slice(), cmds[1].orders.slice()], focus: [cmds[0].focus ?? null, cmds[1].focus ?? null], ult: [cmds[0].ult ?? null, cmds[1].ult ?? null] });
  for (const side of [0, 1]) if (cmds[side].ult != null) state.events.push({ t: 'ult', side, lane: cmds[side].ult, card: state.p[side].lanes[cmds[side].ult].id });

  // READs
  const cancelled = [new Set(), new Set()]; // lanes whose action is cancelled, per side
  const readBonus = [[0, 0, 0], [0, 0, 0]];
  for (const side of [0, 1]) {
    const r = cmds[side].read;
    if (!r) continue;
    const P = state.p[side];
    P.reads--;
    P.stats.readsUsed++;
    const target = state.p[opp(side)].lanes[r.lane];
    // an Ultimate cannot be read
    const hit = target.order === r.order && !kitFlag(target, cards, 'readImmune') && !target.ult;

    P.readThisRound = hit ? 'hit' : 'miss';
    if (hit) {
      P.stats.readsHit++;
      cancelled[opp(side)].add(r.lane);
      readBonus[side][r.lane] += R.readHit;
    } else if (!P.mods?.freeMiss) readBonus[side][r.lane] -= R.readMiss * (lastStand ? 2 : 1);
    state.events.push({ t: 'read', side, lane: r.lane, order: r.order, actual: target.order, hit });
    const mine = P.lanes[r.lane];
    if (mine) trigger(state, cards, mine, hit ? 'readHit' : 'readMiss', { lane: r.lane });
  }

  // Power this round: stat + permanent buffs + temporary + Focus + READ + abilities.
  for (const side of [0, 1]) {
    for (let l = 0; l < LANES; l++) {
      const u = state.p[side].lanes[l];
      if (u) u.power = powerFor(state, cards, u, l, u.order, { focus: !!u.focused, read: readBonus[side][l] });
    }
  }

  // Resolve every lane from the same snapshot (simultaneous), then apply.
  const dmgVoice = [0, 0];
  const acts = [];
  for (let l = 0; l < LANES; l++) {
    const A = state.p[0].lanes[l];
    const B = state.p[1].lanes[l];
    if (!A && !B) continue;
    const r = laneClash(R, [A, B].map((u, side) => (u ? { order: u.order, power: u.power, hp: u.hp, ward: u.ward, mend: mendFor(R, u.power, kitNumber(u, cards, 'mend')), cancelled: cancelled[side].has(l) && !u.ult, unstoppable: !!u.ult } : null)));
    acts.push({ lane: l, r });
  }
  for (const { lane: l, r } of acts) {
    // One event per lane with everything the client needs to stage the exchange;
    // the hits, shields and falls that follow carry the resulting numbers.
    state.events.push({
      t: 'lane',
      lane: l,
      units: [state.p[0].lanes[l]?.order ?? null, state.p[1].lanes[l]?.order ?? null],
      power: [state.p[0].lanes[l]?.power ?? 0, state.p[1].lanes[l]?.power ?? 0],
      outcome: r.out,
      voiceDmg: r.voiceDmg.slice(),
      unitDmg: r.unitDmg.slice(),
      spill: r.spill.slice(),
    });
    for (const side of [0, 1]) {
      dmgVoice[side] += r.voiceDmg[side]; // Voice damage lands even when this side's lane is empty
      const u = state.p[side].lanes[l];
      if (!u) continue;
      const d = r.unitDmg[side];
      if (d > 0) {
        const warded = Math.min(u.ward, d);
        u.ward -= warded;
        const before = u.hp;
        u.hp -= d - warded;
        const spill = r.spill[side];
        state.events.push({ t: 'hit', lane: l, side, n: d, warded, hp: Math.max(0, u.hp), max: u.maxHp, ward: u.ward, spill, from: r.out[opp(side)] });
        state.p[opp(side)].stats.dealt += Math.min(before, d - warded);
        const striker = state.p[opp(side)].lanes[l];
        if (striker) trigger(state, cards, striker, 'hit', { lane: l, target: u, n: d - warded });
      }
      if (r.mend[side] > 0 && u.hp > 0) {
        const n = Math.min(r.mend[side], u.maxHp - u.hp);
        u.hp += n;
        if (n > 0) state.events.push({ t: 'mend', lane: l, side, n, hp: u.hp, max: u.maxHp });
      }
      if (r.ward[side] > 0 && u.hp > 0 && u.ward < r.ward[side]) {
        state.events.push({ t: 'ward', lane: l, side, n: r.ward[side] - u.ward, total: r.ward[side] });
        u.ward = r.ward[side]; // a Guard raises the shield to its Power; it doesn't stack
      }
      if (r.rally[side] > 0) healVoice(state, side, r.rally[side]);
    }
  }
  for (const side of [0, 1]) {
    if (dmgVoice[side] > 0) {
      hurtVoice(state, side, dmgVoice[side], 'round');
      // Champions that reached the Voice this round
      for (let l = 0; l < LANES; l++) {
        const u = state.p[opp(side)].lanes[l];
        const o = acts.find((a) => a.lane === l)?.r.out[opp(side)];
        if (u && (o === 'scheme' || o === 'strikeVoice')) trigger(state, cards, u, 'voice', { lane: l });
      }
    }
  }

  cleanupFallen(state, cards);
  // Round end: abilities, then Initiative to whoever lost more Voice this round.
  for (const side of [state.initiative, opp(state.initiative)]) {
    for (let l = 0; l < LANES; l++) {
      const u = state.p[side].lanes[l];
      if (u) trigger(state, cards, u, 'roundEnd', { lane: l });
    }
  }
  cleanupFallen(state, cards);
  const lost = [voice0[0] - state.p[0].voice, voice0[1] - state.p[1].voice];
  if (lost[0] !== lost[1]) state.initiative = lost[0] > lost[1] ? 0 : 1;
  for (const side of [0, 1]) {
    const P = state.p[side];
    P.lastRound = lost[side] < lost[opp(side)] ? 'won' : lost[side] > lost[opp(side)] ? 'lost' : 'even';
    P.streak = P.lastRound === 'won' ? P.streak + 1 : 0;
    P.fellLast = P.fellThis;
    P.fellThis = 0;
    delete P.readThisRound;
    delete P.focusThisRound;
    delete P.noFocusRound;
    delete P.noReadRound;
  }

  state.history[state.history.length - 1].command = cmds.map((c) => ({ orders: c.orders.slice(), focus: c.focus ?? null, read: c.read ? { ...c.read } : null, ult: c.ult ?? null }));
  state.history[state.history.length - 1].voice = [state.p[0].voice, state.p[1].voice];

  // Clear per-round state.
  for (const side of [0, 1]) {
    for (const u of state.p[side].lanes) {
      if (!u) continue;
      u.temp = { strike: 0, guard: 0, scheme: 0 };
      delete u.order;
      delete u.power;
      delete u.focused;
      delete u.ult;
      delete u.tags.forbid;
      delete u.tags.noFocus;
    }
  }
  if (checkEnd(state)) return state;
  if (state.round >= state.rules.rounds) {
    finishOnVoice(state);
    return state;
  }
  state.round++;
  for (const side of [0, 1]) draw(state, side, 1);
  state.phase = 'deploy';
  return state;
}

/**
 * Pure resolution of one lane. `s` = [side0, side1], each null (empty lane) or
 * { order, power, hp, ward, mend, cancelled }. Returns damage *taken* by each
 * side's Champion and Voice, mending, STRIKE spill and outcomes. The engine
 * and the AIs both use this, so previews can never disagree with the rules.
 */
export function laneClash(R, s) {
  const out = [null, null], unitDmg = [0, 0], voiceDmg = [0, 0], mend = [0, 0], spill = [0, 0], rally = [0, 0], ward = [0, 0];
  for (const side of [0, 1]) {
    const me = s[side], them = s[1 - side];
    if (!me) continue;
    if (me.cancelled) {
      out[side] = 'read';
      continue;
    }
    if (them && !them.cancelled && BEATS[them.order] === me.order && !me.unstoppable) {
      out[side] = 'beaten';
      continue;
    }
    const o = 1 - side;
    if (me.order === 'strike') {
      if (them) {
        unitDmg[o] += me.power;
        out[side] = 'strike';
      } else {
        voiceDmg[o] += me.power;
        out[side] = 'strikeVoice';
      }
    } else if (me.order === 'scheme') {
      voiceDmg[o] += me.power;
      out[side] = 'scheme';
    } else if (them && them.order === 'strike' && !them.cancelled) {
      unitDmg[o] += me.power;
      out[side] = 'riposte';
    } else if (R.guardMode === 'rally') {
      rally[side] += Math.ceil(me.power / 2);
      out[side] = 'rally';
    } else if (R.guardMode === 'ward') {
      ward[side] += me.power;
      out[side] = 'ward';
    } else {
      mend[side] += me.mend;
      out[side] = 'mend';
    }
  }
  if (R.spill)
    for (const side of [0, 1]) {
      const u = s[side];
      if (u && out[1 - side] === 'strike') {
        const left = u.hp + u.ward - unitDmg[side];
        if (left < 0) spill[side] = -left;
        voiceDmg[side] += spill[side];
      }
    }
  return { out, unitDmg, voiceDmg, mend, spill, rally, ward };
}

/** How much an unchallenged GUARD mends. */
export function mendFor(R, power, bonus = 0) {
  return (R.mendMode === 'half' ? Math.ceil(power / 2) : R.mend) + (bonus || 0);
}

/** A Champion's Power for an Order this round, abilities included. */
export function powerFor(state, cards, u, lane, order, { focus = false, read = 0, oppOrder, ult = u.ult } = {}) {
  const prev = u.order;
  const foe = oppOrder !== undefined ? state.p[1 - u.side].lanes[lane] : null;
  const prevFoe = foe?.order;
  const prevFocused = u.focused;
  u.order = order;
  if (foe) foe.order = oppOrder;
  if (focus) u.focused = true;
  const R = state.rules;
  let p =
    unitPower(u, order) +
    (focus ? R.focusPower : 0) +
    read +
    powerFromKits(state, cards, u, lane) +
    (TERRAIN[state.terrain?.[lane]]?.mod[order] || 0) +
    (lastStandActive(state, u.side) ? R.lastStandPower : 0) +
    (ult ? R.ultPower : 0);
  u.order = prev;
  u.focused = prevFocused;
  if (foe) foe.order = prevFoe;
  return Math.max(0, p);
}

/**
 * Bonds: which Champions are powering which right now. For every pair of allies,
 * the Power the receiver loses (at its best-affected Order) if the giver were
 * gone. Reads the real kits, so auras, "per ally", trait and faction links all
 * show without a list. Returns [{ from, to, n }] as lane numbers.
 */
export function bondsFor(state, cards, side) {
  const lanes = state.p[side].lanes, out = [];
  for (let b = 0; b < lanes.length; b++) {
    const u = lanes[b];
    if (!u) continue;
    const base = ORDERS.map((o) => powerFor(state, cards, u, b, o, { ult: false }));
    for (let a = 0; a < lanes.length; a++) {
      if (a === b || !lanes[a]) continue;
      const keep = lanes[a];
      lanes[a] = null;
      let n = 0;
      try {
        ORDERS.forEach((o, i) => (n = Math.max(n, base[i] - powerFor(state, cards, u, b, o, { ult: false }))));
      } finally {
        lanes[a] = keep;
      }
      if (n > 0) out.push({ from: a, to: b, n });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shared effects (used by the rules and by abilities)
// ---------------------------------------------------------------------------

export function draw(state, side, n) {
  const P = state.p[side];
  for (let i = 0; i < n; i++) {
    if (!P.reserve.length || P.hand.length >= state.rules.handMax) return;
    const j = Math.floor(rnd(state) * P.reserve.length);
    P.hand.push(P.reserve.splice(j, 1)[0]);
    state.events.push({ t: 'draw', side });
  }
}

export function hurtVoice(state, side, n, src) {
  if (n <= 0) return;
  state.p[side].voice -= n;
  state.p[opp(side)].stats.dealt += n;
  state.p[side].stats.taken += n;
  state.events.push({ t: 'voice', side, n, voice: state.p[side].voice, src });
}

export function healVoice(state, side, n) {
  const P = state.p[side];
  const k = Math.max(0, Math.min(n, (P.maxVoice ?? state.rules.voice) - P.voice));
  P.voice += k;
  if (k) state.events.push({ t: 'voiceHeal', side, n: k, voice: P.voice });
}

export function damageUnit(state, cards, u, n, src) {
  if (!u || n <= 0) return 0;
  const warded = Math.min(u.ward, n);
  u.ward -= warded;
  const d = n - warded;
  u.hp -= d;
  const lane = state.p[u.side].lanes.indexOf(u);
  state.events.push({ t: 'hit', lane, side: u.side, n, warded, hp: Math.max(0, u.hp), max: u.maxHp, ward: u.ward, spill: 0, from: src });
  return d;
}

export function healUnit(state, u, n) {
  if (!u) return;
  const k = Math.max(0, Math.min(n, u.maxHp - u.hp));
  u.hp += k;
  const lane = state.p[u.side].lanes.indexOf(u);
  if (k) state.events.push({ t: 'mend', lane, side: u.side, n: k, hp: u.hp, max: u.maxHp });
}

function cleanupFallen(state, cards) {
  let any = true;
  while (any) {
    any = false;
    for (const side of [0, 1]) {
      const P = state.p[side];
      for (let l = 0; l < LANES; l++) {
        const u = P.lanes[l];
        if (u && u.hp <= 0) {
          any = true;
          P.lanes[l] = null;
          P.fallen.push(u.id);
          P.fellThis++;
          state.p[opp(side)].stats.kills++;
          state.events.push({ t: 'fall', side, lane: l, card: u.id });
          trigger(state, cards, u, 'fall', { lane: l });
          // allies and enemies that care about a Champion falling
          for (const s2 of [0, 1])
            for (let l2 = 0; l2 < LANES; l2++) {
              const w = state.p[s2].lanes[l2];
              if (w) trigger(state, cards, w, s2 === side ? 'allyFall' : 'enemyFall', { lane: l2, fallen: u });
            }
        }
      }
    }
  }
}

function checkEnd(state) {
  const dead = [state.p[0].voice <= 0, state.p[1].voice <= 0];
  if (!dead[0] && !dead[1]) return false;
  if (dead[0] && dead[1]) {
    const a = state.p[0].voice, b = state.p[1].voice;
    state.winner = a === b ? state.initiative : a > b ? 0 : 1;
  } else state.winner = dead[0] ? 1 : 0;
  state.phase = 'over';
  state.events.push({ t: 'end', winner: state.winner, by: 'silence' });
  return true;
}

function finishOnVoice(state) {
  const a = state.p[0].voice, b = state.p[1].voice;
  state.winner = a === b ? state.initiative : a > b ? 0 : 1;
  state.phase = 'over';
  state.events.push({ t: 'end', winner: state.winner, by: 'voice' });
}

// ---------------------------------------------------------------------------
// Ability plumbing (see kit.js)
// ---------------------------------------------------------------------------

function kitFor(u, cards) {
  return u.tags.silenced ? null : kitOf(cards[u.id]);
}
export { kitFor };

function trigger(state, cards, u, hook, extra) {
  const k = kitFor(u, cards);
  if (!k || !k[hook]) return;
  k[hook](ctxFor(state, cards, u, extra));
}

function powerFromKits(state, cards, u, lane) {
  let n = 0;
  const k = kitFor(u, cards);
  if (k && k.power) n += k.power(ctxFor(state, cards, u, { lane }));
  // auras from allies
  const P = state.p[u.side];
  for (let l = 0; l < LANES; l++) {
    const w = P.lanes[l];
    if (!w || w === u) continue;
    const kw = kitFor(w, cards);
    if (kw && kw.aura) n += kw.aura(ctxFor(state, cards, w, { lane: l }), u, lane);
  }
  return n;
}

function kitFlag(u, cards, flag) {
  const k = kitFor(u, cards);
  return !!(k && k.flags && k.flags[flag]);
}
function kitNumber(u, cards, key) {
  const k = kitFor(u, cards);
  return k && k.flags ? k.flags[key] : 0;
}

export function ctxFor(state, cards, u, extra = {}) {
  const side = u.side;
  return {
    state,
    cards,
    unit: u,
    side,
    me: state.p[side],
    them: state.p[opp(side)],
    lane: extra.lane ?? state.p[side].lanes.indexOf(u),
    rand: () => rnd(state),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Helpers for AIs and the client
// ---------------------------------------------------------------------------

export function publicView(state, side) {
  // What `side` is allowed to know: everything except the opponent's hand and
  // Reserve order (their Octave is public, so the union is known).
  const s = cloneState(state);
  const o = s.p[opp(side)];
  o.hiddenCount = o.hand.length;
  o.unplayed = [...o.hand, ...o.reserve].sort();
  o.hand = [];
  o.reserve = [];
  return s;
}

export function winnerOf(state) {
  return state.winner;
}

// Both sides' deploys from two agents, honouring counter-deploy: the side that
// places first does so face-up, and the other side answers knowing it.
export function agentDeploys(state, agents) {
  const order = deployOrder(state);
  const d = [];
  if (!order) {
    for (const s of [0, 1]) d[s] = agents[s].deploy(publicView(state, s), s);
    return d;
  }
  const [a, b] = order;
  d[a] = agents[a].deploy(publicView(state, a), a, { first: true });
  d[b] = agents[b].deploy(publicView(state, b), b, { known: d[a] });
  return d;
}
