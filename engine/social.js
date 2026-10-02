// FRIENDS AND TRADING — the rules the game and the economy server share
// (docs/19-friends-trading.md).
//
// Safety first: there is no typed chat anywhere. Friends send each other
// messages from a fixed list (PRESETS). The server stores only a message's id
// and refuses any id that isn't on the list, so no words a player typed ever
// reach another player. Friends are added by friend code or from someone you've
// actually played, never by searching names, so strangers can't go looking for
// children.
//
// Trading moves real copies between two vaults. Offers can't be edited once
// sent (a new offer replaces an old one), so there's no switching cards at the
// last second, and the server checks everything again at the moment of the
// trade: who owns what, the locks, the Trade Seal, the daily limit.
import { CARDS } from './cards/index.js';
import { tradeSeal } from './collection.js';

// ---- preset messages ----------------------------------------------------------------
// `kind` groups them on screen. `duel` carries a challenge code (made by the pvp
// server, checked to be the sender's own open challenge).
export const PRESETS = [
  { id: 'hi', kind: 'hello', text: 'Hey!' },
  { id: 'on', kind: 'hello', text: 'I’m on now.' },
  { id: 'gl', kind: 'hello', text: 'Good luck!' },
  { id: 'brb', kind: 'hello', text: 'Be right back.' },
  { id: 'bye', kind: 'hello', text: 'Gotta go. See you!' },
  { id: 'duel', kind: 'duel', text: 'Wanna Duel?', code: true },
  { id: 'who', kind: 'duel', text: 'You sending the invite or am I?' },
  { id: 'isend', kind: 'duel', text: 'I’ll send the invite.' },
  { id: 'usend', kind: 'duel', text: 'You send the invite.' },
  { id: 'again', kind: 'duel', text: 'Rematch?' },
  { id: 'gg', kind: 'duel', text: 'Good game!' },
  { id: 'wp', kind: 'duel', text: 'Well played!' },
  { id: 'tcheck', kind: 'trade', text: 'Check that trade I sent.' },
  { id: 'twant', kind: 'trade', text: 'Want to trade?' },
  { id: 'tlook', kind: 'trade', text: 'Look in my Vault. Anything you want?' },
  { id: 'tmore', kind: 'trade', text: 'Can you add a little more?' },
  { id: 'tthanks', kind: 'trade', text: 'Thanks for the trade!' },
  { id: 'pull', kind: 'trade', text: 'Nice pull!' },
  { id: 'yes', kind: 'reply', text: 'Yes!' },
  { id: 'no', kind: 'reply', text: 'No thanks.' },
  { id: 'later', kind: 'reply', text: 'Maybe later.' },
  { id: 'ok', kind: 'reply', text: 'Okay.' },
  { id: 'thanks', kind: 'reply', text: 'Thanks!' },
];
export const PRESET = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
export const PRESET_KINDS = [
  ['duel', 'Duel'],
  ['trade', 'Trade'],
  ['reply', 'Reply'],
  ['hello', 'Hello'],
];
/** The words for a stored message (an unknown id shows nothing, never raw text). */
export const presetText = (id) => PRESET[id]?.text ?? '';

export const SOCIAL = {
  maxFriends: 100,
  maxPendingOut: 20, // requests waiting on other people
  msgPerHour: 40, // messages a player can send in an hour, to everyone
  msgGapMs: 2000, // between two messages to the same friend
  msgKeep: 40, // messages shown per friend (older ones stay out of view)
  recentDays: 14, // "people you've played" goes back this far
};

// ---- trading ------------------------------------------------------------------------
// Player trading is open: no account age, no Duel count, no daily limit, no
// wait on new cards, no fee. (The Trade Hall's traders keep their own Trade Seal,
// TRADE_RULES in engine/collection.js.) Only a saved profile is needed. The caps
// below just keep one offer or post a readable size.
export const TRADE = {
  minAccountDays: 0,
  minMatches: 0,
  dailyTrades: null, // no limit
  newCopyLockHours: 0, // new cards trade at once
  seal: false, // no Embers fee between players
  offerHours: 72, // an offer nobody answers expires
  listingDays: 7, // a Trade Board post comes down after a week
  maxOffersOut: 25, // offers waiting on other people
  maxListings: 10, // your posts on the Trade Board at once
  maxSide: 6, // copies on one side of a trade
  maxHave: 3, // copies in one Trade Board post
  maxWant: 3, // cards a post asks for
};

const HOUR = 3600000;
const DAY = 24 * HOUR;

/** When this copy reached its owner: its last change of hands (or when it was made). */
export function heldSince(it) {
  const last = it?.owners?.length ? it.owners[it.owners.length - 1].from : 0;
  return Math.max(it?.acquired || 0, last || 0);
}

/** Why this copy can't be traded right now, or null. */
export function copyLock(it, now = Date.now()) {
  if (!it) return 'You no longer own that card.';
  if (!TRADE.newCopyLockHours) return null;
  const left = heldSince(it) + TRADE.newCopyLockHours * HOUR - now;
  if (left > 0) return `New cards can be traded after ${TRADE.newCopyLockHours} hours (${Math.ceil(left / HOUR)}h to go).`;
  return null;
}

