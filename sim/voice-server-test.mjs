// Runs supabase/functions/voice/index.ts (the deployed bundle) in Node against
// the in-memory Supabase stand-in, with Cloudflare Realtime and Stripe faked.
// Usage: node sim/voice-server-test.mjs
import { db, loadFunction } from './fake-supabase.mjs';

const assert = (ok, msg) => { if (!ok) { console.error('✗', msg); process.exit(1); } else console.log('✓', msg); };

// ---- fake Cloudflare + Stripe -------------------------------------------------------
const calls = [];
const stripeState = { funding: 'credit', idStatus: 'verified', dob: { day: 2, month: 3, year: 1990 } };
let n = 0;
const owners = {};
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), body = init.body ? (u.includes('stripe') ? Object.fromEntries(new URLSearchParams(init.body)) : JSON.parse(init.body)) : null;
  calls.push({ url: u, method: init.method, body, auth: init.headers?.Authorization });
  const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
  if (u.includes('rtc.live.cloudflare.com')) {
    if (u.endsWith('/sessions/new')) return ok({ sessionId: 'cf' + ++n });
    if (u.endsWith('/tracks/new')) {
      if (body.sessionDescription) return ok({ sessionDescription: { type: 'answer', sdp: 'ANSWER' }, tracks: body.tracks });
      return ok({ requiresImmediateRenegotiation: true, sessionDescription: { type: 'offer', sdp: 'OFFER' }, tracks: [{ mid: '1', ...body.tracks[0] }] });
    }
    return ok({});
  }
  if (u.includes('api.stripe.com')) {
    if (u.endsWith('/checkout/sessions') && init.method === 'POST') { const id = 'cs_' + ++n; owners[id] = body.client_reference_id; return ok({ id, url: 'https://checkout.stripe.com/x' }); }
    if (u.includes('/checkout/sessions/')) return ok({ status: 'complete', client_reference_id: owners[u.split('/').pop().split('?')[0]], setup_intent: { status: 'succeeded', payment_method: { id: 'pm_1', card: { funding: stripeState.funding } } } });
    if (u.endsWith('/identity/verification_sessions')) return ok({ id: 'vs_' + ++n, url: 'https://verify.stripe.com/x', metadata: { user_id: body['metadata[user_id]'] } });
    if (u.includes('/redact')) return ok({});
    if (u.includes('/identity/verification_sessions/')) return ok({ id: u.split('/').pop().split('?')[0], status: stripeState.idStatus, metadata: { user_id: stripeState.idUser }, verified_outputs: { dob: stripeState.dob } });
  }
  return new Response('{}', { status: 404 });
};

const call = await loadFunction('voice');
const A = 'user-a', B = 'user-b', C = 'user-c';
const flagsOn = () => (db.app_flags = [{ key: 'voiceSystemEnabled', value: true }, { key: 'friendVoiceEnabled', value: true }, { key: 'rankedVoiceEnabled', value: true }]);
flagsOn();
db.pvp_matches.push({ id: 'm-friend', a: A, b: B, status: 'live', data: { friendly: true } });
db.pvp_matches.push({ id: 'm-ranked', a: A, b: C, status: 'live', data: {} });
db.pvp_matches.push({ id: 'm-echo', a: A, b: null, status: 'live', data: { echo: { name: 'Kess' } } });
db.pvp_profiles.push({ user_id: B, name: 'Bo' });

// ---- age ----------------------------------------------------------------------------
let s = await call(A, { action: 'status' });
assert(s.ageSet === false && s.friend.reason === 'age_unknown', 'a new player is asked their birth month and year');
assert((await call(A, { action: 'set_age', month: 13, year: 1990 })).error, 'a bad month is refused');
s = await call(A, { action: 'set_age', month: 3, year: 1990 });
assert(s.ageSet && s.friend.reason === 'card', 'an adult is next asked for the card check');
assert(!JSON.stringify(db.voice_accounts).includes('1990'), 'the birth year itself is not stored');
s = await call(A, { action: 'set_age', month: 1, year: 2015 });
assert(db.voice_accounts.find((r) => r.user_id === A).band === 'adult', 'the band can’t be changed by asking again');
await call(B, { action: 'set_age', month: 5, year: 1995 });
await call(C, { action: 'set_age', month: 5, year: 2012 });
assert(db.voice_accounts.find((r) => r.user_id === C).band === 'teen', 'a 14-year-old is a teen');

