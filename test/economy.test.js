// The economy: every change to what a player owns, with the server's limits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, freshVault, importVault, isEconError, SERVER_ONLY, pickVault, STARTER, TUTORIAL_GRANTS, OPPONENT_SKILL, TIERS, LIMITS, FREE_PACK_MS, AI_REWARDS_PER_DAY } from '../engine/economy.js';
import { CARDS, LIST } from '../engine/cards/index.js';
import { owned, grant, SPOILS_PER_DAY, CRAFT } from '../engine/collection.js';
import { freshHall, TRADERS, dealValues } from '../engine/tradehall.js';
import * as store from '../client/js/core/store.js';
import { LESSONS } from '../client/js/screens/tutorial-lessons.js';

const T0 = Date.UTC(2026, 8, 30, 12);
const DAY = 86400000;
let seed = 1;
const act = (v, name, args, now = T0) => apply(v, name, args, { now, seed: seed++ });
const refuses = (fn, re) => assert.throws(fn, (e) => isEconError(e) && (!re || re.test(e.message)));
const give = (v, id, n = 1) => {
  for (let i = 0; i < n; i++) grant(v.profile, id, { now: T0 - 90 * DAY });
};

test('packs: free charges first, then tickets; nothing to open is refused and changes nothing', () => {
  let v = freshVault(T0);
  for (let i = 0; i < 2; i++) {
    const r = act(v, 'openPack', { type: 'standard' });
    v = r.vault;
    assert.equal(r.result.cards.length, 3);
  }
  assert.equal(v.free.charges, 0);
  const before = JSON.stringify(v);
  refuses(() => act(v, 'openPack', { type: 'standard' }), /No pack/);
  assert.equal(JSON.stringify(v), before, 'a refused action leaves the vault alone');
  v.profile.tickets.collector = 1;
  v = act(v, 'openPack', { type: 'collector' }).vault;
  assert.equal(v.profile.tickets.collector, 0);
  assert.equal(v.profile.packsOpened, 3);
  // the free timer refills on the server's clock
  v = act(v, 'openPack', { type: 'standard' }, T0 + FREE_PACK_MS + 1000).vault;
  assert.equal(v.free.charges, 0);
});

test('shop and Embers: Chimes, craft, burn, spares, ascend', () => {
  let v = freshVault(T0);
  refuses(() => act(v, 'buyOffer', { offer: 'standard1' }), /Chimes|Unknown/);
  v.profile.chimes = 500;
  v = act(v, 'buyOffer', { offer: 'standard5' }).vault;
  assert.equal(v.profile.chimes, 0);
  assert.equal(v.profile.tickets.standard, 5);
  const c = LIST.find((x) => x.rarity === 'rare');
  refuses(() => act(v, 'craft', { cardId: c.id }), /Embers/);
  v.profile.embers = CRAFT.rare;
  v = act(v, 'craft', { cardId: c.id }).vault;
  assert.equal(owned(v.profile, c.id), 1);
  give(v, c.id, 6);
  const [first, second] = v.profile.copies[c.id];
  refuses(() => act(v, 'burn', { copyId: first }), /spare/);
  v = act(v, 'burn', { copyId: second }).vault;
  assert.equal(owned(v.profile, c.id), 6);
  const r = act(v, 'burnSpares', {});
  assert.ok(r.result.embers > 0);
  assert.ok(owned(r.vault.profile, c.id) >= 1);
  // spares are kept for the next Ascension, so it works straight after
  assert.equal(act(r.vault, 'ascend', { cardId: c.id }).vault.profile.ascension[c.id], 1);
  refuses(() => act(freshVault(T0), 'ascend', { cardId: c.id }));
});

