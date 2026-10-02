// Friends, preset messages, trades and the Trade Board, through the bundled
// economy function against the in-memory Supabase. Usage: node sim/social-server-test.mjs
import { db, loadFunction, userCreated, users } from './fake-supabase.mjs';
import { freshVault } from '../engine/economy.js';
import { grant } from '../engine/collection.js';
import { TRADE, SOCIAL } from '../engine/social.js';

const call = await loadFunction('economy');
let fails = 0;
const assert = (ok, msg) => {
  if (!ok) (fails++, console.error('✗', msg));
  else console.log('✓', msg);
};
const DAY = 86400000;
const S = (uid, op, args = {}) => call(uid, { action: 'social', op, ...args });
const save = () => ({ ...freshVault(Date.now()), onboard: 'done', octaves: [{ cards: [] }] });
const vaultOf = (uid) => db.vaults.find((v) => v.user_id === uid).data;
// a player 30 days old with 25 Duels, some Embers, and cards held for a while
async function player(uid, name, { days = 30, duels = 25, embers = 500 } = {}) {
  userCreated[uid] = new Date(Date.now() - days * DAY).toISOString();
  await call(uid, { action: 'vault', save: save() });
  db.pvp_profiles.push({ user_id: uid, name });
  const v = vaultOf(uid);
  v.profile.name = 'You'; // like most players: their vault never learned their name
  v.econ.duels = duels;
  v.profile.embers = embers;
}
const give = (uid, cardId, { ago = 10 * DAY } = {}) => grant(vaultOf(uid).profile, cardId, { now: Date.now() - ago, source: 'Standard Pack' });
const owns = (uid, copyId) => !!vaultOf(uid).profile.items[copyId];

const A = 'alice', B = 'bob', C = 'cara', D = 'dev';
await player(A, 'Alice');
await player(B, 'Bob');
await player(C, 'Cara');
await player(D, 'Dev');

// ---- friends ------------------------------------------------------------------------------
let r = await S(A, 'status');
assert(/^[A-Z2-9]{8}$/.test(r.code), `a friend code: ${r.code}`);
const codeA = r.code;
assert((await S(A, 'status')).code === codeA, '...the same every time');
assert(/own friend code/.test((await S(A, 'add', { code: codeA })).error), 'not your own code');
assert(/No one has/.test((await S(B, 'add', { code: 'ZZZZZZZZ' })).error), 'an unknown code is refused');
assert(/friend code/.test((await S(B, 'add', { id: A })).error), 'no adding by id without having played (no searching for people)');
r = await S(B, 'add', { code: codeA.toLowerCase() });
assert(r.pending && r.name === 'Alice', 'a request by friend code (any case)');
r = await S(A, 'status');
assert(r.incoming.length === 1 && r.incoming[0].name === 'Bob' && r.requests === 1, 'Alice sees the request');
assert((await S(B, 'status')).outgoing[0]?.name === 'Alice', 'Bob sees it waiting');
r = await S(A, 'accept', { id: B });
assert(r.friends, 'accepted');
assert((await S(A, 'status')).friends[0]?.name === 'Bob' && (await S(B, 'status')).friends[0]?.name === 'Alice', 'friends both ways');
// played a Duel lately: can add without a code
db.pvp_matches.push({ id: 'm1', a: A, b: C, status: 'over', created_at: new Date().toISOString(), data: { echo: null } });
db.pvp_matches.push({ id: 'm2', a: A, b: D, status: 'over', created_at: new Date().toISOString(), data: { echo: { name: 'x' } } });
r = await S(A, 'status');
assert(r.recent.some((p) => p.id === C) && !r.recent.some((p) => p.id === D), 'people you played are suggested (not Echoes)');
r = await S(A, 'add', { id: C });
assert(r.pending, 'add someone you played');
r = await S(C, 'add', { code: codeA });
assert(r.friends, 'asking someone who asked you is a yes');
// guests
await call('guest-1', { action: 'vault', save: null });
assert(/Save your profile/.test((await S('guest-1', 'status')).error), 'guests can’t use friends or trading');
db.pvp_matches.push({ id: 'm3', a: A, b: 'guest-1', status: 'over', created_at: new Date().toISOString(), data: {} });
assert(!(await S(A, 'status')).recent.some((p) => p.id === 'guest-1'), 'guests aren’t suggested');
const gcode = 'GUESTCDE';
db.friend_codes.push({ user_id: 'guest-1', code: gcode });
assert(/hasn’t saved/.test((await S(A, 'add', { code: gcode })).error), 'a guest can’t be added');

