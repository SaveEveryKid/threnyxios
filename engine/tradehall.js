// THE TRADE HALL — the Meridian's traders: each week every trader holds six
// real copies (with invented but consistent histories) and wants three cards.
// Deterministic from the week number, so the game and the server agree on
// every trader's table, and the deal check (dealOk) is the same on both.
import { CARDS, LIST } from './cards/index.js';
import { makeRng } from './rng.js';

export const WEEK = 7 * 86400000;
export const VALUE = { common: 1, rare: 3, epic: 9, legendary: 30, mythic: 90 };
export const TRADERS = [
  { id: 'marek', name: 'Marek Soll', title: 'Clerk of Seals · Coda', temper: 1.0 },
  { id: 'ivo', name: 'Ivo Marrow', title: 'Name-Seller · Scrawl', temper: 1.15 },
  { id: 'lark', name: 'Lark Ferro', title: 'Canal Runner · Carillon', temper: 0.95 },
  { id: 'bastian', name: 'Bastian Crowe', title: 'Scavenger · the Ashfields', temper: 1.05 },
];
const NAMES = ['Vesper Ruel', 'Kess the Quick', 'Oren Halewright', 'Sister Quince', 'Tallow-Jack', 'Marrow', 'The Archivist', 'Dunmore Ash', 'Ilka Venn', 'Petronel', 'Hask', 'Old Sorrow'];
const PLACES = ['the Stillhouse', 'Carillon Canal', 'the Ashfields', 'Lanternfast', 'Cinderhold', 'the Margin bridges'];

export const weekOf = (now = Date.now()) => Math.floor(now / WEEK);

/** One trader's table for a week: { items: [copy records], wants: [cardId x3] }. */
export function stock(trader, week) {
  const rand = makeRng((week * 2654435761 + trader.id.charCodeAt(0) * 97) >>> 0);
  const pick = (pool) => pool[Math.floor(rand() * pool.length)];
  const byR = (r) => LIST.filter((c) => c.rarity === r);
  const plan = ['common', 'common', 'rare', 'rare', 'epic', rand() < 0.5 ? 'legendary' : 'epic'];
  if (rand() < 0.12) plan[5] = 'mythic';
  const start = week * WEEK; // histories are dated from the week, so they never differ between devices
  const items = plan.map((r, i) => {
    const c = pick(byR(r));
    const owners = [];
    const n = 1 + Math.floor(rand() * 4);
    let t = start - (60 + rand() * 300) * 86400000;
    for (let k = 0; k < n; k++) {
      owners.push({ name: k === n - 1 ? trader.name : pick(NAMES), from: Math.round(t) });
      t += rand() * 40 * 86400000;
    }
    const battles = Math.floor(rand() * rand() * 4500);
    const source = pick(['Standard Pack', 'Collector Pack', 'Firstfall Pack', 'Crafted', 'Spoils']);
    const history = [{ at: owners[0].from, text: source === 'Spoils' ? `Taken as Spoils from ${pick(NAMES)} at ${pick(PLACES)}.` : source === 'Crafted' ? 'Forged from Embers.' : `Pulled from a ${source}.` }];
    owners.forEach((o, k) => {
      if (k > 0) history.push({ at: o.from, text: `Traded from ${owners[k - 1].name} to ${o.name}.` });
      if (rand() < 0.6 && battles > 40) history.push({ at: Math.round(o.from + rand() * 20 * 86400000), text: pick([`Felled ${2 + Math.floor(rand() * 2)} Champions against ${pick(NAMES)} at ${pick(PLACES)}.`, `Landed a ${8 + Math.floor(rand() * 5)}-damage blow against ${pick(NAMES)}.`, `Held the line in a win from the brink against ${pick(NAMES)}.`, `Still standing on 1 health at the end against ${pick(NAMES)}.`]) });
    });
    for (const m of [10, 25, 50, 100, 250, 500]) if (battles >= m && rand() < 0.35) history.push({ at: owners[owners.length - 1].from, text: `${m} Clashes fought.` });
    history.sort((a, b) => a.at - b.at);
    return {
      copyId: `${trader.id.toUpperCase()}-${c.id}-${week}-${i}`,
      cardId: c.id,
      treatment: rand() < 0.08 ? 'foil' : 'standard',
      firstOwner: owners[0].name,
      acquired: owners[0].from,
      source,
      owners,
      history,
      stats: { battles, kills: Math.floor(battles * rand() * 0.9), clashWins: Math.floor(battles * (0.45 + rand() * 0.2)), readsHit: Math.floor(battles * rand() * 0.12), finalsWon: Math.floor(battles * rand() * 0.08), matchWins: Math.floor(battles * 0.5) },
      honors: rand() < 0.15 ? [pick(['Firstfall Claims Finalist', 'Rival Decider', 'Broke the Rest'])] : [],
    };
  });
  const wants = [];
  while (wants.length < 3) {
    const c = pick(LIST.filter((x) => x.rarity !== 'mythic'));
    if (!wants.includes(c.id)) wants.push(c.id);
  }
  return { items, wants };
}

/** This week's hall: { week, traders: { id: table }, done: {} }. */
export const freshHall = (week) => ({ week, traders: Object.fromEntries(TRADERS.map((t) => [t.id, stock(t, week)])), done: {} });

/** What a trader thinks a copy is worth (more if it's a card they want). */
export function tradeValue(it, wants = []) {
  const base = VALUE[CARDS[it.cardId].rarity] * (it.treatment === 'foil' ? 1.4 : it.treatment === 'altart' ? 2 : it.treatment === 'oktober' ? 8 : it.treatment === 'immortal' ? 20 : 1);
  const legacy = 1 + Math.min(0.5, (it.stats?.battles || 0) / 8000) + (it.honors?.length ? 0.25 : 0);
  return base * legacy * (wants.includes(it.cardId) ? 1.6 : 1);
}

/** The deal: what you give must be worth at least 95% of what you get (after the trader's temper). */
export function dealValues(trader, table, give, get) {
  const vGive = give.reduce((a, it) => a + tradeValue(it, table.wants), 0);
  const vGet = get.reduce((a, it) => a + tradeValue(it, []), 0) * trader.temper;
  return { vGive, vGet, ok: give.length > 0 && get.length > 0 && vGive >= vGet * 0.95 };
}