test('trade hall: fair deals go through with the seal, lopsided ones are refused', () => {
  let v = freshVault(T0);
  const hall = freshHall(Math.floor(T0 / (7 * DAY)));
  const t = TRADERS[0];
  const table = hall.traders[t.id];
  const want = table.items.find((i) => CARDS[i.cardId].rarity === 'common');
  // offer one common for their common: refused unless it's something they want or worth more
  const cheap = LIST.find((c) => c.rarity === 'common' && !table.wants.includes(c.id));
  give(v, cheap.id, 2);
  const mine = v.profile.copies[cheap.id][1];
  const ok = dealValues(t, table, [v.profile.items[mine]], [want]).ok;
  if (ok) {
    v = act(v, 'trade', { trader: t.id, give: [mine], get: [want.copyId] }).vault;
    assert.ok(v.profile.items[want.copyId], 'their copy is now yours');
    assert.ok(!v.profile.items[mine], 'yours is theirs');
  } else refuses(() => act(v, 'trade', { trader: t.id, give: [mine], get: [want.copyId] }), /wants more/);
  // a legendary of yours for their commons always works
  const big = LIST.find((c) => c.rarity === 'legendary');
  give(v, big.id);
  v.profile.embers = 1000;
  const bigCopy = v.profile.copies[big.id][0];
  const got = (v.trade?.traders?.[t.id] || table).items.filter((i) => CARDS[i.cardId].rarity === 'common').map((i) => i.copyId);
  const r = act(v, 'trade', { trader: t.id, give: [bigCopy], get: got });
  assert.equal(r.result.seal, 150);
  assert.equal(r.vault.profile.embers, 850);
  refuses(() => act(v, 'trade', { trader: t.id, give: ['NOT-MINE'], get: got }), /own/);
});

test('training: lessons in order and once, the reward once, skipping hands out every starter', () => {
  let v = freshVault(T0);
  refuses(() => act(v, 'lesson', { n: 1 }), /earlier/);
  v = act(v, 'lesson', { n: 0 }).vault;
  assert.deepEqual(TUTORIAL_GRANTS[0].map((id) => owned(v.profile, id)), [1, 1, 1]);
  v = act(v, 'lesson', { n: 0 }).vault; // again: nothing more
  assert.equal(owned(v.profile, TUTORIAL_GRANTS[0][0]), 1);
  v = act(v, 'finishTraining', { skip: true }).vault;
  assert.ok(STARTER.every((id) => owned(v.profile, id) === 1));
  assert.equal(v.profile.tickets.standard, 2);
  v = act(v, 'finishTraining', { skip: true }).vault;
  assert.equal(v.profile.tickets.standard, 2, 'the training reward pays once');
});

test('daily rewards: objectives, Daily Read streak, puzzle, Long Road; each once a day', () => {
  let v = freshVault(T0);
  v = act(v, 'claimObjectives').vault;
  refuses(() => act(v, 'claimObjectives'), /Already/);
  v = act(v, 'claimObjectives', {}, T0 + DAY).vault;
  assert.equal(v.profile.tickets.standard, 2);
  for (let d = 0; d < 7; d++) v = act(v, 'dailyRead', {}, T0 + d * DAY).vault;
  refuses(() => act(v, 'dailyRead', {}, T0 + 6 * DAY), /Already/);
  assert.equal(v.econ.dr.streak, 7);
  assert.equal(v.profile.tickets.event, 1, 'a week of Reads: a Firstfall Pack');
  const r = act(v, 'puzzle', { tries: 1 });
  assert.equal(r.result.embers, 30);
  refuses(() => act(r.vault, 'puzzle', { tries: 1 }), /Already/);
  assert.equal(act(v, 'puzzle', { tries: 99 }).result.embers, 10, 'tries are clamped');
  let w = v;
  for (let i = 0; i < LIMITS.roadPerDay; i++) w = act(w, 'roadEnd', { floor: 8, wins: 9, done: 'victory' }).vault;
  refuses(() => act(w, 'roadEnd', { floor: 8, wins: 9, done: 'victory' }), /today/);
  const one = act(v, 'roadEnd', { floor: 99, wins: 99, done: 'victory' }).result.pay;
  assert.deepEqual(one, { embers: 20 * 8 + 15 * 9, tickets: 3, collector: 1, event: 1 }, 'a run is clamped to the real road');
});