// ---- preset messages --------------------------------------------------------------------------
r = await S(B, 'send', { id: A, preset: 'hi', text: 'meet me at the park' });
assert(r.messages?.length === 1 && r.messages[0].preset === 'hi' && !('text' in r.messages[0]), 'a preset message; typed text is ignored');
assert(!db.friend_messages.some((m) => JSON.stringify(m).includes('park')), 'nothing typed is ever stored');
assert(/from the list/.test((await S(B, 'send', { id: A, preset: 'meetup' })).error), 'only presets on the list');
assert(/One moment/.test((await S(B, 'send', { id: A, preset: 'gl' })).error), 'not too fast to one friend');
assert(/not friends/.test((await S(D, 'send', { id: A, preset: 'hi' })).error), 'only friends can message');
assert(/Duel invitation/.test((await S(B, 'send', { id: A, preset: 'duel' })).error), '“Wanna Duel?” needs an invitation');
db.pvp_matches.push({ id: 'ch1', a: A, code: 'QWERTY', status: 'open', created_at: new Date().toISOString(), data: {} });
assert(/expired/.test((await S(B, 'send', { id: A, preset: 'duel', code: 'QWERTY' })).error), '...the sender’s own');
db.pvp_matches.push({ id: 'ch2', a: B, code: 'BOBDUE', status: 'open', created_at: new Date().toISOString(), data: {} });
await new Promise((res) => setTimeout(res, SOCIAL.msgGapMs + 50));
r = await S(B, 'send', { id: A, preset: 'duel', code: 'bobdue' });
assert(r.messages?.at(-1)?.code === 'BOBDUE', '“Wanna Duel?” with Bob’s invitation');
assert((await S(A, 'ping')).unread === 2, 'Alice has 2 unread');
r = await S(A, 'messages', { id: B });
assert(r.messages.length === 2 && r.messages.every((m) => !m.mine) && r.name === 'Bob', 'Alice reads them');
assert((await S(A, 'ping')).unread === 0, '...and they’re read');

// ---- a friend's Vault ---------------------------------------------------------------------------
const aRare = give(A, 'vega'); // rare? whatever it is, held 10 days
const aNew = give(A, 'hadric', { ago: 3600000 }); // pulled an hour ago
r = await S(B, 'vault', { id: A });
assert(r.copies.some((c) => c.copyId === aRare && !c.lock) && r.copies.some((c) => c.copyId === aNew && !c.lock), 'a friend sees your cards, new ones included (nothing locked)');
assert(/not friends/.test((await S(D, 'vault', { id: A })).error), 'strangers can’t look');

