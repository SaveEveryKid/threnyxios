// COLLECTION ENGINE — packs, odds, bad-luck protection, duplicate handling,
// Embers, crafting, Ascension and Legacy. Pure functions over a plain JSON
// profile so the same code runs in the client, the server, and simulation.
//
// Published odds live in ODDS below. They are the truth: there is no hidden
// weighting between free and paid Standard Packs.

import { nextRandom } from './rng.js';
import { CARDS } from './cards/index.js';

export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

// ---------------------------------------------------------------------------
// ODDS (per slot). Standard Pack = 2 open slots + 1 Rare-or-better slot.
// ---------------------------------------------------------------------------
export const ODDS = {
  // Tuned (October 2026) for a heavy free player (every free pack, a few hours
  // of Ranked a day): every Common in a week, Rare in two, Epic in three,
  // Legendary in about seven, all five Mythics owned in about seven, and fully
  // Ascended in about three months. Less play than that: packs speed it up.
  open: { common: 0.79, rare: 0.1704, epic: 0.0366, legendary: 0.0024, mythic: 0.0006 },
  rarePlus: { rare: 0.85, epic: 0.13, legendary: 0.017, mythic: 0.003 },
  epicPlus: { epic: 0.91, legendary: 0.075, mythic: 0.015 },
};

export const PACKS = {
  standard: { name: 'Standard Pack', slots: ['open', 'open', 'rarePlus'] },
  collector: { name: 'Collector Pack', slots: ['open', 'open', 'rarePlus', 'epicPlus', 'showcase'] },
  // Targeted packs use Standard slots over a filtered pool (faction, alignment...).
  faction: { name: 'Faction Pack', slots: ['open', 'open', 'rarePlus'] },
  event: { name: 'Firstfall Pack', slots: ['open', 'rarePlus', 'rarePlus'] },
  // Earned only in Oktoberfest 2026 (ranked points milestones): every card foil.
  oktober: { name: 'Oktoberfest 2026 Pack', slots: ['rarePlus', 'rarePlus', 'rarePlus', 'rarePlus', 'epicPlus'], treatment: 'foil', special: 'oktober' },
  // Sold for Chimes, a few a week (engine/shop.js): one guaranteed Mythic (openMythicPack).
  mythic: { name: 'Mythic Pack', slots: [], special: 'mythic' },
};

// THE OKTOBERFEST SET: five Champions in an Oktoberfest 2026 version (their
// own autumn painting, same Power). Only ever found in Oktoberfest Packs, as a
// bonus sixth card in OKTOBER_SET_CHANCE of packs; one you don't have yet first.
export const OKTOBER_SET = ['cassius', 'unrung', 'hourbell', 'vega', 'caska'];
export const OKTOBER_SET_CHANCE = 0.04;
export const hasOktober = (profile, cardId) => (profile.copies[cardId] || []).some((c) => profile.items[c]?.treatment === 'oktober');

// Showcase slot (Collector Packs): cosmetic treatment of the best card pulled.
// Foil 80.7%, Alt Art 19%, Immortal 0.3% (numbered, max 10,000 per card).
export const SHOWCASE = [
  ['immortal', 0.003],
  ['altart', 0.19],
  ['foil', 0.807],
];

// ---------------------------------------------------------------------------
// BAD-LUCK PROTECTION (disclosed)
//   Legendary-or-better: after 35 packs without one, each further pack adds
//   +3% to the Rare+ slot's Legendary chance; guaranteed by the 45th pack.
//   Mythic: after 115 packs without one, +1.2% per pack; guaranteed by the 140th.
// Counters are per profile, across all pack types, and shown in the UI.
// ---------------------------------------------------------------------------
export const PITY = {
  legendary: { soft: 35, hard: 45, step: 0.03 },
  mythic: { soft: 115, hard: 140, step: 0.012 },
};

