// Friends, preset messages and trading in a real browser at iPhone size: two
// players (two browser sessions) on one fake server, running the real bundled
// economy function. Usage: (site served on :8091) node sim/browser/social-flows.mjs
import { page, open, text, fake, shot, ok, done, tappable, browser, BASE } from './lib.mjs';
import { freshVault, apply } from '../../engine/economy.js';
import { grant } from '../../engine/collection.js';

const DAY = 86400000;
const DECK = ['odo', 'ossian', 'pip', 'ione', 'mote', 'dunstan', 'tamsin', 'anselm'];
const now = Date.now();
const vaultFor = (name, extra) => {
  let v = freshVault(now - 30 * DAY, name);
  v = apply(v, 'finishTraining', { skip: true }, { now, seed: 7 }).vault;
  v.profile.embers = 500;
  v.econ.duels = 25;
  const ids = {};
  for (const id of extra) ids[id] = grant(v.profile, id, { now: now - 10 * DAY, source: 'Standard Pack' });
  return { v, ids };
};
const alice = vaultFor('Alice', ['vega', 'caska']);
const bob = vaultFor('Bob', ['dask', 'hourbell']);
const user = (id, name) => ({ id, email: `${name.toLowerCase()}@players.test`, password: 'pw', is_anonymous: false, app_metadata: { threnyx_account: true }, user_metadata: { username: name }, created_at: new Date(now - 30 * DAY).toISOString() });
const USERS = { 'user-alice': user('user-alice', 'Alice'), 'user-bob': user('user-bob', 'Bob') };
const DB = {
  vaults: [
    { user_id: 'user-alice', data: alice.v, version: 1 },
    { user_id: 'user-bob', data: bob.v, version: 1 },
  ],
  pvp_profiles: [
    { user_id: 'user-alice', name: 'Alice', rating: 1000, wins: 0, losses: 0 },
    { user_id: 'user-bob', name: 'Bob', rating: 1000, wins: 0, losses: 0 },
  ],
  friend_codes: [{ user_id: 'user-bob', code: 'BOBCODE2' }],
};

// a player's browser: signed in, trained, with a legal Octave
async function player(id, name) {
  const p = await page();
  await p.goto(BASE + 'client/legal/terms.html');
  await p.evaluate(({ USERS, DB, id }) => {
    localStorage.setItem('fake.users', JSON.stringify(USERS));
    localStorage.setItem('fake.db', JSON.stringify(DB));
    localStorage.setItem('fake.session', JSON.stringify({ access_token: id, user: { id } }));
  }, { USERS, DB, id });
  await open(p);
  await p.evaluate(({ name, DECK }) => {
    const s = JSON.parse(localStorage.getItem('threnyx.save.v1'));
    Object.assign(s, { onboard: 'done', seenDuel: true, worldSeen: 99, tut: { lesson: 5, granted: 4 }, octaves: [{ name: 'Starter Octave', cards: DECK }], active: 0, updated: Date.now() + 1e9 });
    s.settings.name = name;
    localStorage.setItem('threnyx.save.v1', JSON.stringify(s));
  }, { name, DECK });
  await open(p);
  return p;
}
// the other player's turn: their browser gets the server's latest state
async function handoff(from, to, hash = '') {
  const st = await from.evaluate(() => [localStorage.getItem('fake.db'), localStorage.getItem('fake.users')]);
  await to.goto(BASE + 'client/legal/terms.html'); // off the game, so its copy of the server can't write over this one
  await to.evaluate(([db, users]) => (localStorage.setItem('fake.db', db), localStorage.setItem('fake.users', users)), st);
  await open(to, BASE + hash);
}
const go = async (p, hash) => {
  await p.evaluate((h) => (location.hash = h), hash);
  await p.waitForTimeout(1200);
};
const settle = (p, ms = 900) => p.waitForTimeout(ms);

const A = await player('user-alice', 'Alice');
const B = await player('user-bob', 'Bob');

