// THE ECONOMY — every change to what a player owns, as one named action.
//
// A "vault" is the part of the save that has value: the collection and its
// histories, currencies and pack tickets, the free-pack timer, and the
// bookkeeping that decides which rewards are still owed. For a signed-in
// player the vault lives on the server (supabase/functions/economy): the game
// asks for an action and gets the new vault back, so nothing of value can be
// written from the page. A guest's vault is their local save, and the same
// actions run on this device. Same rules, one file.
//
// Things the server can check, it checks: ownership, prices, pity, odds (it
// rolls the packs), once-only and once-a-day rewards. Results of matches
// against the computer can't be re-played on the server, so those rewards are
// bounded instead: rate limits and daily caps no honest player reaches.
import { CARDS, LIST } from './cards/index.js';
import { newProfile, owned, openPack, grant, addHistory, rollSpoils, recordBattle, burn, craft, ascend, ascTier, openMythicPack, executeTrade, tradeSeal, SPOILS_PER_DAY, SPOILS_EMBERS, ASCENSION, CRAFT, CRAFT_OWN_FIRST, RARITY_ORDER } from './collection.js';
import { OKTOBER } from './oktober.js';
import { MASTERY, cardStats, masteryLevel, seasonWin, applyReward, givePacks, packText, rankRewards, anomalyWin } from './goals.js';
import { REFERRAL, SHARE_CHIMES, owed } from './referral.js';
import { OFFERS, PRODUCTS, buyWithChimes, grantProduct, offerPrice, weeklyLeft, weekKey } from './shop.js';
import { runRewards, FLOORS } from './road.js';
import { TRADERS, freshHall, weekOf, dealValues } from './tradehall.js';

const DAY = 86400000;
export const dayKey = (now = Date.now()) => Math.floor(now / DAY);
const rarityOf = (id) => CARDS[id].rarity;

// ---- the vault ---------------------------------------------------------------
/** The save keys the vault owns. Everything else (decks, settings, story
 *  scenes seen, rivals, stats) stays in the player's own save. */
export const VAULT_KEYS = ['profile', 'free', 'spoils', 'mastery', 'season', 'rankPaid', 'ladder', 'anomalyWeek', 'story', 'trade', 'purchased', 'econ'];

export const FREE_PACK_MS = 12 * 3600000;

export function freshVault(now = Date.now(), name = 'You') {
  return {
    profile: newProfile(name, now),
    free: { charges: 2, last: now },
    spoils: { day: null, n: 0 },
    mastery: {},
    season: null,
    rankPaid: 0,
    ladder: { tier: 0, div: 5, notes: 0, wins: 0, losses: 0 },
    anomalyWeek: null,
    story: { chapter: 0 },
    trade: null,
    purchased: [],
    econ: freshEcon(),
  };
}
const freshEcon = () => ({ lessons: -1, trained: false, objDay: null, dr: { last: null, streak: 0 }, puzzleDay: null, day: null, matches: 0, draft: 0, road: 0, lastMatch: 0, alliance: {} });

/** The vault's part of a save (a deep copy). */
export function pickVault(save) {
  const v = {};
  for (const k of VAULT_KEYS) if (save[k] !== undefined) v[k] = save[k];
  return JSON.parse(JSON.stringify(v));
}

// ---- free packs, ladder -------------------------------------------------------
/** One free Standard pack every 12 hours, up to 2 stored. */
export function tickFree(free, now = Date.now()) {
  if (free.charges >= 2) return (free.last = now), free;
  const gained = Math.floor((now - free.last) / FREE_PACK_MS);
  if (gained > 0) {
    free.charges = Math.min(2, free.charges + gained);
    free.last = free.charges >= 2 ? now : free.last + gained * FREE_PACK_MS;
  }
  return free;
}

export const TIERS = ['Initiate', 'Chorister', 'Cantor', 'Arbiter', 'Warden', 'Paragon', 'Threnodist'];
export const tierName = (l) => (l.tier >= 6 ? TIERS[6] : `${TIERS[l.tier]} ${['I', 'II', 'III', 'IV', 'V'][l.div - 1]}`);

/** Ladder: 4 Notes per division; wins from the brink give a bonus Note. */
export function ladderResult(l, won, finalWin) {
  if (won) {
    l.wins++;
    l.notes += finalWin ? 2 : 1;
    while (l.notes >= 4 && l.tier < 6) {
      l.notes -= 4;
      l.div -= 1;
      if (l.div < 1) (l.tier += 1), (l.div = 5);
    }
  } else {
    l.losses++;
    if (l.tier >= 3 || l.notes > 0) l.notes -= 1;
    if (l.notes < 0) {
      if (l.div < 5) (l.div += 1), (l.notes = 3);
      else l.notes = 0;
    }
  }
  return l;
}

