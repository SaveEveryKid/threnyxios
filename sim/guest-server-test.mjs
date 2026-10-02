// Guest play on the servers (docs/18-guest-play.md): runs the bundled economy and
// pvp functions against the in-memory Supabase stand-in.
// Usage: node sim/guest-server-test.mjs
import { db, users, loadFunction } from './fake-supabase.mjs';
import { GUEST_MAX_DUELS, GUEST_FRIEND_MATCHES, GUEST_PLAY_DURATION_MINUTES, CHALLENGE_TTL_HOURS } from '../engine/guest.js';
import { STARTER } from '../engine/economy.js';

const assert = (ok, msg) => { if (!ok) { console.error('✗', msg); process.exit(1); } else console.log('✓', msg); };
const econ = await loadFunction('economy');
const pvp = await loadFunction('pvp');
const G = 'guest-1', HOST = 'user-host';
const vaultOf = (uid) => db.vaults.find((v) => v.user_id === uid)?.data;
// reward claims closer than 20 s apart are refused by the economy's own limits: step past that
const later = (uid) => { const v = vaultOf(uid); if (v?.econ) v.econ.lastMatch = 0; };
const ladder = { mode: 'ladder', won: true, fought: [], opp: 'Marrow', persona: 'marrow' };

// ---- a guest's collection starts clean ------------------------------------------------------
{
  const forged = { settings: { name: 'Sneaky' }, onboard: 'done', tut: { granted: 4 }, profile: { embers: 60000, chimes: 9999, tickets: { standard: 40 }, copies: { aurelle: ['x1', 'x2'] }, items: { x1: {}, x2: {} } } };
  const r = await econ(G, { action: 'vault', save: forged });
  const v = r.vault;
  assert(r.guest && r.guest.allowed && !r.guest.started, 'a guest gets their allowance, not started yet');
  assert(v.profile.embers < 1000 && v.profile.chimes === 0 && !(v.profile.copies.aurelle?.length), 'a forged save brings nothing: no Embers, Chimes or cards it didn’t earn');
  assert(STARTER.every((id) => v.profile.copies[id]?.length), 'what training gives (the starters) is there');
}

// ---- a fresh guest trains: training never counts --------------------------------------------
const T = 'guest-trainee';
{
  await econ(T, { action: 'vault', save: { tut: { granted: -1 } } });
  assert((await econ(T, { action: 'act', name: 'lesson', args: { n: 0 } })).result.cards.length === 3, 'training hands out its heroes to a guest');
  const m = await econ(T, { action: 'act', name: 'matchEnd', args: { mode: 'tutorial', won: true, fought: [] } });
  assert(!m.error && m.guest && !m.guest.started, 'a training match pays and doesn’t start the guest clock');
}

// ---- the allowance ------------------------------------------------------------------------
{
  later(G);
  const no = await econ(G, { action: 'act', name: 'matchEnd', args: ladder });
  assert(/Save your profile/.test(no.error || ''), 'a Duel result with no Duel started for it pays nothing');
  for (let i = 0; i < GUEST_MAX_DUELS; i++) {
    const s = await econ(G, { action: 'guestStart' });
    assert(s.ok && s.guest.started, `guest Duel ${i + 1} starts`);
    later(G);
    const e = await econ(G, { action: 'act', name: 'matchEnd', args: ladder });
    assert(!e.error, `guest Duel ${i + 1} pays (${e.result?.rewards?.map((x) => x.join(' ')).join(', ') || 'no reward'})`);
  }
  const gate = await econ(G, { action: 'guestStart' });
  assert(gate.error === 'guest_limit' && gate.guest.over, `after ${GUEST_MAX_DUELS} Duels the next one asks to save the profile`);
  const pack = await econ(G, { action: 'act', name: 'openPack', args: { type: 'standard' } });
  assert(!pack.error, 'at the gate, the guest can still open the packs they earned (nothing is taken away)');
}
{
  // the clock: a Duel started at minute 29 still finishes and pays at minute 40
  const C = 'guest-clock';
  await econ(C, { action: 'vault', save: null });
  await econ(C, { action: 'guestStart' });
  later(C);
  await econ(C, { action: 'act', name: 'matchEnd', args: ladder });
  vaultOf(C).econ.guest.since = Date.now() - (GUEST_PLAY_DURATION_MINUTES - 1) * 60000;
  assert((await econ(C, { action: 'guestStart' })).ok, `a Duel can start at minute ${GUEST_PLAY_DURATION_MINUTES - 1}`);
  vaultOf(C).econ.guest.since = Date.now() - (GUEST_PLAY_DURATION_MINUTES + 10) * 60000;
  later(C);
  assert(!(await econ(C, { action: 'act', name: 'matchEnd', args: ladder })).error, 'and finishes (and pays) after the time is up: never cut off mid-Duel');
  assert((await econ(C, { action: 'guestStart' })).error === 'guest_limit', 'but no new Duel starts');
}

