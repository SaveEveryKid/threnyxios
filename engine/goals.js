// GOALS — things to chase between matches.
//  · Mastery: four steps per Champion, earned by what that Champion does in
//    your hands (read from the per-copy battle stats in collection.js).
//  · The weekly season: wins this week fill a track with four rewards.
// Pure functions; the client stores what has been claimed.

export const MASTERY = [
  { name: 'Blooded', need: { battles: 3 }, text: 'Take the field 3 times', reward: { embers: 25 } },
  { name: 'Proven', need: { matchWins: 5 }, text: 'Win 5 matches with it', reward: { embers: 50 } },
  { name: 'Feared', need: { kills: 6 }, text: 'Fell 6 enemy Champions', reward: { embers: 75 } },
  { name: 'Legend', need: { matchWins: 15, dealt: 80 }, text: 'Win 15 matches and deal 80', reward: { tickets: 1 } },
];

/** A card's stats summed over every copy you own. */
export function cardStats(profile, cardId) {
  const out = { battles: 0, matchWins: 0, kills: 0, dealt: 0 };
  for (const c of profile.copies?.[cardId] || []) {
    const s = profile.items[c]?.stats || {};
    for (const k of Object.keys(out)) out[k] += s[k] || 0;
  }
  return out;
}

/** How many Mastery steps the stats have reached (steps are in order). */
export function masteryLevel(stats) {
  let n = 0;
  for (const m of MASTERY) {
    if (!Object.entries(m.need).every(([k, v]) => (stats[k] || 0) >= v)) break;
    n++;
  }
  return n;
}

/** Progress toward the next step, 0..1, with a label. */
export function masteryNext(stats) {
  const lvl = masteryLevel(stats);
  const m = MASTERY[lvl];
  if (!m) return null;
  const parts = Object.entries(m.need).map(([k, v]) => Math.min(1, (stats[k] || 0) / v));
  return { step: m, level: lvl, progress: Math.min(...parts), have: Object.fromEntries(Object.keys(m.need).map((k) => [k, stats[k] || 0])) };
}

// ---------------------------------------------------------------------------
// The weekly season (Monday to Monday, local time)
// ---------------------------------------------------------------------------
export const SEASON = [
  { wins: 3, reward: { tickets: 1 }, text: '1 Pack Ticket' },
  { wins: 6, reward: { embers: 100 }, text: '100 Embers' },
  { wins: 10, reward: { tickets: 2 }, text: '2 Pack Tickets' },
  { wins: 15, reward: { tickets: 3, embers: 150, event: 1 }, text: '3 Pack Tickets + 150 Embers + a Firstfall Pack' },
];

export function weekKey(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function weekEnds(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7);
  return d.getTime();
}

/** Record a win on the season track; returns the steps newly reached. */
export function seasonWin(season, now = Date.now()) {
  const wk = weekKey(now);
  if (!season || season.week !== wk) season = { week: wk, wins: 0, claimed: 0 };
  season.wins++;
  const reached = [];
  while (season.claimed < SEASON.length && season.wins >= SEASON[season.claimed].wins) reached.push(SEASON[season.claimed++]);
  return { season, reached };
}

export function applyReward(profile, r) {
  if (r.embers) profile.embers += r.embers;
  if (r.tickets) profile.tickets.standard += r.tickets;
  for (const k of ['collector', 'faction', 'event']) if (r[k]) profile.tickets[k] = (profile.tickets[k] || 0) + r[k];
}

// ---------------------------------------------------------------------------
// Where the rarer packs come from (docs/06 §8, docs/08): first time reaching
// each ladder rank, three Anomaly wins a week, clearing the Long Road, and
// Daily Read streaks. Each pays once.
// ---------------------------------------------------------------------------
export const RANK_REWARDS = [
  null, // Initiate: where everyone starts
  { standard: 2 }, // Chorister
  { faction: 1 }, // Cantor
  { faction: 1, standard: 1 }, // Arbiter
  { collector: 1 }, // Warden
  { collector: 1, faction: 1 }, // Paragon
  { collector: 2, event: 1 }, // Threnodist
];
export const PACK_NAME = { standard: 'Standard', collector: 'Collector', faction: 'Faction', event: 'Firstfall' };
export const packText = (r) =>
  Object.entries(r)
    .filter(([k, n]) => n && PACK_NAME[k])
    .map(([k, n]) => `+${n} ${PACK_NAME[k]} Pack${n > 1 ? 's' : ''}`)
    .join(' · ');
export function givePacks(profile, r) {
  for (const [k, n] of Object.entries(r)) if (PACK_NAME[k]) profile.tickets[k] = (profile.tickets[k] || 0) + n;
}

/** Ranks newly reached for the first time: [{ tier, reward }], and records them. */
export function rankRewards(s) {
  const out = [];
  s.rankPaid ??= 0; // store.load sets it for saves that already had a rank
  while (s.rankPaid < s.ladder.tier) {
    s.rankPaid++;
    const r = RANK_REWARDS[s.rankPaid];
    if (r) out.push({ tier: s.rankPaid, reward: r });
  }
  return out;
}

/** A win in the weekly Anomaly; the third pays a Faction Pack. */
export const ANOMALY_WINS = 3;
export function anomalyWin(s, now = Date.now()) {
  const wk = weekKey(now);
  if (s.anomalyWeek?.week !== wk) s.anomalyWeek = { week: wk, wins: 0, paid: false };
  s.anomalyWeek.wins++;
  if (!s.anomalyWeek.paid && s.anomalyWeek.wins >= ANOMALY_WINS) return (s.anomalyWeek.paid = true), { faction: 1 };
  return null;
}