// ---- reward tables the server needs (the screens read them from here too) ------
/** The sixteen starter Champions, and which training lesson hands out which. */
export const STARTER = ['hadric', 'tamsin', 'pip', 'nan', 'wren', 'aria', 'dunstan', 'ossian', 'benn', 'dilly', 'odo', 'sentry9', 'dask', 'mote', 'anselm', 'ione'];
export const TUTORIAL_GRANTS = [['pip', 'ossian', 'benn'], ['hadric', 'dunstan', 'dask'], ['odo', 'aria', 'wren'], ['tamsin', 'mote', 'anselm'], ['nan', 'dilly', 'ione', 'sentry9']];
export const TRAINING_REWARD = { standard: 2 };
/** Story chapter rewards, paid on a chapter's first win. */
export const STORY_REWARDS = [{ standard: 1 }, { standard: 1 }, { standard: 2 }, { standard: 2, collector: 1 }, { standard: 2 }, { standard: 2 }, { standard: 2, collector: 1 }, { standard: 3 }, { collector: 2 }, { collector: 3 }];
/** How strong each ladder opponent is (Spoils odds rise with it). */
export const OPPONENT_SKILL = { marrow: 0.3, kess: 0.45, quince: 0.55, tallowjack: 0.6, vesper: 0.75, hale: 0.85, archivist: 0.97, hush: 0.1 };
export const PUZZLE_TRIES = 3;
export const DRAFT_REWARD = { won: 2, lost: 1 };
/** Online wins (checked by the server against the match itself): the first
 *  win of the day a Collector Pack Ticket, Embers a win, a Pack Ticket every 3
 *  wins in a row. */
export const WIN_REWARD = { firstWin: { collector: 1 }, embers: 20, streakEvery: 3, streak: { standard: 1 } };
export const PVP_REWARD = WIN_REWARD;
/** Matches against the AI (Ladder, Rivals, Anomaly, bosses, Echoes, friendly
 *  games, a story chapter's first clear) pay this many times a day. Ranked
 *  matches against real people always pay. The story pays each chapter once. */
export const AI_REWARDS_PER_DAY = 10;

/** Limits no honest player reaches (they bound rewards the server can't re-play). */
export const LIMITS = {
  matchGapMs: 20000, // a Clash takes minutes; reward claims closer than this are refused
  matchesPerDay: 80, // paying match results per day
  draftsPerDay: 8,
  roadPerDay: 4,
};

// ---- what a match adds to a copy's history ------------------------------------
function historyLines(F, stats, prev, { vs, won, clutch, top, fell, endHp }) {
  const out = [];
  if (!prev.battles) out.push(`First Clash: ${won ? 'won' : 'lost'} ${vs}.`);
  if (F.kills >= 2) out.push(`Felled ${F.kills} Champions ${vs}${won && F.kills === top ? ', the most on the field' : ''}.`);
  else if (F.kills === 1 && won && top === 1 && !prev.kills) out.push(`First Champion felled, ${vs}.`);
  if (F.best >= 8) out.push(`Landed a ${F.best}-damage blow ${vs}.`);
  if (F.reads) out.push(`Stood behind a READ that landed ${vs}.`);
  if (clutch && !fell) out.push(`Held the line in a win from the brink ${vs}.`);
  if (won && endHp != null && endHp > 0 && endHp <= 2) out.push(`Still standing on ${endHp} health at the end ${vs}.`);
  for (const m of [10, 25, 50, 100, 250, 500]) {
    if (prev.battles < m && stats.battles >= m) out.push(`${m} Clashes fought.`);
    if ((prev.kills || 0) < m && (stats.kills || 0) >= m) out.push(`${m} Champions felled, all told.`);
  }
  return out;
}

// ---- helpers -----------------------------------------------------------------
class EconError extends Error {}
const fail = (msg) => {
  throw new EconError(msg);
};
export const isEconError = (e) => e instanceof EconError;
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
const str = (v, max) => String(v ?? '').replace(/[<>]/g, '').slice(0, max);
function daily(s, now) {
  const d = dayKey(now);
  if (s.econ.day !== d) Object.assign(s.econ, { day: d, matches: 0, draft: 0, road: 0, ai: 0 });
}
// The shared win track: p is the econ prefix ('pvp' | 'story').
function winTrack(s, p, label, won, now, rewards) {
  const e = s.econ;
  if (!won) return void (e[p + 'Streak'] = 0);
  const d = dayKey(now);
  e[p + 'Streak'] = (e[p + 'Streak'] || 0) + 1;
  if (e[p + 'Day'] !== d) {
    Object.assign(e, { [p + 'Day']: d, [p + 'Wins']: 0 });
    givePacks(s.profile, WIN_REWARD.firstWin);
    rewards.push([`First ${label} win today`, packText(WIN_REWARD.firstWin)]);
  }
  e[p + 'Wins'] = (e[p + 'Wins'] || 0) + 1;
  s.profile.embers += WIN_REWARD.embers;
  rewards.push([`${label[0].toUpperCase() + label.slice(1)} win`, `+${WIN_REWARD.embers} Embers`]);
  if (e[p + 'Streak'] % WIN_REWARD.streakEvery === 0) {
    givePacks(s.profile, WIN_REWARD.streak);
    rewards.push([`${e[p + 'Streak']} ${label} wins in a row`, packText(WIN_REWARD.streak)]);
  }
}
const rewardRows = (label, r) => (packText(r) ? [[label, packText(r)]] : []);

