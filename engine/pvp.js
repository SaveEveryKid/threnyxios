// PVP MATCHES — the server's side of a live Duel between two people.
// Pure data in, pure data out, so the Supabase function (supabase/functions/
// pvp) stores a match as JSON and runs these, and tests run them in Node.
//
//  · The Duel is open: both hands are public. What stays on the server is the
//    draw order (the Reserve is shown sorted) and the RNG.
//  · Each duel is three turns: the Lead sends, the Answer answers (with Focus
//    or not), the Lead finishes (Focus, a READ switch). A finish with nothing
//    to decide is skipped.
//  · Each player gets viewFor(): always seen from their own side (they are
//    side 0 in every view).
//  · Every resolved duel is appended to `results`, so a client that missed one
//    plays them back in order; the log is also the replay.
//  · Shot clocks: a late player is played for when the clock runs out; three
//    timeouts in a row forfeit.
import { createDuel, playDuel, canRead, duelStats, cloneDuel } from './duel.js';
import { MYTHIC_MAX } from './deckbuild.js';

export const CLOCK = { move: 30000 }; // ms per turn
export const FORFEIT_AFTER = 3; // timeouts in a row
export const DROP_AFTER = 60000; // ms without hearing from a player: they forfeit

/** What's wrong with an Octave, in plain words, or null: 8 known Champions, one per character, at most one Mythic. */
export function deckProblem(ids, cards) {
  if (!Array.isArray(ids) || ids.length !== 8 || !ids.every((id) => cards[id])) return 'Your Octave needs 8 Champions.';
  if (new Set(ids.map((id) => cards[id].char)).size !== 8) return 'Your Octave needs 8 different Champions.';
  if (ids.filter((id) => cards[id].rarity === 'mythic').length > MYTHIC_MAX) return 'Only one Mythic per Octave.';
  return null;
}
export const validDeck = (ids, cards) => !deckProblem(ids, cards);

export function createMatch({ seed, decks, names = ['A', 'B'], ratings = [1000, 1000], now = Date.now(), rules = {} }) {
  const state = createDuel(decks, { seed, rules, names });
  const m = { v: 2, game: 'duel', seed, names, ratings, state, turn: { phase: 'lead', lead: null, answer: null }, seen: [now, now], results: [], timeouts: [0, 0], version: 0, deadline: 0, over: false, rated: false, rematch: [false, false] };
  arm(m, now);
  return m;
}

// ---- whose move it is --------------------------------------------------------
/** Sides that still have to act (one at most: the Duel takes turns). */
export function waitingOn(m) {
  if (m.over || m.state.over) return [];
  const L = m.state.lead;
  return [m.turn.phase === 'answer' ? 1 - L : L];
}
function arm(m, now) {
  m.deadline = waitingOn(m).length ? now + CLOCK.move : 0;
}
// does the Lead have anything to decide after the Answer?
function finishable(m) {
  const st = m.state, me = st.sides[st.lead];
  return me.focus > 0 || canRead(st, m.turn.answer.answer);
}

// ---- actions ------------------------------------------------------------------
/**
 * One turn. lead: { lead }; answer: { answer, answerFocus }; finish: { leadFocus, switchTo }.
 * Returns { ok, error }.
 */
export function submitMove(m, who, mv = {}, now = Date.now()) {
  if (m.over) return { ok: false, error: 'The match is over.' };
  if (!waitingOn(m).includes(who)) return { ok: false, error: 'Wait for your turn.' };
  const st = m.state, me = st.sides[who], t = m.turn;
  if (t.phase === 'lead') {
    if (!me.hand.includes(mv.lead)) return { ok: false, error: 'Not in your hand.' };
    t.lead = mv.lead;
    t.phase = 'answer';
  } else if (t.phase === 'answer') {
    if (!me.hand.includes(mv.answer)) return { ok: false, error: 'Not in your hand.' };
    t.answer = { answer: mv.answer, answerFocus: !!mv.answerFocus && me.focus > 0 };
    t.phase = 'finish';
    if (!finishable(m)) return (m.timeouts[who] = 0), resolve(m, { leadFocus: false, switchTo: null }, now), { ok: true };
  } else {
    const sw = mv.switchTo ?? null;
    if (sw != null && (sw === t.lead || !me.hand.includes(sw) || !canRead(st, t.answer.answer))) return { ok: false, error: 'You can’t switch to that Champion.' };
    if (mv.leadFocus && me.focus <= 0) return { ok: false, error: 'No Focus left.' };
    m.timeouts[who] = 0;
    resolve(m, { leadFocus: !!mv.leadFocus, switchTo: sw }, now);
    return { ok: true };
  }
  m.timeouts[who] = 0;
  m.version++;
  arm(m, now);
  return { ok: true };
}

