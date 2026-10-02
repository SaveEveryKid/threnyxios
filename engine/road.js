// THE LONG ROAD — a single-player run. Take your Octave down a road of nine
// stops toward the Archivist. Each stop offers two ways forward: a duel, a
// hard duel, a fire to rest at, or a shrine. Wins pay a choice of three: a new
// Champion, an upgrade to one you carry, or a relic that bends the rules for
// the rest of the run. Three lives; a loss costs one and you walk on unpaid.
//
// Pure data and seeded choices, so a run survives a reload and tests can
// replay one. The battle itself takes the run's `mods` (see createDuel).
import { nextRandom } from './rng.js';

export const FLOORS = 9; // the last is the boss
export const LIVES = 3;
// who waits at each stop (persona ids, see client store); the boss is last
export const LADDER = ['marrow', 'kess', 'quince', 'tallowjack', 'vesper', 'hale'];
export const BOSS = 'archivist';

export const RELICS = {
  bellows: { name: 'Bellows of the Choir', text: 'Start every match with +4 Voice.', mod: { voice: 4 } },
  lens: { name: 'Cracked Lens', text: '+1 READ each match.', mod: { reads: 1 } },
  whetstone: { name: 'Whetstone', text: '+1 Focus each match.', mod: { focus: 1 } },
  sigil: { name: 'Storm Sigil', text: 'Your Focus gives +3, not +2.', mod: { focusPower: 1 } },
  aegis: { name: 'Aegis Bell', text: 'Your Champions block 1 damage in every duel.', mod: { shield: 1 } },
  blindfold: { name: 'Blindfold', text: 'You Lead the first duel of every match.', mod: { lead: true } },
  vanguard: { name: 'Vanguard Horn', text: 'Hold 4 Champions in hand, not 3.', mod: { hand: 1 } },
  banner: { name: 'Ember Banner', text: 'All your Champions +1 STRIKE.', all: { strike: 1 } },
  bulwark: { name: 'Bulwark Stone', text: 'All your Champions +1 GUARD.', all: { guard: 1 } },
  inkwell: { name: 'Bottomless Inkwell', text: 'All your Champions +1 Wound.', all: { scheme: 1 } },
  marrowbone: { name: 'Marrowbone', text: 'All your Champions +2 health.', all: { hp: 2 } },
};

// what a stop can be, weighted after the first
const KINDS = [['fight', 0.5], ['elite', 0.2], ['rest', 0.15], ['shrine', 0.15]];

const rand = (run) => nextRandom(run.rng);
const pick = (run, arr) => arr[Math.floor(rand(run) * arr.length)];
function weighted(run, pairs) {
  let x = rand(run) * pairs.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of pairs) if ((x -= w) <= 0) return k;
  return pairs[pairs.length - 1][0];
}

function makeMap(run) {
  const map = [];
  for (let f = 0; f < FLOORS - 1; f++) {
    const opts = [];
    for (let i = 0; i < 2; i++) {
      let kind = f === 0 ? 'fight' : weighted(run, KINDS);
      // two different roads where possible; never rest or shrine twice in a row
      if (i === 1 && kind === opts[0].kind && kind !== 'fight') kind = 'fight';
      opts.push({ kind, persona: LADDER[Math.min(LADDER.length - 1, Math.floor((f * LADDER.length) / (FLOORS - 1)) + (kind === 'elite' ? 1 : 0))] });
    }
    map.push(opts);
  }
  map.push([{ kind: 'boss', persona: BOSS }]);
  return map;
}

export function newRun(deck, seed = (Math.random() * 2 ** 31) | 0) {
  const run = { v: 1, seed, rng: { seed: seed >>> 0 || 1 }, floor: 0, lives: LIVES, deck: deck.slice(), buffs: {}, relics: [], path: [], pending: null, done: null, wins: 0, started: Date.now() };
  run.map = makeMap(run);
  return run;
}

/** The mods object createDuel takes for the player: relics + upgrades. */
export function playerMods(run) {
  const m = { buffs: {} };
  for (const id of run.deck) m.buffs[id] = { ...(run.buffs[id] || {}) };
  for (const r of run.relics) {
    const R = RELICS[r];
    for (const [k, v] of Object.entries(R.mod || {})) m[k] = typeof v === 'number' ? (m[k] || 0) + v : v;
    for (const id of run.deck) for (const [k, v] of Object.entries(R.all || {})) m.buffs[id][k] = (m.buffs[id][k] || 0) + v;
  }
  return m;
}

