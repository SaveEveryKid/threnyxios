// Referrals and the share bonus, through the bundled economy function against
// the in-memory Supabase. Usage: node sim/referral-server-test.mjs
import { db, loadFunction, userCreated } from './fake-supabase.mjs';
import { freshVault } from '../engine/economy.js';
import { REFERRAL, SHARE_CHIMES } from '../engine/referral.js';

const call = await loadFunction('economy');
const assert = (ok, msg) => {
  if (!ok) {
    console.error('✗', msg);
    process.exit(1);
  } else console.log('✓', msg);
};
const DAY = 86400000;
const save = (trained = true) => ({ ...freshVault(Date.now()), onboard: trained ? 'done' : 'tut', octaves: [{ cards: [] }] });
let mid = 0;
// a finished ranked match between a and b, `daysAgo` days back; w = winner's id
const match = (a, b, w, daysAgo = 0, extra = {}) => {
  const at = new Date(Date.now() - daysAgo * DAY).toISOString();
  db.pvp_matches.push({ id: 'm' + ++mid, a, b, status: 'over', updated_at: at, created_at: at, data: { winner: w === a ? 0 : 1, friendly: false, echo: null, ...extra } });
};

const HOST = 'host';
userCreated[HOST] = new Date(Date.now() - 60 * DAY).toISOString();
let r = await call(HOST, { action: 'referral', op: 'status', save: save() });
const code = r.code;
assert(/^[A-Z2-9]{6}$/.test(code), `an invite code is made: ${code}`);
assert((await call(HOST, { action: 'referral', op: 'status' })).code === code, 'and stays the same');
assert(!r.canEnter, 'an account over a week old can’t enter a code');
assert(/first 7 days/.test((await call(HOST, { action: 'referral', op: 'enter', code: 'ABCDEF' })).error), '...and is told why');

// a new friend joins
const F = 'friend-1';
r = await call(F, { action: 'referral', op: 'status', save: save(false) });
assert(r.canEnter && !r.joinedWithCode, 'a new account can enter a code');
assert(/own code/.test((await call(F, { action: 'referral', op: 'enter', code: r.code })).error), 'not your own');
assert(/No one/.test((await call(F, { action: 'referral', op: 'enter', code: 'ZZZZZZ' })).error), 'a code nobody has is refused');
r = await call(F, { action: 'referral', op: 'enter', code: code.toLowerCase() + ' ' });
assert(r.joinedWithCode && !r.canEnter, 'joins with a friend’s code (any case, stray spaces)');
assert(/already/.test((await call(F, { action: 'referral', op: 'enter', code })).error), 'only once');
{
  // no swapping codes: Y invites Z, so Z can't then invite Y
  const y = await call('young-y', { action: 'referral', op: 'status', save: save() });
  const z = await call('young-z', { action: 'referral', op: 'enter', code: y.code, save: save() });
  assert(/invited them/.test((await call('young-y', { action: 'referral', op: 'enter', code: z.code })).error), 'no swapping codes');
}
assert(r.welcome === null, 'no welcome ticket before training is finished');
assert((await call(HOST, { action: 'referral', op: 'status' })).friends[0]?.counted === false, 'the inviter sees them, not counted yet');

// training done (the save's flag, through the real action) → welcome ticket once
db.vaults.find((v) => v.user_id === F).data.econ.trained = true;
r = await call(F, { action: 'vault' });
assert(r.welcome?.standard === 1, 'finished training: the welcome Pack Ticket');
assert((await call(F, { action: 'vault' })).welcome === null, '...once');

// a friend counts after 5 Duels (any kind) on a saved profile
const duels = (uid, n) => (db.vaults.find((v) => v.user_id === uid).data.econ.duels = n);
duels(F, REFERRAL.duels - 1);
r = await call(HOST, { action: 'referral', op: 'status' });
assert(!r.friends[0].counted && r.friends[0].duels === REFERRAL.duels - 1, `${REFERRAL.duels - 1} Duels: not yet`);
duels(F, REFERRAL.duels);
r = await call(HOST, { action: 'referral', op: 'status' });
assert(r.friends[0].counted && r.counted === 1, `${REFERRAL.duels} Duels: counts`);
assert(r.got?.newly === 1 && r.got.packs.standard === 1 && r.vault.profile.tickets.standard >= 1, 'the inviter gets a pack (never Chimes)');
assert((await call(HOST, { action: 'referral', op: 'status' })).got === null, '...once');
{
  // a friend still playing as a guest counts once they save their profile
  const G = 'guest-ref';
  await call(G, { action: 'vault', save: null });
  await call(G, { action: 'referral', op: 'enter', code });
  duels(G, 9);
  r = await call(HOST, { action: 'referral', op: 'status' });
  const g = r.friends.find((f) => f.guest);
  assert(g && !g.counted, 'a guest friend doesn’t count yet, however many Duels');
  const { users } = await import('./fake-supabase.mjs');
  users[G].app_metadata = { threnyx_account: true };
  r = await call(HOST, { action: 'referral', op: 'status' });
  assert(r.counted === 2, 'saved their profile: counts');
}

// 100 alts that really played: rewards stop at the cap
const before = { ...db.vaults.find((v) => v.user_id === HOST).data.profile.tickets };
for (let k = 0; k < 100; k++) {
  const A = 'alt-' + k;
  await call(A, { action: 'referral', op: 'enter', code, save: save() });
  db.vaults.find((v) => v.user_id === A).data.econ.duels = REFERRAL.duels;
}
// the alts beating each other doesn't help: they were invited by the same person
r = await call(HOST, { action: 'vault' });
const after = db.vaults.find((v) => v.user_id === HOST).data;
assert(after.econ.refPaid === REFERRAL.cap, `101 friends who played: paid for ${after.econ.refPaid} (the cap)`);
const gain = Object.fromEntries(Object.entries(after.profile.tickets).map(([k, n]) => [k, n - (before[k] || 0)]));
assert(gain.standard === REFERRAL.cap - 2 && gain.collector === 4, `the most anyone can earn: ${JSON.stringify(gain)} more (+2 standard earlier)`);
assert((await call(HOST, { action: 'referral', op: 'status' })).counted === 102, 'the count still shows everyone (102 friends)');

// alts farming each other
const H2 = 'host-2';
const c2 = (await call(H2, { action: 'referral', op: 'status', save: save() })).code;
for (const a of ['x1', 'x2', 'x3', 'x4']) await call(a, { action: 'referral', op: 'enter', code: c2, save: save() });
for (let d = 0; d < 3; d++) for (const a of ['x1', 'x2', 'x3', 'x4']) for (const b of ['x1', 'x2', 'x3', 'x4']) if (a !== b) match(a, b, a, d);
assert((await call(H2, { action: 'referral', op: 'status' })).counted === 0, 'alts beating each other never count');

// share bonus: once
r = await call(F, { action: 'act', name: 'shareBonus' });
assert(r.result.chimes === SHARE_CHIMES, `share bonus: +${SHARE_CHIMES} Chimes`);
assert((await call(F, { action: 'act', name: 'shareBonus' })).result.chimes === 0, '...once per account');
assert((await call(F, { action: 'act', name: 'referrals', args: { count: 10 } })).error === 'Not allowed.', 'the game can’t pay itself referral rewards');
console.log('referrals: all checks passed');