function resolve(m, finish, now) {
  const st = m.state, t = m.turn;
  const choice = { lead: t.lead, ...t.answer, ...finish };
  const n = st.duel, lead = st.lead;
  playDuel(st, choice);
  m.results.push({ seq: m.results.length + 1, kind: 'duel', n, lead, choice, events: st.events.slice(), voice: [st.sides[0].voice, st.sides[1].voice] });
  m.turn = { phase: 'lead', lead: null, answer: null };
  if (st.over) finish_(m, st.winner, 'play', now);
  else {
    m.version++;
    arm(m, now);
  }
}

export function resign(m, who, now = Date.now()) {
  if (m.over) return;
  finish_(m, 1 - who, 'resign', now);
}

/** The clock ran out: a simple move for whoever is late. */
export function autoMove(m, who) {
  const st = m.state, hand = st.sides[who].hand;
  const big = (k) => [...hand].sort((a, b) => duelStats(b)[k] + st.sides[who].buff[b][k] - (duelStats(a)[k] + st.sides[who].buff[a][k]))[0];
  if (m.turn.phase === 'lead') return { lead: big('strike') };
  if (m.turn.phase === 'answer') return { answer: big('guard'), answerFocus: false };
  return { leadFocus: false, switchTo: null };
}

/** Past the clock: play for whoever is late. Returns true if anything changed. */
export function expire(m, cards, now = Date.now()) {
  if (m.over || !m.deadline || now < m.deadline) return false;
  const who = waitingOn(m)[0];
  if (who == null) return false;
  if (++m.timeouts[who] >= FORFEIT_AFTER) {
    finish_(m, 1 - who, 'timeout', now);
    return true;
  }
  const t = m.timeouts[who];
  m.results.push({ seq: m.results.length + 1, kind: 'timeout', side: who });
  submitMove(m, who, autoMove(m, who), now);
  m.timeouts[who] = t; // a move played for you doesn't reset the count
  return true;
}

function finish_(m, winner, by, now) {
  m.over = true;
  m.winner = winner;
  m.by = by;
  if (!m.state.over) {
    m.state.over = true;
    m.state.winner = winner;
  }
  m.results.push({ seq: m.results.length + 1, kind: 'end', winner, by });
  m.deadline = 0;
  m.version++;
}

// ---- emotes --------------------------------------------------------------------
// A short fixed set (no free text: nothing to moderate). One every EMOTE_GAP ms
// per player and EMOTE_MAX a match, so they stay fun and never flood a match.
export const EMOTES = [
  { id: 'gl', text: 'Good luck' },
  { id: 'wp', text: 'Well played' },
  { id: 'read', text: 'Nice read!' },
  { id: 'hmm', text: 'Hmm…' },
  { id: 'oops', text: 'Oops' },
  { id: 'bell', text: 'The bell tolls' },
];
export const EMOTE_GAP = 3000;
export const EMOTE_MAX = 30;
/** Returns { ok, error }. Doesn't touch the game, only m.emotes. */
export function addEmote(m, who, id, now = Date.now()) {
  if (!EMOTES.some((e) => e.id === id)) return { ok: false, error: 'Unknown emote.' };
  const list = (m.emotes ||= []);
  const sent = (m.emoteSent ||= [0, 0]); // the whole match (the list keeps only the recent ones)
  if (sent[who] >= EMOTE_MAX) return { ok: false, error: 'That’s enough emotes for one match.' };
  const last = (m.emoteAt ||= [0, 0]);
  if (sent[who] && now - last[who] < EMOTE_GAP) return { ok: false, error: 'Easy there.' };
  sent[who]++;
  last[who] = now;
  list.push({ n: (list.at(-1)?.n || 0) + 1, side: who, id, at: now });
  if (list.length > 12) list.splice(0, list.length - 12); // only the recent ones travel
  return { ok: true };
}