// ---- card check ---------------------------------------------------------------------
const back = 'https://threnyxtcg.com/';
let r = await call(A, { action: 'card_start', returnTo: back });
assert(r.url && calls.at(-1).body.mode === 'setup' && !calls.at(-1).auth.includes('undefined'), 'the card check is a Stripe setup checkout (no charge)');
stripeState.funding = 'prepaid';
s = await call(A, { action: 'card_confirm' });
assert(s.card.ok === false && s.card.prepaid && s.friend.reason === 'card', 'a prepaid card doesn’t pass');
await call(A, { action: 'card_start', returnTo: back });
stripeState.funding = 'debit';
s = await call(A, { action: 'card_confirm' });
assert(s.card.ok && s.friend.reason === 'setting', 'a debit card passes; the player’s own switch is next');
assert(!JSON.stringify(db.voice_accounts).includes('pm_1'), 'the card itself is not kept');
await call(B, { action: 'card_start', returnTo: back });
stripeState.funding = 'credit';
await call(B, { action: 'card_confirm' });

// ---- switches need the safety notice ----------------------------------------------
assert(/notice/.test((await call(A, { action: 'prefs', friend: true })).error), 'voice can’t be switched on before the safety notice');
s = await call(A, { action: 'prefs', friend: true, notice: s.notice.version });
assert(s.friend.ok, 'notice accepted and switched on: Friend Voice ready');
await call(B, { action: 'prefs', friend: true, notice: 1 });

// ---- a friend match -----------------------------------------------------------------
let p = await call(A, { action: 'policy', match: 'm-friend' });
assert(p.available && p.kind === 'friend' && p.peer.joined === false, 'two eligible friends: voice offered, nobody in yet');
assert((await call(C, { action: 'policy', match: 'm-friend' })).error === 'Not your match.', 'strangers can’t ask about a match');
assert((await call(A, { action: 'policy', match: 'm-echo' })).available === false, 'never with an Echo');
r = await call(A, { action: 'join', match: 'm-friend', offer: 'SDP', mid: '0' });
assert(r.answer === 'ANSWER' && r.peer.joined === false, 'A joins: the relay answers, B isn’t in yet (waiting)');
const cfCall = calls.filter((c) => c.url.includes('cloudflare')).at(-1);
assert(cfCall.auth === 'Bearer x' && cfCall.body.tracks[0].location === 'local', 'the relay is called with the server’s key, publishing A’s microphone');
assert(!JSON.stringify(r).includes('cf'), 'the relay session id stays on the server');
assert((await call(A, { action: 'pull', match: 'm-friend' })).waiting, 'nothing to hear until B joins');
r = await call(B, { action: 'join', match: 'm-friend', offer: 'SDP', mid: '0' });
assert(r.peer.joined, 'B joins and sees A is in');
r = await call(B, { action: 'pull', match: 'm-friend' });
assert(r.offer === 'OFFER' && r.mid === '1', 'B pulls A’s audio: the relay offers, B will answer');
const pullBody = calls.filter((c) => c.url.endsWith('/tracks/new')).at(-1).body.tracks[0];
assert(pullBody.location === 'remote' && pullBody.sessionId === db.voice_sessions.find((v) => v.user_id === A).cf_session, 'only the other player’s track in this match is pulled');
assert((await call(B, { action: 'renegotiate', match: 'm-friend', answer: 'ANS' })).ok, 'B’s answer goes back to the relay');
assert((await call(A, { action: 'pull', match: 'm-friend' })).offer, 'A pulls B too');
assert(db.voice_pings.find((x) => x.match_id === 'm-friend').seq >= 2, 'each change pings the match');
await call(A, { action: 'mic', match: 'm-friend', on: false });
assert((await call(B, { action: 'policy', match: 'm-friend' })).peer.mic === false, 'B sees A’s mic is off');

// ---- a block ends it at once ------------------------------------------------------------
const closesBefore = calls.filter((c) => c.url.endsWith('/tracks/close')).length;
assert((await call(B, { action: 'block', match: 'm-friend' })).ok, 'B blocks A mid-match');
assert(calls.filter((c) => c.url.endsWith('/tracks/close')).length - closesBefore >= 2, 'both microphones stop at the relay');
p = await call(A, { action: 'policy', match: 'm-friend' });
assert(!p.available && !p.joined && p.mine.ok && !p.iBlocked, 'A just sees voice unavailable: not who blocked, not why');
assert((await call(B, { action: 'policy', match: 'm-friend' })).iBlocked, 'B knows they blocked (their emotes from A are hidden)');
assert((await call(A, { action: 'join', match: 'm-friend', offer: 'SDP', mid: '0' })).error, 'A can’t rejoin');
assert((await call(B, { action: 'blocks' })).blocks[0].user === A, 'B’s block list');
await call(B, { action: 'unblock', user: A });
assert((await call(A, { action: 'policy', match: 'm-friend' })).available, 'unblocked: voice is offered again');

// ---- reports --------------------------------------------------------------------------
assert((await call(A, { action: 'report', match: 'm-friend', category: 'nope' })).error, 'a report needs a category');
assert((await call(A, { action: 'report', match: 'm-friend', category: 'harassment', note: 'rude', block: true })).ok, 'A reports B and blocks');
const rep = db.player_reports[0];
assert(rep.reporter === A && rep.reported === B && rep.voice === true && rep.category === 'harassment', 'the report knows who, where and that they were in voice');
assert(!(await call(A, { action: 'policy', match: 'm-friend' })).available, 'and voice stops');

