// Oktoberfest through the real pvp function (in-memory Supabase): a month of
// qualifying, the top 8 into the finals, finals-only matchmaking, a champion.
// Usage: node sim/oktober-server-test.mjs
import { CARDS, LIST } from '../engine/cards/index.js';
import { OKTOBER } from '../engine/oktober.js';
import { db, loadFunction } from './fake-supabase.mjs';
import { freshVault } from '../engine/economy.js';

const realNow = Date.now;
let clock = Date.parse('2026-10-10T18:00:00Z');
Date.now = () => clock;
const call = await loadFunction('pvp');
const econ = await loadFunction('economy');
const assert = (ok, msg) => { if (!ok) { console.error('✗', msg); process.exit(1); } else console.log('✓', msg); };
const deck = (() => { const d = []; for (const c of LIST) if (d.length < 8 && !d.some((x) => CARDS[x].char === c.char)) d.push(c.id); return d; })();
const users = Array.from({ length: 10 }, (_, i) => `u${i}`);
for (const u of users) db.vaults.push({ user_id: u, version: 1, data: { profile: { copies: Object.fromEntries(deck.map((id) => [id, [u + id]])) } } });

// a ranked match between two players; `loser` resigns
async function ranked(a, b, loser, extra = {}) {
  assert((await call(a, { action: 'queue', deck, name: a.toUpperCase(), ...extra })).queued, `${a} queues`);
  const r = await call(b, { action: 'queue', deck, name: b.toUpperCase(), ...extra });
  if (!r.matched) return r;
  await call(loser, { action: 'resign', match: r.matched });
  return r;
}
// qualifying: u0 beats everyone, u1 beats u2..u9, and so on (u9 wins nothing)
for (let i = 0; i < users.length; i++) for (let j = i + 1; j < users.length && j <= i + 3; j++) await ranked(users[i], users[j], users[j]);
const pts = (u) => db.event_entries.find((e) => e.event === OKTOBER.id && e.user_id === u);
assert(pts('u0').points === 9 && pts('u0').wins === 3, `wins score 3 (u0: ${pts('u0').points})`);
assert(pts('u9').points === 3 && pts('u9').wins === 0, 'losses score 1 (u9 lost three)');
// the same pair over and over: only 3 count today
const u8 = pts('u8').points; // u8 already beat u9 once today
for (let k = 0; k < 3; k++) await ranked('u8', 'u9', 'u9');
assert(pts('u8').points === u8 + 2 * 3 && pts('u8').wins === 4, `the same opponent scores 3 times a day (u8: ${u8} → ${pts('u8').points})`);
// friendly matches don't score
const before = pts('u5').points;
const ch = await call('u5', { action: 'challenge', deck, name: 'U5' });
const jn = await call('u6', { action: 'join', code: ch.code, deck, name: 'U6' });
await call('u6', { action: 'resign', match: jn.matched });
assert(pts('u5').points === before, 'friendly matches don’t score');
let ok = await call('u3', { action: 'oktober' });
assert(ok.phase === 'qualifying' && ok.me.rank >= 1 && ok.top.length === 10 && ok.top.every((r, i) => !i || ok.top[i - 1].points >= r.points), `the board: you're #${ok.me.rank}, ${ok.players} players`);
assert((await call('u0', { action: 'queue', deck, name: 'U0', finals: true })).error, 'no finals queue during qualifying');

// ---- Oktoberfest Packs: points milestones, delivered on the next visit ----
const fresh = (u) => { const v = db.vaults.find((x) => x.user_id === u); v.data = { ...freshVault(clock), ...v.data, profile: { ...freshVault(clock).profile, ...v.data.profile, items: {} } }; };
const top = ok.top[0];
fresh(top.user_id);
const pk = await econ(top.user_id, { action: 'vault' });
const want = OKTOBER.packs.filter((m) => top.points >= m.at).reduce((a, m) => a + m.n, 0);
assert(want > 0 && pk.eventPacks?.[0]?.packs === want && pk.vault.profile.tickets.oktober === want, `${top.name} (${top.points} points) gets ${want} Oktoberfest Pack(s)`);
const pk2 = await econ(top.user_id, { action: 'vault' });
assert(!pk2.eventPacks?.length && pk2.vault.profile.tickets.oktober === want, 'and not again');

// ---- the finals: Halloween weekend ----
clock = Date.parse('2026-10-31T15:00:00Z');
ok = await call('u0', { action: 'oktober' });
assert(ok.phase === 'finals' && ok.finalists.length === 8 && ok.finalist, `8 finalists, seeded: ${ok.finalists.map((f) => f.name + '#' + f.seed).join(' ')}`);
const fin = ok.finalists.map((f) => f.user_id);
const outsider = users.find((u) => !fin.includes(u));
assert((await call(outsider, { action: 'queue', deck, name: 'X', finals: true })).error, 'a non-finalist can’t join the finals queue');
await call(outsider, { action: 'cancel' });
const lone = await call(fin[0], { action: 'queue', deck, name: 'F0', finals: true });
const rq = await call(outsider, { action: 'queue', deck, name: 'X' });
assert(lone.queued && rq.queued, 'a finalist waiting in the finals pool isn’t matched with ranked players');
await call(outsider, { action: 'cancel' });
const fm = await call(fin[1], { action: 'queue', deck, name: 'F1', finals: true });
assert(fm.matched && db.pvp_matches.find((m) => m.id === fm.matched).data.finals, 'two finalists meet in a finals match');
await call(fin[1], { action: 'resign', match: fm.matched });
const fr = (u) => db.event_entries.find((e) => e.event === OKTOBER.finalsId && e.user_id === u);
assert(fr(fin[0]).rating > 1000 && fr(fin[0]).wins === 1 && fr(fin[1]).rating < 1000, `finals ratings move (${fr(fin[0]).rating} / ${fr(fin[1]).rating})`);
for (let k = 0; k < 2; k++) await ranked(fin[0], fin[2 + k], fin[2 + k], { finals: true });
assert(fr(fin[0]).matches === 3, 'three finals matches played');

// ---- it's over ----
clock = Date.parse('2026-11-02T07:00:00Z');
ok = await call(outsider, { action: 'oktober' });
assert(ok.phase === 'over' && ok.champion?.user_id === fin[0], `the champion: ${ok.champion?.name}`);
// ---- the prize: delivered to the champion's vault on their next visit, once ----
for (const u of [fin[0], outsider]) {
  const v = db.vaults.find((x) => x.user_id === u);
  v.data = { ...freshVault(clock), ...v.data, profile: { ...freshVault(clock).profile, ...v.data.profile, items: {} } };
}
const other = await econ(outsider, { action: 'vault' });
assert(!other.awards?.length && !other.vault.profile.copies.eighthBell, 'nobody else gets the prize');
const won = await econ(fin[0], { action: 'vault' });
assert(won.awards?.[0]?.id === 'eighthBell' && won.vault.profile.copies.eighthBell?.length === 1, 'the champion receives The Eighth Bell');
const item = won.vault.profile.items[won.vault.profile.copies.eighthBell[0]];
assert(item.history.some((h) => /Oktoberfest 2026 Champion/.test(h.text)), `its history: "${item.history.at(-1).text}"`);
const again = await econ(fin[0], { action: 'vault' });
assert(!again.awards?.length && again.vault.profile.copies.eighthBell.length === 1, 'and only once');
Date.now = realNow;
console.log('oktoberfest server: all checks passed');