// ---------------------------------------------------------------------------
// DUPLICATE PROTECTION
//   Legendary / Mythic: no duplicate until you own every card of that rarity.
//   Common / Rare / Epic: missing cards are 2x as likely as owned ones; cards
//   you already own 4+ copies of are 4x less likely than normal.
// Duplicates are still valuable (Ascension, trading, Embers).
// ---------------------------------------------------------------------------
export const DUPE_WEIGHT = { missing: 2, owned: 1, many: 0.25 };

// ---------------------------------------------------------------------------
// EMBERS (soft currency from burning copies) and crafting.
// ---------------------------------------------------------------------------
export const BURN = { common: 5, rare: 15, epic: 50, legendary: 250, mythic: 800 };
// Legendaries and Mythics: crafting only makes more copies of one you've pulled
// (for Ascension), never the first one, so pulling them stays the chase. That's
// where a heavy player's Embers go: Mythic Ascension.
export const CRAFT = { common: 50, rare: 150, epic: 500, legendary: 2000, mythic: 2800 };
export const CRAFT_OWN_FIRST = new Set(['legendary', 'mythic']);

// ---------------------------------------------------------------------------
// ASCENSION — duplicates evolve a card visually. Never affects Power.
//   Tier 1 Tempered  : +2 copies  (frame gains faction metalwork)
//   Tier 2 Radiant   : +4 copies  (animated light, name plate glow)
//   Tier 3 Ascended  : +8 copies  (living background, unique entrance, title)
// ---------------------------------------------------------------------------
export const ASCENSION = [
  { tier: 1, name: 'Tempered', copies: 2 },
  { tier: 2, name: 'Radiant', copies: 4 },
  { tier: 3, name: 'Ascended', copies: 8 },
];
// Mythics Ascend for fewer spares: 1, then 2, then 3 (6 in all; others take 14).
export const ASCENSION_COPIES = { mythic: [1, 2, 3] };
/** The next Ascension tier for a card (with its copy cost), or null when fully Ascended. */
export function ascTier(cardId, tier) {
  const t = ASCENSION[tier];
  if (!t) return null;
  const c = ASCENSION_COPIES[CARDS[cardId]?.rarity];
  return c ? { ...t, copies: c[tier] } : t;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export function newProfile(name = 'You', now = Date.now()) {
  return {
    name,
    created: now,
    embers: 0,
    chimes: 0,
    tickets: { standard: 0, collector: 0, faction: 0, event: 0, oktober: 0, mythic: 0 },
    pity: { legendary: 0, mythic: 0 },
    copies: {}, // cardId -> [copyId, ...]
    items: {}, // copyId -> Legacy record
    ascension: {}, // cardId -> tier
    nextCopy: 1,
    packsOpened: 0,
    log: [],
  };
}

export function owned(profile, cardId) {
  return (profile.copies[cardId] || []).length;
}

function rand01(rng) {
  return nextRandom(rng);
}

function pickFrom(weights, rng) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  let total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand01(rng) * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function rollRarity(slot, profile, rng) {
  const base = { ...ODDS[slot] };
  if (slot !== 'open') {
    // Pity applies to the guaranteed slot.
    const lp = PITY.legendary;
    const mp = PITY.mythic;
    if (profile.pity.mythic + 1 >= mp.hard) return 'mythic';
    if (profile.pity.legendary + 1 >= lp.hard) return rand01(rng) < (base.mythic / (base.legendary + base.mythic)) ? 'mythic' : 'legendary';
    const lBoost = Math.max(0, profile.pity.legendary + 1 - lp.soft) * lp.step;
    const mBoost = Math.max(0, profile.pity.mythic + 1 - mp.soft) * mp.step;
    base.legendary = (base.legendary || 0) + lBoost;
    base.mythic = (base.mythic || 0) + mBoost;
  }
  return pickFrom(base, rng);
}

function pickCard(rarity, pool, profile, rng) {
  const cands = pool.filter((c) => c.rarity === rarity);
  if (!cands.length) return null;
  const weights = {};
  if (rarity === 'legendary' || rarity === 'mythic') {
    const missing = cands.filter((c) => owned(profile, c.id) === 0);
    const use = missing.length ? missing : cands;
    for (const c of use) weights[c.id] = 1;
  } else {
    for (const c of cands) {
      const n = owned(profile, c.id);
      weights[c.id] = n === 0 ? DUPE_WEIGHT.missing : n >= 4 ? DUPE_WEIGHT.many : DUPE_WEIGHT.owned;
    }
  }
  return pickFrom(weights, rng);
}

// Open a pack. `pool` is the card list (already filtered for targeted packs).
// Returns { cards: [{cardId, rarity, copyId, treatment, isNew}], profile }.
export function openPack(profile0, type, pool, rng, { now = Date.now(), source = 'pack' } = {}) {
  const profile = JSON.parse(JSON.stringify(profile0));
  const def = PACKS[type];
  const pulls = [];
  let gotLeg = false;
  let gotMyth = false;
  for (const slot of def.slots) {
    if (slot === 'showcase') {
      // Cosmetic upgrade applied to one card of this pack (the best one).
      const treatment = pickFrom(Object.fromEntries(SHOWCASE), rng);
      const best = pulls.slice().sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity))[0];
      if (best) {
        best.treatment = treatment;
        profile.items[best.copyId].treatment = treatment;
        if (treatment === 'immortal') {
          profile.items[best.copyId].serial = 1 + Math.floor(rand01(rng) * 10000);
        }
      }
      continue;
    }
    const rarity = rollRarity(slot, profile, rng);
    const cardId = pickCard(rarity, pool, profile, rng);
    if (!cardId) continue;
    if (rarity === 'legendary' || rarity === 'mythic') gotLeg = true;
    if (rarity === 'mythic') gotMyth = true;
    const isNew = owned(profile, cardId) === 0;
    const copyId = grant(profile, cardId, { now, source: `${def.name}`, treatment: def.treatment || 'standard' });
    pulls.push({ cardId, rarity, copyId, treatment: def.treatment || 'standard', isNew });
  }
  // the Oktoberfest Set: a rare bonus card, revealed last
  let bonus = null;
  if (def.special === 'oktober' && rand01(rng) < OKTOBER_SET_CHANCE) {
    const missing = OKTOBER_SET.filter((id) => !hasOktober(profile, id));
    const from = missing.length ? missing : OKTOBER_SET;
    const cardId = from[Math.floor(rand01(rng) * from.length)];
    const isNew = !hasOktober(profile, cardId);
    const copyId = grant(profile, cardId, { now, source: 'Oktoberfest 2026 Pack', treatment: 'oktober', origin: 'Found in an Oktoberfest 2026 Pack. One of five.' });
    bonus = { cardId, rarity: 'legendary', copyId, treatment: 'oktober', isNew, special: true };
  }
  profile.pity.legendary = gotLeg ? 0 : profile.pity.legendary + 1;
  profile.pity.mythic = gotMyth ? 0 : profile.pity.mythic + 1;
  profile.packsOpened += 1;
  // Presentation order: build toward the best card last.
  pulls.sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
  if (bonus) pulls.push(bonus);
  return { cards: pulls, profile };
}

