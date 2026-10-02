// THRENYX PvP server: the source. Every live match runs here with the same
// engine the game uses, and each player only ever receives their own view.
// Supabase can't import from other sites, so the deployed file is index.ts,
// this plus the engine in one file: after changing this or engine/, run
// `bash tools/bundle-functions.sh` and redeploy index.ts (docs/14-pvp-alliances.md).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { CARDS } from '../../../engine/cards/index.js';
import { createMatch, submitMove, expire, resign, viewFor, validDeck, deckProblem, elo, waitingOn, markSeen, dropCheck, addEmote } from '../../../engine/pvp.js';
import { makeDuelAI } from '../../../engine/duel-ai.js';
import { makeRng } from '../../../engine/rng.js';
import { textProblem } from '../../../engine/text-filter.js';
import { isGuestUser, GUEST_FRIEND_MATCHES, CHALLENGE_TTL_HOURS } from '../../../engine/guest.js';
import { OKTOBER, phase as oktoberPhase, freshEntry, scoreQualifying, rankQualifying, scoreFinals, rankFinals, championOf } from '../../../engine/oktober.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
class Oops extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
// names other players see (matches, leaderboard, Oktoberfest): a name that fails
// the word filter (engine/text-filter.js) shows as "Player"
const cleanName = (n: unknown) => {
  const s = String(n ?? 'Player').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 18);
  return s && !textProblem(s) ? s : 'Player';
};
// a stored name on its way out (saved before the filter, or an Echo label)
const shown = (n: unknown) => (typeof n === 'string' && n && !textProblem(n) ? n : 'Player');

async function profile(uid: string, name?: string, guest?: boolean) {
  const { data } = await admin.from('pvp_profiles').select('*').eq('user_id', uid).maybeSingle();
  const sameGuest = guest === undefined || !!data?.guest === guest;
  if (data && (!name || data.name === cleanName(name)) && data.name === cleanName(data.name) && sameGuest) return data;
  const row: any = { user_id: uid, name: cleanName(name ?? data?.name), updated_at: new Date().toISOString() };
  // guests stay off the leaderboard (supabase/guest.sql adds the column)
  if (guest !== undefined) row.guest = guest;
  const { data: up, error } = await admin.from('pvp_profiles').upsert(row).select().single();
  if (error) throw new Oops(error.message, 500);
  return up;
}

async function load(id: string) {
  const { data, error } = await admin.from('pvp_matches').select('*').eq('id', id).maybeSingle();
  if (error) throw new Oops(error.message, 500);
  if (!data) throw new Oops('No such match.', 404);
  return data;
}
const sideOf = (row: any, uid: string) => (row.a === uid ? 0 : row.b === uid ? 1 : -1);

// Save only if nobody else saved in between (both players act at once).
async function save(row: any, m: any) {
  const status = m.over ? 'over' : 'live';
  const { data, error } = await admin.from('pvp_matches').update({ data: m, version: m.version, status, updated_at: new Date().toISOString() }).eq('id', row.id).eq('version', row.version).select('id');
  if (error) throw new Oops(error.message, 500);
  if (!data?.length) return false;
  await admin.from('pvp_pings').upsert({ match_id: row.id, a: row.a, b: row.b, version: m.version, status, updated_at: new Date().toISOString() });
  if (m.over && !m.rated) await rate(row, m);
  return true;
}

// Save just "when each player was last heard from", without waking anyone.
// Keeps the later time for both sides in case the other player touched it too.
async function touch(row: any, m: any, who: number) {
  const { data: cur } = await admin.from('pvp_matches').select('version,seen:data->seen').eq('id', row.id).maybeSingle();
  if (!cur || cur.version !== row.version) return;
  if (cur.seen) m.seen = [0, 1].map((s) => Math.max(m.seen[s] ?? 0, cur.seen[s] ?? 0));
  await admin.from('pvp_matches').update({ data: m }).eq('id', row.id).eq('version', row.version);
}

// A match from before the Duel (the Reckoning) can't be played on: it ends with
// no result (no rating change, no rewards) and shows as a fresh, finished Duel.
function upgrade(m: any) {
  if (m.game === 'duel') return m;
  const decks = m.decks ?? [m.state?.p?.[0]?.octave, m.state?.p?.[1]?.octave];
  const fresh: any = createMatch({ seed: m.seed || 1, decks, names: m.names, ratings: m.ratings });
  Object.assign(fresh, { decks, echo: m.echo, finals: m.finals, friendly: m.friendly, rated: true, over: true, winner: null, by: 'update', deadline: 0, version: (m.version || 0) + 1 });
  fresh.state.over = true;
  fresh.results = [{ seq: 1, kind: 'end', winner: null, by: 'update' }];
  return fresh;
}