// ---- the actions ---------------------------------------------------------------
// Each takes (vault, args, { now, seed }) and changes the vault in place, or
// throws. `seed` is fresh randomness from whoever runs it (the server, for
// signed-in players), used for packs and Spoils.
export const ACTIONS = {
  /** Open one pack of a type: a free charge or ticket for Standard, a ticket otherwise. */
  openPack(s, { type }, { now, seed }) {
    if (!['standard', 'collector', 'faction', 'event', 'oktober', 'mythic'].includes(type)) fail('Unknown pack.');
    const p = s.profile;
    if (type === 'standard' && s.free.charges > 0) {
      if (s.free.charges === 2) s.free.last = now;
      s.free.charges -= 1;
    } else if ((p.tickets[type] || 0) > 0) p.tickets[type] -= 1;
    else fail('No pack of that kind to open.');
    const label = { standard: 'Standard Pack', collector: 'Collector Pack', faction: 'Faction Pack', event: 'Firstfall Pack', oktober: 'Oktoberfest 2026 Pack', mythic: 'Mythic Pack' }[type];
    const r = type === 'mythic' ? openMythicPack(p, LIST, { seed }, { now }) : openPack(p, type, LIST, { seed }, { now, source: label });
    s.profile = r.profile;
    return { cards: r.cards };
  },

  /** Spend Chimes on a pack offer. */
  buyOffer(s, { offer }, { now }) {
    const o = OFFERS.find((x) => x.id === offer);
    if (!o) fail('Unknown offer.');
    if (!weeklyLeft(o, s.econ, now)) fail(`That's this week's ${o.weekly} ${o.name}s. More on Monday.`);
    const cost = offerPrice(o, s.econ);
    if (!buyWithChimes(s.profile, o.id, cost)) fail(`You need ${cost - (s.profile.chimes || 0)} more Chimes.`);
    if (o.weekly) {
      const wk = weekKey(now);
      const w = (s.econ.weekly ||= {});
      w[o.id] = w[o.id]?.week === wk ? { week: wk, n: w[o.id].n + 1 } : { week: wk, n: 1 };
    }
    if (o.firstChimes && !(s.econ.firstBuys || []).includes(o.id)) s.econ.firstBuys = [...(s.econ.firstBuys || []), o.id];
    return { name: o.name, chimes: cost };
  },

  craft(s, { cardId }, { now }) {
    const c = CARDS[cardId];
    if (!c || c.unique || !CRAFT[c.rarity]) fail('That card can’t be crafted.');
    if (CRAFT_OWN_FIRST.has(c.rarity) && !owned(s.profile, cardId)) fail('Pull this card first. Then Embers can make more copies of it for Ascension.');
    if (s.profile.embers < CRAFT[c.rarity]) fail(`Crafting needs ${CRAFT[c.rarity]} Embers.`);
    s.profile = craft(s.profile, cardId, c.rarity, now);
    return {};
  },

  /** Burn one spare standard copy (never your first copy of a card). */
  burn(s, { copyId }) {
    const it = s.profile.items[copyId];
    if (!it) fail('You don’t have that copy.');
    const copies = s.profile.copies[it.cardId] || [];
    if (copies[0] === copyId || it.treatment !== 'standard' || CARDS[it.cardId].unique) fail('Only spare standard copies can be burned.');
    const before = s.profile.embers;
    s.profile = burn(s.profile, copyId, rarityOf);
    return { embers: s.profile.embers - before };
  },

  /** Burn every standard copy beyond what you keep (1 + what the next Ascension needs). */
  burnSpares(s) {
    let gained = 0;
    for (const [id, copies] of Object.entries(s.profile.copies)) {
      if (CARDS[id]?.unique) continue; // one-of-ones are never burned
      const tier = s.profile.ascension[id] || 0;
      const reserve = 1 + (ascTier(id, tier)?.copies || 0);
      const std = copies.filter((x) => s.profile.items[x].treatment === 'standard');
      while (std.length > reserve) {
        const before = s.profile.embers;
        s.profile = burn(s.profile, std.pop(), rarityOf);
        gained += s.profile.embers - before;
      }
    }
    return { embers: gained };
  },

  ascend(s, { cardId }) {
    if (!CARDS[cardId]) fail('Unknown card.');
    s.profile = ascend(s.profile, cardId); // throws if you can't
    return {};
  },

  /** A deal at the Trade Hall. */
  trade(s, { trader, give = [], get = [] }, { now }) {
    const t = TRADERS.find((x) => x.id === trader);
    if (!t) fail('Unknown trader.');
    const week = weekOf(now);
    if (s.trade?.week !== week) s.trade = freshHall(week);
    const table = s.trade.traders[t.id];
    if (!Array.isArray(give) || !Array.isArray(get) || give.length > 12 || get.length > 6) fail('That offer doesn’t work.');
    const mine = give.map((c) => s.profile.items[c]);
    if (mine.some((it) => it && CARDS[it.cardId]?.unique)) fail('A one-of-one can only go to another player, not a trader.');
    if (mine.some((it) => !it || it.treatment === 'immortal')) fail('You can only offer copies you own.');
    if (new Set(give).size !== give.length || new Set(get).size !== get.length) fail('That offer doesn’t work.');
    const theirs = get.map((c) => table.items.find((i) => i.copyId === c));
    if (theirs.some((x) => !x)) fail('That copy isn’t on their table any more.');
    if (!dealValues(t, table, mine, theirs).ok) fail(`${t.name} wants more for that.`);
    const seal = tradeSeal([...mine, ...theirs], rarityOf);
    if (s.profile.embers < seal) fail(`The Trade Seal costs ${seal} Embers.`);
    const npc = { name: t.name, embers: 99999, items: Object.fromEntries(table.items.map((i) => [i.copyId, i])), copies: {} };
    for (const i of table.items) (npc.copies[i.cardId] ||= []).push(i.copyId);
    const res = executeTrade(s.profile, npc, give, get, { now, seal });
    s.profile = res.a;
    table.items = Object.values(res.b.items);
    table.wants = table.wants.filter((w) => !mine.some((it) => it.cardId === w));
    return { seal };
  },

  /** Training: each lesson hands out its Champions, once, in order. */
  lesson(s, { n }, { now }) {
    n = int(n, 0, TUTORIAL_GRANTS.length - 1);
    if (s.econ.lessons >= n) return { cards: [] }; // already given
    if (n !== s.econ.lessons + 1) fail('Finish the earlier lessons first.');
    for (const id of TUTORIAL_GRANTS[n]) if (!owned(s.profile, id)) grant(s.profile, id, { now: now - 30 * DAY, at: now, source: 'Starter Octave', origin: 'Earned in training at Cinderhold yard.' });
    s.econ.lessons = n;
    return { cards: TUTORIAL_GRANTS[n] };
  },

  /** Training done (finished or skipped): any starters still missing, and the reward. Once. */
  finishTraining(s, { skip = false } = {}, { now }) {
    if (s.econ.trained) return { rewards: [] };
    if (skip) for (const id of STARTER) if (!owned(s.profile, id)) grant(s.profile, id, { now: now - 30 * DAY, at: now, source: 'Starter Octave', origin: 'Starter hero (training skipped).' });
    s.econ.lessons = TUTORIAL_GRANTS.length - 1;
    s.econ.trained = true;
    givePacks(s.profile, TRAINING_REWARD);
    return { rewards: [['Reward', '+2 Pack Tickets']] };
  },

  /** The three daily objectives, done: one Pack Ticket a day. */
  claimObjectives(s, _a, { now }) {
    if (s.econ.objDay === dayKey(now)) fail('Already claimed today.');
    s.econ.objDay = dayKey(now);
    s.profile.tickets.standard += 1;
    return {};
  },

  /** The Daily Read, played: every 3rd day in a row a ticket, every 7th a Firstfall Pack. */
  dailyRead(s, _a, { now }) {
    const d = dayKey(now);
    const dr = s.econ.dr;
    if (dr.last === d) fail('Already played today.');
    dr.streak = dr.last === d - 1 || dr.last === null ? dr.streak + 1 : 1;
    dr.last = d;
    const r = {};
    if (dr.streak % 3 === 0) r.standard = 1;
    if (dr.streak % 7 === 0) r.event = 1;
    givePacks(s.profile, r);
    return { streak: dr.streak, reward: r };
  },

  /** The daily puzzle, solved on try 1–3: Embers, once a day. */
  puzzle(s, { tries }, { now }) {
    const d = dayKey(now);
    if (s.econ.puzzleDay === d) fail('Already solved today.');
    tries = int(tries, 1, PUZZLE_TRIES);
    s.econ.puzzleDay = d;
    const embers = 10 * (PUZZLE_TRIES + 1 - tries);
    s.profile.embers += embers;
    return { embers };
  },

  /** A Long Road run ended: Embers per stop, tickets for reaching the end. */
  roadEnd(s, { floor, wins, done }, { now }) {
    daily(s, now);
    if (s.econ.road >= LIMITS.roadPerDay) fail('That’s all the Long Road pays today.');
    floor = int(floor, 0, FLOORS - 1);
    const run = { floor, wins: int(wins, 0, floor + 1), done: done === 'victory' && floor === FLOORS - 1 ? 'victory' : 'over' };
    const pay = runRewards(run);
    s.econ.road++;
    s.profile.embers += pay.embers;
    s.profile.tickets.standard += pay.tickets;
    s.profile.tickets.collector += pay.collector;
    s.profile.tickets.event = (s.profile.tickets.event || 0) + pay.event;
    return { pay };
  },

  /** A match against the computer (or online) ended. Records what each
   *  Champion did on your copies, and pays: Spoils, Mastery, the weekly
   *  season, and the mode's own rewards (Ladder rank, Anomaly, Draft, Story, training). */
  matchEnd(s, a, { now, seed }) {
    const mode = a.mode;
    if (!['ladder', 'anomaly', 'draft', 'story', 'tutorial', 'road', 'pvp', 'rival', 'friendly', 'boss'].includes(mode)) fail('Unknown mode.');
    daily(s, now);
    if (now - (s.econ.lastMatch || 0) < LIMITS.matchGapMs) fail('Too soon since the last match.');
    s.econ.lastMatch = now;
    if (mode !== 'tutorial') s.econ.duels = (s.econ.duels || 0) + 1; // every Duel played (referrals count them)
    const paying = s.econ.matches < LIMITS.matchesPerDay;
    s.econ.matches++;
    const won = !!a.won;
    const clutch = won && !!a.clutch;
    const rewards = [];
    const opp = str(a.opp, 40) || 'an opponent';
    // where this happened, for the copies' histories
    const where = mode === 'tutorial' ? 'in training' : mode === 'story' ? `in ${str(a.kicker, 60) || 'the story'}` : mode === 'ladder' ? `on the Ladder (${tierName(s.ladder)})` : '';
    const vs = `against ${opp}${where ? ' ' + where : ''}`;

    // Legacy: each Champion that fought records the battle on your first copy
    const fought = [...new Set(Array.isArray(a.fought) ? a.fought : [])].filter((id) => CARDS[id] && owned(s.profile, id)).slice(0, 8);
    const F = (id) => {
      const f = a.feats?.[id] || {};
      return { kills: int(f.kills, 0, 5), dealt: int(f.dealt, 0, 300), best: int(f.best, 0, 40), reads: int(f.reads, 0, 7) };
    };
    const fell = new Set(Array.isArray(a.fell) ? a.fell : []);
    const top = Math.max(0, ...fought.map((id) => F(id).kills));
    for (const id of fought) {
      const copy = s.profile.copies[id][0];
      const it = s.profile.items[copy];
      const prev = { ...it.stats };
      const f = F(id);
      recordBattle(s.profile, copy, { clashes: 1, clashWins: fell.has(id) ? 0 : 1, readsHit: f.reads, finalWon: clutch, matchWon: won, kills: f.kills, dealt: f.dealt });
      const endHp = a.endHp?.[id] == null ? null : int(a.endHp[id], 0, 99);
      for (const line of historyLines(f, it.stats, prev, { vs, won, clutch, top, fell: fell.has(id), endHp })) addHistory(s.profile, copy, line, now);
    }
    if (!paying) return { rewards: [['Rewards', 'Daily limit reached']], spoils: null };
    // the story pays each chapter once: replays and lost attempts pay nothing
    const firstClear = mode === 'story' && won && s.story.chapter === int(a.chapter, 0, STORY_REWARDS.length - 1);
    if (mode === 'story' && !firstClear) return { rewards: [['Rewards', 'Chapter rewards are paid once']], spoils: null };
    // only ranked matches against real people pay without limit
    const human = mode === 'pvp' && !!a.pvp?.ranked && !a.pvp.echo;
    if (!human && mode !== 'tutorial' && mode !== 'draft') {
      if ((s.econ.ai || 0) >= AI_REWARDS_PER_DAY) {
        const out = [['Rewards', `Today's ${AI_REWARDS_PER_DAY} AI rewards are used · ranked online always pays`]];
        if (mode === 'ladder') {
          // your rank still moves; any rank rewards wait for the next paying match
          const before = tierName(s.ladder);
          ladderResult(s.ladder, won, clutch);
          const after = tierName(s.ladder);
          out.unshift(['Rank', after + (after !== before ? (won ? ' ▲' : ' ▼') : '')]);
        }
        return { rewards: out, spoils: null };
      }
      s.econ.ai = (s.econ.ai || 0) + 1;
    }

    // Mastery: each step a Champion reaches pays once
    for (const id of fought) {
      const lvl = masteryLevel(cardStats(s.profile, id));
      while ((s.mastery[id] || 0) < lvl) {
        const m = MASTERY[(s.mastery[id] = (s.mastery[id] || 0) + 1) - 1];
        applyReward(s.profile, m.reward);
        rewards.push([`Mastery · ${CARDS[id].name}`, `${m.name} · ${m.reward.tickets ? '+' + m.reward.tickets + ' Pack Ticket' : '+' + m.reward.embers + ' Embers'}`]);
      }
    }
    // the weekly season track
    if (won && mode !== 'tutorial') {
      const { season, reached } = seasonWin(s.season, now);
      s.season = season;
      for (const r of reached) {
        applyReward(s.profile, r.reward);
        rewards.push([`Season · ${r.wins} wins`, r.text]);
      }
    }
    // the mode's own rewards
    if (mode === 'ladder') {
      const before = tierName(s.ladder);
      ladderResult(s.ladder, won, clutch);
      const after = tierName(s.ladder);
      rewards.push(['Rank', after + (after !== before ? (won ? ' ▲' : ' ▼') : '')]);
      for (const { tier, reward } of rankRewards(s)) {
        givePacks(s.profile, reward);
        rewards.push([`Reached ${TIERS[tier]}`, packText(reward)]);
      }
      if (clutch) rewards.push(['Clutch win', '+1 bonus Note']);
    }
    // online: the server confirmed this match and its result (a.pvp is set only by it)
    if (mode === 'pvp' && a.pvp?.id) {
      const paid = (s.econ.pvpPaid ||= []);
      if (paid.includes(a.pvp.id)) fail('Already counted.');
      paid.push(a.pvp.id);
      if (paid.length > 60) paid.shift();
      if (a.pvp.ranked) winTrack(s, 'pvp', 'online', won, now, rewards); // Echoes count too
    }

    if (mode === 'anomaly' && won) {
      const r = anomalyWin(s, now);
      if (r) (givePacks(s.profile, r), rewards.push(['Anomaly · 3 wins this week', packText(r)]));
      else rewards.push(['Anomaly this week', `${Math.min(s.anomalyWeek.wins, 3)} / 3 wins${s.anomalyWeek.paid ? ' · Faction Pack earned' : ' → Faction Pack'}`]);
    }
    if (mode === 'draft') {
      if (s.econ.draft < LIMITS.draftsPerDay) {
        s.econ.draft++;
        s.profile.tickets.standard += won ? DRAFT_REWARD.won : DRAFT_REWARD.lost;
        rewards.push(['Draft reward', won ? '+2 Pack Tickets' : '+1 Pack Ticket']);
      }
    }
    if (mode === 'story' && won) {
      const n = int(a.chapter, 0, STORY_REWARDS.length - 1);
      if (s.story.chapter === n) {
        s.story.chapter = n + 1;
        givePacks(s.profile, STORY_REWARDS[n]);
        for (const [k, v] of Object.entries(STORY_REWARDS[n])) rewards.push(['Chapter reward', `+${v} ${k === 'collector' ? 'Collector' : 'Pack'} Ticket${v > 1 ? 's' : ''}`]);
      }
    }
    if (mode === 'tutorial' && a.final) {
      const r = ACTIONS.finishTraining(s, {}, { now });
      rewards.push(...r.rewards);
    }

    // Spoils: the winner takes a card (the first few wins a day), the loser a few Embers
    let spoils = null;
    if (mode !== 'tutorial' && mode !== 'draft' && !a.noSpoils) {
      const day = dayKey(now);
      if (s.spoils.day !== day) s.spoils = { day, n: 0 };
      if (!won) {
        s.profile.embers += SPOILS_EMBERS.loss;
        rewards.push(['For the effort', `+${SPOILS_EMBERS.loss} Embers`]);
      } else if (s.spoils.n >= SPOILS_PER_DAY) {
        s.profile.embers += SPOILS_EMBERS.capped;
        rewards.push(['Spoils', `+${SPOILS_EMBERS.capped} Embers (daily cards taken)`]);
      } else {
        const known = OPPONENT_SKILL[a.persona];
        const skill = known ?? Math.min(0.5, Math.max(0, Number(a.skill) || 0));
        const boost = Math.min(1, skill * 0.75 + (clutch ? 0.25 : 0));
        const round = int(a.round, 1, 12);
        const r = rollSpoils(s.profile, LIST, { seed }, { now, boost, source: 'Spoils', origin: `Taken as Spoils from ${opp}${where ? ' ' + where : ''}, round ${round}.` });
        s.profile = r.profile;
        s.spoils.n++;
        spoils = { cardId: r.cardId, rarity: r.rarity, isNew: r.isNew, copyId: r.copyId, left: SPOILS_PER_DAY - s.spoils.n };
      }
    }
    return { rewards, spoils };
  },

  /** Purchases already verified and taken off the purchases table (server). */
  grantPurchases(s, { products }, { now }) {
    const got = [];
    for (const id of products) {
      const p = grantProduct(s.profile, id, { now });
      if (p) (got.push({ id: p.id, name: p.name }), s.purchased.push(p.id));
    }
    return { got };
  },

  /** A tournament prize the server confirmed you won: the one-of-one card, once (econ.awards). */
  award(s, { event, cardId, line }, { now }) {
    const c = CARDS[cardId];
    if (!c?.unique) fail('Not a prize card.');
    const done = (s.econ.awards ||= []);
    if (done.includes(event)) return { card: null };
    done.push(event);
    grant(s.profile, cardId, { now, source: str(event, 60), origin: str(line, 200) });
    return { card: { id: cardId, name: c.name } };
  },

  /** Oktoberfest points milestones the server read from the scoreboard: their packs, each once. */
  eventPacks(s, { points }) {
    const paid = (s.econ.oktPaid ||= 0);
    const due = OKTOBER.packs.filter((m, i) => i >= paid && points >= m.at);
    if (!due.length) return { packs: 0, reached: [] };
    s.econ.oktPaid = paid + due.length;
    const n = due.reduce((a, m) => a + m.n, 0);
    s.profile.tickets.oktober = (s.profile.tickets.oktober || 0) + n;
    return { packs: n, reached: due.map((m) => m.at) };
  },

  /** Friends you invited who now count (the server checked their matches): their Pack Tickets, each once, up to the cap. */
  referrals(s, { count }) {
    const paid = s.econ.refPaid || 0;
    const { packs, newly } = owed(int(count, 0, 1e6), paid);
    if (!newly) return { newly: 0, packs: {} };
    s.econ.refPaid = paid + newly;
    for (const [k, n] of Object.entries(packs)) s.profile.tickets[k] = (s.profile.tickets[k] || 0) + n;
    return { newly, packs };
  },

  /** You joined with a friend's code and finished training: a welcome ticket, once. */
  refWelcome(s) {
    if (s.econ.refWelcome || !s.econ.trained) return { packs: null };
    s.econ.refWelcome = true;
    for (const [k, n] of Object.entries(REFERRAL.welcome)) s.profile.tickets[k] = (s.profile.tickets[k] || 0) + n;
    return { packs: REFERRAL.welcome };
  },

  /** Shared the game: a Standard Pack's worth of Chimes, once per account. */
  shareBonus(s) {
    if (s.econ.shared) return { chimes: 0 };
    s.econ.shared = true;
    s.profile.chimes = (s.profile.chimes || 0) + SHARE_CHIMES;
    return { chimes: SHARE_CHIMES };
  },

  /** An Alliance chest tier the server confirmed you claimed: its packs, once. */
  allianceChest(s, { week, tier, reward }) {
    const k = String(week);
    const done = (s.econ.alliance[k] ||= []);
    if (done.includes(tier)) return { reward: null };
    done.push(tier);
    givePacks(s.profile, reward);
    return { reward };
  },
};