/** Duels played, for the trading requirement (older saves counted the Ladder only). */
export function played(v) {
  return Math.max(v?.econ?.duels || 0, (v?.ladder?.wins || 0) + (v?.ladder?.losses || 0));
}

/** Can this player trade at all? null, or the reason (what they still need). */
export function tradeBlock({ createdAt, vault, tradesToday = 0, now = Date.now() }) {
  const age = now - Date.parse(createdAt || 0);
  if (TRADE.minAccountDays && !(age >= TRADE.minAccountDays * DAY)) {
    const d = Math.max(1, Math.ceil((TRADE.minAccountDays * DAY - (age || 0)) / DAY));
    return `Trading opens ${TRADE.minAccountDays} days after you join (${d} day${d === 1 ? '' : 's'} to go).`;
  }
  const p = played(vault);
  if (TRADE.minMatches && p < TRADE.minMatches) return `Play ${TRADE.minMatches - p} more Duel${TRADE.minMatches - p === 1 ? '' : 's'} to start trading.`;
  if (TRADE.dailyTrades && tradesToday >= TRADE.dailyTrades) return `That’s ${TRADE.dailyTrades} trades today. More tomorrow.`;
  return null;
}

/** Check one side of a trade: the copies are this vault's, distinct, and unlocked. */
export function sideProblem(vault, ids, now = Date.now()) {
  if (!Array.isArray(ids) || ids.length > TRADE.maxSide || ids.some((c) => typeof c !== 'string')) return 'That offer doesn’t work.';
  if (new Set(ids).size !== ids.length) return 'That offer doesn’t work.';
  for (const c of ids) {
    const why = copyLock(vault?.profile?.items?.[c], now);
    if (why) return why;
  }
  return null;
}

export const rarityOf = (id) => CARDS[id]?.rarity ?? 'common';
/** The Trade Seal for a whole trade (each side pays it), by its rarest copy: none between players. */
export const sealOf = (items) => (TRADE.seal ? tradeSeal(items.filter(Boolean), rarityOf) : 0);

/** What another player sees of a copy: the card, its finish and its Legacy. */
export function copyView(it) {
  if (!it) return null;
  return {
    copyId: it.copyId,
    cardId: it.cardId,
    treatment: it.treatment || 'standard',
    serial: it.serial,
    acquired: it.acquired,
    owners: (it.owners || []).slice(-8),
    stats: it.stats,
    honors: it.honors || [],
    history: (it.history || []).slice(-12),
  };
}
/** A short record of a copy for an offer or a post (shown even after it moves). */
export const copyTag = (it) => ({ copyId: it.copyId, cardId: it.cardId, treatment: it.treatment || 'standard' });

/** Does `items` (copies) give exactly what a post wants: one copy of each wanted card? */
export function meetsWant(want, items) {
  if (!want?.length) return false;
  if (items.length !== want.length) return false;
  const need = [...want];
  for (const it of items) {
    const i = need.indexOf(it.cardId);
    if (i < 0) return false;
    need.splice(i, 1);
  }
  return need.length === 0;
}

// a copy id can come from another player's vault: if the new owner already has
// one with that id, the copy gets a fresh one
function freshId(profile, it) {
  if (!profile.items[it.copyId]) return it.copyId;
  let n = profile.nextCopy || 1;
  const base = `T${(profile.name || 'X').slice(0, 2).toUpperCase()}-${it.cardId}`;
  while (profile.items[`${base}-${n}`]) n++;
  profile.nextCopy = n + 1;
  return `${base}-${n}`;
}

/**
 * The trade itself, on two vaults (copies, never changed in place): A gives
 * `giveA`, B gives `giveB`, each pays `seal` Embers, and every copy's Legacy
 * gets its new owner. Returns { a, b, moved: { a: [ids B received], b: [ids A received] } }.
 */
export function swapVaults(a0, b0, giveA, giveB, { now = Date.now(), seal = 0, nameA, nameB } = {}) {
  const a = JSON.parse(JSON.stringify(a0));
  const b = JSON.parse(JSON.stringify(b0));
  const nA = nameA || a.profile.name;
  const nB = nameB || b.profile.name;
  const move = (from, to, fromName, toName, copyId) => {
    const it = from.profile.items[copyId];
    delete from.profile.items[copyId];
    from.profile.copies[it.cardId] = (from.profile.copies[it.cardId] || []).filter((c) => c !== copyId);
    it.copyId = freshId(to.profile, it);
    (it.owners ||= []).push({ name: toName, from: now });
    (it.history ||= []).push({ at: now, text: `Traded from ${fromName} to ${toName}.` });
    if (it.history.length > 40) it.history.splice(1, it.history.length - 40);
    to.profile.items[it.copyId] = it;
    (to.profile.copies[it.cardId] ||= []).push(it.copyId);
    return it.copyId;
  };
  const toB = giveA.map((c) => move(a, b, nA, nB, c));
  const toA = giveB.map((c) => move(b, a, nB, nA, c));
  a.profile.embers -= seal;
  b.profile.embers -= seal;
  return { a, b, moved: { a: toB, b: toA } };
}
