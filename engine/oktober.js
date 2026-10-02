// OKTOBERFEST 2026 — the first tournament. Shared by the pvp server (which
// keeps the score) and the game (which shows it). Pure: no I/O.
//
//  · Qualifying, all October: ranked online matches earn points. Real
//    opponents count fully; Echoes a little, a few times a day. The same
//    opponent counts only a few times a day, so friends can't farm each other.
//  · Finals, Halloween weekend (Sat 31 Oct – Sun 1 Nov, US Central): the top 8
//    play each other on their own ladder whenever they're free. Everyone
//    starts at 1000; Elo moves it. Highest finals rating at the end, with at
//    least MIN finals matches, takes the one-of-one.

export const OKTOBER = {
  id: 'oktober-2026',
  finalsId: 'oktober-2026-finals',
  name: 'Oktoberfest',
  start: Date.parse('2026-10-01T05:00:00Z'), // Thu 1 Oct, 00:00 Central
  qualEnd: Date.parse('2026-10-31T05:00:00Z'), // Sat 31 Oct, 00:00 Central
  finalsEnd: Date.parse('2026-11-02T06:00:00Z'), // Mon 2 Nov, 00:00 Central (clocks go back on 1 Nov)
  finalists: 8,
  points: { win: 3, loss: 1, echoWin: 1 },
  echoPointsPerDay: 3,
  sameOpponentPerDay: 3, // matches against one opponent that score, per day
  finals: { start: 1000, k: 32, minMatches: 3, perPair: 4 }, // perPair: finals matches between two finalists that count
  prize: 'The Eighth Bell, a one-of-one card that will never be reprinted',
  // everyone: qualifying points milestones pay Oktoberfest Packs (n each), once
  packs: [{ at: 10, n: 1 }, { at: 25, n: 1 }, { at: 50, n: 2 }, { at: 100, n: 3 }],
};

const DAY = 86400000;

/** 'soon' | 'qualifying' | 'finals' | 'over' */
export function phase(now = Date.now()) {
  if (now < OKTOBER.start) return 'soon';
  if (now < OKTOBER.qualEnd) return 'qualifying';
  if (now < OKTOBER.finalsEnd) return 'finals';
  return 'over';
}

/** A fresh scoreboard entry. */
export function freshEntry(userId, name) {
  return { user_id: userId, name, points: 0, wins: 0, losses: 0, matches: 0, rating: OKTOBER.finals.start, extra: {} };
}

/**
 * A ranked qualifying match ended. opp: the opponent's id ('echo' for an Echo).
 * Returns { entry, gained, note } (entry is a new object).
 */
export function scoreQualifying(entry0, { won, opp, echo = false, now = Date.now() }) {
  const e = { ...entry0, extra: { ...(entry0.extra || {}) } };
  const day = Math.floor(now / DAY);
  if (e.extra.day !== day) e.extra = { day, pairs: {}, echo: 0 };
  e.extra.pairs = { ...(e.extra.pairs || {}) };
  e.matches++;
  won ? e.wins++ : e.losses++;
  let gained = 0, note = null;
  if (echo) {
    if (won && e.extra.echo < OKTOBER.echoPointsPerDay) {
      gained = OKTOBER.points.echoWin;
      e.extra.echo += gained;
    } else if (won) note = 'Echo points are done for today';
  } else {
    const n = (e.extra.pairs[opp] || 0) + 1;
    e.extra.pairs[opp] = n;
    if (n <= OKTOBER.sameOpponentPerDay) gained = won ? OKTOBER.points.win : OKTOBER.points.loss;
    else note = 'This opponent has scored for you enough today';
  }
  e.points += gained;
  return { entry: e, gained, note };
}

/** Qualifying order: points, then wins, then who got there first. */
export function rankQualifying(rows) {
  return [...rows].sort((a, b) => b.points - a.points || b.wins - a.wins || String(a.updated_at).localeCompare(String(b.updated_at)));
}

/** A finals match between two finalists ended. Returns [a, b] updated, or null if this pair has played enough. */
export function scoreFinals(fa0, fb0, aWon) {
  const fa = { ...fa0, extra: { ...(fa0.extra || {}), pairs: { ...(fa0.extra?.pairs || {}) } } };
  const fb = { ...fb0, extra: { ...(fb0.extra || {}), pairs: { ...(fb0.extra?.pairs || {}) } } };
  if ((fa.extra.pairs[fb.user_id] || 0) >= OKTOBER.finals.perPair) return null;
  fa.extra.pairs[fb.user_id] = (fa.extra.pairs[fb.user_id] || 0) + 1;
  fb.extra.pairs[fa.user_id] = (fb.extra.pairs[fa.user_id] || 0) + 1;
  const ea = 1 / (1 + 10 ** ((fb.rating - fa.rating) / 400));
  const d = Math.round(OKTOBER.finals.k * ((aWon ? 1 : 0) - ea));
  fa.rating += d;
  fb.rating -= d;
  for (const [f, w] of [[fa, aWon], [fb, !aWon]]) (f.matches++, w ? f.wins++ : f.losses++);
  return [fa, fb];
}

const seedOf = (r) => r.extra?.seed ?? r.seed ?? 99;
/** Finals order (the Official Rules): those with enough matches first, then rating, most wins, higher seed. */
export function rankFinals(rows) {
  const ok = (r) => r.matches >= OKTOBER.finals.minMatches;
  return [...rows].sort((a, b) => ok(b) - ok(a) || b.rating - a.rating || b.wins - a.wins || seedOf(a) - seedOf(b));
}
/** Who wins: the top eligible finalist; if nobody played enough, most finals wins; if none were played, the top seed. */
export function championOf(rows) {
  if (!rows.length) return null;
  const ok = rows.filter((r) => r.matches >= OKTOBER.finals.minMatches);
  if (ok.length) return rankFinals(ok)[0];
  return [...rows].sort((a, b) => b.wins - a.wins || seedOf(a) - seedOf(b))[0];
}
