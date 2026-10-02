// THE DUEL — THRENYX combat. One Champion against one, in the open.
//
//   Each player has an Octave of 8 Champions, a hand of 3 (the rest is the
//   Reserve), Voice, 2 Focus and 1 READ. Both hands are public.
//   A match is at most 8 duels. In each:
//     1. LEAD    one player commits a Champion from hand, face up.
//     2. ANSWER  the other commits one of theirs.
//     3. FOCUS   the Answer's Focus comes with its Champion; the Lead may add
//                Focus last. (READ: the Lead may switch its Champion once the
//                Answer is down, after which the Answer stands.)
//     4. CLASH   the Lead attacks with STRIKE, the Answer defends with GUARD,
//                plus abilities and Focus (+2). Higher Power wins the duel:
//                the losing Champion takes the difference (+1) as damage and
//                the winner's SCHEME hits the loser's Voice. A tie: both
//                Champions take 1.
//     5. AFTER   Champions at 0 Health Fall (Last Words). Survivors go to the
//                bottom of the Reserve. Draw back to 3. The loser of the duel
//                Leads the next one (Leading is the stronger seat: the Lead
//                adds Focus last and can READ).
//   The final duel counts double. A Voice at 0 loses; after the last duel the
//   higher Voice wins.
//
// Card data is the same as ever: Strike/Guard/Scheme/Health and the kit DSL.
// Kits are read here with duel meanings (see `cond` and `runOps`): "using
// STRIKE" = when Leading, "using GUARD" = when Answering, "opposite" = the
// Champion it duels, "this round" = this duel, lanes = your next Champion.
// State is plain JSON (replays, saves and the server are exact); everything
// visible is pushed to state.events for the screen to animate.
import { CARDS } from './cards/index.js';
import { nextRandom, shuffleInPlace } from './rng.js';
import TUNE from './data/duel-tune.js';
import { bondMap } from './archetypes.js';

export const DUEL_RULES = {
  voice: 20,
  hand: 3,
  handMax: 4,
  duels: 8,
  focus: 2,
  focusPower: 2,
  reads: 1,
  forbidCost: 2, // "can't use" an Order = -2 to it this duel
  finalDouble: true, // the last duel's Voice damage counts double
  bonds: true, // archetype Bonds (engine/archetypes.js)
};

/** A win with your Voice at or below this is a clutch win (bonus Ladder Note). */
export const CLUTCH_AT = 6;

const ORD = ['strike', 'guard', 'scheme'];
/** A Champion's printed numbers in the Duel (the duel tuning sits on top of the card). */
export function duelStats(id) {
  const c = CARDS[id], t = TUNE[id] || {};
  return { strike: c.stats.strike + (t.strike || 0), guard: c.stats.guard + (t.guard || 0), scheme: c.stats.scheme + (t.scheme || 0), hp: Math.max(2, c.hp + (t.hp || 0)) };
}

// ---- setup ---------------------------------------------------------------------------------
/**
 * mods: per side, e.g. the Long Road's relics and upgrades:
 * { voice, focus, reads, shield (blocks n damage every duel), focusPower (extra per Focus),
 *   hand (extra hand size), lead (Leads the first duel), buffs: { id: { strike, guard, scheme, hp } } }
 */
export function createDuel(decks, { seed = 1, rules = {}, names = ['You', 'Opponent'], lead = null, mods = [] } = {}) {
  const R = { ...DUEL_RULES, ...rules };
  const st = { v: 1, rules: R, seed: seed >>> 0 || 1, duel: 1, lead: 0, over: false, winner: null, names, events: [], history: [], sides: [] };
  st.lead = lead ?? R.fixedLead ?? (mods[0]?.lead && !mods[1]?.lead ? 0 : mods[1]?.lead && !mods[0]?.lead ? 1 : nextRandom(st) < 0.5 ? 0 : 1);
  for (let s = 0; s < 2; s++) {
    const order = [...decks[s]];
    shuffleInPlace(order, () => nextRandom(st));
    const m = mods[s] || {};
    const hand = R.hand + (m.hand || 0);
    const side = {
      deck: [...decks[s]], hand: order.slice(0, hand), reserve: order.slice(hand), fallen: [],
      voice: R.voice + (m.voice || 0), focus: R.focus + (m.focus || 0), reads: R.reads + (m.reads || 0),
      handSize: hand, shieldAll: m.shield || 0, focusBonus: m.focusPower || 0,
      hp: {}, maxHp: {}, buff: {}, ward: {}, used: {}, bond: R.bonds ? bondMap(decks[s], CARDS) : {},
      fallenCount: 0, fallenTraits: {}, fallenFactions: {}, streak: 0, last: null, allyFellLast: false,
    };
    for (const id of decks[s]) {
      const b = m.buffs?.[id] || {};
      side.maxHp[id] = side.hp[id] = Math.max(1, duelStats(id).hp + (b.hp || 0));
      side.buff[id] = { strike: b.strike || 0, guard: b.guard || 0, scheme: b.scheme || 0 };
    }
    st.sides.push(side);
  }
  return st;
}
export const cloneDuel = (st) => JSON.parse(JSON.stringify(st));
export const isFinalDuel = (st) => st.duel >= st.rules.duels;