// Actions a guest can run on their own device (the rest need the server).
export const SERVER_ONLY = new Set(['grantPurchases', 'allianceChest', 'award', 'eventPacks', 'referrals', 'refWelcome']);

/** Run one action on a copy of a vault. Returns { vault (the new one), result };
 *  throws EconError with a player-facing message, leaving the original untouched. */
export function apply(vault0, name, args = {}, { now = Date.now(), seed = (Math.random() * 2 ** 32) >>> 0 } = {}) {
  const fn = ACTIONS[name];
  if (!fn) fail('Unknown action.');
  const vault = JSON.parse(JSON.stringify(vault0));
  // older saves may be missing parts
  const d = freshVault(now);
  if (vault.rankPaid === undefined && vault.ladder) vault.rankPaid = vault.ladder.tier; // ranks reached before rewards existed
  for (const k of VAULT_KEYS) if (vault[k] === undefined) vault[k] = d[k];
  vault.econ ||= freshEcon();
  vault.econ.dr ||= { last: null, streak: 0 };
  vault.econ.alliance ||= {};
  tickFree(vault.free, now);
  try {
    const result = fn(vault, args || {}, { now, seed: seed >>> 0 || 7 });
    return { vault, result };
  } catch (e) {
    // the collection engine's own refusals ("Not enough Embers") read fine as they are
    if (e instanceof EconError) throw e;
    throw new EconError(e?.message || 'That didn’t work.');
  }
}

