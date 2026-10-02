// Runs supabase/functions/pvp/index.ts (the deployed bundle) in Node against an in-memory stand-in
// for Supabase, and plays two Duel AIs through queue → match → rating →
// rematch. Usage: node sim/pvp-server-test.mjs
import { makeDuelAI } from '../engine/duel-ai.js';
import { makeRng } from '../engine/rng.js';
import { CARDS, LIST } from '../engine/cards/index.js';

import { db, fake, loadFunction } from './fake-supabase.mjs';

const call = await loadFunction('pvp');
const deck = (f) => { const d = []; for (const c of LIST.filter((c) => c.faction === f)) if (d.length < 8 && !d.some((x) => CARDS[x].char === c.char)) d.push(c.id); return d; };
const assert = (ok, msg) => { if (!ok) { console.error('✗', msg); process.exit(1); } else console.log('✓', msg); };

const A = 'user-a', B = 'user-b';
// each player's collection lives on the server (the economy function's vault)
const vaultWith = (uid, ids) => db.vaults.push({ user_id: uid, version: 1, data: { profile: { copies: Object.fromEntries(ids.map((id) => [id, [uid + '-' + id]])) } } });
vaultWith(A, [...deck('crown'), ...deck('hour')]);
vaultWith(B, [...deck('vigil'), ...deck('quiet').slice(0, 7)]);
assert(/own/.test((await call(B, { action: 'queue', deck: deck('quiet'), name: 'Bo' })).error), 'a Champion you don\'t own is refused');
assert(/signed in once/.test((await call('user-new', { action: 'queue', deck: deck('crown'), name: 'Cy' })).error), 'no collection on the server: refused');
db.vaults.find((v) => v.user_id === B).data.profile.copies[deck('quiet')[7]] = ['x'];
assert((await call(A, { action: 'queue', deck: deck('crown').slice(0, 7), name: 'Ann' })).error, 'a 7-card deck is refused');
assert((await call(A, { action: 'queue', deck: deck('crown'), name: 'Ann' })).queued, 'first player waits in the queue');
const got = await call(B, { action: 'queue', deck: deck('vigil'), name: 'Bo' });
assert(got.matched, 'second player is paired');
const id = got.matched;
assert(db.pvp_queue.length === 0, 'both leave the queue');
assert((await call('user-c', { action: 'view', match: id })).error === 'Not your match.', 'strangers cannot look at a match');

// a player's turn, decided on their own view (they are side 0 in it)
const moveFor = (ai, v) => (v.turn.phase === 'lead' ? { lead: ai.lead(v.state) } : v.turn.phase === 'answer' ? ai.answer(v.state, v.turn.lead) : ai.finish(v.state, v.turn.lead, v.turn.answer.answer, v.turn.answer.answerFocus));
const ag = { [A]: makeDuelAI({ rand: makeRng(1) }), [B]: makeDuelAI({ rand: makeRng(2) }) };
let v, guard = 0;
const views = {};
for (const u of [A, B]) views[u] = await call(u, { action: 'view', match: id });
assert(views[A].state.sides[0].deck.join() === deck('crown').join() && views[B].state.sides[0].deck.join() === deck('vigil').join(), 'each player sees the match from their own side');
assert(views[A].state.seed === 0, 'the draw order stays on the server');
assert(/reload/i.test((await call(A, { action: 'deploy', match: id, list: [] })).error), 'an old game is told to reload');
{
  const v0 = views[A].version;
  const e1 = await call(A, { action: 'emote', match: id, id: 'gl' });
  assert(e1.emotes?.at(-1)?.mine && e1.version > v0, 'an emote is saved and wakes the other player');
  assert((await call(B, { action: 'view', match: id })).emotes.some((e) => e.id === 'gl' && !e.mine), 'the other player sees it as theirs');
  assert(/Easy/.test((await call(A, { action: 'emote', match: id, id: 'wp' })).error), 'emotes are spaced out');
  assert((await call(B, { action: 'emote', match: id, id: 'nope' })).error, 'only the fixed phrases');
  views[A] = await call(A, { action: 'view', match: id });
}
while (guard++ < 200) {
  let acted = false;
  for (const u of [A, B]) {
    v = await call(u, { action: 'view', match: id });
    if (v.over) break;
    if (!v.waiting.includes('you')) continue;
    acted = true;
    const r = await call(u, { action: 'move', match: id, move: moveFor(ag[u], v) });
    if (r.error) assert(false, 'action refused: ' + r.error);
  }
  if (v.over) break;
  if (!acted) assert(false, 'nobody could act');
}
const va = await call(A, { action: 'view', match: id }), vb = await call(B, { action: 'view', match: id });
assert(va.over && vb.over && va.winner === 1 - vb.winner, `match finished: ${va.winner === 0 ? 'Ann' : 'Bo'} won after ${va.state.history.length} duels`);
const [pa, pb] = [db.pvp_profiles.find((p) => p.user_id === A), db.pvp_profiles.find((p) => p.user_id === B)];
assert(pa.rating + pb.rating === 2000 && pa.rating !== 1000, `ratings moved (${pa.rating} / ${pb.rating})`);
assert(pa.wins + pa.losses === 1 && pb.wins + pb.losses === 1, 'wins and losses recorded');
assert(va.ratingDelta === pa.rating - 1000, 'the view reports the rating change');
await call(A, { action: 'rematch', match: id });
const rb = await call(B, { action: 'rematch', match: id });
assert(rb.next && db.pvp_matches.some((m) => m.id === rb.next && m.status === 'live'), 'both pressed Rematch: a new match starts');
// friend challenge by code
const ch = await call(A, { action: 'challenge', deck: deck('hour'), name: 'Ann' });
assert(/^[A-Z2-9]{6}$/.test(ch.code), 'a challenge code is made: ' + ch.code);
assert((await call(A, { action: 'join', code: ch.code, deck: deck('hour') })).error, 'you cannot join your own challenge');
const jn = await call(B, { action: 'join', code: ch.code.toLowerCase(), deck: deck('quiet'), name: 'Bo' });
assert(jn.matched === ch.id, 'a friend joins with the code');
assert((await call(A, { action: 'status', match: ch.id })).status === 'live', 'the host sees it go live');
const lb = await call(A, { action: 'leaderboard' });
assert(lb.top.length === 2 && lb.top[0].rating >= lb.top[1].rating, 'leaderboard sorted by rating');
console.log('pvp server: all checks passed');