// ---- connection --------------------------------------------------------------
/** The player was heard from (any call about this match). */
export function markSeen(m, who, now = Date.now()) {
  (m.seen ||= [now, now])[who] = now;
}
/** Someone silent for DROP_AFTER forfeits. `present` lists sides that never drop (an Echo). Returns true if it ended the match. */
export function dropCheck(m, now = Date.now(), present = []) {
  if (m.over) return false;
  m.seen ||= [now, now];
  const gone = [0, 1].filter((s) => !present.includes(s) && now - m.seen[s] > DROP_AFTER);
  if (gone.length !== 1) return false; // both gone: wait, the first back wins
  finish_(m, 1 - gone[0], 'disconnect', now);
  return true;
}

// ---- rating (Elo; docs/11 names Glicko-2 as the later upgrade) ------------------
export function elo(ra, rb, scoreA, k = 32) {
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  const d = Math.round(k * (scoreA - ea));
  return [ra + d, rb - d];
}

// ---- what each player may see --------------------------------------------------
const flip = (s) => (s === 0 ? 1 : s === 1 ? 0 : s);
const swapKeys = (o) => (o && typeof o === 'object' && ('0' in o || '1' in o) ? { 0: o[1], 1: o[0] } : o);
export function mirrorEvent(e) {
  const o = { ...e };
  for (const k of ['side', 'lead', 'winner']) if (k in o) o[k] = flip(o[k]);
  for (const k of ['ids', 'power']) if (k in o) o[k] = swapKeys(o[k]);
  return o;
}
/** A Duel state seen from side 1 (who becomes side 0). */
export function mirrorState(s0) {
  const s = cloneDuel(s0);
  s.sides = [s.sides[1], s.sides[0]];
  s.names = s.names && [s.names[1], s.names[0]];
  s.lead = flip(s.lead);
  s.winner = flip(s.winner);
  s.history = s.history.map((h) => ({ ...h, lead: flip(h.lead), ids: swapKeys(h.ids), voice: [h.voice[1], h.voice[0]], result: h.result && { ...h.result, ...('winner' in h.result ? { winner: flip(h.result.winner) } : {}) } }));
  s.events = s.events.map(mirrorEvent);
  return s;
}
// the open state, without the draw order or the RNG
function publicDuel(st) {
  const s = cloneDuel(st);
  s.seed = 0;
  for (const side of s.sides) side.reserve.sort();
  return s;
}
const pair = (a, who) => (who === 0 ? a : [a[1], a[0]]);
const flip2 = (s, who) => (who === 0 ? s : flip(s));

/**
 * The match as `who` may see it, from `who`'s side (always side 0), with the
 * results after `since` (so a client catches up in order).
 */
export function viewFor(m, who, since = 0) {
  const pub = publicDuel(m.state);
  const state = who === 0 ? pub : mirrorState(pub);
  const t = m.turn;
  return {
    version: m.version,
    game: 'duel',
    you: who,
    names: pair(m.names, who),
    ratings: pair(m.ratings, who),
    // the turn in progress: what's already on the table
    turn: { phase: m.over ? 'over' : t.phase, lead: t.lead, answer: t.answer && { ...t.answer } },
    waiting: waitingOn(m).map((s) => (s === who ? 'you' : 'them')),
    deadline: m.deadline,
    now: Date.now(),
    oppSeen: m.seen && !m.echo ? m.seen[1 - who] : null, // for "reconnecting…" on the other side
    emotes: (m.emotes || []).map((e) => ({ n: e.n, id: e.id, mine: e.side === who })),
    over: m.over,
    winner: m.over ? flip2(m.winner, who) : null,
    by: m.by || null,
    rematch: pair(m.rematch, who),
    state,
    results: m.results
      .filter((r) => r.seq > since)
      .map((r) => {
        const out = { seq: r.seq, kind: r.kind };
        if (r.kind === 'timeout') out.side = r.side === who ? 0 : 1;
        if (r.kind === 'end') (out.winner = flip2(r.winner, who)), (out.by = r.by);
        if (r.kind === 'duel') {
          out.n = r.n;
          out.lead = flip2(r.lead, who);
          out.choice = { ...r.choice };
          out.events = who === 0 ? r.events : r.events.map(mirrorEvent);
          out.voice = pair(r.voice, who);
        }
        return out;
      }),
  };
}
