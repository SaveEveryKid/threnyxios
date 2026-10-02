// Kit DSL for the Reckoning. Card abilities are declared as data:
//
// kit = {
//   name: 'Imperial Decree',
//   power:  [ { n, if?, per?, max? } ],             // +Power to this Champion's Order
//   aura:   [ { n, to, if?, order? } ],             // +Power to allies while this is in play
//   reveal | hit | voice | fall | allyFall | enemyFall | roundEnd | readHit | readMiss:
//           [ { op, ...args, if? } ],               // triggered effects
//   flags:  { readImmune?: true },
// }
//
// Conditions are compact strings, joined with '&':
//   'order:strike' 'oppOrder:guard' 'lowest' 'highest' 'round>=4' 'first'
//   'behind' 'ahead' 'wonLast' 'lostLast' 'allyFellLast' 'opposed' 'unopposed'
//   'hurt' 'warded' 'focused' 'read' 'readHit' 'oppRead' 'oppFocus'
//   'initiative' 'facingFaction:vigil' 'facingTrait:Knight' 'facingAlign:Villainous'
//   'bond:aurelle' 'bondIn:aurelle' 'bondFallen:hadric' 'lowVoice'
//   and any count compared: 'fallen>=2', 'alliesTrait:Knight>=1', 'focusHeld<=1'
// Counts ('per'): fallen, fallenTrait:X, fallenFaction:X, enemyFallen, allies,
//   alliesTrait:X, octaveTrait:X, focusHeld, focusUsed, oppFocusUsed, round,
//   streak, missingHp
//
// The same declaration generates the card's rules text (kitText), so what a
// card says and what it does can never drift apart.

import { ORDERS } from './orders.js';
import { LANES, damageUnit, healUnit, hurtVoice, healVoice, draw as drawCards } from './battle.js';
import { setKitCompiler, kitOf } from './kit.js';

let nameOf = (id) => id;
export function setKitNames(fn) {
  nameOf = fn;
}

const opp = (s) => 1 - s;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ORD = (o) => o.toUpperCase();
const FACTION = { crown: 'Ashen Crown', quiet: 'Quiet', hour: 'Hourwright', margin: 'Margin', vigil: 'Vigil' };
const PLURAL = { Child: 'Children', Sleepless: 'Sleepless', Unsung: 'Unsung', Knight: 'Knights', Machine: 'Machines', Silencer: 'Silencers', Mourner: 'Mourners', Assassin: 'Assassins', Royal: 'Royals', Tolled: 'Tolled', Vantaine: 'Vantaines', Spy: 'Spies', Deserter: 'Deserters' };
const plural = (t) => PLURAL[t] || t + 's';

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

const opposite = (c) => c.them.lanes[c.lane] || null;
const allies = (c) => c.me.lanes.filter((u) => u && u !== c.unit);
const alliesAll = (c) => c.me.lanes.filter(Boolean);
const adjacent = (c) => [c.lane - 1, c.lane + 1].filter((l) => l >= 0 && l < LANES).map((l) => c.me.lanes[l]).filter(Boolean);
const enemies = (c) => c.them.lanes.filter(Boolean);
const cardOf = (c, u) => c.cards[u.id];
const hasTrait = (card, t) => (card.traits || []).includes(t);
function printed(card) {
  return ORDERS.map((o) => [o, card.stats[o]]);
}
function lowestOrders(card) {
  const min = Math.min(...ORDERS.map((o) => card.stats[o]));
  return ORDERS.filter((o) => card.stats[o] === min);
}
function highestOrders(card) {
  const max = Math.max(...ORDERS.map((o) => card.stats[o]));
  return ORDERS.filter((o) => card.stats[o] === max);
}

// ---------------------------------------------------------------------------
// Values (conditions and counts)
// ---------------------------------------------------------------------------

