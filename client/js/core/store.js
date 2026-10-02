// Save data + progression. One JSON blob in localStorage (wrapped: storage
// can be unavailable in private modes; the game still runs in memory).
import { newProfile, grant } from '../../../engine/collection.js';
import { tierName as engineTierName } from '../../../engine/economy.js';

const KEY = 'threnyx.save.v1';
const DAY = 86400000;
export const FREE_PACK_MS = 12 * 3600000;

// The sixteen starter Champions. They are no longer handed over up front: the
// tutorial pays them out lesson by lesson (see screens/tutorial.js).
export { STARTER } from '../../../engine/economy.js';

export { TIERS } from '../../../engine/economy.js';

// Opponent personas: fictional duelists with human-like habits to learn.
// bias = the Order they fall back on under pressure; skill = 0..1 (Expert share).
// lines: what they say before the Clash, when they win, and when they lose.
// habit: one learnable pattern (the worker plays it) · honesty: how often the
// lean they show before you lock is their real Order (the rest are bluffs).
export const PERSONAS = [
  { id: 'marrow', name: 'Marrow', title: 'Scaffold-Rat', skill: 0.3, bias: { order: 'guard', p: 0.35 }, faction: 'margin', avatar: 'corbel', habit: { when: 'hurt', order: 'guard', p: 0.75, text: 'Guards when his Champion is hurt' }, honesty: 0.85, lines: { intro: 'Nobody watches the small ones. That’s your first mistake.', win: 'Forgotten already. Told you.', lose: 'Fine. Fine! The scaffold holds. Come back tomorrow.' } },
  { id: 'kess', name: 'Kess the Quick', title: 'Canal Duelist', skill: 0.45, bias: { order: 'strike', p: 0.3 }, faction: 'hour', avatar: 'lark', habit: { when: 'behind', order: 'strike', p: 0.7, text: 'Strikes when she is behind' }, honesty: 0.75, lines: { intro: 'I bill by the second. Let’s keep this short.', win: 'Time’s up. Pay at the door.', lose: 'Huh. You were worth the hour.' } },
  { id: 'quince', name: 'Sister Quince', title: 'Hymn-Singer', skill: 0.55, bias: { order: 'scheme', p: 0.25 }, faction: 'vigil', avatar: 'morrow', habit: { when: 'ahead', order: 'scheme', p: 0.65, text: 'Schemes when she is ahead' }, honesty: 0.7, lines: { intro: 'Sing with me, or be sung over.', win: 'Rest now. The choir will remember you.', lose: 'The Voice chose you tonight. Don’t make it regret that.' } },
  { id: 'tallowjack', name: 'Tallow-Jack', title: 'Ash-Runner', skill: 0.6, bias: { order: 'highest', p: 0.35 }, faction: 'crown', avatar: 'joss', habit: { when: 'always', order: 'highest', p: 0.5, text: 'Always swings for his biggest number' }, honesty: 0.8, lines: { intro: 'I’ve run the Ashfields barefoot. You don’t scare me.', win: 'Ash to ash. Next!', lose: 'Burnt. Good fight, though.' } },
  { id: 'vesper', name: 'Vesper Ruel', title: 'Warden of the Third Gate', skill: 0.75, bias: { order: 'guard', p: 0.15 }, faction: 'quiet', avatar: 'tessaly', habit: { when: 'never2', p: 0.8, text: 'Never gives the same Order twice in a lane' }, honesty: 0.6, lines: { intro: '(Vesper Ruel raises one hand. The gate closes behind you.)', win: '(One word, the only one she will say tonight:) Judged.', lose: '(She bows, once, and opens the gate.)' } },
  { id: 'hale', name: 'Oren Halewright', title: 'Paragon', skill: 0.85, bias: { order: 'strike', p: 0.12 }, faction: 'crown', avatar: 'brannoc', habit: { when: 'ahead', order: 'guard', p: 0.6, text: 'Turtles behind GUARD when ahead' }, honesty: 0.65, lines: { intro: 'Twenty-one years I have mourned. I can spare you a minute.', win: 'The Crown remembers its victories. I will not remember this one.', lose: 'Well struck. Tell them Halewright fell to you. They won’t believe it.' } },
  { id: 'archivist', name: 'The Archivist', title: 'Threnodist', skill: 0.97, bias: null, faction: 'quiet', avatar: 'maud', habit: { when: 'mirror', p: 0.45, text: 'Copies what you did last round' }, honesty: 0.45, lines: { intro: 'I have read every Clash you have fought. All of them. Shall we begin?', win: 'Filed.', lose: 'A new page. How rare.' } },
];