// ---- trading requirements ---------------------------------------------------------------------
const bCard = give(B, 'caska');
await player('newbie', 'Newbie', { days: 2 });
await player('fresh', 'Fresh', { duels: 3 });
for (const p of ['newbie', 'fresh']) {
  const c = (await S(p, 'status')).code;
  await S(A, 'add', { code: c });
  await S(p, 'accept', { id: A });
}
const nb = give('newbie', 'pip');
r = await S('newbie', 'offer', { to: A, give: [nb], get: [aRare] });
assert(r.ok, 'a 2-day-old account trades (no waiting period)');
await S('newbie', 'cancel', { id: r.id });
const fr = give('fresh', 'pip');
r = await S('fresh', 'offer', { to: A, give: [fr], get: [aRare] });
assert(r.ok, '…and so does one with 3 Duels');
await S('fresh', 'cancel', { id: r.id });
assert(/at least one of your cards/.test((await S(B, 'offer', { to: A, give: [], get: [aRare] })).error), 'no asking for something for nothing');
r = await S(A, 'offer', { to: B, give: [aNew], get: [] });
assert(r.ok, 'a card pulled an hour ago can be offered at once');
await S(A, 'cancel', { id: r.id });
assert(/available/.test((await S(B, 'offer', { to: A, give: [bCard], get: ['nope'] })).error), 'only cards they really have');

// ---- a friend trade ---------------------------------------------------------------------------
// same copy id in both vaults (every vault's names start "YOU-"): the copy gets a new id
const clash = give(B, 'pip');
vaultOf(A).profile.items[clash] = { ...vaultOf(B).profile.items[clash], cardId: 'pip' };
(vaultOf(A).profile.copies.pip ||= []).push(clash);
r = await S(B, 'offer', { to: A, give: [bCard, clash], get: [aRare] });
assert(r.ok && r.id, `Bob offers Caska + Pip for Alice’s Vega (seal ${r.seal})`);
const offer1 = r.id;
assert((await S(A, 'ping')).offers === 1, 'Alice sees an offer waiting');
r = await S(A, 'trades');
assert(r.incoming[0]?.with === 'Bob' && r.views[bCard], 'with the Legacy of what she’d get');
const embersA = vaultOf(A).profile.embers, embersB = vaultOf(B).profile.embers;
vaultOf(A).profile.embers = 0;
r = await S(A, 'respond', { id: offer1, accept: true });
if (r.error) console.log(r.error);
assert(r.ok && r.with === 'Bob', 'Alice accepts with 0 Embers: traded (trading is free)');
vaultOf(A).profile.embers = embersA;
const gotIds = r.got.map((t) => t.copyId);
assert(owns(B, aRare) && !owns(A, aRare), 'Vega moved to Bob');
assert(!owns(B, bCard) && owns(A, bCard), 'Caska moved to Alice');
const pipNew = Object.keys(vaultOf(A).profile.items).filter((k) => vaultOf(A).profile.items[k].cardId === 'pip' && k !== clash);
assert(pipNew.length === 1 && owns(A, clash), `a clashing copy id gets a fresh one (${pipNew[0]}), the old copy is untouched`);
const it = vaultOf(B).profile.items[aRare];
assert(it.owners.at(-1).name === 'Bob' && it.history.at(-1).text === 'Traded from Alice to Bob.', 'the Legacy: new owner and “Traded from Alice to Bob.” (real names, not “You”)');
assert(r.seal === 0 && vaultOf(B).profile.embers === embersB, 'nobody pays a fee');
assert(db.trade_log.length === 1, 'the trade is logged');
assert(/closed/.test((await S(A, 'respond', { id: offer1, accept: true })).error), 'accepting twice does nothing');
assert((await S(B, 'offer', { to: A, give: [aRare], get: [] })).ok, 'a card just traded can move on again straight away');