// ---- Home → Friends; add by code ----------------------------------------------------------------
ok(/Friends/i.test(await text(A)) && (await A.locator('[data-to="friends"]').count()), 'Home has a Friends tile');
await go(A, '#/friends');
let t = await text(A);
ok(/Your friend code/i.test(t) && /set list/i.test(t), 'Friends: your code, and messages come from a set list');
ok(/No requests right now/i.test(await text(A, '[data-requests]')), 'Friend requests is always there, even empty');
ok(!(await A.locator('textarea, [contenteditable]').count()), 'no place to type a message anywhere');
await shot(A, 'friends-empty');
let tp = await tappable(A);
ok(!tp.length, 'Friends: every control on screen and big enough' + (tp.length ? ' — ' + tp.join('; ') : ''));
await A.fill('[data-code]', 'bobcode2');
await A.click('[data-add]');
await settle(A);
ok(/Sent.*Bob.*Waiting/i.test(await text(A, '[data-requests]')), 'request sent to Bob: it shows under Friend requests → Sent');
await shot(A, 'requests-sent');

// ---- Bob accepts, says hi ------------------------------------------------------------------------
await handoff(A, B);
ok(/1 request/i.test(await text(B, '[data-friends-sub]')), 'Bob’s Home shows the request');
await go(B, '#/friends');
ok(/1 new/i.test(await text(B, '[data-requests]')) && /Received.*Alice.*Accept/i.test(await text(B, '[data-requests]')), 'Bob sees Alice’s request under Friend requests → Received');
await shot(B, 'requests-received');
await B.click('[data-accept]');
await settle(B);
ok(/Your friends · 1/i.test(await text(B)), 'accepted: friends');
await B.click('[data-open]');
await settle(B, 1500);
t = await text(B);
ok(/Alice/i.test(t) && /Duel/i.test(t) && /Trade/i.test(t) && /Wanna Duel\?/i.test(t), 'Alice’s page: Duel, Trade, preset messages');
await B.click('[data-kind="hello"]');
await B.click('[data-say="hi"]');
await settle(B);
ok(/Hey!/i.test(await text(B, '[data-log]')), 'Bob sends “Hey!”');
await B.click('[data-kind="trade"]');
await shot(B, 'friend-page');
tp = await tappable(B);
ok(!tp.length, 'friend page: every control on screen and big enough' + (tp.length ? ' — ' + tp.join('; ') : ''));

// ---- Bob offers a trade from Alice's Vault --------------------------------------------------------
await B.click('[data-trade]');
await settle(B, 1500);
ok(/Trade with Alice/i.test(await text(B)), 'Trade: Alice’s Vault and his own');
await B.locator(`[data-theirs] .cell`).first().waitFor();
// ask for her Vega, give his Dask (press on a card: pointerdown + pointerup)
const tap = (p, sel) => p.evaluate((sel) => { const el = document.querySelector(sel); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }, sel);
ok(/Step 1 of 3/i.test(await text(B)) && /Pick what you want from Alice/i.test(await text(B)), 'step 1 of 3: pick what you want from Alice');
await tap(B, `[data-theirs] [data-copy="${alice.ids.vega}"]`);
await settle(B, 200);
ok(/1 picked/i.test(await text(B, '.trade-bar')) && /Confirm selection/i.test(await text(B, '[data-next]')), '1 picked · Confirm selection');
await shot(B, 'step1');
await B.click('[data-next]');
await settle(B, 300);
ok(/Step 2 of 3/i.test(await text(B)) && /Pick what you’ll give/i.test(await text(B)), 'step 2 of 3: pick what you’ll give');
ok(await B.locator('[data-next]').isDisabled(), '…Confirm selection waits until you pick one');
// the active Octave's cards stay; his only copy of a card outside it can go
ok((await B.locator('[data-mine] .cell.is-kept').count()) === DECK.length, `his ${DECK.length} active-Octave cards are marked “In Octave”`);
await tap(B, '[data-mine] .cell.is-kept');
await settle(B, 200);
ok(!(await B.locator('[data-mine] .cell.in').count()), '…and can’t be picked');
await tap(B, `[data-mine] [data-copy="${bob.ids.hourbell}"]`);
await settle(B, 200);
ok(await B.locator(`[data-mine] [data-copy="${bob.ids.hourbell}"].in`).count(), 'his only Hourbell (not in the Octave) can be picked');
await tap(B, `[data-mine] [data-copy="${bob.ids.hourbell}"]`);
await tap(B, `[data-mine] [data-copy="${bob.ids.dask}"]`);
await settle(B, 200);
ok(/1 picked/i.test(await text(B, '.trade-bar')), 'picks his spare Dask');
await shot(B, 'step2');