// ---- ranked: ID scan + Season Pass ------------------------------------------------------
p = await call(A, { action: 'policy', match: 'm-ranked' });
assert(!p.available && p.mine.reason === 'id', 'ranked voice needs the ID check first');
stripeState.idUser = A;
r = await call(A, { action: 'id_start', returnTo: back });
const idBody = calls.filter((c) => c.url.endsWith('/identity/verification_sessions')).at(-1).body;
assert(r.url && idBody['options[document][require_matching_selfie]'] === 'true', 'the ID check asks for a matching selfie');
s = await call(A, { action: 'id_confirm' });
assert(s.id && s.ranked.reason === 'pass', 'ID shows 18+: next the Season Pass');
assert(calls.some((c) => c.url.includes('/redact')), 'Stripe is asked to delete the ID details afterwards');
assert(!JSON.stringify(db.voice_accounts).includes('1990'), 'the date of birth is not stored');
db.purchases.push({ id: 'cs_pass', user_id: A, product: 'pass_firstfall', amount_cents: 999 });
s = await call(A, { action: 'prefs', ranked: true });
assert(s.ranked.ok, 'Season Pass + switch on: Ranked Voice ready');
p = await call(A, { action: 'policy', match: 'm-ranked' });
assert(!p.available && p.mine.ok, 'the opponent (a teen) can’t: voice not offered, and A isn’t told why');
db.purchases[0].refunded_at = new Date().toISOString();
assert((await call(A, { action: 'status' })).ranked.reason === 'pass', 'a refunded Season Pass stops giving Ranked Voice');
db.purchases[0].refunded_at = null;
assert(!JSON.stringify(p).includes('teen') && !JSON.stringify(p).includes('age'), 'nothing about the opponent’s age leaks');

// a declared adult whose ID shows a minor
const D = 'user-d';
await call(D, { action: 'set_age', month: 1, year: 1980 });
stripeState.idUser = D;
stripeState.dob = { day: 1, month: 1, year: 2011 };
await call(D, { action: 'id_start', returnTo: back });
s = await call(D, { action: 'id_confirm' });
assert(!s.id && db.voice_accounts.find((x) => x.user_id === D).band === 'teen' && s.friend.reason === 'age', 'an ID showing a minor closes voice, Friend Voice included');

// ---- flags, moderation, limits ----------------------------------------------------------
await call(B, { action: 'unblock', user: A });
await call(A, { action: 'unblock', user: B });
db.player_blocks = [];
assert((await call(A, { action: 'policy', match: 'm-friend' })).available, 'friend voice back on after the blocks go');
db.app_flags.find((f) => f.key === 'voiceSystemEnabled').value = false;
await new Promise((res) => setTimeout(res, 10));
// flags are cached for 30 s; a fresh load of the function sees the switch at once
const call2 = await loadFunction('voice');
p = await call2(A, { action: 'policy', match: 'm-friend' });
assert(!p.available && p.mine.reason === 'off', 'the master switch turns voice off');
flagsOn();
const call3 = await loadFunction('voice');
db.voice_accounts.find((x) => x.user_id === B).restricted_friend = true;
assert(!(await call3(A, { action: 'policy', match: 'm-friend' })).available, 'a moderation restriction stops it');
db.voice_accounts.find((x) => x.user_id === B).restricted_until = new Date(Date.now() - 1000).toISOString();
assert((await call3(A, { action: 'policy', match: 'm-friend' })).available, 'and lifts when it expires');
let limited = false;
for (let i = 0; i < 10; i++) if ((await call3(A, { action: 'join', match: 'm-friend', offer: 'SDP', mid: '0' })).error?.includes('Too many')) limited = true;
assert(limited, 'joining is rate-limited');
assert((await call3(A, { action: 'event', name: 'voice_join_clicked', meta: { ms: 12.3456, text: 'hello world!' } })).ok, 'an event is accepted');
assert(db.voice_events.at(-1).meta.ms === 12.346 && !('text' in db.voice_events.at(-1).meta), 'event details are numbers and short codes, never free text');
assert((await call3(A, { action: 'event', name: 'transcript' })).error, 'unknown events are refused');
db.pvp_matches.find((m) => m.id === 'm-friend').status = 'over';
p = await call3(A, { action: 'policy', match: 'm-friend' });
assert(!p.available && !p.joined && db.voice_sessions.filter((v) => v.match_id === 'm-friend' && !v.left_at).length <= 1, 'voice ends with the match');
await call3(B, { action: 'policy', match: 'm-friend' });
assert(db.voice_sessions.filter((v) => v.match_id === 'm-friend' && !v.left_at).length === 0, 'no session is left open');
console.log('\nvoice server: all good');