// an offer for a card that's moved on fails cleanly
const a2 = give(A, 'aria');
const b2 = give(B, 'benn');
r = await S(B, 'offer', { to: A, give: [b2], get: [a2] });
const offer2 = r.id;
vaultOf(A).profile.items[a2] && delete vaultOf(A).profile.items[a2];
vaultOf(A).profile.copies.aria = (vaultOf(A).profile.copies.aria || []).filter((c) => c !== a2);
r = await S(A, 'respond', { id: offer2, accept: true });
assert(/available|no longer own/.test(r.error), 'a card that’s gone: the trade doesn’t happen');
assert(db.trade_offers.find((o) => o.id === offer2).status === 'failed', '...and the offer closes');
// decline and cancel
const a3 = give(A, 'odo');
r = await S(B, 'offer', { to: A, give: [b2], get: [a3] });
assert((await S(A, 'respond', { id: r.id, accept: false })).declined, 'decline');
r = await S(B, 'offer', { to: A, give: [b2], get: [a3] });
assert((await S(B, 'cancel', { id: r.id })).cancelled, 'cancel your own offer');
assert(/isn’t there/.test((await S(B, 'respond', { id: r.id, accept: true })).error), 'can’t accept your own offer');
// a new offer replaces the old one
const o1 = (await S(B, 'offer', { to: A, give: [b2], get: [a3] })).id;
const o2 = (await S(B, 'offer', { to: A, give: [b2], get: [] })).id;
assert(db.trade_offers.find((o) => o.id === o1).status === 'cancelled' && db.trade_offers.find((o) => o.id === o2).status === 'open', 'a new offer to the same friend replaces the old one');
// a gift
r = await S(A, 'respond', { id: o2, accept: true });
assert(r.ok && r.got.length === 1 && !r.gave.length && !owns(B, b2) && Object.values(vaultOf(A).profile.items).some((x) => x.cardId === 'benn'), 'a gift between friends (nothing back)');

// ---- the Trade Board ------------------------------------------------------------------------------
const cHave = give(C, 'vega');
const cHave2 = give(C, 'nan');
r = await S(C, 'post', { have: [cHave], want: ['dask'] });
assert(r.ok, 'Cara posts: Vega for any Dask');
const post1 = r.id;
assert((await S(C, 'post', { have: [give(C, 'wren', { ago: 1000 })], want: [] })).ok, 'a brand-new card can be posted');
r = await S(D, 'board');
assert(r.posts.some((p) => p.id === post1 && p.name === 'Cara'), 'anyone sees the post');
assert((await S(D, 'board', { card: 'dask' })).posts.some((p) => p.id === post1) && !(await S(D, 'board', { card: 'pip' })).posts.some((p) => p.id === post1), 'search by card');
r = await S(D, 'postView', { id: post1 });
assert(r.copies[0].copyId === cHave && r.copies[0].history?.length, 'look at a post’s Legacy');
const dWrong = give(D, 'pip');
assert(/each card they asked/.test((await S(D, 'take', { id: post1, give: [dWrong] })).error), 'take it only with what they asked for');
const dDask = give(D, 'dask');
r = await S(D, 'take', { id: post1, give: [dDask] });
assert(r.ok && owns(D, cHave) && owns(C, dDask), 'Dev takes the post: traded at once');
assert(db.trade_listings.find((p) => p.id === post1).status === 'done', 'the post comes down');
assert(/gone/.test((await S('fresh', 'take', { id: post1, give: [] })).error), 'and nobody else can take it');
// "make me an offer"
r = await S(C, 'post', { have: [cHave2], want: [] });
const post2 = r.id;
const dOffer = give(D, 'mote');
const aOffer = give(A, 'mote');
assert(/Make them an offer/.test((await S(D, 'take', { id: post2, give: [dOffer] })).error), 'an open post takes offers, not takers');
const oD = (await S(D, 'offer', { listing: post2, give: [dOffer], get: [cHave2] })).id;
const oA = (await S(A, 'offer', { listing: post2, give: [aOffer], get: [cHave2] })).id;
assert(oD && oA, 'two offers on the post');
assert(/doesn’t work/.test((await S(A, 'offer', { listing: post2, give: [aOffer], get: [] })).error), 'an offer on a post asks for what’s in it');
r = await S(C, 'trades');
assert(r.incoming.length === 2 && r.posts.some((p) => p.id === post2), 'Cara sees both offers and her post');
r = await S(C, 'respond', { id: oA, accept: true });
assert(r.ok && owns(A, cHave2), 'Cara picks Alice’s');
assert(db.trade_offers.find((o) => o.id === oD).status === 'failed' && db.trade_listings.find((p) => p.id === post2).status === 'done', 'the other offer and the post close');
// limits on posts
for (let k = 0; k < TRADE.maxListings; k++) await S(D, 'post', { have: [give(D, 'ione')], want: [] });
assert(/posts up/.test((await S(D, 'post', { have: [give(D, 'ione')], want: [] })).error), `${TRADE.maxListings} posts at a time`);
const mine = (await S(D, 'board')).mine;
await S(D, 'unpost', { id: mine[0].id });
assert((await S(D, 'board')).mine.length === TRADE.maxListings - 1, 'take a post down');