await B.click('[data-next]');
await settle(B, 300);
t = await text(B);
ok(/Step 3 of 3/i.test(t) && /Check the trade/i.test(t) && (await B.locator('[data-get] .trade-row__card').count()) === 1 && (await B.locator('[data-give] .trade-row__card').count()) === 1, 'step 3 of 3: the whole trade, You get / You give');
ok(/Confirm trade/i.test(await text(B, '[data-send]')), '…and Confirm trade');
await shot(B, 'step3');
await B.click('[data-send]');
await settle(B, 1500);
let f = await fake(B);
const offer = f.db.trade_offers?.find((o) => o.status === 'open');
ok(offer && offer.from_id === 'user-bob' && offer.give.length === 1 && offer.get.length === 1, 'the offer is on the server');
ok(f.db.friend_messages.some((m) => m.preset === 'tcheck'), '…and Alice gets “Check that trade I sent.”');

// ---- Alice is told, counters; Bob is told, accepts -------------------------------------------------
await handoff(B, A);
await A.waitForSelector('.notice', { timeout: 6000 }).catch(() => {});
ok(/Bob sent you a trade offer/i.test(await text(A, '.notice')), 'Alice gets a banner: “Bob sent you a trade offer · View”');
await shot(A, 'notice');
ok(await A.locator('.nav a[href="#/home"] .dot').count(), '…and a dot on Home');
ok(/1 offer waiting/i.test(await text(A, '[data-trade-sub]')), 'Alice’s Home: “1 offer waiting”');
await A.click('.notice');
await settle(A, 1200);
t = await text(A);
ok(/Waiting on you/i.test(t) && /Bob/.test(t) && /Counter/i.test(t) && /Decline/i.test(t), 'View → Offers: Accept, Counter, Decline');
await shot(A, 'offers');
await A.click('[data-counter]');
await settle(A, 1500);
ok(/Step 1 of 3/i.test(await text(A)) && /1 picked/i.test(await text(A, '.trade-bar')), 'Counter starts at step 1 with Bob’s offer turned around (his Dask picked)');
// ask for more: his Hourbell too
await tap(A, `[data-theirs] [data-copy="${bob.ids.hourbell}"]`);
await settle(A, 200);
ok(/2 picked/i.test(await text(A, '.trade-bar')), '…she asks for his Hourbell as well');
await shot(A, 'counter');
await A.click('[data-next]');
await settle(A, 300);
ok(/1 picked/i.test(await text(A, '.trade-bar')), 'step 2: her Vega already picked');
await A.click('[data-next]');
await settle(A, 300);
ok((await A.locator('[data-get] .trade-row__card').count()) === 2 && /Send counter/i.test(await text(A, '[data-send]')), 'step 3: gets 2, gives 1 · Send counter');
await A.click('[data-send]');
await settle(A, 1500);
f = await fake(A);
const ctr = f.db.trade_offers.find((o) => o.status === 'open');
ok(ctr && ctr.from_id === 'user-alice' && ctr.counter_of === offer.id && f.db.trade_offers.find((o) => o.id === offer.id).status === 'countered', 'the counter is on the server; Bob’s offer is settled by it');