const V = {
  order: (c, a) => c.unit.order === a,
  oppOrder: (c, a) => opposite(c)?.order === a,
  mirror: (c) => !!c.unit.order && opposite(c)?.order === c.unit.order,
  lowest: (c) => !!c.unit.order && lowestOrders(cardOf(c, c.unit)).length < 3 && lowestOrders(cardOf(c, c.unit)).includes(c.unit.order),
  highest: (c) => !!c.unit.order && highestOrders(cardOf(c, c.unit)).length < 3 && highestOrders(cardOf(c, c.unit)).includes(c.unit.order),
  round: (c) => c.state.round,
  first: (c) => c.state.round === 1,
  behind: (c) => c.me.voice < c.them.voice,
  ahead: (c) => c.me.voice > c.them.voice,
  wonLast: (c) => c.me.lastRound === 'won',
  lostLast: (c) => c.me.lastRound === 'lost',
  allyFellLast: (c) => (c.me.fellLast || 0) > 0,
  opposed: (c) => !!opposite(c),
  unopposed: (c) => !opposite(c),
  hurt: (c) => c.unit.hp < c.unit.maxHp,
  warded: (c) => c.unit.ward > 0,
  focused: (c) => !!c.unit.focused,
  read: (c) => !!c.me.readThisRound,
  readHit: (c) => c.me.readThisRound === 'hit',
  oppRead: (c) => !!c.them.readThisRound,
  oppFocus: (c) => !!c.them.focusThisRound,
  initiative: (c) => c.state.initiative === c.side,
  facingFaction: (c, a) => !!opposite(c) && cardOf(c, opposite(c)).faction === a,
  facingTrait: (c, a) => !!opposite(c) && hasTrait(cardOf(c, opposite(c)), a),
  facingAlign: (c, a) => !!opposite(c) && cardOf(c, opposite(c)).alignment === a,
  facing: (c, a) => opposite(c)?.id === a,
  bond: (c, a) => c.me.octave.includes(a),
  bondIn: (c, a) => c.me.lanes.some((u) => u && u.id === a),
  bondFallen: (c, a) => c.me.fallen.includes(a),
  lowVoice: (c) => c.me.voice <= 10,
  // counts
  fallen: (c) => c.me.fallen.length,
  fallenTrait: (c, a) => c.me.fallen.filter((id) => hasTrait(c.cards[id], a)).length,
  fallenFaction: (c, a) => c.me.fallen.filter((id) => c.cards[id].faction === a).length,
  enemyFallen: (c) => c.them.fallen.length,
  allies: (c) => allies(c).length,
  alliesTrait: (c, a) => allies(c).filter((u) => hasTrait(cardOf(c, u), a)).length,
  octaveTrait: (c, a) => c.me.octave.filter((id) => id !== c.unit.id && hasTrait(c.cards[id], a)).length,
  focusHeld: (c) => c.me.focus,
  focusUsed: (c) => c.me.stats.focusUsed,
  oppFocusUsed: (c) => c.them.stats.focusUsed,
  streak: (c) => c.me.streak || 0,
  missingHp: (c) => c.unit.maxHp - c.unit.hp,
};

function evalOne(expr, c) {
  const m = /^([A-Za-z]+)(?::([A-Za-z0-9]+))?(?:(>=|<=|=)(\d+))?$/.exec(expr);
  if (!m) throw new Error('bad condition ' + expr);
  const [, key, arg, cmp, num] = m;
  const f = V[key];
  if (!f) throw new Error('unknown value ' + key);
  const v = f(c, arg);
  if (!cmp) return typeof v === 'number' ? v > 0 : !!v;
  const n = +num;
  return cmp === '>=' ? v >= n : cmp === '<=' ? v <= n : v === n;
}
export function evalCond(expr, c) {
  if (!expr) return true;
  return expr.split('&').every((e) => evalOne(e.trim(), c));
}
function count(expr, c) {
  const m = /^([A-Za-z]+)(?::([A-Za-z0-9]+))?$/.exec(expr);
  return V[m[1]](c, m[2]);
}
function term(t, c) {
  if (!evalCond(t.if, c)) return 0;
  if (t.per) return Math.min(t.max ?? 99, t.n * count(t.per, c));
  return t.n;
}

// ---------------------------------------------------------------------------
// Targets and effects
// ---------------------------------------------------------------------------

function targetsOf(c, to) {
  switch (to) {
    case 'self':
      return [c.unit];
    case 'opposite':
      return opposite(c) ? [opposite(c)] : [];
    case 'enemies':
      return enemies(c);
    case 'randomEnemy': {
      const e = enemies(c);
      return e.length ? [e[Math.floor(c.rand() * e.length)]] : [];
    }
    case 'weakestEnemy': {
      const e = enemies(c).sort((a, b) => a.hp - b.hp);
      return e.length ? [e[0]] : [];
    }
    case 'strongestEnemy': {
      const e = enemies(c).sort((a, b) => b.hp - a.hp);
      return e.length ? [e[0]] : [];
    }
    case 'allies':
      return allies(c);
    case 'team':
      return alliesAll(c);
    case 'adjacent':
      return adjacent(c);
    case 'weakestAlly': {
      const a = alliesAll(c).filter((u) => u.hp > 0).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp);
      return a.length ? [a[0]] : [];
    }
    default:
      if (to && to.startsWith('trait:')) return allies(c).filter((u) => hasTrait(cardOf(c, u), to.slice(6)));
      throw new Error('unknown target ' + to);
  }
}