/**
 * A Mythic Pack: one Mythic, always. One you don't own yet first; once you own
 * all five, a plain copy of one that still needs copies to fully Ascend (equal
 * chance among them). Returns { profile, cards } like openPack.
 */
export function openMythicPack(profile0, pool, rng, { now = Date.now(), source = 'Mythic Pack' } = {}) {
  const profile = JSON.parse(JSON.stringify(profile0));
  const myths = pool.filter((c) => c.rarity === 'mythic' && !c.unique);
  let use = myths.filter((c) => !owned(profile, c.id));
  if (!use.length) use = myths.filter((c) => ascendSpares(profile, c.id) < sparesToMax(profile, c.id));
  if (!use.length) use = myths;
  const card = use[Math.min(use.length - 1, Math.floor(rand01(rng) * use.length))];
  const isNew = owned(profile, card.id) === 0;
  const copyId = grant(profile, card.id, { now, source, origin: 'Found in a Mythic Pack.' });
  profile.packsOpened = (profile.packsOpened || 0) + 1;
  return { profile, cards: [{ cardId: card.id, rarity: 'mythic', copyId, treatment: 'standard', isNew }] };
}

// ---------------------------------------------------------------------------
// LEGACY — every copy is an individual object with a history that travels
// with it when traded.
// ---------------------------------------------------------------------------
export function grant(profile, cardId, { now = Date.now(), source = 'pack', treatment = 'standard', origin = null, at = now } = {}) {
  const copyId = `${profile.name.slice(0, 3).toUpperCase()}-${cardId}-${profile.nextCopy++}`;
  (profile.copies[cardId] ||= []).push(copyId);
  profile.items[copyId] = {
    copyId,
    cardId,
    treatment,
    firstOwner: profile.name,
    acquired: now,
    source,
    owners: [{ name: profile.name, from: now }],
    stats: { battles: 0, clashWins: 0, readsHit: 0, finalsWon: 0, matchWins: 0, kills: 0, dealt: 0 },
    honors: [],
    // the copy's own story, oldest first; travels with it when traded
    history: [{ at, text: origin || originText(source) }],
  };
  return copyId;
}