// Read, change, save; retried if the other player saved first.
async function mutate(id: string, uid: string, fn: (m: any, who: number, row: any) => void) {
  for (let i = 0; i < 5; i++) {
    const row = await load(id);
    const who = sideOf(row, uid);
    if (who < 0) throw new Oops('Not your match.', 403);
    const m = upgrade(row.data);
    fn(m, who, row);
    echoMoves(m);
    // connection: hearing from you keeps you in; 60 s of silence from the other side forfeits
    const now = Date.now();
    const last = m.seen?.[who] ?? 0;
    markSeen(m, who, now);
    dropCheck(m, now, m.echo ? [1] : []);
    if (m.version === row.version) {
      // nothing else changed: note when you were last here, quietly (no ping, no version)
      if (!m.over && now - last > 10000) await touch(row, m, who);
      return { m, who };
    }
    if (await save(row, m)) return { m, who };
  }
  throw new Oops('Busy, try again.', 409);
}

async function rate(row: any, m: any) {
  if (m.echo) return rateEcho(row, m);
  const { data: ps } = await admin.from('pvp_profiles').select('*').in('user_id', [row.a, row.b]);
  const pa = ps?.find((p: any) => p.user_id === row.a), pb = ps?.find((p: any) => p.user_id === row.b);
  if (!pa || !pb || m.winner == null) return;
  // a match with a guest is just for fun: no rating, no record, no tournament points
  if (pa.guest || pb.guest) {
    m.rated = true;
    m.ratingDelta = [0, 0];
    await admin.from('pvp_matches').update({ data: m }).eq('id', row.id);
    return;
  }
  const [ra, rb] = elo(pa.rating, pb.rating, m.winner === 0 ? 1 : 0);
  await admin.from('pvp_profiles').update({ rating: ra, wins: pa.wins + (m.winner === 0 ? 1 : 0), losses: pa.losses + (m.winner === 1 ? 1 : 0) }).eq('user_id', row.a);
  await admin.from('pvp_profiles').update({ rating: rb, wins: pb.wins + (m.winner === 1 ? 1 : 0), losses: pb.losses + (m.winner === 0 ? 1 : 0) }).eq('user_id', row.b);
  m.rated = true;
  m.ratingDelta = [ra - pa.rating, rb - pb.rating];
  await admin.from('pvp_matches').update({ data: m }).eq('id', row.id);
  if (m.finals) await safely(() => finalsResult(row.a, row.b, m.winner === 0));
  else if (!m.friendly) {
    await safely(() => qualifyingResult(row.a, pa.name, row.b, m.winner === 0, false));
    await safely(() => qualifyingResult(row.b, pb.name, row.a, m.winner === 1, false));
  }
}