const OPS = {
  dmg: (c, e) => {
    if (e.to === 'voice') return hurtVoice(c.state, opp(c.side), e.n, 'ability');
    for (const u of targetsOf(c, e.to)) damageUnit(c.state, c.cards, u, e.n, 'ability');
  },
  heal: (c, e) => {
    if (e.to === 'voice') return healVoice(c.state, c.side, e.n);
    for (const u of targetsOf(c, e.to)) healUnit(c.state, u, e.n);
  },
  ward: (c, e) => {
    for (const u of targetsOf(c, e.to || 'self')) {
      u.ward += e.n;
      c.state.events.push({ t: 'ward', side: u.side, lane: c.state.p[u.side].lanes.indexOf(u), n: e.n, total: u.ward });
    }
  },
  buff: (c, e) => {
    const stats = e.stat === 'all' ? ORDERS : [e.stat];
    for (const u of targetsOf(c, e.to || 'self')) {
      for (const s of stats) (e.temp ? u.temp : u.buff)[s] += e.n;
      c.state.events.push({ t: 'buff', side: u.side, lane: c.state.p[u.side].lanes.indexOf(u), stat: e.stat, n: e.n, temp: !!e.temp });
    }
  },
  weaken: (c, e) => {
    const stats = e.stat === 'all' ? ORDERS : [e.stat];
    for (const u of targetsOf(c, e.to || 'opposite')) {
      for (const s of stats) (e.temp ? u.temp : u.buff)[s] -= e.n;
      c.state.events.push({ t: 'buff', side: u.side, lane: c.state.p[u.side].lanes.indexOf(u), stat: e.stat, n: -e.n, temp: !!e.temp });
    }
  },
  forbid: (c, e) => {
    const t = opposite(c);
    if (!t) return;
    const order = e.order === 'highest' ? highestOrders(cardOf(c, t))[0] : e.order;
    (t.tags.forbid ||= []).push(order);
    c.state.events.push({ t: 'forbid', side: t.side, lane: c.lane, order });
  },
  noRead: (c) => {
    c.them.noReadRound = true;
    c.state.events.push({ t: 'noRead', side: opp(c.side) });
  },
  noFocus: (c) => {
    c.them.noFocusRound = true;
    c.state.events.push({ t: 'noFocus', side: opp(c.side) });
  },
  gainFocus: (c, e) => {
    const n = Math.min(e.n, c.state.rules.focus - c.me.focus);
    if (n > 0) {
      c.me.focus += n;
      c.state.events.push({ t: 'focus', side: c.side, n });
    }
  },
  drainFocus: (c, e) => {
    const n = Math.min(e.n, c.them.focus);
    if (n > 0) {
      c.them.focus -= n;
      c.state.events.push({ t: 'focus', side: opp(c.side), n: -n });
    }
  },
  stealFocus: (c, e) => {
    const n = Math.min(e.n, c.them.focus, c.state.rules.focus - c.me.focus);
    if (n > 0) {
      c.them.focus -= n;
      c.me.focus += n;
      c.state.events.push({ t: 'focus', side: opp(c.side), n: -n }, { t: 'focus', side: c.side, n });
    }
  },
  gainRead: (c) => {
    if (c.me.reads > 0) return;
    c.me.reads = 1;
    c.state.events.push({ t: 'gainRead', side: c.side });
  },
  intel: (c, e) => {
    const hand = c.them.hand.slice();
    const shown = [];
    for (let i = 0; i < e.n && hand.length; i++) shown.push(hand.splice(Math.floor(c.rand() * hand.length), 1)[0]);
    if (shown.length) c.state.events.push({ t: 'intel', side: c.side, cards: shown });
  },
  revive: (c) => {
    const pool = c.me.fallen.filter((id) => id !== c.unit.id);
    if (!pool.length || c.me.hand.length >= c.state.rules.handMax) return;
    const id = pool[pool.length - 1];
    c.me.fallen.splice(c.me.fallen.lastIndexOf(id), 1);
    c.me.hand.push(id);
    c.state.events.push({ t: 'revive', side: c.side, card: id });
  },
  draw: (c, e) => drawCards(c.state, c.side, e.n),
  silence: (c) => {
    const t = opposite(c);
    if (!t) return;
    t.tags.silenced = true;
    c.state.events.push({ t: 'silence', side: t.side, lane: c.lane });
  },
  move: (c) => {
    // slip into an empty lane with nobody opposite (else any empty lane)
    const empty = [0, 1, 2].filter((l) => !c.me.lanes[l]);
    if (!empty.length) return;
    const open = empty.filter((l) => !c.them.lanes[l]);
    const to = (open.length ? open : empty)[0];
    c.me.lanes[c.lane] = null;
    c.me.lanes[to] = c.unit;
    c.state.events.push({ t: 'move', side: c.side, from: c.lane, to });
  },
  drain: (c, e) => {
    hurtVoice(c.state, opp(c.side), e.n, 'ability');
    healVoice(c.state, c.side, e.n);
  },
  execute: (c, e) => {
    const t = opposite(c);
    if (t && t.hp <= e.n) damageUnit(c.state, c.cards, t, t.hp + t.ward, 'execute');
  },
};

