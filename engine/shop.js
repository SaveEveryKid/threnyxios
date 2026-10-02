// THE SHOP (docs/06 §9). Chimes are the premium currency: bought with real
// money (Stripe, through the Supabase functions in game/supabase/functions),
// spent here on packs. Nothing sold changes Power: packs only speed up a
// collection that free play also completes (docs/07 §2.6).
//
// Real-money prices are enforced on the server (supabase/functions/
// create-checkout); this table is what the shop shows and what a paid
// purchase grants when it is claimed.
import { grant } from './collection.js';

// spent with Chimes
export const OFFERS = [
  { id: 'standard1', name: 'Standard Pack', chimes: 120, packs: { standard: 1 } },
  { id: 'standard5', name: '5 Standard Packs', chimes: 500, packs: { standard: 5 }, tag: 'Save 17%' },
  { id: 'standard10', name: '10 Standard Packs', chimes: 900, packs: { standard: 10 }, tag: 'Save 25%' },
  { id: 'collector1', name: 'Collector Pack', chimes: 280, packs: { collector: 1 }, tag: '5 cards · Rare or better' },
  { id: 'faction1', name: 'Faction Pack', chimes: 150, packs: { faction: 1 } },
  { id: 'event1', name: 'Firstfall Pack', chimes: 150, packs: { event: 1 } },
  // one guaranteed Mythic (engine/collection.js openMythicPack); 3 a week so Mythics
  // stay special, and the first one ever is cheaper
  { id: 'mythic1', name: 'Mythic Pack', chimes: 800, firstChimes: 500, weekly: 3, packs: { mythic: 1 }, tag: '1 guaranteed Mythic' },
];

const DAY = 86400000;
/** This week's number: weeks start Monday 00:00 UTC. */
export const weekKey = (now = Date.now()) => Math.floor((Math.floor(now / DAY) + 3) / 7);
/** When the week resets (ms since the epoch). */
export const weekEnds = (now = Date.now()) => (weekKey(now) + 1) * 7 * DAY - 3 * DAY;
/** What an offer costs this player now (a first-time price, if it has one). */
export const offerPrice = (o, econ) => (o.firstChimes && !(econ?.firstBuys || []).includes(o.id) ? o.firstChimes : o.chimes);
/** How many more of a weekly-limited offer this player can buy this week (Infinity if no limit). */
export function weeklyLeft(o, econ, now = Date.now()) {
  if (!o.weekly) return Infinity;
  const w = econ?.weekly?.[o.id];
  return Math.max(0, o.weekly - (w && w.week === weekKey(now) ? w.n : 0));
}

// bought with real money (USD cents); `once`: one per account
export const PRODUCTS = [
  { id: 'starter', name: 'First Purchase Bundle', cents: 499, once: true, hidden: true, packs: { collector: 3, standard: 10 }, altArt: 'aurelle', blurb: '3 Collector + 10 Standard Packs and an Alt-Art Aurelle' },
  // first purchases: one each per account, priced to make the first buy easy (docs/13)
  { id: 'spark', name: 'First Spark', cents: 99, once: true, packs: { collector: 1 }, tag: 'One time', blurb: 'A Collector Pack: 5 cards, Rare or better' },
  { id: 'firstlight', name: 'First Light', cents: 199, once: true, packs: { collector: 1, standard: 2 }, chimes: 100, tag: 'One time · best value', blurb: '1 Collector + 2 Standard Packs and 100 Chimes' },
  // the Season Pass is off sale until Ranked Voice is live (voice needs its ID check switched on)
  { id: 'pass_firstfall', name: 'Firstfall Season Pass', cents: 1299, once: true, hidden: true, pass: 'firstfall', packs: { mythic: 1, collector: 2, standard: 5 }, blurb: '1 Mythic + 2 Collector + 5 Standard Packs · Ranked Voice until the season ends' },
  { id: 'chimes240', name: '240 Chimes', cents: 299, chimes: 240, blurb: 'Enough for 2 Standard Packs' },
  { id: 'chimes500', name: '500 Chimes', cents: 499, chimes: 500 },
  { id: 'chimes1100', name: '1,100 Chimes', cents: 999, chimes: 1100, tag: '+10%' },
  { id: 'chimes2400', name: '2,400 Chimes', cents: 1999, chimes: 2400, tag: '+20%' },
  { id: 'chimes6500', name: '6,500 Chimes', cents: 4999, chimes: 6500, tag: '+30%' },
];
// Season Passes: a pass is active from its purchase until its season ends.
// A pass runs from the day it's bought to the end of its season, whenever it's bought
// (the shop says so, with the date and the days left, before anyone pays).
export const PASSES = { firstfall: { product: 'pass_firstfall', ends: '2027-01-04T00:00:00Z' } };
/** Days left in a pass's season (rounded up), from `now`. */
export const passDaysLeft = (passId, now = Date.now()) => Math.max(0, Math.ceil((Date.parse(PASSES[passId].ends) - now) / 86400000));
/** Is a Season Pass active, given the products the player has bought? */
export function passActive(bought, now = Date.now()) {
  return Object.values(PASSES).some((p) => bought.includes(p.product) && now < Date.parse(p.ends));
}
export const price = (cents) => '$' + (cents / 100).toFixed(2);

/** Spend Chimes on an offer. Returns false if the player can't afford it. */
export function buyWithChimes(profile, offerId, cost) {
  const o = OFFERS.find((x) => x.id === offerId);
  cost ??= o?.chimes;
  if (!o || (profile.chimes || 0) < cost) return false;
  profile.chimes -= cost;
  for (const [k, n] of Object.entries(o.packs)) profile.tickets[k] = (profile.tickets[k] || 0) + n;
  return true;
}

/** Grant a paid purchase (once it has been confirmed and claimed). */
export function grantProduct(profile, productId, { now = Date.now() } = {}) {
  const p = PRODUCTS.find((x) => x.id === productId);
  if (!p) return null;
  if (p.chimes) profile.chimes = (profile.chimes || 0) + p.chimes;
  for (const [k, n] of Object.entries(p.packs || {})) profile.tickets[k] = (profile.tickets[k] || 0) + n;
  if (p.altArt) grant(profile, p.altArt, { now, treatment: 'altart', source: p.name });
  return p;
}