// ---- conditions and ability Power ---------------------------------------------------------
function cond(st, s, id, ctx, expr) {
  const me = st.sides[s], them = st.sides[1 - s], c = CARDS[id], foe = ctx.foe ? CARDS[ctx.foe] : null;
  const myStat = ctx.leading ? 'strike' : 'guard', foeStat = ctx.leading ? 'guard' : 'strike';
  return String(expr).split('&').every((x) => {
    const [k, v] = x.split(':');
    switch (k) {
      case 'order': return v === 'strike' ? ctx.leading : v === 'guard' ? !ctx.leading : true;
      case 'oppOrder': return v === 'strike' ? !ctx.leading : v === 'guard' ? ctx.leading : true;
      case 'lowest': return !!foe && duelStats(id)[myStat] + me.buff[id][myStat] < duelStats(ctx.foe)[foeStat]; // the underdog in this duel
      case 'highest': return !!foe && duelStats(id)[myStat] + me.buff[id][myStat] >= duelStats(ctx.foe)[foeStat];
      case 'behind': return me.voice < them.voice;
      case 'ahead': return me.voice > them.voice;
      case 'lowVoice': return me.voice <= 7;
      case 'wonLast': return me.last === 'won';
      case 'lostLast': return me.last === 'lost';
      case 'allyFellLast': return me.allyFellLast;
      case 'initiative': return ctx.leading;
      case 'first': return ctx.leading;
      case 'focused': return !!ctx.focused;
      case 'read': case 'readHit': return !!ctx.readUsed;
      case 'oppRead': return !!ctx.oppRead;
      case 'oppFocus': return !!ctx.oppFocused;
      case 'warded': return (me.ward[id] || 0) > 0;
      case 'hurt': return me.hp[id] < me.maxHp[id];
      case 'round>=3': return st.duel >= 3;
      case 'round>=4': return st.duel >= 4;
      case 'round>=5': return st.duel >= 5;
      case 'facing': return !!foe && foe.id === v;
      case 'facingFaction': return !!foe && foe.faction === v;
      case 'facingTrait': return !!foe && (foe.traits || []).includes(v);
      case 'facingAlign': return !!foe && foe.alignment === v;
      case 'bond': case 'bondIn': return me.deck.includes(v) && !me.fallen.includes(v);
      case 'bondFallen': return me.fallen.includes(v);
      case 'opposed': return true;
      case 'unopposed': return false;
      case 'mirror': return !!foe && foe.faction === c.faction;
      case 'focusHeld<=1': return me.focus <= 1;
      default: return false;
    }
  });
}
function per(st, s, p) {
  const me = st.sides[s];
  const [k, v] = p.split(':');
  if (k === 'fallen') return me.fallenCount;
  if (k === 'fallenFaction') return me.fallenFactions[v] || 0;
  if (k === 'fallenTrait') return me.fallenTraits[v] || 0;
  if (k === 'streak') return Math.max(0, me.streak);
  if (k === 'focusHeld') return me.focus;
  if (k === 'octaveTrait') return me.deck.filter((x) => !me.fallen.includes(x) && (CARDS[x].traits || []).includes(v)).length;
  return 0;
}
// Power this Champion's own ability adds in this duel, and where it came from.
function abilityPower(st, s, id, ctx) {
  if (ctx.silenced?.[s]) return { n: 0, why: [] };
  let n = 0;
  const why = [];
  for (const e of CARDS[id].kit?.power || []) {
    if (e.if && !cond(st, s, id, ctx, e.if)) continue;
    const add = e.per ? Math.min(e.max ?? 99, per(st, s, e.per) * e.n) : e.n;
    if (add) (n += add), why.push(CARDS[id].abilityName);
  }
  return { n, why };
}
// Auras from your other standing Champions (half strength: one duel at a time).
function auraPower(st, s, id) {
  const me = st.sides[s], c = CARDS[id];
  let n = 0;
  for (const x of me.deck) {
    if (x === id || me.fallen.includes(x)) continue;
    for (const a of CARDS[x].kit?.aura || []) {
      const to = a.to || 'allies';
      if (to === 'allies' || to === 'team' || (to.startsWith('trait:') && (c.traits || []).includes(to.slice(6)))) n += a.n * 0.5;
    }
  }
  return Math.floor(n);
}