function runEffects(list, c, hook, name) {
  let announced = false;
  for (const e of list) {
    if (!evalCond(e.if, c)) continue;
    if (!announced) {
      // lets the client show which ability fired, on which card, before its effects
      c.state.events.push({ t: 'ability', side: c.side, lane: c.lane, card: c.unit.id, name, hook });
      announced = true;
    }
    const f = OPS[e.op];
    if (!f) throw new Error('unknown op ' + e.op);
    f(c, e);
  }
}

// ---------------------------------------------------------------------------
// Compile
// ---------------------------------------------------------------------------

const HOOKS = ['reveal', 'hit', 'voice', 'fall', 'allyFall', 'enemyFall', 'roundEnd', 'readHit', 'readMiss'];

export function compileKit(kit) {
  const k = { flags: kit.flags || {} };
  if (kit.power) k.power = (c) => kit.power.reduce((a, t) => a + term(t, c), 0);
  if (kit.aura)
    k.aura = (c, u, lane) => {
      let n = 0;
      for (const a of kit.aura) {
        if (!evalCond(a.if, c)) continue;
        if (a.order && u.order !== a.order) continue;
        const ok =
          a.to === 'allies' ||
          (a.to === 'adjacent' && Math.abs(lane - c.lane) === 1) ||
          (a.to && a.to.startsWith('trait:') && hasTrait(c.cards[u.id], a.to.slice(6)));
        if (ok) n += a.n;
      }
      return n;
    };
  for (const h of HOOKS) if (kit[h]) k[h] = (c) => runEffects(kit[h], c, h, kit.name);
  return k;
}
setKitCompiler(compileKit);

// ---------------------------------------------------------------------------
// Rules text
// ---------------------------------------------------------------------------

const TARGET = {
  self: 'this Champion',
  opposite: 'the enemy opposite',
  enemies: 'every enemy Champion',
  randomEnemy: 'a random enemy Champion',
  weakestEnemy: 'the weakest enemy Champion',
  strongestEnemy: 'the healthiest enemy Champion',
  allies: 'your other Champions',
  team: 'your Champions',
  adjacent: 'Champions beside this',
  weakestAlly: 'your most wounded Champion',
};
const tgt = (to) => (to && to.startsWith('trait:') ? `your other ${plural(to.slice(6))}` : TARGET[to]);
const STAT = (s) => (s === 'all' ? 'all stats' : cap(s));