// ---- first sign-in: bring an existing collection into the server's vault ---------
/** A player's first vault comes from the save they already have, checked and
 *  bounded (the save was written by their own device). Chimes are capped at
 *  what they actually bought (`chimesPaid`), which the server knows. */
export function importVault(save, { now = Date.now(), chimesPaid = 0 } = {}) {
  const v = freshVault(now, str(save?.profile?.name, 18) || 'You');
  const p0 = save?.profile;
  if (p0 && typeof p0 === 'object') {
    const p = v.profile;
    p.created = Math.min(now, int(p0.created, 0, now) || now);
    p.embers = int(p0.embers, 0, 60000);
    p.chimes = int(p0.chimes, 0, chimesPaid);
    for (const k of Object.keys(p.tickets)) p.tickets[k] = k === 'oktober' ? 0 : int(p0.tickets?.[k], 0, 40); // Oktoberfest packs only come from the server
    p.pity = { legendary: int(p0.pity?.legendary, 0, 40), mythic: int(p0.pity?.mythic, 0, 120) };
    p.packsOpened = int(p0.packsOpened, 0, 100000);
    // copies: real cards only, a sane number of each, records with the right shape
    const items = p0.items && typeof p0.items === 'object' ? p0.items : {};
    for (const [cardId, list] of Object.entries(p0.copies || {})) {
      if (!CARDS[cardId] || CARDS[cardId].unique || !Array.isArray(list)) continue; // one-of-ones only come from the server
      for (const copyId of list.slice(0, 24)) {
        const it = items[copyId];
        if (!it || it.cardId !== cardId) continue;
        const treatment = ['standard', 'foil', 'altart', 'immortal'].includes(it.treatment) ? it.treatment : 'standard';
        if (treatment === 'immortal') continue; // Immortals only ever come from the server
        const clean = {
          copyId: str(copyId, 60),
          cardId,
          treatment,
          serial: null,
          firstOwner: str(it.firstOwner, 40),
          acquired: Math.min(now, int(it.acquired, 0, now)),
          source: str(it.source, 60),
          origin: it.origin ? str(it.origin, 160) : null,
          owners: (Array.isArray(it.owners) ? it.owners : []).slice(-20).map((o) => ({ name: str(o?.name, 40), from: Math.min(now, int(o?.from, 0, now)) })),
          history: (Array.isArray(it.history) ? it.history : []).slice(-40).map((h) => ({ at: Math.min(now, int(h?.at, 0, now)), text: str(h?.text, 160) })),
          stats: Object.fromEntries(['battles', 'kills', 'clashWins', 'readsHit', 'finalsWon', 'matchWins', 'dealt'].map((k) => [k, int(it.stats?.[k], 0, 1e6)])),
          honors: (Array.isArray(it.honors) ? it.honors : []).slice(0, 10).map((h) => str(h, 60)),
        };
        p.items[clean.copyId] = clean;
        (p.copies[cardId] ||= []).push(clean.copyId);
      }
    }
    for (const [id, t] of Object.entries(p0.ascension || {})) if (CARDS[id] && p.copies[id]) p.ascension[id] = int(t, 0, ASCENSION.length);
    p.nextCopy = Math.max(int(p0.nextCopy, 1, 1e9), Object.keys(p.items).length + 1);
  }
  const f = save?.free;
  if (f) v.free = { charges: int(f.charges, 0, 2), last: Math.min(now, int(f.last, 0, now) || now) };
  // progress that decides which rewards are still owed
  const l = save?.ladder;
  if (l) v.ladder = { tier: int(l.tier, 0, 6), div: int(l.div, 1, 5) || 5, notes: int(l.notes, 0, 3), wins: int(l.wins, 0, 1e6), losses: int(l.losses, 0, 1e6) };
  v.rankPaid = Math.min(v.ladder.tier, int(save?.rankPaid ?? v.ladder.tier, 0, 6));
  v.story = { chapter: int(save?.story?.chapter, 0, STORY_REWARDS.length) };
  for (const [id, n] of Object.entries(save?.mastery || {})) if (CARDS[id]) v.mastery[id] = int(n, 0, MASTERY.length);
  if (save?.season) v.season = { week: str(save.season.week, 12), wins: int(save.season.wins, 0, 500), claimed: int(save.season.claimed, 0, 10) };
  if (save?.anomalyWeek) v.anomalyWeek = { week: str(save.anomalyWeek.week, 12), wins: int(save.anomalyWeek.wins, 0, 100), paid: !!save.anomalyWeek.paid };
  if (save?.spoils) v.spoils = { day: save.spoils.day == null ? null : int(save.spoils.day, 0, 1e7), n: int(save.spoils.n, 0, SPOILS_PER_DAY) };
  v.purchased = (Array.isArray(save?.purchased) ? save.purchased : []).filter((id) => PRODUCTS.some((p) => p.id === id)).slice(0, 50);
  // training: someone who finished it has had its cards and reward
  const trained = save?.onboard === 'done';
  v.econ.trained = trained;
  v.econ.lessons = trained ? TUTORIAL_GRANTS.length - 1 : int(save?.tut?.granted ?? -1, -1, TUTORIAL_GRANTS.length - 1);
  if (save?.dr) v.econ.dr = { last: save.dr.last == null ? null : int(save.dr.last, 0, 1e7), streak: int(save.dr.streak, 0, 10000) };
  if (save?.daily?.claimed) v.econ.objDay = save.daily.key ?? null;
  if (save?.puzzle?.solved) v.econ.puzzleDay = save.puzzle.day ?? null;
  return v;
}

export { RARITY_ORDER };