// ---- effects ------------------------------------------------------------------------------
function ev(st, e) {
  st.events.push(e);
}
function runOps(st, s, id, trig, ctx) {
  if (ctx.silenced?.[s] && trig !== 'fall') return;
  const me = st.sides[s], them = st.sides[1 - s];
  const list = CARDS[id].kit?.[trig] || [];
  if (!list.length) return;
  let fired = false;
  for (const e of list) {
    if (e.if && !cond(st, s, id, ctx, e.if)) continue;
    const n = e.n ?? 1;
    fired = true;
    switch (e.op) {
      case 'dmg':
        if (e.to === 'voice') hitVoice(st, 1 - s, n, id);
        else if (ctx.foe && (e.to === 'opposite' || !e.to) && !them.fallen.includes(ctx.foe)) hurt(st, 1 - s, ctx.foe, n, ctx);
        else { const t = weakest(st, 1 - s); if (t) hurt(st, 1 - s, t, n, ctx); }
        break;
      case 'heal':
        if (e.to === 'voice') { me.voice = Math.min(st.rules.voice + 5, me.voice + n); ev(st, { t: 'heal', side: s, n, voice: true }); }
        else if (e.to === 'self' || !e.to) me.hp[id] = Math.min(me.maxHp[id], me.hp[id] + n);
        else for (const x of me.deck) if (!me.fallen.includes(x)) me.hp[x] = Math.min(me.maxHp[x], me.hp[x] + n);
        break;
      case 'ward':
        if (e.to === 'self' || !e.to) ctx.shield[s] += n;
        else for (const x of [...me.hand, ...me.reserve]) if (x !== id) me.ward[x] = (me.ward[x] || 0) + n; // "beside / your team": the ones still to fight
        break;
      case 'buff': {
        const stats = e.stat === 'all' ? ORD : [e.stat || 'strike'];
        const tgt = e.to === 'allies' || e.to === 'team' ? me.deck.filter((x) => x !== id && !me.fallen.includes(x)) : e.to?.startsWith('trait:') ? me.deck.filter((x) => x !== id && !me.fallen.includes(x) && (CARDS[x].traits || []).includes(e.to.slice(6))) : [id];
        for (const x of tgt) for (const o of stats) me.buff[x][o] += n;
        break;
      }
      case 'forbid': {
        // "can't use" an Order: -2 to it this duel; 'highest' takes the stat the enemy is using
        const o = e.order === 'highest' || e.order === 'lowest' ? (ctx.leading ? 'guard' : 'strike') : e.order;
        ctx.forbid[1 - s] = o;
        break;
      }
      case 'silence': ctx.silenced = { ...(ctx.silenced || {}), [1 - s]: true }; break;
      case 'gainFocus': me.focus = Math.min(4, me.focus + n); break;
      case 'stealFocus': if (them.focus > 0) (them.focus--, (me.focus = Math.min(4, me.focus + 1))); break;
      case 'drainFocus': them.focus = Math.max(0, them.focus - n); break;
      case 'noFocus': ctx.noFocus[1 - s] = true; break;
      case 'gainRead': case 'intel': me.reads = Math.min(2, me.reads + 1); break; // knowing their hand = a READ
      case 'noRead': ctx.noRead[1 - s] = true; break;
      case 'revive': {
        const f = me.fallen.find((x) => x !== id);
        if (f) {
          me.fallen = me.fallen.filter((x) => x !== f);
          me.hp[f] = Math.ceil(me.maxHp[f] / 2);
          (me.hand.length < st.rules.handMax ? me.hand : me.reserve).push(f);
          ev(st, { t: 'revive', side: s, id: f });
        }
        break;
      }
      case 'draw': if (me.reserve.length && me.hand.length < st.rules.handMax) me.hand.push(me.reserve.shift()); break;
      case 'move': ctx.returns = { ...(ctx.returns || {}), [s]: id }; break; // slips away: back to hand after the duel
      case 'execute': if (ctx.foe && !them.fallen.includes(ctx.foe) && them.hp[ctx.foe] <= n) hurt(st, 1 - s, ctx.foe, 99, ctx); break;
      case 'drain': hitVoice(st, 1 - s, n, id); me.voice += n; break;
      default: break;
    }
  }
  if (fired) ev(st, { t: 'ability', side: s, id, trig, name: CARDS[id].abilityName });
}
function weakest(st, s) {
  const me = st.sides[s];
  let best = null;
  for (const x of [...me.hand, ...me.reserve]) if (!best || me.hp[x] < me.hp[best]) best = x;
  return best;
}
function hitVoice(st, s, n, by) {
  if (n <= 0) return;
  st.sides[s].voice -= n;
  ev(st, { t: 'voice', side: s, n, by });
}
function hurt(st, s, id, n, ctx) {
  const me = st.sides[s];
  if (me.fallen.includes(id) || n <= 0) return 0;
  me.hp[id] -= n;
  ev(st, { t: 'dmg', side: s, id, n });
  if (me.hp[id] <= 0) fall(st, s, id, ctx);
  return n;
}
function fall(st, s, id, ctx) {
  const me = st.sides[s];
  if (me.fallen.includes(id)) return;
  const spill = Math.max(0, -me.hp[id]);
  me.hp[id] = 0;
  me.fallen.push(id);
  me.hand = me.hand.filter((x) => x !== id);
  me.reserve = me.reserve.filter((x) => x !== id);
  me.fallenCount++;
  const c = CARDS[id];
  me.fallenFactions[c.faction] = (me.fallenFactions[c.faction] || 0) + 1;
  for (const t of c.traits || []) me.fallenTraits[t] = (me.fallenTraits[t] || 0) + 1;
  me.allyFellLast = true;
  ev(st, { t: 'fall', side: s, id });
  if (ctx.spill && spill) hitVoice(st, s, spill, null); // overkill spills into the Voice
  const foe = ctx.duelists?.[1 - s] || null;
  runOps(st, s, id, 'fall', { ...ctx, foe, silenced: null }); // Last Words always speak
  for (const x of me.deck) if (x !== id && !me.fallen.includes(x)) runOps(st, s, x, 'allyFall', { ...ctx, foe });
  for (const x of st.sides[1 - s].deck) if (!st.sides[1 - s].fallen.includes(x)) runOps(st, 1 - s, x, 'enemyFall', { ...ctx, foe: id });
}