test('the story pays each chapter once; AI matches pay a limited number of times a day', () => {
  let v = freshVault(T0);
  for (const id of STARTER) give(v, id);
  let t = T0;
  const end = (args) => {
    t += LIMITS.matchGapMs + 1000;
    const r = act(v, 'matchEnd', { fought: STARTER.slice(0, 8), opp: 'Marrow', persona: 'marrow', round: 5, ...args }, t);
    v = r.vault;
    return r.result.rewards.map(([k, val]) => k + ': ' + val).join(' | ');
  };
  assert.match(end({ mode: 'story', chapter: 0, won: false }), /paid once/, 'a lost chapter pays nothing');
  assert.match(end({ mode: 'story', chapter: 0, won: true }), /Chapter reward/, 'the first clear pays');
  const e0 = v.profile.embers;
  assert.match(end({ mode: 'story', chapter: 0, won: true }), /paid once/, 'a replay pays nothing');
  assert.equal(v.profile.embers, e0);
  for (let i = 1; i < AI_REWARDS_PER_DAY; i++) end({ mode: 'ladder', won: false }); // the first clear counted as one
  assert.equal(v.econ.ai, AI_REWARDS_PER_DAY);
  assert.match(end({ mode: 'rival', won: true }), /AI rewards are used/, `AI matches stop paying after ${AI_REWARDS_PER_DAY} a day`);
  const notes = v.ladder.notes + v.ladder.div * 10;
  assert.match(end({ mode: 'ladder', won: true }), /Rank/, 'a Ladder win past the limit still shows your rank');
  assert.notEqual(v.ladder.notes + v.ladder.div * 10, notes, 'and still moves it');
  assert.match(end({ mode: 'pvp', won: true, pvp: { id: 'echo-1', ranked: true, echo: true } }), /AI rewards are used/, 'Echoes are AI too');
  assert.match(end({ mode: 'pvp', won: true, pvp: { id: 'real-1', ranked: true } }), /First online win today/, 'ranked against a real person always pays');
  t += DAY;
  assert.doesNotMatch(end({ mode: 'ladder', won: true }), /AI rewards are used/, 'and AI rewards come back the next day');
});

test('match end: legacy, Spoils cap, rate limit, ladder rank and rewards, story once, draft cap', () => {
  let v = freshVault(T0);
  for (const id of STARTER) give(v, id);
  const deck = STARTER.slice(0, 8);
  const feats = { [deck[0]]: { kills: 3, best: 9, reads: 1, dealt: 20 } };
  let t = T0;
  const end = (args) => {
    t += LIMITS.matchGapMs + 1000;
    const r = act(v, 'matchEnd', { fought: deck, feats, opp: 'Marrow', persona: 'marrow', round: 5, ...args }, t);
    v = r.vault;
    return r.result;
  };
  const r1 = end({ mode: 'ladder', won: true });
  assert.ok(r1.spoils && CARDS[r1.spoils.cardId], 'a win takes Spoils');
  const copy = v.profile.items[v.profile.copies[deck[0]][0]];
  assert.equal(copy.stats.battles, 1);
  assert.equal(copy.stats.kills, 3);
  assert.ok(copy.history.some((h) => /Felled 3 Champions against Marrow on the Ladder/.test(h.text)));
  refuses(() => act(v, 'matchEnd', { mode: 'ladder', won: true }, t + 1000), /Too soon/);
  for (let i = 1; i < SPOILS_PER_DAY; i++) end({ mode: 'ladder', won: true });
  const capped = end({ mode: 'ladder', won: true });
  assert.equal(capped.spoils, null);
  assert.ok(capped.rewards.some(([a]) => a === 'Spoils'), 'past the daily cap, Embers instead');
  assert.deepEqual([v.ladder.tier, v.ladder.div, v.ladder.notes], [0, 4, 2], 'six wins: one division and two Notes');
  // one Note from the next rank: the win promotes and pays, once
  Object.assign(v.ladder, { tier: 0, div: 1, notes: 3 });
  const tickets = v.profile.tickets.standard;
  const up = end({ mode: 'ladder', won: true });
  assert.equal(v.ladder.tier, 1);
  assert.ok(up.rewards.some(([a]) => a === 'Reached Chorister'));
  assert.equal(v.profile.tickets.standard, tickets + 2, 'reaching Chorister pays 2 Standard packs');
  // story: chapter 0 pays once
  const s1 = end({ mode: 'story', won: true, chapter: 0 });
  assert.ok(s1.rewards.some(([a]) => a === 'Chapter reward'));
  const s2 = end({ mode: 'story', won: true, chapter: 0 });
  assert.ok(!s2.rewards.some(([a]) => a === 'Chapter reward'));
  // a forged result can't give Legacy to cards you don't own, or impossible feats
  const notMine = LIST.find((c) => !owned(v.profile, c.id));
  end({ mode: 'draft', won: true, fought: [notMine.id, deck[1]], feats: { [deck[1]]: { kills: 99 } } });
  assert.equal(owned(v.profile, notMine.id), 0);
  assert.equal(v.profile.items[v.profile.copies[deck[1]][0]].stats.kills, 5, 'kills are clamped');
  for (let i = 1; i < LIMITS.draftsPerDay + 2; i++) end({ mode: 'draft', won: true });
  assert.equal(v.econ.draft, LIMITS.draftsPerDay, 'Draft pays up to its daily cap');
  refuses(() => act(v, 'matchEnd', { mode: 'cheat', won: true }, t + DAY), /Unknown mode/);
  // training: a lesson battle pays nothing; the final one pays the training reward, once
  let w = freshVault(T0);
  const tk = () => w.profile.tickets.standard;
  w = act(w, 'matchEnd', { mode: 'tutorial', won: true }, T0 + 60000).vault;
  assert.equal(tk(), 0);
  w = act(w, 'matchEnd', { mode: 'tutorial', won: true, final: true }, T0 + 120000).vault;
  assert.equal(tk(), 2);
  w = act(w, 'matchEnd', { mode: 'tutorial', won: true, final: true }, T0 + 180000).vault;
  assert.equal(tk(), 2);
});

