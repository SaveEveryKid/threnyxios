// REFERRALS and the one-time share bonus. Shared by the economy server (which
// decides who counts and pays) and the game (which shows it). Pure: no I/O.
//
// A friend counts once they've saved their profile and played DUELS Duels (any
// kind: the same 5 Duels a guest gets before saving, so the reward lands right as
// they sign up). One inviter's rewards stop at CAP friends, and only packs are
// paid, never Chimes.

export const REFERRAL = {
  enterDays: 7, // a code can be entered in your account's first week
  duels: 5, // completed Duels (not training), on a saved profile
  cap: 10, // friends that pay; more still show on your count
  perFriend: { standard: 1 }, // Pack Tickets for each friend who counts
  milestones: [
    { at: 3, packs: { collector: 1 } },
    { at: 5, packs: { collector: 1 } },
    { at: 10, packs: { collector: 2 } },
  ],
  welcome: { standard: 1 }, // the new player, once they finish training
};

// The one-time share bonus: a Standard Pack's worth of Chimes.
export const SHARE_CHIMES = 120;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
/** A 6-character invite code from random numbers (the server retries on a clash). */
export function makeCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}
export const cleanCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

/**
 * Does a referred friend count yet? `duels`: their completed Duels (vault
 * econ.duels); `guest`: still playing as a guest (they count once they save).
 * Returns { ok, duels }.
 */
export function progress({ duels = 0, guest = false } = {}) {
  return { duels, ok: !guest && duels >= REFERRAL.duels };
}

/** What `count` friends who counted are owed, given `paid` already paid for. Returns { packs, newly }. */
export function owed(count, paid) {
  const n = Math.min(count, REFERRAL.cap);
  const packs = {};
  const add = (o) => Object.entries(o).forEach(([k, v]) => (packs[k] = (packs[k] || 0) + v));
  for (let i = paid + 1; i <= n; i++) {
    add(REFERRAL.perFriend);
    for (const m of REFERRAL.milestones) if (m.at === i) add(m.packs);
  }
  return { packs, newly: Math.max(0, n - paid) };
}