// ---- legality --------------------------------------------------------------------------------
/** What the side to act may do now: { lead: [ids] } or { answer: [ids] }. */
export const leadOptions = (st) => (st.over ? [] : [...st.sides[st.lead].hand]);
export const answerOptions = (st) => (st.over ? [] : [...st.sides[1 - st.lead].hand]);
/** Can the Lead switch with a READ against this Answer? */
export function canRead(st, answerId) {
  const L = st.lead;
  if (st.sides[L].reads <= 0 || st.sides[L].hand.length < 2) return false;
  return !CARDS[answerId]?.kit?.flags?.readImmune;
}

// ---- the duel ---------------------------------------------------------------------------------
/**
 * Play one duel. choice = { lead: id, answer: id, answerFocus: bool,
 * leadFocus: bool, switchTo: id|null (READ) }. Returns the state (mutated).
 */
export function playDuel(st, choice) {
  if (st.over) return st;
  const R = st.rules, L = st.lead, A = 1 - L;
  const sL = st.sides[L], sA = st.sides[A];
  st.events = [];
  const before = [sL.voice, sA.voice];
  let lead = choice.lead;
  const answer = choice.answer;
  if (!sL.hand.includes(lead) || !sA.hand.includes(answer)) throw new Error('Not in hand');
  const ctx = { shield: { [L]: 0, [A]: 0 }, forbid: {}, noFocus: {}, noRead: {}, silenced: null, duelists: {}, spill: true };
  let readUsed = false;
  if (choice.switchTo && choice.switchTo !== lead && sL.hand.includes(choice.switchTo) && canRead(st, answer)) {
    sL.reads--;
    readUsed = true;
    ev(st, { t: 'read', side: L, from: lead, to: choice.switchTo });
    lead = choice.switchTo;
  }
  sL.hand = sL.hand.filter((x) => x !== lead);
  sA.hand = sA.hand.filter((x) => x !== answer);
  ctx.duelists = { [L]: lead, [A]: answer };
  ev(st, { t: 'duel', lead: L, ids: { [L]: lead, [A]: answer }, n: st.duel, final: isFinalDuel(st) });
  const fL = !!choice.leadFocus && sL.focus > 0, fA = !!choice.answerFocus && sA.focus > 0;
  const mk = (s) => ({ ...ctx, leading: s === L, foe: ctx.duelists[1 - s], focused: s === L ? fL : fA, oppFocused: s === L ? fA : fL, readUsed: s === L && readUsed, oppRead: s === A && readUsed });
  // On Reveal: Lead first
  for (const s of [L, A]) {
    const c = mk(s);
    runOps(st, s, ctx.duelists[s], 'reveal', c);
    Object.assign(ctx, { shield: c.shield, forbid: c.forbid, noFocus: c.noFocus, noRead: c.noRead, silenced: c.silenced, returns: c.returns });
  }
  if (readUsed) runOps(st, L, lead, 'readHit', mk(L));
  let result = null;
  if (!sL.fallen.includes(lead) && !sA.fallen.includes(answer)) {
    // Focus
    const useF = { [L]: fL && !ctx.noFocus[L], [A]: fA && !ctx.noFocus[A] };
    for (const s of [L, A]) if (useF[s]) (st.sides[s].focus--, ev(st, { t: 'focus', side: s }));
    const power = (s) => {
      const id = ctx.duelists[s], me = st.sides[s], k = s === L ? 'strike' : 'guard';
      const c = { ...mk(s), focused: useF[s] };
      const base = duelStats(id)[k] + me.buff[id][k];
      const ab = abilityPower(st, s, id, c);
      const aura = auraPower(st, s, id);
      const hold = s === A ? R.answerBonus || 0 : 0; // holding ground: the Answer's small edge for showing second
      const pen = (ctx.forbid[s] === k ? R.forbidCost : 0) + (R.handicap?.[s] || 0); // handicap: training dummies only
      const bond = (s === L ? me.bond?.[id]?.lead : me.bond?.[id]?.answer) || 0;
      return { total: base + ab.n + aura + hold + bond + (useF[s] ? R.focusPower + st.sides[s].focusBonus : 0) - pen, base, ability: ab.n, aura, hold, bond, focus: useF[s] ? R.focusPower + st.sides[s].focusBonus : 0, penalty: pen, stat: k };
    };
    const P = { [L]: power(L), [A]: power(A) };
    ev(st, { t: 'clash', power: { [L]: P[L], [A]: P[A] } });
    const shieldOf = (s) => ctx.shield[s] + (st.sides[s].ward[ctx.duelists[s]] || 0) + st.sides[s].shieldAll;
    const mult = R.finalDouble && isFinalDuel(st) ? 2 : 1;
    if (P[L].total === P[A].total) {
      result = { tie: true };
      for (const s of [L, A]) hurt(st, s, ctx.duelists[s], Math.max(0, 1 - shieldOf(s)), ctx);
    } else {
      const w = P[L].total > P[A].total ? L : A, l = 1 - w;
      const margin = Math.abs(P[L].total - P[A].total);
      result = { winner: w, margin };
      ev(st, { t: 'win', side: w, margin });
      const dealt = Math.max(0, margin + 1 - shieldOf(l));
      if (shieldOf(l) && margin + 1 > 0) ev(st, { t: 'shield', side: l, n: Math.min(shieldOf(l), margin + 1) });
      if (dealt) {
        hurt(st, l, ctx.duelists[l], dealt, ctx);
        runOps(st, w, ctx.duelists[w], 'hit', mk(w));
      }
      if (ctx.forbid[w] !== 'scheme' && !st.sides[w].fallen.includes(ctx.duelists[w])) {
        const id = ctx.duelists[w];
        const sch = Math.max(0, duelStats(id).scheme + st.sides[w].buff[id].scheme);
        hitVoice(st, l, sch * mult, id);
        runOps(st, w, id, 'voice', mk(w));
      }
    }
  }
  // after the duel: wards on the duelists are spent; End of round for both duelists
  for (const s of [L, A]) {
    const id = ctx.duelists[s];
    delete st.sides[s].ward[id];
    if (!st.sides[s].fallen.includes(id)) runOps(st, s, id, 'roundEnd', mk(s));
  }
  // survivors go to the bottom of the Reserve (or back to hand if they slipped away)
  for (const s of [L, A]) {
    const id = ctx.duelists[s], me = st.sides[s];
    if (me.fallen.includes(id)) continue;
    if (ctx.returns?.[s] === id && me.hand.length < R.handMax) me.hand.push(id);
    else me.reserve.push(id);
    me.used[id] = (me.used[id] || 0) + 1;
  }
  // who lost the duel: more Voice lost (ties: the duel's loser, else no change)
  const lostL = before[0] - sL.voice, lostA = before[1] - sA.voice;
  let loser = lostL > lostA ? L : lostA > lostL ? A : result?.winner != null ? 1 - result.winner : null;
  for (const s of [0, 1]) {
    const me = st.sides[s];
    me.last = loser == null ? 'tie' : loser === s ? 'lost' : 'won';
    me.streak = me.last === 'won' ? Math.max(1, me.streak + 1) : me.last === 'lost' ? Math.min(-1, me.streak - 1) : 0;
  }
  if (!st.events.some((e) => e.t === 'fall' && e.side === L)) sL.allyFellLast = false;
  if (!st.events.some((e) => e.t === 'fall' && e.side === A)) sA.allyFellLast = false;
  st.history.push({ n: st.duel, lead: L, ids: { ...ctx.duelists }, result, voice: [st.sides[0].voice, st.sides[1].voice], read: readUsed });
  // the end?
  const out = [0, 1].map((s) => st.sides[s].voice <= 0 || (!st.sides[s].hand.length && !st.sides[s].reserve.length));
  if (out[0] || out[1] || isFinalDuel(st)) {
    st.over = true;
    st.winner = out[0] && !out[1] ? 1 : out[1] && !out[0] ? 0 : st.sides[0].voice === st.sides[1].voice ? (loser == null ? null : 1 - loser) : st.sides[0].voice > st.sides[1].voice ? 0 : 1;
    ev(st, { t: 'end', winner: st.winner });
    return st;
  }
  // next duel: draw back up
  for (const s of [0, 1]) {
    const me = st.sides[s];
    while (me.hand.length < me.handSize && me.reserve.length) me.hand.push(me.reserve.shift());
  }
  st.duel++;
  // who Leads next: by default the loser of the duel (the stronger seat goes to whoever is behind)
  st.lead = R.fixedLead != null ? R.fixedLead : loser == null ? A : R.winnerLeads ? 1 - loser : loser; // fixedLead: training only
  // nobody to send: the other side Leads
  if (!st.sides[st.lead].hand.length) st.lead = 1 - st.lead;
  return st;
}