test('first sign-in import: real cards only, bounded amounts, Chimes only as bought', () => {
  const save = store.get() || (store.load(), store.get());
  const s = JSON.parse(JSON.stringify(save));
  s.onboard = 'done';
  s.profile.chimes = 999999;
  s.profile.embers = 5e6;
  s.profile.tickets = { standard: 999, collector: 3, faction: 0, event: 0 };
  s.profile.copies = { hadric: ['A', 'B'], notacard: ['C'], tamsin: ['D'] };
  s.profile.items = {
    A: { copyId: 'A', cardId: 'hadric', treatment: 'standard', stats: { battles: 4 }, history: [{ at: 1, text: '<b>hi</b>' }] },
    B: { copyId: 'B', cardId: 'hadric', treatment: 'immortal' },
    C: { copyId: 'C', cardId: 'notacard' },
    D: { copyId: 'D', cardId: 'pip' }, // listed under the wrong card
  };
  const v = importVault(s, { now: T0, chimesPaid: 1000 });
  assert.equal(v.profile.chimes, 1000);
  assert.equal(v.profile.embers, 60000);
  assert.equal(v.profile.tickets.standard, 40);
  assert.deepEqual(Object.keys(v.profile.copies), ['hadric']);
  assert.equal(owned(v.profile, 'hadric'), 1, 'no Immortals from a save');
  assert.equal(v.profile.items.A.history[0].text, 'bhi/b');
  assert.equal(v.econ.trained, true);
  // and the imported vault works
  const r = apply(v, 'claimObjectives', {}, { now: T0 + 5 * DAY });
  assert.equal(r.vault.profile.tickets.standard, 41);
  assert.deepEqual(Object.keys(pickVault({ ...s, profile: v.profile, octaves: [] })).includes('octaves'), false);
});

test('the shared tables match the game', () => {
  assert.deepEqual(STARTER, store.STARTER);
  assert.deepEqual(TIERS, store.TIERS);
  assert.deepEqual(LESSONS.map((l) => l.grant), TUTORIAL_GRANTS);
  for (const p of store.PERSONAS) assert.equal(OPPONENT_SKILL[p.id], p.skill, p.id);
});

test('a one-of-one: never in the set, never crafted, burned, imported or sold to a trader; awarded once', () => {
  assert.ok(CARDS.eighthBell?.unique && !LIST.some((c) => c.id === 'eighthBell'), 'in CARDS, never in the set list');
  let v = freshVault(T0);
  v.profile.embers = 99999;
  refuses(() => act(v, 'craft', { cardId: 'eighthBell' }, T0), /can’t be crafted/);
  // a guest save claiming one is cleaned on import
  const fake = importVault({ profile: { copies: { eighthBell: ['x1'] }, items: { x1: { copyId: 'x1', cardId: 'eighthBell', treatment: 'standard' } } } }, { chimesPaid: 0 });
  assert.equal(owned(fake.profile, 'eighthBell'), 0, 'imports can’t bring one in');
  // the server's award: once, with the win in its history
  v = apply(v, 'award', { event: 'oktober-2026', cardId: 'eighthBell', line: 'Oktoberfest 2026 Champion: Ann.' }, { now: T0, seed: 1 }).vault;
  v = apply(v, 'award', { event: 'oktober-2026', cardId: 'eighthBell', line: 'again' }, { now: T0, seed: 2 }).vault;
  assert.equal(owned(v.profile, 'eighthBell'), 1, 'awarded exactly once');
  const copy = v.profile.copies.eighthBell[0];
  assert.ok(v.profile.items[copy].history.some((h) => /Oktoberfest 2026 Champion: Ann/.test(h.text)), 'the win is in its history');
  refuses(() => act(v, 'burn', { copyId: copy }, T0), /can be burned/);
  v = act(v, 'burnSpares', {}, T0).vault;
  assert.equal(owned(v.profile, 'eighthBell'), 1, 'Burn All Spares never touches it');
  refuses(() => apply(v, 'award', { event: 'x', cardId: 'hadric' }, { now: T0, seed: 1 }), /Not a prize card/);
});