// ---- saving the profile -------------------------------------------------------------------
{
  users[HOST] = { id: HOST, created_at: new Date().toISOString(), is_anonymous: false, email: 'byron@x', app_metadata: {}, user_metadata: {} };
  const before = JSON.stringify(vaultOf(G).profile.copies);
  assert(/3–18/.test((await econ(G, { action: 'convert', username: 'a', password: 'longenough' })).error || ''), 'a too-short name is refused');
  assert(/different words/.test((await econ(G, { action: 'convert', username: 'shitlord', password: 'longenough' })).error || ''), 'a rude name is refused');
  assert(/taken/.test((await econ(G, { action: 'convert', username: 'Byron', password: 'longenough' })).error || ''), 'a name someone has is refused');
  const ok = await econ(G, { action: 'convert', username: 'Wren_Fan', password: 'longenough', email: 'me@example.com' });
  assert(ok.ok && users[G].app_metadata.threnyx_account && users[G].email === 'wren_fan@x', 'the guest becomes a username account');
  assert(JSON.stringify(vaultOf(G).profile.copies) === before && vaultOf(G).econ.guest.converted, 'the same player, the same collection: nothing copied, nothing lost');
  assert(vaultOf(G).profile.name === 'Wren_Fan', 'their player name is the one they chose');
  const twice = await econ(G, { action: 'convert', username: 'Wren_Fan', password: 'longenough' });
  assert(twice.ok && twice.already, 'a second tap or a retry is harmless');
  const v = await econ(G, { action: 'vault' });
  assert(v.guest === null, 'a saved profile has no guest limit');
  later(G);
  assert(!(await econ(G, { action: 'act', name: 'matchEnd', args: ladder })).error, 'and plays on without asking to start Duels');
  assert(db.funnel_events.some((e) => e.name === 'guest_account_converted' && e.user_id === G), 'the conversion is counted in the funnel');
}

// ---- the funnel ------------------------------------------------------------------------
{
  const r = await econ('', { action: 'event', name: 'visitor_landing', visitor: 'abcd1234-visitor' });
  assert(r.ok && db.funnel_events.some((e) => e.name === 'visitor_landing' && e.visitor === 'abcd1234-visitor' && !e.user_id), 'a first visit is counted with a random visitor id, no player');
  assert((await econ('', { action: 'event', name: 'credit_card', visitor: 'abcd1234-visitor' })).error, 'unknown events are refused');
  await econ('', { action: 'event', name: 'guest_duel_started', visitor: 'abcd1234-visitor', meta: { n: 2, note: 'hello there!' } });
  assert(db.funnel_events.at(-1).meta.n === 2 && !('note' in db.funnel_events.at(-1).meta), 'event details are numbers and short codes, never free text');
}