await handoff(A, B);
await B.waitForSelector('.notice', { timeout: 6000 }).catch(() => {});
ok(/Alice sent you a counter-offer/i.test(await text(B, '.notice')), 'Bob gets a banner: “Alice sent you a counter-offer”');
await go(B, '#/trade?tab=offers');
await settle(B, 800);
ok(/Counter-offer/i.test(await text(B)), 'marked as a counter-offer');
await B.click('[data-yes]');
await settle(B, 300);
ok(await B.locator('.trade-confirm [data-yes]').isDisabled(), 'the Accept button waits a moment (no accepting by accident)');
await shot(B, 'confirm');
await settle(B, 1500);
await B.click('.trade-confirm [data-yes]');
await settle(B, 1500);
f = await fake(B);
ok(f.db.trade_log?.length === 1 && f.db.trade_offers.find((o) => o.id === ctr.id).status === 'done', 'Bob accepts the counter: traded');
const av = f.db.vaults.find((v) => v.user_id === 'user-alice').data;
const gotCopy = Object.values(av.profile.items).find((it) => it.history?.some((h) => /Traded from Bob to Alice/.test(h.text)));
ok(gotCopy && Object.values(av.profile.items).some((it) => it.cardId === 'hourbell'), 'Alice has Dask and Hourbell, each saying “Traded from Bob to Alice.”');

await handoff(B, A);
await A.waitForSelector('.notice', { timeout: 6000 }).catch(() => {});
ok(/Bob traded with you/i.test(await text(A, '.notice')), 'Alice is told: “Bob traded with you”');
ok(await A.evaluate((id) => !!JSON.parse(localStorage.getItem('threnyx.save.v1')).profile.items[id], gotCopy?.copyId), 'and the cards are in her collection on this device');

// ---- the Trade Board ---------------------------------------------------------------------------------
await go(A, '#/trade?tab=board');
await settle(A);
ok(/No posts yet/i.test(await text(A)), 'the Trade Board, empty');
await A.click('[data-post]');
await settle(A, 500);
await tap(A, `[data-have] [data-copy="${alice.ids.caska}"]`);
await A.fill('[data-want]', 'Vega');
await A.locator('[data-want]').dispatchEvent('change');
await settle(A, 300);
ok(/1 card up · wants 1/i.test(await text(A, '.trade-bar')), 'a post: one card up, wants Vega');
await shot(A, 'post-builder');
await A.click('[data-go]');
await settle(A, 1500);
f = await fake(A);
const post = f.db.trade_listings?.find((p) => p.status === 'open');
ok(post && post.want[0] && post.user_id === 'user-alice', 'posted');

await handoff(A, B, '#/trade?tab=board');
await settle(B, 800);
t = await text(B);
ok(/Alice/i.test(t) && /Wants/i.test(t), 'Bob sees Alice’s post on the board');
await shot(B, 'board');
tp = await tappable(B);
ok(!tp.length, 'Trade Board: every control on screen and big enough' + (tp.length ? ' — ' + tp.join('; ') : ''));
await B.click('.trade-post');
await settle(B, 1200);
const canTake = !(await B.locator('[data-take]').isDisabled());
ok(canTake, 'Bob has what she wants: Trade now');
await shot(B, 'post');
await B.click('[data-take]');
await settle(B, 1700);
await B.click('.trade-confirm [data-yes]');
await settle(B, 1500);
f = await fake(B);
ok(f.db.trade_listings.find((p) => p.id === post.id).status === 'done' && f.db.trade_log.length === 2, 'taken: traded at once, the post comes down');

// ---- block ---------------------------------------------------------------------------------------------
await go(B, '#/friends');
await B.click('[data-open]');
await settle(B, 1200);
await B.click('[data-block]');
await settle(B, 300);
await B.click('.modal [data-yes]');
await settle(B, 1200);
f = await fake(B);
ok(f.db.player_blocks.some((x) => x.blocker === 'user-bob' && x.blocked === 'user-alice') && !f.db.friends.length, 'Block: no longer friends');

ok(!A.errs.length && !B.errs.length, 'no errors: ' + [...A.errs, ...B.errs].slice(0, 3).join(' | '));
await browser.close();
process.exit(done() ? 1 : 0);