// ---- Echoes --------------------------------------------------------------------
// When nobody else is searching, you can duel an Echo: the Octave a real player
// last took online (or, before anyone has, a house duelist's), played by the
// game's Expert AI here on the server. Always labelled as an Echo. It moves the
// moment it's its turn, never runs out of time, and counts for half rating.
const HOUSE = [
  { id: 'kess', name: 'Kess the Quick', faction: 'hour', rating: 1000 },
  { id: 'quince', name: 'Sister Quince', faction: 'vigil', rating: 1050 },
  { id: 'tallowjack', name: 'Tallowjack', faction: 'crown', rating: 1100 },
  { id: 'vesper', name: 'Warden Vesper', faction: 'quiet', rating: 1150 },
  { id: 'marrow', name: 'Marrow', faction: 'margin', rating: 950 },
];
function houseDeck(h: any) {
  // the same 5-from-their-faction + 3 others shape the game's own duelists use
  let x = [...h.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0 || 1;
  const rnd = () => (x = (x * 1103515245 + 12345) >>> 0) / 4294967296;
  const pool = (Object.values(CARDS) as any[]).filter((c) => !c.unique);
  const out: string[] = [], chars = new Set();
  for (const c of [...pool.filter((c) => c.faction === h.faction).sort(() => rnd() - 0.5).slice(0, 5), ...pool.filter((c) => c.faction !== h.faction).sort(() => rnd() - 0.5)]) {
    if (out.length === 8) break;
    if (chars.has(c.char)) continue;
    chars.add(c.char);
    out.push(c.id);
  }
  return out;
}
// a recent real Octave from someone else, near your rating
async function pickEcho(uid: string, rating: number) {
  const { data } = await admin.from('pvp_matches').select('a,b,decks:data->decks,names:data->names,ratings:data->ratings,echo:data->echo').eq('status', 'over').order('updated_at', { ascending: false }).limit(60);
  const seen = new Map<string, any>();
  for (const r of data ?? []) {
    [r.a, r.echo ? null : r.b].forEach((u: string | null, i: number) => {
      if (!u || u === uid || seen.has(u) || !validDeck(r.decks?.[i], CARDS)) return;
      seen.set(u, { name: shown(r.names[i]), rating: r.ratings?.[i] ?? 1000, deck: r.decks[i], real: true });
    });
  }
  const real = [...seen.values()].sort((x, y) => Math.abs(x.rating - rating) - Math.abs(y.rating - rating)).slice(0, 5);
  if (real.length) return real[Math.floor(Math.random() * real.length)];
  const h = HOUSE[Math.floor(Math.random() * HOUSE.length)];
  return { name: h.name, rating: h.rating, deck: houseDeck(h), real: false };
}
async function startEcho(uid: string, me: any, deck: string[], echo: any, id?: string) {
  const name = echo.real ? `Echo of ${echo.name}` : echo.name;
  const m = createMatch({ seed: seed(), decks: [deck, echo.deck], names: [me.name, name], ratings: [me.rating, echo.rating], });
  m.decks = [deck, echo.deck];
  m.echo = { name: echo.name, rating: echo.rating, real: !!echo.real };
  echoMoves(m);
  const row = { id: id ?? crypto.randomUUID(), a: uid, b: null, status: 'live', data: m, version: m.version };
  const { error } = await admin.from('pvp_matches').insert(row);
  if (error) throw new Oops(error.message, 500);
  await admin.from('pvp_pings').upsert({ match_id: row.id, a: uid, b: null, version: m.version, status: 'live' });
  return row.id;
}
// the Echo (side 1) answers at once whenever it's its turn
function echoMoves(m: any) {
  if (!m.echo || m.over || m.game !== 'duel') return;
  for (let i = 0; i < 4 && !m.over && waitingOn(m).includes(1); i++) {
    submitMove(m, 1, echoMove(m));
  }
}
// the Echo's turn, by the Duel AI (it plays the open state, like a person would)
function echoMove(m: any) {
  const bot = makeDuelAI({ skill: 0.85, rand: makeRng((m.seed ^ (m.version * 2654435761)) >>> 0) });
  const st = m.state, t = m.turn;
  if (t.phase === 'lead') return { lead: bot.lead(st) };
  if (t.phase === 'answer') return bot.answer(st, t.lead);
  return bot.finish(st, t.lead, t.answer.answer, t.answer.answerFocus);
}
async function rateEcho(row: any, m: any) {
  const { data: pa } = await admin.from('pvp_profiles').select('*').eq('user_id', row.a).maybeSingle();
  if (!pa || m.winner == null) return;
  const [ra] = elo(pa.rating, m.echo.rating, m.winner === 0 ? 1 : 0);
  const d = Math.round((ra - pa.rating) / 2);
  await admin.from('pvp_profiles').update({ rating: pa.rating + d, wins: pa.wins + (m.winner === 0 ? 1 : 0), losses: pa.losses + (m.winner === 1 ? 1 : 0) }).eq('user_id', row.a);
  m.rated = true;
  m.ratingDelta = [d, 0];
  await admin.from('pvp_matches').update({ data: m }).eq('id', row.id);
  await safely(() => qualifyingResult(row.a, pa.name, 'echo', m.winner === 0, true));
}

// ---- Oktoberfest (engine/oktober.js) ------------------------------------------
// The tournament never gets in the way of a match: if its table isn't set up
// yet (supabase/oktober.sql), scoring is skipped and play goes on.
async function safely(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.warn('oktober:', (e as Error).message);
  }
}
async function entry(event: string, uid: string, name: string) {
  const { data, error } = await admin.from('event_entries').select('*').eq('event', event).eq('user_id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? freshEntry(uid, name);
}
async function putEntry(event: string, e: any) {
  const { error } = await admin.from('event_entries').upsert({ ...e, event, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
async function qualifyingResult(uid: string, name: string, opp: string, won: boolean, echo: boolean) {
  if (oktoberPhase() !== 'qualifying') return;
  const e = await entry(OKTOBER.id, uid, name);
  const { entry: next, gained } = scoreQualifying({ ...e, name }, { won, opp, echo });
  if (gained || next.matches !== e.matches) await putEntry(OKTOBER.id, next);
}
// The finalists: the top 8 once qualifying closes, written once (the scores no longer change).
async function finalists() {
  if (oktoberPhase() === 'soon' || oktoberPhase() === 'qualifying') return [];
  const { data: have } = await admin.from('event_entries').select('*').eq('event', OKTOBER.finalsId);
  if (have?.length) return have;
  const { data: all } = await admin.from('event_entries').select('*').eq('event', OKTOBER.id).gt('points', 0).order('points', { ascending: false }).limit(50);
  const top = rankQualifying(all ?? []).slice(0, OKTOBER.finalists);
  if (!top.length) return [];
  await admin.from('event_entries').upsert(
    top.map((r: any, i: number) => ({ ...freshEntry(r.user_id, r.name), event: OKTOBER.finalsId, extra: { seed: i + 1, pairs: {} }, updated_at: new Date().toISOString() })),
    { onConflict: 'event,user_id', ignoreDuplicates: true },
  );
  const { data } = await admin.from('event_entries').select('*').eq('event', OKTOBER.finalsId);
  return data ?? [];
}
async function finalsResult(a: string, b: string, aWon: boolean) {
  if (oktoberPhase() !== 'finals') return;
  const rows = await finalists();
  const fa = rows.find((r: any) => r.user_id === a), fb = rows.find((r: any) => r.user_id === b);
  if (!fa || !fb) return;
  const out = scoreFinals(fa, fb, aWon);
  if (!out) return; // this pair has played its counted matches
  await putEntry(OKTOBER.finalsId, out[0]);
  await putEntry(OKTOBER.finalsId, out[1]);
}
async function oktober(uid: string) {
  const ph = oktoberPhase();
  const { data: rows } = await admin.from('event_entries').select('user_id,name,points,wins,losses,matches,updated_at').eq('event', OKTOBER.id).order('points', { ascending: false }).limit(100);
  const board = rankQualifying((rows ?? []).map((r: any) => ({ ...r, name: shown(r.name) })));
  let me = board.find((r: any) => r.user_id === uid) ?? null;
  let rank = me ? board.indexOf(me) + 1 : null;
  if (!me) {
    const { data } = await admin.from('event_entries').select('user_id,name,points,wins,losses,matches,updated_at').eq('event', OKTOBER.id).eq('user_id', uid).maybeSingle();
    if (data) {
      me = { ...data, name: shown(data.name) };
      const { count } = await admin.from('event_entries').select('user_id', { count: 'exact', head: true }).eq('event', OKTOBER.id).gt('points', data.points);
      rank = (count ?? 0) + 1;
    }
  }
  const fin = rankFinals(await finalists()).map((r: any) => ({ user_id: r.user_id, name: shown(r.name), rating: r.rating, wins: r.wins, losses: r.losses, matches: r.matches, seed: r.extra?.seed ?? null }));
  return {
    phase: ph,
    times: { start: OKTOBER.start, qualEnd: OKTOBER.qualEnd, finalsEnd: OKTOBER.finalsEnd },
    me: me ? { ...me, rank } : null,
    top: board.slice(0, 50).map((r: any, i: number) => ({ rank: i + 1, user_id: r.user_id, name: r.name, points: r.points, wins: r.wins, losses: r.losses })),
    players: board.length,
    finalists: fin,
    finalist: fin.some((r: any) => r.user_id === uid),
    champion: ph === 'over' ? championOf(fin) : null,
  };
}

// ---- the pulse: what's happening online right now (real numbers) ----------------
async function pulse() {
  const now = Date.now();
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  const [{ count: today }, { count: searching }, { data: active }, { data: recent }] = await Promise.all([
    admin.from('pvp_matches').select('id', { count: 'exact', head: true }).neq('status', 'open').gte('created_at', day.toISOString()),
    admin.from('pvp_queue').select('user_id', { count: 'exact', head: true }).is('match_id', null),
    admin.from('pvp_matches').select('a,b').gte('updated_at', new Date(now - 10 * 60000).toISOString()).limit(300),
    admin.from('pvp_matches').select('updated_at,names:data->names,winner:data->winner,echo:data->echo,delta:data->ratingDelta,friendly:data->friendly').eq('status', 'over').order('updated_at', { ascending: false }).limit(8),
  ]);
  const players = new Set<string>();
  for (const r of active ?? []) [r.a, r.b].forEach((u: string) => u && players.add(u));
  return {
    active: players.size + (searching ?? 0),
    searching: searching ?? 0,
    today: today ?? 0,
    recent: (recent ?? []).filter((r: any) => r.winner === 0 || r.winner === 1).map((r: any) => ({
      at: r.updated_at,
      winner: shown(r.names?.[r.winner]),
      loser: shown(r.names?.[1 - r.winner]),
      delta: r.delta?.[r.winner] ?? null,
      echo: !!r.echo,
      friendly: !!r.friendly,
    })),
  };
}

async function startMatch(a: any, b: any, id?: string, opts: { finals?: boolean; friendly?: boolean } = {}) {
  const m = createMatch({ seed: seed(), decks: [a.deck, b.deck], names: [a.name, b.name], ratings: [a.rating, b.rating], });
  m.decks = [a.deck, b.deck];
  if (opts.finals) m.finals = true;
  if (opts.friendly) m.friendly = true; // a friend's rematch stays friendly
  const row = { id: id ?? crypto.randomUUID(), a: a.user_id, b: b.user_id, status: 'live', data: m, version: m.version };
  const { error } = await admin.from('pvp_matches').insert(row);
  if (error) throw new Oops(error.message, 500);
  await admin.from('pvp_pings').upsert({ match_id: row.id, a: row.a, b: row.b, version: m.version, status: 'live' });
  return row.id;
}

// ---- challenge links (docs/18-guest-play.md) ------------------------------------------
const expired = (row: any) => Date.now() - Date.parse(row.created_at ?? row.updated_at ?? 0) > CHALLENGE_TTL_HOURS * 3600000;
async function peek(raw: unknown) {
  const code = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (code.length !== 6) return { status: 'invalid' };
  const { data: open } = await admin.from('pvp_matches').select('a,status,created_at,host:data->host').eq('code', code).maybeSingle();
  if (!open) return { status: 'invalid' };
  if (open.status !== 'open') return { status: 'taken' };
  if (expired(open)) return { status: 'expired' };
  return { status: 'open', name: shown(open.host?.name) };
}
async function isGuestId(id: string | null) {
  if (!id) return false;
  try {
    const { data } = await admin.auth.admin.getUserById(id);
    return isGuestUser(data?.user);
  } catch {
    return false;
  }
}
// Guests play friends only, only friends with a saved profile (so nobody can mint
// invitations to themselves), and only so many times.
async function guestMayPlay(uid: string, otherId: string | null) {
  if (!otherId || (await isGuestId(otherId))) throw new Oops('Save your profile to keep playing online.', 403);
  const { count } = await admin.from('pvp_matches').select('id', { count: 'exact', head: true }).or(`a.eq.${uid},b.eq.${uid}`);
  if ((count ?? 0) >= GUEST_FRIEND_MATCHES) throw new Oops('Save your profile to keep playing online.', 403);
}

// The deck must be yours: every Champion in it is checked against the
// server's copy of your collection (the vault, see the economy function).
async function checkDeck(uid: string, deck: unknown) {
  const problem = deckProblem(deck, CARDS);
  if (problem) throw new Oops(problem);
  const { data } = await admin.from('vaults').select('data').eq('user_id', uid).maybeSingle();
  if (!data) throw new Oops('Open the game while signed in once, so your collection is on the server.', 409);
  const copies = data.data?.profile?.copies ?? {};
  const missing = (deck as string[]).filter((id) => !(copies[id]?.length > 0));
  if (missing.length) throw new Oops(`You don't own ${missing.map((id) => CARDS[id]?.name ?? id).join(', ')}.`, 403);
}

const view = (m: any, who: number, since = 0) => ({ ...viewFor(m, who, since), echo: m.echo ? { real: !!m.echo.real } : null, finals: !!m.finals, next: m.next ?? null, ratingDelta: m.ratingDelta ? (who === 0 ? m.ratingDelta[0] : m.ratingDelta[1]) : null });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s*/i, '');
    const body = await req.json();
    const { action } = body;

    // a challenge link, opened by anyone (even before they have a player): who sent it, and is it still open?
    if (action === 'peek') return json(await peek(body.code));

    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) throw new Oops('Sign in to play online.', 401);
    const uid = user.id;
    const guest = isGuestUser(user);
    // Ranked, Echoes, Oktoberfest and making challenges need a saved profile
    if (guest && ['queue', 'echo', 'challenge'].includes(action)) throw new Oops('Save your profile to play Ranked and challenge friends.', 403);

    if (action === 'profile') return json(await profile(uid, body.name, guest));

    if (action === 'leaderboard') {
      // guests stay off the board (if supabase/guest.sql hasn't added the column yet, everyone shows)
      let { data, error } = await admin.from('pvp_profiles').select('user_id,name,rating,wins,losses').not('guest', 'is', true).order('rating', { ascending: false }).limit(50);
      if (error) ({ data } = await admin.from('pvp_profiles').select('user_id,name,rating,wins,losses').order('rating', { ascending: false }).limit(50));
      return json({ top: (data ?? []).map((r: any) => ({ ...r, name: shown(r.name) })), me: await profile(uid) });
    }

    if (action === 'queue') {
      await checkDeck(uid, body.deck);
      const me = await profile(uid, body.name);
      // already in a live match? go back to it
      const { data: live } = await admin.from('pvp_matches').select('id').or(`a.eq.${uid},b.eq.${uid}`).eq('status', 'live').limit(1);
      if (live?.length) return json({ matched: live[0].id });
      // Oktoberfest finals: finalists only, in their own pool, during the finals
      const finals = !!body.finals;
      if (finals) {
        if (oktoberPhase() !== 'finals') throw new Oops('The finals aren’t on right now.');
        if (!(await finalists()).some((r: any) => r.user_id === uid)) throw new Oops('Only the 8 finalists play in the finals.', 403);
      }
      const q: any = { user_id: uid, name: me.name, rating: me.rating, deck: body.deck, created_at: new Date().toISOString(), match_id: null };
      if (finals) q.pool = 'finals';
      else if (oktoberPhase() === 'finals') q.pool = 'ranked'; // back from the finals pool (the column exists by then)
      await admin.from('pvp_queue').upsert(q);
      const id = crypto.randomUUID();
      const { data: partner } = await admin.rpc('pvp_claim_partner', finals ? { p_user: uid, p_rating: me.rating, p_match: id, p_pool: 'finals' } : { p_user: uid, p_rating: me.rating, p_match: id });
      if (!partner?.length) return json({ queued: true });
      const p = partner[0];
      await startMatch({ user_id: p.user_id, name: p.name, rating: p.rating, deck: p.deck }, { user_id: uid, name: me.name, rating: me.rating, deck: body.deck }, id, { finals });
      await admin.from('pvp_queue').delete().in('user_id', [uid, p.user_id]);
      return json({ matched: id });
    }

    if (action === 'pulse') return json(await pulse());

    if (action === 'oktober') return json(await oktober(uid));

    if (action === 'echo') {
      await checkDeck(uid, body.deck);
      const me = await profile(uid, body.name);
      const { data: live } = await admin.from('pvp_matches').select('id').or(`a.eq.${uid},b.eq.${uid}`).eq('status', 'live').limit(1);
      if (live?.length) return json({ matched: live[0].id });
      await admin.from('pvp_queue').delete().eq('user_id', uid).is('match_id', null); // stop searching
      return json({ matched: await startEcho(uid, me, body.deck, await pickEcho(uid, me.rating)) });
    }

    if (action === 'cancel') {
      await admin.from('pvp_queue').delete().eq('user_id', uid).is('match_id', null);
      return json({ ok: true });
    }

    if (action === 'challenge') {
      await checkDeck(uid, body.deck);
      const me = await profile(uid, body.name);
      const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join('');
      const { data, error } = await admin.from('pvp_matches').insert({ a: uid, code, status: 'open', data: { host: { user_id: uid, name: me.name, rating: me.rating, deck: body.deck } } }).select('id').single();
      if (error) throw new Oops(error.message, 500);
      await admin.from('pvp_pings').upsert({ match_id: data.id, a: uid, version: 0, status: 'open' });
      return json({ id: data.id, code });
    }

    if (action === 'join') {
      await checkDeck(uid, body.deck);
      const code = String(body.code ?? '').toUpperCase().trim();
      const { data: open } = await admin.from('pvp_matches').select('*').eq('code', code).eq('status', 'open').maybeSingle();
      if (!open) throw new Oops('No open challenge with that code.', 404);
      if (expired(open)) throw new Oops('This Duel invitation has expired.', 410);
      if (open.a === uid) throw new Oops('That is your own challenge: send the code to a friend.');
      // a guest may answer a saved player's invitation, a few times, even past the guest limit
      if (guest) await guestMayPlay(uid, open.a);
      const me = await profile(uid, body.name, guest);
      const host = open.data.host;
      const m = createMatch({ seed: seed(), decks: [host.deck, body.deck], names: [host.name, me.name], ratings: [host.rating, me.rating], });
      m.decks = [host.deck, body.deck];
      m.friendly = true;
      const { data: took } = await admin.from('pvp_matches').update({ b: uid, status: 'live', data: m, version: m.version, code: null }).eq('id', open.id).eq('status', 'open').select('id');
      if (!took?.length) throw new Oops('Someone else took that challenge.', 409);
      await admin.from('pvp_pings').upsert({ match_id: open.id, a: open.a, b: uid, version: m.version, status: 'live' });
      return json({ matched: open.id });
    }

    if (action === 'status') {
      // an open challenge: has anyone joined yet?
      const row = await load(body.match);
      if (sideOf(row, uid) < 0) throw new Oops('Not your match.', 403);
      return json({ status: row.status });
    }

    if (action === 'view') {
      const { m, who } = await mutate(body.match, uid, (m) => expire(m, CARDS));
      return json(view(m, who, body.since ?? 0));
    }

    if (action === 'deploy' || action === 'command') throw new Oops('The game has been updated. Reload THRENYX to keep playing.', 409);

    if (action === 'move') {
      let err: string | null = null;
      const { m, who } = await mutate(body.match, uid, (m, who) => {
        if (m.game !== 'duel') return void (err = 'This match was made before the update. Forfeit it and start a new one.');
        expire(m, CARDS);
        const r = submitMove(m, who, body.move);
        if (!r.ok) err = r.error;
      });
      if (err) return json({ error: err, view: view(m, who, body.since ?? 0) }, 409);
      return json(view(m, who, body.since ?? 0));
    }

    if (action === 'emote') {
      // a quick phrase to the other player: saved with a new version so the ping wakes them
      let err: string | null = null;
      const { m, who } = await mutate(body.match, uid, (m, who) => {
        if (m.echo) return void (err = 'Echoes don’t chat.');
        const r = addEmote(m, who, body.id);
        if (r.ok) m.version++;
        else err = r.error;
      });
      if (err) return json({ error: err, view: view(m, who, body.since ?? 0) }, 409);
      return json(view(m, who, body.since ?? 0));
    }

    if (action === 'resign') {
      const { m, who } = await mutate(body.match, uid, (m, who) => resign(m, who));
      return json(view(m, who, body.since ?? 0));
    }

    if (action === 'rematch') {
      if (guest) {
        const { data: r0 } = await admin.from('pvp_matches').select('a,b').eq('id', body.match).maybeSingle();
        if (r0) await guestMayPlay(uid, r0.a === uid ? r0.b : r0.a);
      }
      let next: string | null = null;
      const { m, who } = await mutate(body.match, uid, (m, who, row) => {
        if (!m.over || m.next) return;
        m.rematch[who] = true;
        if (m.echo) m.rematch[1] = true; // an Echo is always up for another
        m.version++;
        if (m.rematch[0] && m.rematch[1]) {
          next = crypto.randomUUID();
          m.next = next;
        }
      });
      if (next && m.echo) {
        const me = await profile(uid);
        await startEcho(uid, me, m.decks[0], { ...m.echo, deck: m.decks[1] }, next);
      } else if (next) {
        const row = await load(body.match);
        // the rematch: same decks, sides swapped so the other player places first
        const [pa, pb] = [await profile(row.b), await profile(row.a)];
        await startMatch({ user_id: row.b, name: pa.name, rating: pa.rating, deck: m.decks[1] }, { user_id: row.a, name: pb.name, rating: pb.rating, deck: m.decks[0] }, next, { finals: !!m.finals && oktoberPhase() === 'finals', friendly: !!m.friendly });
      }
      return json(view(m, who, body.since ?? 0));
    }

    throw new Oops('Unknown action.');
  } catch (e) {
    const status = e instanceof Oops ? e.status : 500;
    return json({ error: (e as Error).message ?? String(e) }, status);
  }
});