// ---- the daily limit -------------------------------------------------------------------------------
const done = db.trade_log.filter((t) => t.a === A || t.b === A).length;
for (let k = done; k < 30; k++) db.trade_log.push({ id: 'x' + k, a: A, b: 'someone', a_gave: [], b_gave: [], created_at: new Date().toISOString() });
assert((await S(A, 'offer', { to: B, give: [give(A, 'dilly')], get: [] })).ok, 'no daily trade limit');

// ---- blocking ---------------------------------------------------------------------------------------
const pending = (await S(A, 'offer', { to: B, give: [give(A, 'anselm')], get: [] }).catch(() => null)) || {};
r = await S(B, 'block', { id: A });
assert(r.ok, 'Bob blocks Alice');
assert(!(await S(B, 'status')).friends.some((f) => f.id === A) && !(await S(A, 'status')).friends.some((f) => f.id === B), 'no longer friends');
assert(/not friends/.test((await S(A, 'send', { id: B, preset: 'hi' })).error), 'no messages');
assert(/can’t add/.test((await S(A, 'add', { code: (await S(B, 'status')).code })).error), 'can’t add them back');
assert(!db.trade_offers.some((o) => ((o.from_id === A && o.to_id === B) || (o.from_id === B && o.to_id === A)) && o.status === 'open'), 'open offers between them close');
r = await S(B, 'post', { have: [give(B, 'sentry9')], want: [] });
assert(!(await S(A, 'board')).posts.some((p) => p.by === B), 'their Trade Board posts disappear for each other');
assert((await S(B, 'status')).blocked.some((p) => p.id === A), 'Bob can see who he blocked');
assert((await S(B, 'unblock', { id: A })).ok && !(await S(B, 'status')).blocked.length, '...and unblock');

// ---- who can send you requests; adding from a match; saying no --------------------------------------
await player('kid', 'Kid');
await player('stranger', 'Stranger');
await player('rival', 'Rival');
const kidCode = (await S('kid', 'status')).code;
assert((await S('kid', 'status')).allow === 'anyone', 'by default anyone with your code can ask');
r = await S('kid', 'settings', { allow: 'played' });
assert(r.allow === 'played', 'set: only people I’ve played');
assert(/isn’t taking/.test((await S('stranger', 'add', { code: kidCode })).error), '…a stranger with the code can’t ask');
db.pvp_matches.push({ id: 'mk1', a: 'kid', b: 'rival', status: 'over', created_at: new Date().toISOString(), data: { echo: null } });
assert(/only add someone you played/.test((await S('stranger', 'add', { match: 'mk1' })).error), 'adding from a match you weren’t in is refused');
r = await S('rival', 'add', { match: 'mk1' });
assert(r.pending, '“Add as a friend” right after a match (by the match, no code)');
r = await S('kid', 'decline', { id: 'rival' });
assert(r.ok && !(await S('kid', 'status')).incoming.length, 'Kid says no');
assert(!(await S('rival', 'status')).outgoing.length, '…it leaves the asker’s list');
assert(/ask again in a few days/.test((await S('rival', 'add', { match: 'mk1' })).error), '…and they can’t ask again for a week');
await S('kid', 'settings', { allow: 'none' });
assert(/isn’t taking/.test((await S('rival', 'add', { id: 'kid' })).error) || /ask again/.test((await S('rival', 'add', { id: 'kid' })).error), 'No one: nobody new can ask');
db.pvp_matches.push({ id: 'mk2', a: 'kid', b: 'stranger', status: 'over', created_at: new Date().toISOString(), data: { echo: null } });
assert(/isn’t taking/.test((await S('stranger', 'add', { match: 'mk2' })).error), '…not even someone they played');
await S('kid', 'settings', { allow: 'anyone' });
r = await S('stranger', 'add', { code: kidCode });
assert(r.pending, 'back to anyone: a request arrives');
r = await S('kid', 'block', { id: 'stranger' });
assert(r.ok && !(await S('kid', 'status')).incoming.length, 'block a request: gone');
assert(/can’t add/.test((await S('stranger', 'add', { code: kidCode })).error), '…and they can’t ask again');
r = await S('kid', 'settings', { newCode: true });
assert(r.code && r.code !== kidCode, 'a new friend code');
assert(/No one has/.test((await S('rival', 'add', { code: kidCode })).error), '…the old one stops working');