function originText(source) {
  if (source === 'Crafted') return 'Forged from Embers.';
  if (/pack/i.test(source)) return `Pulled from a ${source}.`;
  return `Acquired: ${source}.`;
}

// Card history: a short log of what this copy has been through.
// The first entry (its origin) is never dropped; the log keeps the latest 40.
export const HISTORY_MAX = 40;
export function addHistory(profile, copyId, text, at = Date.now()) {
  const it = profile.items[copyId];
  if (!it) return;
  const h = (it.history ||= [{ at: it.acquired, text: originText(it.source) }]);
  h.push({ at, text });
  if (h.length > HISTORY_MAX) h.splice(1, h.length - HISTORY_MAX);
}

// ---------------------------------------------------------------------------
// SPOILS — the winner of a match takes a card. Published odds; no pity, so
// packs remain the reliable road to Legendaries and Mythics. The first
// SPOILS_PER_DAY wins each day drop a card; after that, wins pay Embers.
// `boost` (0..1) rises with the opponent's skill and clutch wins, and only
// lifts the Epic-and-up odds.
// ---------------------------------------------------------------------------
export const SPOILS_ODDS = { common: 0.7425, rare: 0.21, epic: 0.045, legendary: 0.0022, mythic: 0.0003 };
export const SPOILS_PER_DAY = 5;
export const SPOILS_EMBERS = { capped: 15, loss: 5 };

export function spoilsOdds(boost = 0) {
  const b = Math.max(0, Math.min(1, boost));
  const o = { ...SPOILS_ODDS, epic: SPOILS_ODDS.epic * (1 + b * 0.5), legendary: SPOILS_ODDS.legendary * (1 + b), mythic: SPOILS_ODDS.mythic * (1 + b) };
  o.common = 1 - o.rare - o.epic - o.legendary - o.mythic;
  return o;
}

export function rollSpoils(profile0, pool, rng, { now = Date.now(), boost = 0, source = 'Spoils', origin = null } = {}) {
  const profile = JSON.parse(JSON.stringify(profile0));
  const rarity = pickFrom(spoilsOdds(boost), rng);
  const cardId = pickCard(rarity, pool, profile, rng) || pickCard('common', pool, profile, rng);
  const isNew = owned(profile, cardId) === 0;
  const copyId = grant(profile, cardId, { now, source, origin });
  return { profile, cardId, rarity: pool.find((c) => c.id === cardId)?.rarity || rarity, copyId, isNew };
}

