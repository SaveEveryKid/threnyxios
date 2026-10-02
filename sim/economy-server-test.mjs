// Runs supabase/functions/economy/index.ts (the deployed bundle) in Node
// against an in-memory stand-in for Supabase. Usage: node sim/economy-server-test.mjs
import { db, loadFunction } from './fake-supabase.mjs';
import { freshVault } from '../engine/economy.js';
import { grant } from '../engine/collection.js';

const call = await loadFunction('economy');
const assert = (ok, msg) => {
  if (!ok) {
    console.error('✗', msg);
    process.exit(1);
  } else console.log('✓', msg);
};

const U = 'user-1';
// what this device had before the server owned it: a collection, 1,000 Chimes
// from purchases the old game already added, and an inflated 99,999 more
const save = { ...freshVault(Date.now() - 30 * 86400000), onboard: 'done', octaves: [{ cards: [] }] };
for (const id of ['hadric', 'tamsin', 'pip']) grant(save.profile, id);
save.profile.chimes = 100999;
save.profile.tickets.standard = 3;
db.purchases.push({ id: 'cs_old1', user_id: U, product: 'chimes500', amount_cents: 499, claimed_at: '2026-09-30T19:00:00Z' }, { id: 'cs_old2', user_id: U, product: 'chimes500', amount_cents: 499, claimed_at: '2026-09-30T19:02:00Z' });

db.alliance_claims.push({ alliance_id: 'a1', week: 202639, user_id: U, tier: 1 }); // claimed before the vault existed
assert((await call('', { action: 'vault' })).error === 'Sign in first.', 'signed out: refused');
let r = await call(U, { action: 'vault', save });
assert(r.vault?.profile?.copies?.hadric?.length === 1, 'first sign-in: the collection comes across');
assert(r.vault.profile.chimes === 1000, 'Chimes capped at what was actually bought (1000)');
assert(r.vault.econ.credited.length === 2, 'purchases the old game already added are remembered');
assert(r.purchases.length === 0 && r.alliance.length === 0, 'and neither they nor earlier Alliance chests are paid again');
assert(db.vaults.length === 1, 'one vault row');

// a second 'vault' call never re-imports (a later, richer save can't overwrite it)
r = await call(U, { action: 'vault', save: { ...save, profile: { ...save.profile, chimes: 5000 } } });
assert(r.vault.profile.chimes === 1000, 'the vault is created once; later saves are ignored');

// actions run on the server's copy
r = await call(U, { action: 'act', name: 'openPack', args: { type: 'standard' } });
assert(r.result?.cards?.length === 3, 'a pack opened by the server');
const charges = r.vault.free.charges;
r = await call(U, { action: 'act', name: 'buyOffer', args: { offer: 'standard10' } });
assert(r.vault.profile.chimes === 100 && r.vault.profile.tickets.standard === 13, 'Chimes spent on the server: 1000 - 900, +10 tickets');
r = await call(U, { action: 'act', name: 'buyOffer', args: { offer: 'standard10' } });
assert(r.error && /more Chimes/.test(r.error) && r.vault.profile.chimes === 100, 'can’t afford it: refused, vault unchanged');
r = await call(U, { action: 'act', name: 'grantPurchases', args: { products: ['chimes6500'] } });
assert(r.error === 'Not allowed.', 'the game can’t grant itself purchases');
r = await call(U, { action: 'act', name: 'allianceChest', args: { week: 1, tier: 3, reward: { collector: 50 } } });
assert(r.error === 'Not allowed.', 'or Alliance chests');
r = await call(U, { action: 'act', name: 'matchEnd', args: { mode: 'ladder', won: true, fought: ['hadric', 'notmine'], opp: 'Marrow', persona: 'marrow', round: 5 } });
assert(r.result && db.vaults[0].data.profile.items[db.vaults[0].data.profile.copies.hadric[0]].stats.battles === 1, 'a match result is recorded on the copy');
r = await call(U, { action: 'act', name: 'matchEnd', args: { mode: 'ladder', won: true } });
assert(/Too soon/.test(r.error), 'match results can’t be spammed');

// a new purchase (the Stripe webhook wrote it): collected once, marked claimed
db.purchases.push({ id: 'cs_new', user_id: U, product: 'chimes1100', amount_cents: 999, claimed_at: null });
r = await call(U, { action: 'vault' });
assert(r.purchases.length === 1 && r.vault.profile.chimes === 1200, 'a new purchase lands in the vault (+1,100)');
assert(db.purchases.find((p) => p.id === 'cs_new').claimed_at, 'and is marked claimed');
db.purchases.find((p) => p.id === 'cs_new').claimed_at = null; // as if marking it had failed
r = await call(U, { action: 'vault' });
assert(r.purchases.length === 0 && r.vault.profile.chimes === 1200, 'even unmarked, it never pays twice');

// Alliance chest tiers claimed in the database pay into the vault once
db.alliance_claims.push({ alliance_id: 'a1', week: 202640, user_id: U, tier: 2 });
const before = r.vault.profile.tickets.standard;
r = await call(U, { action: 'vault' });
assert(r.alliance.length === 1 && r.vault.profile.tickets.standard === before + 2, 'an Alliance chest tier pays its packs');
r = await call(U, { action: 'vault' });
assert(r.alliance.length === 0 && r.vault.profile.tickets.standard === before + 2, 'once');
assert(typeof charges === 'number', 'free packs tracked on the server');

// online results come from the match itself, never the player's word
const vrow = () => db.vaults.find((v) => v.user_id === U);
const ready = () => (vrow().data.econ.lastMatch = 0);
db.pvp_matches.push({ id: 'm-won', a: U, b: 'someone', status: 'over', data: { winner: 0 } });
db.pvp_matches.push({ id: 'm-lost', a: U, b: 'someone', status: 'over', data: { winner: 1 } });
const t0 = vrow().data.profile.tickets.collector || 0;
ready();
r = await call(U, { action: 'act', name: 'matchEnd', args: { mode: 'pvp', match: 'm-won', won: true, fought: [] } });
assert(!r.error && r.result.rewards.some(([k]) => /First online win/.test(k)) && r.vault.profile.tickets.collector === t0 + 1, 'first online win of the day: a Collector Pack Ticket');
ready();
r = await call(U, { action: 'act', name: 'matchEnd', args: { mode: 'pvp', match: 'm-won', won: true, fought: [] } });
assert(/Already counted/.test(r.error), 'an online win pays once');
ready();
r = await call(U, { action: 'act', name: 'matchEnd', args: { mode: 'pvp', match: 'm-lost', won: true, fought: [] } });
assert(!r.error && !r.result.rewards.some(([k]) => /online win/i.test(k)) && r.vault.econ.pvpStreak === 0, 'claiming a lost match as a win earns nothing');
ready();
r = await call(U, { action: 'act', name: 'matchEnd', args: { mode: 'pvp', match: 'made-up', won: true, pvp: { id: 'made-up', ranked: true }, fought: [] } });
assert(!r.error && !r.result.rewards.some(([k]) => /online/i.test(k)), 'a made-up online match earns no online rewards');
console.log('economy server: all checks passed');