/**
 * What would happen: the duel played on a copy (deterministic, so exact).
 * Returns { win: 'lead'|'answer'|'tie', power: {lead, answer}, voice: [lostByLead, lostByAnswer],
 * falls: [ids], triggers: [ability names], outlook: 'likely win'|'even'|'likely loss' (for `side`) }.
 */
export function preview(st, choice, side = st.lead) {
  const c = cloneDuel(st);
  const L = c.lead;
  const v0 = [c.sides[0].voice, c.sides[1].voice];
  playDuel(c, choice);
  const clash = c.events.find((e) => e.t === 'clash');
  const win = c.events.find((e) => e.t === 'win');
  const lost = [v0[0] - c.sides[0].voice, v0[1] - c.sides[1].voice];
  const mine = lost[side], theirs = lost[1 - side];
  const outlook = theirs - mine >= 2 ? 'likely win' : mine - theirs >= 2 ? 'likely loss' : 'even';
  return {
    win: win ? (win.side === L ? 'lead' : 'answer') : 'tie',
    power: clash ? { lead: clash.power[L], answer: clash.power[1 - L] } : null,
    lost,
    falls: c.events.filter((e) => e.t === 'fall').map((e) => ({ side: e.side, id: e.id })),
    triggers: [...new Set(c.events.filter((e) => e.t === 'ability').map((e) => `${CARDS[e.id].name.split(' ')[0]}: ${e.name}`))],
    outlook,
  };
}