test('Oktoberfest Packs: milestones pay once each, all foil, never imported', () => {
  let v = freshVault(T0);
  const ev = (points) => {
    const r = apply(v, 'eventPacks', { points }, { now: T0, seed: 1 });
    v = r.vault;
    return r.result.packs;
  };
  assert.equal(ev(9), 0, 'under 10 points: nothing');
  assert.equal(ev(12), 1, '10 points: 1 pack');
  assert.equal(ev(12), 0, 'and only once');
  assert.equal(ev(60), 3, '25 and 50 together: 1 + 2');
  assert.equal(ev(250), 3, '100: 3 more');
  assert.equal(ev(999), 0, 'all paid');
  assert.equal(v.profile.tickets.oktober, 7, '7 packs in all');
  const r = act(v, 'openPack', { type: 'oktober' }, T0);
  assert.equal(r.result.cards.length, 5);
  assert.ok(r.result.cards.every((c) => c.treatment === 'foil' && c.rarity !== 'common'), 'five foils, no commons');
  assert.ok(r.result.cards.some((c) => ['epic', 'legendary', 'mythic'].includes(c.rarity)), 'at least one Epic or better');
  const item = r.vault.profile.items[r.result.cards[0].copyId];
  assert.equal(item.source, 'Oktoberfest 2026 Pack', 'the history says where it came from');
  assert.ok(SERVER_ONLY.has('eventPacks'), 'players can’t call it: only the server pays milestones');
  const imp = importVault({ profile: { tickets: { oktober: 40, standard: 3 } } }, { chimesPaid: 0 });
  assert.equal(imp.profile.tickets.oktober, 0, 'a guest save can’t bring Oktoberfest packs in');
});

test('the Oktoberfest Set: a rare bonus sixth card, one you lack first, never importable', async () => {
  const { OKTOBER_SET, OKTOBER_SET_CHANCE, hasOktober } = await import('../engine/collection.js');
  let v = freshVault(T0);
  v.profile.tickets.oktober = 3000;
  let bonus = 0, firstFive = [];
  for (let i = 0; i < 3000; i++) {
    const r = act(v, 'openPack', { type: 'oktober' }, T0);
    v = r.vault;
    const b = r.result.cards.find((c) => c.special);
    if (b) {
      bonus++;
      assert.equal(r.result.cards.length, 6);
      assert.equal(b.treatment, 'oktober');
      assert.ok(OKTOBER_SET.includes(b.cardId));
      if (firstFive.length < 5) firstFive.push(b.cardId);
    } else assert.equal(r.result.cards.length, 5);
  }
  const rate = bonus / 3000;
  assert.ok(Math.abs(rate - OKTOBER_SET_CHANCE) < 0.015, `about ${OKTOBER_SET_CHANCE * 100}% of packs (${(rate * 100).toFixed(1)}%)`);
  assert.equal(new Set(firstFive).size, 5, 'the first five found are all different');
  assert.ok(OKTOBER_SET.every((id) => hasOktober(v.profile, id)), 'the whole set collected');
  const copy = v.profile.copies.unrung.find((c) => v.profile.items[c].treatment === 'oktober');
  assert.ok(v.profile.items[copy].history.some((h) => /Oktoberfest 2026 Pack/.test(h.text)));
  const imp = importVault({ profile: { copies: { unrung: ['z1'] }, items: { z1: { copyId: 'z1', cardId: 'unrung', treatment: 'oktober' } } } }, { chimesPaid: 0 });
  assert.ok(!hasOktober(imp.profile, 'unrung'), 'a guest save can’t bring one in');
});