function condText(expr) {
  if (!expr) return '';
  return expr
    .split('&')
    .map((e) => {
      const m = /^([A-Za-z]+)(?::([A-Za-z0-9]+))?(?:(>=|<=|=)(\d+))?$/.exec(e.trim());
      const [, key, arg, cmp, num] = m;
      const n = +num;
      const cmpText = (what, one, many) => (cmp === '>=' ? (n === 1 ? `you have ${one}` : `you have ${n}+ ${many}`) : cmp === '<=' ? `you have ${n} or fewer ${many}` : `you have exactly ${n} ${many}`);
      switch (key) {
        case 'order': return `using ${ORD(arg)}`;
        case 'oppOrder': return `the enemy opposite uses ${ORD(arg)}`;
        case 'mirror': return 'both Champions in this lane use the same Order';
        case 'lowest': return 'using its lowest printed Order';
        case 'highest': return 'using its highest printed Order';
        case 'round': return cmp === '>=' ? `from round ${n}` : cmp === '<=' ? `until round ${n}` : `in round ${n}`;
        case 'first': return 'in round 1';
        case 'behind': return 'your Voice is lower';
        case 'ahead': return 'your Voice is higher';
        case 'wonLast': return 'you won the last round';
        case 'lostLast': return 'you lost the last round';
        case 'allyFellLast': return 'an ally fell last round';
        case 'opposed': return 'an enemy is opposite';
        case 'unopposed': return 'no enemy is opposite';
        case 'hurt': return 'wounded';
        case 'warded': return 'shielded';
        case 'focused': return 'Focused';
        case 'read': return 'you READ this round';
        case 'readHit': return 'your READ was correct';
        case 'oppRead': return 'your opponent READs this round';
        case 'oppFocus': return 'your opponent uses Focus';
        case 'initiative': return 'you hold Initiative';
        case 'facingFaction': return `facing ${article(FACTION[arg])} ${FACTION[arg]} Champion`;
        case 'facingTrait': return `facing ${article(arg)} ${arg}`;
        case 'facingAlign': return `facing ${article(arg)} ${arg} Champion`;
        case 'facing': return `facing ${nameOf(arg)}`;
        case 'bond': return `${nameOf(arg)} is in your Octave`;
        case 'bondIn': return `${nameOf(arg)} is in play`;
        case 'bondFallen': return `${nameOf(arg)} has fallen`;
        case 'lowVoice': return 'your Voice is 10 or less';
        case 'fallen': return cmp ? cmpText('fallen', 'a fallen ally', 'fallen allies') : 'an ally has fallen';
        case 'fallenTrait': return cmp ? cmpText('', `a fallen ${arg}`, `fallen ${plural(arg)}`) : `one of your ${plural(arg)} has fallen`;
        case 'enemyFallen': return 'an enemy has fallen';
        case 'allies': return cmp ? cmpText('', 'an ally in play', 'allies in play') : 'you have another Champion in play';
        case 'alliesTrait': return cmp ? cmpText('', `another ${arg} in play`, `other ${plural(arg)} in play`) : `another ${arg} is in play`;
        case 'focusHeld': return cmp === '<=' ? `you hold ${n} or less Focus` : `you hold ${n}+ Focus`;
        case 'streak': return `you have won ${n}+ rounds in a row`;
        default: return key;
      }
    })
    .join(' and ');
}
const article = (w) => (/^[AEIOU]/i.test(w || '') ? 'an' : 'a');
const COUNT = {
  fallen: 'fallen ally',
  enemyFallen: 'fallen enemy',
  allies: 'other Champion you have in play',
  focusHeld: 'Focus you hold',
  focusUsed: 'Focus you have used',
  oppFocusUsed: 'Focus your opponent has used',
  round: 'round played',
  streak: 'round in your winning streak',
  missingHp: 'missing health',
};
function countText(per) {
  const [k, a] = per.split(':');
  if (k === 'fallenTrait') return `fallen ${a}`;
  if (k === 'fallenFaction') return `fallen ${FACTION[a]} ally`;
  if (k === 'alliesTrait') return `other ${a} in play`;
  if (k === 'octaveTrait') return `other ${a} in your Octave`;
  return COUNT[k] || k;
}
// Conditions read naturally after a clause: 'when using STRIKE', 'from round 4',
// 'when facing a Knight', otherwise 'if ...' (several 'if' parts joined by 'and').
function condClause(expr) {
  if (!expr) return '';
  const whens = [], ifs = [];
  for (const part of expr.split('&')) {
    const t = condText(part);
    if (/^(using|facing|wounded|shielded|Focused)/.test(t)) whens.push(t === 'Focused' ? 'Focused' : t);
    else if (/^(from round|until round|in round)/.test(t)) whens.push(t);
    else ifs.push(t);
  }
  let out = '';
  if (whens.length) out += (/^(from|until|in) round/.test(whens[0]) ? '' : 'when ') + whens.join(' and ');
  if (ifs.length) out += (out ? ' if ' : 'if ') + ifs.join(' and ');
  return out;
}
function termText(t, what = 'Power') {
  let s = `+${t.n} ${what}`;
  if (t.per) s += ` for each ${countText(t.per)}${t.max ? ` (max +${t.max})` : ''}`;
  if (t.if) s += ' ' + condClause(t.if);
  return s + '.';
}
function effectText(e, shared = false) {
  const iff = e.if && !shared ? ` ${condClause(e.if)}` : '';
  switch (e.op) {
    case 'dmg': return e.to === 'voice' ? `deal ${e.n} damage to the enemy Voice${iff}` : `deal ${e.n} damage to ${tgt(e.to)}${iff}`;
    case 'heal': return e.to === 'voice' ? `restore ${e.n} of your Voice${iff}` : `heal ${tgt(e.to)} for ${e.n}${iff}`;
    case 'ward': return `give ${tgt(e.to || 'self')} a ${e.n} Shield${iff}`;
    case 'buff': return `${tgt(e.to || 'self')} ${e.to && e.to !== 'self' ? 'gain' : 'gains'} +${e.n} ${STAT(e.stat)}${e.temp ? ' this round' : ''}${iff}`;
    case 'weaken': return `${tgt(e.to || 'opposite')} ${e.to === 'enemies' ? 'lose' : 'loses'} ${e.n} ${STAT(e.stat)}${e.temp ? ' this round' : ''}${iff}`;
    case 'forbid': return `the enemy opposite can't use ${e.order === 'highest' ? 'its highest printed Order' : ORD(e.order)} this round${iff}`;
    case 'noFocus': return `your opponent can't use Focus this round${iff}`;
    case 'noRead': return `your opponent can't READ this round${iff}`;
    case 'gainFocus': return `gain ${e.n} Focus${iff}`;
    case 'drainFocus': return `your opponent loses ${e.n} Focus${iff}`;
    case 'stealFocus': return `take ${e.n} Focus from your opponent${iff}`;
    case 'gainRead': return `gain a READ if you have none${iff ? ' and' + iff.replace(/^ if/, '') : ''}`;
    case 'intel': return `reveal ${e.n === 1 ? 'a random card' : e.n + ' random cards'} in your opponent's hand${iff}`;
    case 'revive': return `return your last fallen Champion to your hand${iff}`;
    case 'draw': return `draw ${e.n === 1 ? 'a card' : e.n + ' cards'}${iff}`;
    case 'silence': return `silence the enemy opposite (it loses its abilities)${iff}`;
    case 'move': return `move this Champion to an empty lane${iff}`;
    case 'drain': return `drain ${e.n} Voice from your opponent${iff}`;
    case 'execute': return `the enemy opposite falls if its health is ${e.n} or less${iff}`;
    default: return e.op;
  }
}
const HOOK_LABEL = {
  reveal: 'On Reveal',
  hit: 'On Hit',
  voice: 'When it hits the Voice',
  fall: 'Last Words',
  allyFall: 'When an ally falls',
  enemyFall: 'When an enemy falls',
  roundEnd: 'End of round',
  readHit: 'If your READ here is correct',
  readMiss: 'If your READ here misses',
};
function sentence(s) {
  return s[0].toUpperCase() + s.slice(1);
}

export function kitText(kit) {
  if (!kit) return '';
  const parts = [];
  for (const t of kit.power || []) parts.push(termText(t));
  for (const a of kit.aura || []) {
    const who = a.to === 'allies' ? 'Your other Champions' : a.to === 'adjacent' ? 'Champions beside this' : `Your other ${plural(a.to.slice(6))}`;
    parts.push(`${who} gain +${a.n} Power${a.order ? ` when using ${ORD(a.order)}` : ''}${a.if ? ' ' + condClause(a.if) : ''}.`);
  }
  for (const h of HOOKS) {
    if (!kit[h]) continue;
    const list = kit[h];
    // effects that share one condition read better with it up front
    const shared = list.length > 1 && list[0].if && list.every((e) => e.if === list[0].if);
    const label = shared ? `${HOOK_LABEL[h]}, ${condClause(list[0].if)}` : HOOK_LABEL[h];
    parts.push(`${label}: ${list.map((e, i) => (i ? effectText(e, shared) : sentence(effectText(e, shared)))).join('; ')}.`);
  }
  if (kit.flags?.readImmune) parts.push('READs against this Champion always miss.');
  return parts.join(' ');
}

export { kitOf };