export function recordBattle(profile, copyId, { clashes = 0, clashWins = 0, readsHit = 0, finalWon = false, matchWon = false, kills = 0, dealt = 0 } = {}) {
  const it = profile.items[copyId];
  if (!it) return;
  it.stats.kills = (it.stats.kills || 0) + kills;
  it.stats.dealt = (it.stats.dealt || 0) + dealt;
  it.stats.battles += clashes > 0 ? 1 : 0;
  it.stats.clashWins += clashWins;
  it.stats.readsHit += readsHit;
  if (finalWon) it.stats.finalsWon += 1;
  if (matchWon) it.stats.matchWins += 1;
}

export function burn(profile0, copyId, rarityOf) {
  const profile = JSON.parse(JSON.stringify(profile0));
  const it = profile.items[copyId];
  if (!it) throw new Error('No such copy');
  if (it.treatment === 'immortal') throw new Error('Immortals cannot be burned');
  const cardId = it.cardId;
  profile.copies[cardId] = profile.copies[cardId].filter((c) => c !== copyId);
  delete profile.items[copyId];
  profile.embers += BURN[rarityOf(cardId)];
  return profile;
}

export function craft(profile0, cardId, rarity, now = Date.now()) {
  const cost = CRAFT[rarity];
  if (profile0.embers < cost) throw new Error('Not enough Embers');
  const profile = JSON.parse(JSON.stringify(profile0));
  profile.embers -= cost;
  grant(profile, cardId, { now, source: 'Crafted' });
  return profile;
}

// Ascension spends spare copies: plain ones first, then Foils (a Collector Pack
// turns its best card Foil, so a paid-for Mythic still counts). Alt Art, Immortal
// and Oktoberfest copies are never spent.
export const SPARE_TREATMENTS = ['standard', 'foil'];
const spareList = (profile, cardId) =>
  (profile.copies[cardId] || [])
    .slice(1)
    .filter((c) => SPARE_TREATMENTS.includes(profile.items[c]?.treatment))
    .sort((a, b) => SPARE_TREATMENTS.indexOf(profile.items[a].treatment) - SPARE_TREATMENTS.indexOf(profile.items[b].treatment));
/** Spare copies Ascension can spend: copies beyond the one you keep (plain, then Foil). */
export function ascendSpares(profile, cardId) {
  return spareList(profile, cardId).length;
}
/** Spare copies still needed to fully Ascend a card from its current tier. */
export function sparesToMax(profile, cardId) {
  let n = 0;
  for (let t = profile.ascension?.[cardId] || 0; ascTier(cardId, t); t++) n += ascTier(cardId, t).copies;
  return n;
}
/** Every owned card that can still Ascend: { id, tier, next, spare, ready }, ready ones first. */
export function ascendList(profile) {
  const out = [];
  for (const id of Object.keys(profile.copies || {})) {
    if (!profile.copies[id]?.length) continue;
    const tier = profile.ascension?.[id] || 0;
    const next = ascTier(id, tier);
    if (!next) continue;
    const spare = ascendSpares(profile, id);
    out.push({ id, tier, next, spare, ready: spare >= next.copies });
  }
  return out.sort((a, b) => b.ready - a.ready || b.spare / b.next.copies - a.spare / a.next.copies);
}

// Ascend: consumes duplicate copies (never the one you keep: the oldest copy,
// with the longest Legacy, is always preserved).
export function ascend(profile0, cardId) {
  const profile = JSON.parse(JSON.stringify(profile0));
  const tier = profile.ascension[cardId] || 0;
  const next = ascTier(cardId, tier);
  if (!next) throw new Error('Already fully Ascended');
  const copies = profile.copies[cardId] || [];
  const spare = spareList(profile, cardId);
  if (spare.length < next.copies) throw new Error(`Need ${next.copies} spare copies`);
  const used = spare.slice(0, next.copies);
  profile.copies[cardId] = copies.filter((c) => !used.includes(c));
  for (const c of used) delete profile.items[c];
  profile.ascension[cardId] = next.tier;
  return profile;
}