// ---- Echoes: nobody else searching, duel a real player's saved Octave ----
const C = 'user-c';
vaultWith(C, deck('margin'));
const ec = await call(C, { action: 'echo', deck: deck('margin'), name: 'Cy' });
assert(ec.matched, 'an Echo match starts at once');
let ev = await call(C, { action: 'view', match: ec.matched });
assert(/Echoes/.test((await call(C, { action: 'emote', match: ec.matched, id: 'gl' })).error), 'no emotes with an Echo');
assert(/^Echo of (Ann|Bo)$/.test(ev.names[1]), `the Echo is a real player's Octave, labelled: "${ev.names[1]}"`);
const agc = makeDuelAI({ rand: makeRng(3) });
for (let i = 0; i < 200 && !ev.over; i++) {
  if (!ev.waiting.includes('you')) assert(false, 'the Echo left you waiting');
  ev = await call(C, { action: 'move', match: ec.matched, move: moveFor(agc, ev) });
  if (ev.error) assert(false, 'action refused: ' + ev.error);
}
assert(ev.over, `the Echo match finished (${ev.winner === 0 ? 'Cy' : 'the Echo'} won)`);
const pc = db.pvp_profiles.find((p) => p.user_id === C);
assert(pc.rating !== 1000 && Math.abs(pc.rating - 1000) <= 16 && pc.wins + pc.losses === 1, `an Echo counts for half rating (${pc.rating})`);
const er = await call(C, { action: 'rematch', match: ec.matched });
assert(er.next && db.pvp_matches.find((m) => m.id === er.next)?.data.echo, 'Rematch against an Echo starts at once');
const pu = await call(C, { action: 'pulse' });
assert(pu.today >= 3 && pu.active >= 1 && pu.recent.length >= 2 && pu.recent.some((r) => r.echo), `the pulse reports real activity (${pu.today} matches today, ${pu.active} active)`);
console.log('pvp echoes: all checks passed');

// ---- connection: a player silent for 60 s forfeits; the other's next check-in ends it ----
const fr = db.pvp_matches.find((m) => m.id === ch.id);
await call(A, { action: 'view', match: ch.id });
await call(B, { action: 'view', match: ch.id });
assert(!fr.data.over && fr.data.seen.every((t) => Date.now() - t < 5000), 'both players are marked as here');
fr.data.seen[1] = Date.now() - 61000; // Bo's phone went dark a minute ago
const dv = await call(A, { action: 'view', match: ch.id });
assert(dv.over && dv.winner === 0 && dv.by === 'disconnect', 'Bo was silent for over a minute: Ann wins by disconnect');
const bv = await call(B, { action: 'view', match: ch.id });
assert(bv.over && bv.winner === 1 && bv.by === 'disconnect', 'when Bo comes back, he sees the forfeit');
console.log('pvp connection: all checks passed');

// display names other players see go through the word filter
{
  const r = await call(A, { action: 'profile', name: 'Sh1t Lord' });
  assert(r.name === 'Player', 'a rude display name shows as Player');
  db.pvp_profiles.push({ user_id: 'user-old', name: 'fuckface', rating: 5000, wins: 0, losses: 0 });
  const lb = await call(A, { action: 'leaderboard' });
  assert(lb.top[0].name === 'Player', 'a rude name saved before the filter shows as Player on the leaderboard');
  assert((await call(A, { action: 'profile', name: 'Ann' })).name === 'Ann', 'an ordinary name is kept');
}
