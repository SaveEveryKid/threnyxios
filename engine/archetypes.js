// ARCHETYPES AND BONDS — the deck styles of the Duel.
//
// Every Champion belongs to one or more archetypes, read from what it is
// (traits, class) and what its ability does (engine/kitdsl.js data). An Octave
// with BOND_AT or more Champions of one archetype is BONDED in it: in every
// duel, each bonded Champion fights with extra power (engine/duel.js).
//
//  · Every bonded Champion fights with +1. Rarer ones are the payoffs:
//    Legendaries and Mythics get +2 when Answering, and more in styles tuned up. That is the whole rarity edge
//    (measured: a commons-only Octave wins about 36% against the same style
//    built from every card; commons + rares about 40%; no Legendaries 48%).
//  · ARCH_TUNE (written by `node sim/archetypes.js --tune`) evens the styles
//    out: a style that loses too often gets a little more.
import TUNE from './data/arch-tune.js';

export const BOND_AT = 4;
// With the style's tune added, a whole number is the bonus both ways; a half
// is the next point up when Answering only (1.5: +1 Leading, +2 Answering).
export const BOND_POWER = { common: 1, rare: 1, epic: 1, legendary: 1.5, mythic: 1.5 };

const kitText = (c) => JSON.stringify(c.kit || {});
const has = (c, t) => (c.traits || []).includes(t);
const op = (c, ...ops) => ops.some((o) => kitText(c).includes(`"op":"${o}"`));
const cond = (c, ...cs) => ops2(c, cs);
function ops2(c, cs) {
  const t = kitText(c);
  return cs.some((x) => t.includes(`"if":"${x}`) || t.includes(`"if":"!${x}`));
}
const trig = (c, ...ts) => ts.some((k) => c.kit && k in c.kit);

export const ARCHETYPES = [
  { id: 'knights', name: 'Knights', text: 'Sworn swords who fight better side by side.', test: (c) => has(c, 'Knight') },
  { id: 'silencers', name: 'Silencers', text: 'Take away their best number and their abilities.', test: (c) => has(c, 'Silencer') || op(c, 'forbid', 'silence') },
  { id: 'unsung', name: 'The Unsung', text: 'The forgotten, who matter more the more of them there are.', test: (c) => has(c, 'Unsung') },
  { id: 'sleepless', name: 'The Sleepless', text: 'They will not stay down.', test: (c) => has(c, 'Sleepless') || op(c, 'revive') },
  { id: 'lastWords', name: 'Last Words', text: 'Every fall feeds the next fight.', test: (c) => has(c, 'Mourner') || has(c, 'Tolled') || trig(c, 'allyFall', 'enemyFall') || cond(c, 'allyFellLast', 'bondFallen') || /"per":"fallen/.test(kitText(c)) },
  { id: 'clockwork', name: 'Clockwork', text: 'Machines and their makers.', test: (c) => has(c, 'Machine') || c.cls === 'Artificer' },
  { id: 'court', name: 'The Court', text: 'Royals, their spies and their knives.', test: (c) => has(c, 'Royal') || has(c, 'Vantaine') || has(c, 'Spy') || has(c, 'Assassin') || has(c, 'Deserter') || cond(c, 'bond') },
  { id: 'children', name: 'Children', text: 'Small, brave, and never alone.', test: (c) => has(c, 'Child') },
  { id: 'readers', name: 'Readers', text: 'Extra READs, and payoffs for using them.', test: (c) => op(c, 'gainRead', 'intel') || trig(c, 'readHit', 'readMiss') || cond(c, 'read', 'readHit', 'oppRead') },
  { id: 'focus', name: 'Focus', text: 'More Focus, and Champions that love it.', test: (c) => op(c, 'gainFocus') || cond(c, 'focused', 'focusHeld', 'oppFocus') },
  { id: 'wardens', name: 'Wardens', text: 'Shields and healing: win the long game.', test: (c) => op(c, 'heal', 'revive') || /"op":"ward"[^}]*"to":"(allies|lowest|all)/.test(kitText(c)) },
  { id: 'momentum', name: 'Momentum', text: 'Hit first, keep hitting, come back from behind.', test: (c) => cond(c, 'wonLast', 'lostLast', 'behind', 'initiative', 'lowVoice') || (c.cls === 'Duelist' && c.stats.strike >= 6) },
];
const IDENTITY = ['knights', 'unsung', 'sleepless', 'children', 'court', 'clockwork', 'silencers', 'lastWords', 'readers', 'focus', 'wardens', 'momentum'];
export const ARCH = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a]));

const cache = new Map();
/** The archetypes a Champion belongs to (ids). */
export function archetypesOf(card) {
  if (!card) return [];
  let a = cache.get(card.id);
  if (!a) {
    // at most two: who it is (traits) before what it does (its ability)
    a = ARCHETYPES.filter((x) => x.test(card)).sort((x, y) => IDENTITY.indexOf(x.id) - IDENTITY.indexOf(y.id)).map((x) => x.id).slice(0, 2);
    // nobody left out: a Champion with no style takes its class's
    if (!a.length) a = [{ Duelist: 'momentum', Trickster: 'court', Sentinel: 'wardens', Seer: 'readers', Martyr: 'lastWords', Artificer: 'clockwork' }[card.cls] || 'momentum'];
    cache.set(card.id, a);
  }
  return a;
}

/** The Bonds an Octave makes: [{ id, n }] for every archetype with BOND_AT or more. */
export function bondsOf(ids, cards) {
  const n = {};
  for (const id of ids) for (const a of archetypesOf(cards[id])) n[a] = (n[a] || 0) + 1;
  return Object.entries(n).filter(([, k]) => k >= BOND_AT).map(([id, k]) => ({ id, n: k })).sort((x, y) => y.n - x.n);
}

/** A Champion's bonus in this Octave, { lead, answer } (its best Bond), or null. */
export function bondPower(id, ids, cards) {
  const c = cards[id];
  const base = BOND_POWER[c?.rarity] || 0;
  const mine = new Set(archetypesOf(c));
  let best = null;
  for (const b of bondsOf(ids, cards)) {
    if (!mine.has(b.id)) continue;
    const v = Math.max(0, base + (TUNE[b.id] || 0));
    const p = { lead: Math.floor(v), answer: Math.floor(v + 0.5), arch: b.id };
    if (!best || p.lead + p.answer > best.lead + best.answer) best = p;
  }
  return best && best.lead + best.answer > 0 ? best : null;
}

/** Every bonded Champion's bonus for one Octave: { id: { lead, answer, arch } }. */
export function bondMap(ids, cards) {
  const out = {};
  for (const id of ids) {
    const n = bondPower(id, ids, cards);
    if (n) out[id] = n;
  }
  return out;
}