// ---- counter-offers and notifications --------------------------------------------------------------
await player('p1', 'Pia');
await player('p2', 'Paz');
await player('p3', 'Pol');
const cx = give('p2', 'vega'), y = give('p1', 'caska'), z = give('p1', 'pip');
const cPost = (await S('p2', 'post', { have: [cx], want: [] })).id;
const first = (await S('p1', 'offer', { listing: cPost, give: [y], get: [cx] })).id;
r = await S('p2', 'ping');
assert(r.offers === 1 && r.latest.offer?.name === 'Pia' && !r.latest.offer.counter, 'Paz is told: “Pia sent you a trade offer”');
assert(/closed/.test((await S('p3', 'offer', { counter: first, give: [give('p3', 'odo')], get: [y] })).error), 'only the person an offer was sent to can counter it');
r = await S('p2', 'counterView', { id: first });
assert(r.name === 'Pia' && r.copies.some((c) => c.copyId === z), 'countering: Paz sees what else Pia has (no need to be friends)');
r = await S('p2', 'offer', { counter: first, give: [cx], get: [y, z] });
assert(r.ok, 'Paz counters: Vega for Caska + Pip');
const ctr = r.id;
assert(db.trade_offers.find((o) => o.id === first).status === 'countered', '…Pia’s first offer is settled by the counter');
r = await S('p1', 'ping');
assert(r.offers === 1 && r.latest.offer?.name === 'Paz' && r.latest.offer.counter, 'Pia is told it’s a counter-offer');
assert((await S('p1', 'trades')).incoming[0]?.counter, '…marked as a counter in her offers');
r = await S('p1', 'offer', { counter: ctr, give: [y], get: [cx] });
assert(r.ok, 'Pia counters back');
const back = r.id;
assert(/closed/.test((await S('p1', 'respond', { id: ctr, accept: true })).error), 'a countered offer can’t be accepted any more');
r = await S('p2', 'respond', { id: back, accept: true });
assert(r.ok && owns('p2', y) && owns('p1', cx), 'Paz accepts the counter: traded (strangers, through the post)');
r = await S('p1', 'ping');
assert(r.latest.traded?.name === 'Paz', 'Pia is told: “Paz accepted your trade”');
assert(db.trade_listings.find((p) => p.id === cPost).status === 'done', 'the post closes once its card has moved');
const w = give('p2', 'nan'), v = give('p3', 'wren');
const cPost2 = (await S('p2', 'post', { have: [w], want: ['wren'] })).id;
await S('p3', 'take', { id: cPost2, give: [v] });
r = await S('p2', 'ping');
assert(r.latest.traded?.name === 'Pol', 'a post taken while you’re away: “Pol traded with you”');

console.log(fails ? `\nsocial: ${fails} FAILED` : '\nsocial: all checks passed');
process.exit(fails ? 1 : 0);