// ---- friend challenge links ----------------------------------------------------------------
const deckOf = (uid) => { const c = vaultOf(uid).profile.copies; return STARTER.filter((id) => c[id]?.length).slice(0, 8); };
const F = 'guest-friend';
{
  await econ(HOST, { action: 'vault', save: null });
  await econ(HOST, { action: 'act', name: 'finishTraining', args: { skip: true } });
  await econ(F, { action: 'vault', save: null });
  await econ(F, { action: 'act', name: 'finishTraining', args: { skip: true } });
  assert((await pvp('', { action: 'peek', code: 'NOPE00' })).status === 'invalid', 'a made-up code: invalid (anyone can ask)');
  const ch = await pvp(HOST, { action: 'challenge', deck: deckOf(HOST), name: 'Byron' });
  const pk = await pvp('', { action: 'peek', code: ch.code.toLowerCase() });
  assert(pk.status === 'open' && pk.name === 'Byron', 'the link shows who sent it, before the visitor has a player');
  assert(/Save your profile/.test((await pvp(F, { action: 'queue', deck: deckOf(F), name: 'Pal' })).error || ''), 'a guest can’t play Ranked');
  assert(/Save your profile/.test((await pvp(F, { action: 'challenge', deck: deckOf(F), name: 'Pal' })).error || ''), 'a guest can’t make challenge links');
  const j = await pvp(F, { action: 'join', code: ch.code, deck: deckOf(F), name: 'Pal' });
  assert(j.matched, 'a guest accepts a friend’s invitation, no account needed');
  assert(db.pvp_profiles.find((p) => p.user_id === F)?.guest === true, 'the guest is marked as a guest');
  assert(['taken', 'invalid'].includes((await pvp('', { action: 'peek', code: ch.code })).status), 'the link is used up (the screen says it was used or has expired)');
  const before = db.pvp_profiles.find((p) => p.user_id === HOST).rating;
  await pvp(F, { action: 'resign', match: j.matched });
  const host = db.pvp_profiles.find((p) => p.user_id === HOST);
  assert(host.rating === before, 'a match with a guest moves no one’s rating');
  const lb = await pvp(HOST, { action: 'leaderboard' });
  assert(!lb.top.some((p) => p.user_id === F), 'guests stay off the leaderboard');
  // the rematch stays friendly
  await pvp(HOST, { action: 'rematch', match: j.matched });
  const rm = await pvp(F, { action: 'rematch', match: j.matched });
  const next = db.pvp_matches.find((m) => m.id === db.pvp_matches.find((x) => x.id === j.matched).data.next);
  assert(next && next.data.friendly, 'a rematch with a friend stays friendly');
  // the economy pays a verified friend match without asking for a guest start
  later(F);
  const paid = await econ(F, { action: 'act', name: 'matchEnd', args: { mode: 'pvp', match: j.matched, won: true, fought: [] } });
  assert(!paid.error, 'the friend match itself pays without using the guest allowance');
}
{
  // past the limit: invited matches still go ahead, a few times, then the profile is needed
  for (let i = 0; i < GUEST_FRIEND_MATCHES + 1; i++) {
    const ch = await pvp(HOST, { action: 'challenge', deck: deckOf(HOST), name: 'Byron' });
    const j = await pvp(F, { action: 'join', code: ch.code, deck: deckOf(F), name: 'Pal' });
    if (j.matched) await pvp(F, { action: 'resign', match: j.matched });
    else { assert(i >= GUEST_FRIEND_MATCHES - 2 && /Save your profile/.test(j.error), `after ${i + 2} friend matches (rematches count), a guest saves their profile to play more`); break; }
  }
  // a guest can't answer another guest's invitation (nobody can mint invitations to themselves)
  db.pvp_matches.push({ id: 'g-open', a: 'guest-host', b: null, code: 'GUEST1', status: 'open', created_at: new Date().toISOString(), data: { host: { name: 'Alt', deck: deckOf(F) } }, version: 0 });
  await econ('guest-x', { action: 'vault', save: null });
  await econ('guest-x', { action: 'act', name: 'finishTraining', args: { skip: true } });
  assert(/Save your profile/.test((await pvp('guest-x', { action: 'join', code: 'GUEST1', deck: deckOf('guest-x'), name: 'X' })).error || ''), 'a guest can’t answer another guest’s invitation');
  // an old link
  db.pvp_matches.push({ id: 'old', a: HOST, b: null, code: 'OLDONE', status: 'open', created_at: new Date(Date.now() - (CHALLENGE_TTL_HOURS + 1) * 3600000).toISOString(), data: { host: { name: 'Byron', deck: deckOf(HOST) } }, version: 0 });
  assert((await pvp('', { action: 'peek', code: 'OLDONE' })).status === 'expired', `a link older than ${CHALLENGE_TTL_HOURS} hours shows as expired`);
  assert(/expired/.test((await pvp('guest-x', { action: 'join', code: 'OLDONE', deck: deckOf('guest-x'), name: 'X' })).error || ''), 'and can’t be joined');
}
console.log('\nguest play: all checks passed');