// ---------------------------------------------------------------------------
// TRADING — both sides' offers are copy ids; Legacy moves with the copy.
// Safeguards are enforced by validateTrade (server-authoritative in PvP).
// ---------------------------------------------------------------------------
export const TRADE_RULES = {
  minAccountDays: 7,
  minMatches: 20,
  dailyTrades: 5,
  // Seals: each trade costs Embers by the highest rarity included, paid by
  // both sides. Makes laundering through alt accounts expensive, keeps
  // honest trading cheap.
  sealCost: { common: 0, rare: 10, epic: 40, legendary: 150, mythic: 400, immortal: 800 },
  newCopyLockHours: 48, // freshly opened copies can't be traded for 48h
  reviewWindowSeconds: 10, // both players must hold "Confirm" after the final change
  maxValueImbalance: null, // no forced fairness: gifts and bad deals are allowed
};

export function tradeSeal(items, rarityOf) {
  let worst = 0;
  const costOf = (it) => (it.treatment === 'immortal' ? TRADE_RULES.sealCost.immortal : TRADE_RULES.sealCost[rarityOf(it.cardId)]);
  for (const it of items) worst = Math.max(worst, costOf(it));
  return worst;
}

export function validateTrade(a, b, offerA, offerB, { now = Date.now(), tradesToday = [0, 0], matchesPlayed = [0, 0], rarityOf }) {
  const errs = [];
  const check = (p, offer, i) => {
    if ((now - p.created) / 86400000 < TRADE_RULES.minAccountDays) errs.push(`${p.name}: account younger than ${TRADE_RULES.minAccountDays} days`);
    if (matchesPlayed[i] < TRADE_RULES.minMatches) errs.push(`${p.name}: needs ${TRADE_RULES.minMatches} matches played`);
    if (tradesToday[i] >= TRADE_RULES.dailyTrades) errs.push(`${p.name}: daily trade limit reached`);
    for (const c of offer) {
      const it = p.items[c];
      if (!it) errs.push(`${p.name} does not own ${c}`);
      else if ((now - it.acquired) / 3600000 < TRADE_RULES.newCopyLockHours) errs.push(`${c} is newly acquired (48h trade lock)`);
    }
  };
  check(a, offerA, 0);
  check(b, offerB, 1);
  if (!offerA.length && !offerB.length) errs.push('Empty trade');
  const sealA = tradeSeal(offerA.map((c) => a.items[c]).filter(Boolean), rarityOf);
  const sealB = tradeSeal(offerB.map((c) => b.items[c]).filter(Boolean), rarityOf);
  const seal = Math.max(sealA, sealB);
  if (a.embers < seal) errs.push(`${a.name} needs ${seal} Embers for the trade seal`);
  if (b.embers < seal) errs.push(`${b.name} needs ${seal} Embers for the trade seal`);
  return { ok: errs.length === 0, errs, seal };
}

export function executeTrade(a0, b0, offerA, offerB, { now = Date.now(), seal = 0 } = {}) {
  const a = JSON.parse(JSON.stringify(a0));
  const b = JSON.parse(JSON.stringify(b0));
  const move = (from, to, copyId) => {
    const it = from.items[copyId];
    delete from.items[copyId];
    from.copies[it.cardId] = from.copies[it.cardId].filter((c) => c !== copyId);
    it.owners.push({ name: to.name, from: now });
    (it.history ||= []).push({ at: now, text: `Traded from ${from.name} to ${to.name}.` });
    to.items[copyId] = it;
    (to.copies[it.cardId] ||= []).push(copyId);
  };
  for (const c of offerA) move(a, b, c);
  for (const c of offerB) move(b, a, c);
  a.embers -= seal;
  b.embers -= seal;
  return { a, b };
}