function fresh(now = Date.now()) {
  const profile = newProfile('You', now);
  return {
    v: 1,
    created: now,
    profile,
    octaves: [{ name: 'Starter Octave', cards: [] }],
    active: 0,
    onboard: 'tutorial', // tutorial -> done. Nothing else opens until the tutorial is finished.
    seenDuel: true, // new players learn the Duel in training; older saves get the one-time welcome (screens/tutorial.js)
    tut: { lesson: 0, granted: -1 },
    spoils: { day: null, n: 0 },
    unlock: { focus: false, read: false },
    story: { chapter: 0 },
    free: { charges: 2, last: now },
    daily: { key: null, objectives: [], claimed: false },
    dr: { last: null, streak: 0, winStreak: 0, played: {} },
    ladder: { tier: 0, div: 5, notes: 0, wins: 0, losses: 0 },
    rivals: {},
    stats: { matches: 0, wins: 0, readsUsed: 0, readsHit: 0, finals: 0 },
    settings: { sound: true, music: true, haptics: true, motion: true, voiceDuck: true, name: 'You' },
    pledge: null,
    claims: { crown: 0, quiet: 0, hour: 0, margin: 0, vigil: 0 },
    draft: null,
  };
}

let state = null;
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? JSON.parse(raw) : fresh();
    // Saves from before the forced tutorial that never finished onboarding start over.
    if (state.onboard !== 'done' && !state.tut) state = fresh();
    state.spoils ||= { day: null, n: 0 };
    // rank rewards pay from here on: ranks reached before they existed don't pay twice
    state.rankPaid ??= state.ladder?.tier || 0;
  } catch {
    state = fresh();
  }
  tickFree();
  rollDaily();
  save();
  return state;
}
export function get() {
  return state;
}
export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: keep playing in memory */
  }
  for (const f of listeners) f(state);
}
export function update(fn) {
  fn(state);
  state.updated = Date.now(); // cloud sync keeps the newer of two saves
  save();
}
// Swap in a whole save (from the cloud, on sign-in).
export function replace(next) {
  state = next;
  if (state.onboard !== 'done' && !state.tut) state = fresh();
  state.spoils ||= { day: null, n: 0 };
  tickFree();
  rollDaily();
  save();
}
export function onChange(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}
export function resetSave() {
  state = fresh();
  save();
}

// Free pack timer: one charge every 12h, max 2 stored.
export function tickFree(now = Date.now()) {
  const f = state.free;
  if (f.charges >= 2) {
    f.last = now;
    return;
  }
  const gained = Math.floor((now - f.last) / FREE_PACK_MS);
  if (gained > 0) {
    f.charges = Math.min(2, f.charges + gained);
    f.last = f.charges >= 2 ? now : f.last + gained * FREE_PACK_MS;
  }
}
export function nextFreeIn(now = Date.now()) {
  if (state.free.charges >= 2) return 0;
  return Math.max(0, state.free.last + FREE_PACK_MS - now);
}

// Starter grants: backdated so they clear the new-copy trade lock like before.
export function grantStarter(st, ids, origin) {
  for (const id of ids) grant(st.profile, id, { now: Date.now() - 30 * DAY, at: Date.now(), source: 'Starter Octave', origin });
}

export const dayKey = (now = Date.now()) => Math.floor(now / DAY);

// Daily objectives: three short goals, one reward.
const OBJECTIVES = [
  { id: 'win2', text: 'Win 2 Matches', goal: 2, stat: 'wins' },
  { id: 'play3', text: 'Play 3 Matches', goal: 3, stat: 'matches' },
  { id: 'read1', text: 'Switch with a READ', goal: 1, stat: 'readsHit' },
  { id: 'final1', text: 'Win a match with 6 Voice or less', goal: 1, stat: 'finals' },
  { id: 'fell5', text: 'Make 5 enemy Champions fall', goal: 5, stat: 'kills' },
  { id: 'duels', text: 'Win 6 duels', goal: 6, stat: 'duelsWon' },
];
export function rollDaily(now = Date.now()) {
  const k = dayKey(now);
  if (state.daily.key === k) return;
  const pick = [OBJECTIVES[k % 6], OBJECTIVES[(k + 2) % 6], OBJECTIVES[5]];
  state.daily = { key: k, objectives: pick.map((o) => ({ ...o, have: 0 })), claimed: false };
}
export function bumpObjective(stat, n = 1) {
  for (const o of state.daily.objectives) if (o.stat === stat) o.have = Math.min(o.goal, o.have + n);
}
export function objectivesDone() {
  return state.daily.objectives.every((o) => o.have >= o.goal);
}

export const tierName = (l = state.ladder) => engineTierName(l);

// Ladder results (Notes, divisions, ranks) are the vault's: engine/economy.js ladderResult.