/** The enemy grows along the road; elites and the boss are stronger still. */
export function enemyMods(node, floor, theirDeck) {
  const m = { voice: floor >= 6 ? 4 : floor >= 3 ? 2 : 0, buffs: {} };
  let all = 0;
  if (node.kind === 'elite') (m.focus = 1), (all = 1);
  if (node.kind === 'boss') Object.assign(m, { voice: 6, focus: 1, reads: 1 }), (all = 1);
  if (all) for (const id of theirDeck) m.buffs[id] = { strike: all, guard: all, scheme: all };
  return m;
}

/** Choose one of the two stops on the current floor. */
export function choose(run, i) {
  const node = run.map[run.floor][i] ?? run.map[run.floor][0];
  run.path.push(i);
  run.at = node;
  return node;
}

// Champions not already carried, weighted by rarity (elites pay better).
function offerHero(run, cards, elite) {
  const W = elite ? { common: 0, rare: 3, epic: 4, legendary: 2, mythic: 0.4 } : { common: 3, rare: 4, epic: 2, legendary: 0.6, mythic: 0.1 };
  const pool = Object.values(cards).filter((c) => !run.deck.includes(c.id));
  const r = weighted(run, Object.entries(W));
  const of = pool.filter((c) => c.rarity === r);
  return pick(run, of.length ? of : pool).id;
}
const STATS = ['strike', 'guard', 'scheme'];
function offerUpgrade(run, elite) {
  const id = pick(run, run.deck);
  const stat = pick(run, [...STATS, 'hp']);
  return { id, stat, n: stat === 'hp' ? (elite ? 4 : 3) : elite ? 2 : 1 };
}
function offerRelic(run, n = 1) {
  const left = Object.keys(RELICS).filter((r) => !run.relics.includes(r));
  const out = [];
  while (out.length < n && left.length) out.push(left.splice(Math.floor(rand(run) * left.length), 1)[0]);
  return out;
}

/**
 * After a duel (or on reaching a rest or shrine) the run holds `pending`:
 * a list of choices. A win offers hero / upgrade / relic.
 */
export function afterDuel(run, won, cards) {
  const node = run.at;
  if (won) {
    run.wins++;
    if (node.kind === 'boss') {
      run.done = 'victory';
      run.pending = null;
      return run;
    }
    const elite = node.kind === 'elite';
    run.pending = [{ type: 'hero', id: offerHero(run, cards, elite) }, { type: 'upgrade', ...offerUpgrade(run, elite) }, ...offerRelic(run).map((id) => ({ type: 'relic', id }))];
    run.floor++;
    return run;
  }
  run.lives--;
  if (run.lives <= 0) {
    run.done = 'fallen';
    run.pending = null;
    return run;
  }
  // a lost boss is fought again; anywhere else you walk on, unpaid
  if (node.kind !== 'boss') run.floor++;
  else run.path.pop();
  run.pending = null;
  return run;
}

/** A rest or shrine offers its own choices at once. */
export function visit(run) {
  const node = run.at;
  if (node.kind === 'rest') run.pending = [{ type: 'life' }, { type: 'temper', id: pick(run, run.deck) }];
  else if (node.kind === 'shrine') run.pending = offerRelic(run, 2).map((id) => ({ type: 'relic', id }));
  if (!run.pending?.length) run.pending = [{ type: 'life' }];
  return run;
}

/** Take one pending choice. `swap` = the carried Champion a new hero replaces. */
export function take(run, i, swap = null) {
  const c = run.pending?.[i];
  if (!c) return run;
  if (c.type === 'hero') {
    const j = run.deck.indexOf(swap);
    if (j < 0) return run;
    run.deck[j] = c.id;
    delete run.buffs[swap];
  } else if (c.type === 'upgrade') {
    const b = (run.buffs[c.id] ||= {});
    b[c.stat] = (b[c.stat] || 0) + c.n;
  } else if (c.type === 'temper') {
    const b = (run.buffs[c.id] ||= {});
    for (const s of STATS) b[s] = (b[s] || 0) + 1;
    b.hp = (b.hp || 0) + 2;
  } else if (c.type === 'relic') run.relics.push(c.id);
  else if (c.type === 'life') run.lives = Math.min(LIVES, run.lives + 1);
  run.pending = null;
  if (run.at && (run.at.kind === 'rest' || run.at.kind === 'shrine')) run.floor++;
  return run;
}

/** What a finished run pays: Embers per stop reached, tickets for the boss. */
export function runRewards(run) {
  const clear = run.done === 'victory';
  return { embers: 20 * run.floor + 15 * run.wins, tickets: clear ? 3 : run.floor >= 6 ? 1 : 0, collector: clear ? 1 : 0, event: clear ? 1 : 0 };
}
