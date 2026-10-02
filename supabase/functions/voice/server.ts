// THRENYX live voice server: the source (docs/17-voice-chat.md). It decides,
// on every call, whether two players in a match may talk (engine/voice-policy.js),
// runs the age, card and ID checks, and brokers the audio through Cloudflare
// Realtime. Players never see Cloudflare or Stripe keys, each other's session
// ids, or why the other player can't talk.
// The deployed file is index.ts: run `bash tools/bundle-functions.sh` after
// changing this or engine/, and redeploy index.ts.
//
// Secrets (Supabase → Edge Functions → Secrets), never in the game:
//   CF_REALTIME_APP_ID, CF_REALTIME_APP_SECRET   Cloudflare Realtime (SFU) app
//   STRIPE_SECRET_KEY                            card check and ID check
//   SITE_URL                                     where Stripe sends players back
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { ageBand, matchPolicy, accountPolicy, NOTICE_VERSION, VOICE_EVENTS } from '../../../engine/voice-policy.js';
import { PASSES, passActive } from '../../../engine/shop.js';
import { isGuestUser } from '../../../engine/guest.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
class Oops extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}
const nowIso = () => new Date().toISOString();
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

// ---- switches ---------------------------------------------------------------------
const FLAG_DEFAULTS: Record<string, boolean> = { voiceSystemEnabled: true, friendVoiceEnabled: true, rankedVoiceEnabled: true, parentalVoiceControlsEnabled: false };
let flagCache: { at: number; flags: Record<string, boolean> } | null = null;
async function flags() {
  if (flagCache && Date.now() - flagCache.at < 30000) return flagCache.flags;
  const { data } = await admin.from('app_flags').select('key,value');
  const f = { ...FLAG_DEFAULTS };
  for (const r of data ?? []) if (r.key in f) f[r.key] = !!r.value;
  flagCache = { at: Date.now(), flags: f };
  return f;
}

// ---- one account ------------------------------------------------------------------
async function account(uid: string) {
  const { data } = await admin.from('voice_accounts').select('*').eq('user_id', uid).maybeSingle();
  return data ?? { user_id: uid, band: null, card_ok: false, card_funding: null, id_adult: false, friend_on: false, ranked_on: false, notice_version: 0 };
}
async function saveAccount(uid: string, patch: Record<string, unknown>) {
  const { error } = await admin.from('voice_accounts').upsert({ user_id: uid, ...patch, updated_at: nowIso() });
  if (error) throw new Oops(error.message, 500);
}
async function hasPass(uid: string) {
  const products = Object.values(PASSES).map((p: any) => p.product);
  const { data } = await admin.from('purchases').select('product').eq('user_id', uid).in('product', products).is('refunded_at', null);
  return passActive((data ?? []).map((r: any) => r.product));
}
// what engine/voice-policy.js needs, from the stored row
async function policyInput(uid: string) {
  const a: any = await account(uid);
  let guest = false;
  try {
    guest = isGuestUser((await admin.auth.admin.getUserById(uid)).data?.user);
  } catch {}
  const live = !a.restricted_until || Date.parse(a.restricted_until) > Date.now();
  return {
    guest,
    band: a.band ?? null,
    cardCheck: a.card_ok ? { ok: true, funding: a.card_funding } : null,
    idAdult: !!a.id_adult,
    pass: await hasPass(uid),
    prefs: { friend: !!a.friend_on && a.notice_version >= NOTICE_VERSION, ranked: !!a.ranked_on && a.notice_version >= NOTICE_VERSION },
    restriction: live && (a.restricted_friend || a.restricted_ranked) ? { friend: !!a.restricted_friend, ranked: !!a.restricted_ranked } : null,
    row: a,
  };
}
// the player's own voice status (Settings → Voice): their own facts only
async function status(uid: string) {
  const p = await policyInput(uid);
  const f = await flags();
  const pol = accountPolicy(p, f);
  return {
    flags: { voice: f.voiceSystemEnabled, friend: f.friendVoiceEnabled, ranked: f.rankedVoiceEnabled },
    ageSet: p.band != null,
    friend: pol.friend,
    ranked: pol.ranked,
    card: { ok: !!p.row.card_ok, prepaid: p.row.card_funding === 'prepaid' && !p.row.card_ok },
    id: !!p.idAdult,
    pass: p.pass,
    prefs: { friend: !!p.row.friend_on, ranked: !!p.row.ranked_on },
    notice: { accepted: (p.row.notice_version ?? 0) >= NOTICE_VERSION, version: NOTICE_VERSION },
    ready: { audio: !!(env('CF_REALTIME_APP_ID') && env('CF_REALTIME_APP_SECRET')), stripe: !!env('STRIPE_SECRET_KEY') },
  };
}

// ---- a match ----------------------------------------------------------------------
async function matchRow(id: string, uid: string) {
  if (typeof id !== 'string' || !id) throw new Oops('No match.');
  const { data } = await admin.from('pvp_matches').select('id,a,b,status,friendly:data->friendly,echo:data->echo').eq('id', id).maybeSingle();
  if (!data) throw new Oops('No such match.', 404);
  const who = data.a === uid ? 0 : data.b === uid ? 1 : -1;
  if (who < 0) throw new Oops('Not your match.', 403);
  return { row: data, who, other: who === 0 ? data.b : data.a };
}
async function blockedBetween(x: string, y: string | null) {
  if (!y) return { either: false, mine: false };
  const { data } = await admin.from('player_blocks').select('blocker,blocked').in('blocker', [x, y]).in('blocked', [x, y]);
  const rows = (data ?? []).filter((r: any) => r.blocker !== r.blocked);
  return { either: rows.length > 0, mine: rows.some((r: any) => r.blocker === x) };
}
const sfuReady = () => !!(env('CF_REALTIME_APP_ID') && env('CF_REALTIME_APP_SECRET'));
// whether these two may talk right now, from `uid`'s side
async function decide(matchId: string, uid: string) {
  const { row, who, other } = await matchRow(matchId, uid);
  const kind = row.echo ? 'echo' : row.friendly ? 'friend' : 'ranked';
  const blocks = await blockedBetween(uid, other);
  const accounts = row.echo || !other ? [] : await Promise.all([row.a, row.b].map((u: string) => policyInput(u)));
  const pol = row.echo || !other
    ? { available: false, mine: { ok: false, reason: 'not_voice_match' } }
    : matchPolicy({ kind, echo: !!row.echo, accounts, flags: await flags(), blocked: blocks.either }, who);
  const live = row.status === 'live';
  const available = pol.available && live && sfuReady();
  const mine = !live ? { ok: false, reason: 'not_voice_match' } : pol.mine.ok && !sfuReady() ? { ok: false, reason: 'unavailable' } : pol.mine;
  return { row, who, other, kind, available, mine, iBlocked: blocks.mine };
}
const sessionId = (match: string, uid: string) => `${match}:${uid}`;
async function sessionOf(match: string, uid: string | null) {
  if (!uid) return null;
  const { data } = await admin.from('voice_sessions').select('*').eq('id', sessionId(match, uid)).maybeSingle();
  return data && !data.left_at ? data : null;
}
async function ping(row: any) {
  const { data } = await admin.from('voice_pings').select('seq').eq('match_id', row.id).maybeSingle();
  await admin.from('voice_pings').upsert({ match_id: row.id, a: row.a, b: row.b, seq: (data?.seq ?? 0) + 1, updated_at: nowIso() });
}
// leave voice: the server stops forwarding this player's microphone at once
async function endSession(s: any) {
  if (!s) return;
  if (s.cf_session && s.mid) await safely(() => cf(`/sessions/${s.cf_session}/tracks/close`, 'PUT', { tracks: [{ mid: s.mid }], force: true }));
  await admin.from('voice_sessions').update({ left_at: nowIso(), updated_at: nowIso() }).eq('id', s.id);
}
async function safely(fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { console.warn('voice', (e as Error).message); }
}

// ---- Cloudflare Realtime (SFU) ----------------------------------------------------
async function cf(path: string, method: string, body?: unknown) {
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${env('CF_REALTIME_APP_ID')}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env('CF_REALTIME_APP_SECRET')}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.errorCode) throw new Oops(`Voice relay: ${j.errorDescription || r.status}`, 502);
  return j;
}

// ---- Stripe (card check, ID check), by its HTTPS API ------------------------------
function form(obj: Record<string, unknown>, pre = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = pre ? `${pre}[${k}]` : k;
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' ? form(x, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x))));
    else if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripe(path: string, method = 'GET', params?: Record<string, unknown>) {
  if (!env('STRIPE_SECRET_KEY')) throw new Oops('Checks aren’t set up yet. Try again later.', 503);
  const q = params ? form(params).toString() : '';
  const r = await fetch(`https://api.stripe.com/v1${path}${method === 'GET' && q ? '?' + q : ''}`, {
    method,
    headers: { Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : q,
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Oops(j.error?.message || `Stripe ${r.status}`, 502);
  return j;
}
const backTo = (returnTo: unknown) => (typeof returnTo === 'string' && /^https:\/\//.test(returnTo) ? returnTo.split('#')[0] : env('SITE_URL'));

// ---- limits -----------------------------------------------------------------------
async function limit(uid: string, name: string, max: number, windowMs: number, msg: string) {
  const { count } = await admin.from('voice_events').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('name', name).gte('created_at', ago(windowMs));
  if ((count ?? 0) >= max) throw new Oops(msg, 429);
  await admin.from('voice_events').insert({ user_id: uid, name, created_at: nowIso() });
}
async function event(uid: string, name: string, match?: string | null, meta?: Record<string, unknown> | null) {
  await safely(async () => {
    await admin.from('voice_events').insert({ user_id: uid, match_id: match ?? null, name, meta: meta ?? null, created_at: nowIso() });
  });
}
// product numbers only: short names and numbers, never text the player typed
function cleanMeta(m: unknown) {
  if (!m || typeof m !== 'object') return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(m).slice(0, 8)) {
    if (!/^[a-zA-Z_]{1,24}$/.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 1000) / 1000;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && /^[a-zA-Z0-9_.-]{0,32}$/.test(v)) out[k] = v;
  }
  return out;
}
const REPORT_CATEGORIES = new Set(['harassment', 'hate', 'sexual', 'threats', 'personal_info', 'spam', 'other']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s*/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) throw new Oops('Sign in first.', 401);
    const uid = user.id;
    const body = await req.json();
    const { action } = body;

    if (action === 'status') return json(await status(uid));

    // birth month and year, asked once; only the band is kept, and it can't be changed here
    if (action === 'set_age') {
      const a: any = await account(uid);
      if (a.band) return json(await status(uid));
      const band = ageBand(body.month, body.year);
      if (!band) throw new Oops('Pick your birth month and year.');
      await saveAccount(uid, { band, band_at: nowIso() });
      await event(uid, 'age_set');
      return json(await status(uid));
    }

    // the player's own switches; switching one on needs the current safety notice accepted
    if (action === 'prefs') {
      const a: any = await account(uid);
      const patch: Record<string, unknown> = {};
      if (body.notice === NOTICE_VERSION) patch.notice_version = NOTICE_VERSION;
      const noticeOk = (patch.notice_version ?? a.notice_version ?? 0) >= NOTICE_VERSION;
      for (const [k, col] of [['friend', 'friend_on'], ['ranked', 'ranked_on']]) {
        if (typeof body[k] !== 'boolean') continue;
        if (body[k] && !noticeOk) throw new Oops('Read the voice safety notice first.');
        patch[col] = body[k];
      }
      await saveAccount(uid, patch);
      return json(await status(uid));
    }

    // ---- the card check (Friend Voice): Stripe Checkout in setup mode, no charge
    if (action === 'card_start') {
      await limit(uid, 'srv_card_start', 5, 86400000, 'Too many tries today. Try again tomorrow.');
      const back = backTo(body.returnTo);
      const s = await stripe('/checkout/sessions', 'POST', {
        mode: 'setup',
        currency: 'usd',
        payment_method_types: ['card'],
        client_reference_id: uid,
        metadata: { purpose: 'voice_card_check', user_id: uid },
        success_url: `${back}#/more?voice=card`,
        cancel_url: `${back}#/more?voice=cancel`,
      });
      await saveAccount(uid, { card_session: s.id });
      return json({ url: s.url });
    }
    if (action === 'card_confirm') {
      const a: any = await account(uid);
      if (!a.card_session) return json(await status(uid));
      const s = await stripe(`/checkout/sessions/${a.card_session}`, 'GET', { expand: ['setup_intent.payment_method'] });
      if (s.client_reference_id !== uid) throw new Oops('That check belongs to another account.', 403);
      const si = s.setup_intent;
      if (s.status !== 'complete' || si?.status !== 'succeeded') return json({ ...(await status(uid)), pending: true });
      const pm = si.payment_method;
      const funding = pm?.card?.funding ?? 'unknown';
      const ok = funding === 'credit' || funding === 'debit';
      // the card itself is not kept: only "passed", the card type and the date
      await saveAccount(uid, { card_ok: ok, card_funding: funding, card_at: nowIso(), card_session: null });
      if (pm?.id && pm.customer) await safely(() => stripe(`/payment_methods/${pm.id}/detach`, 'POST', {}));
      await event(uid, ok ? 'card_check_passed' : 'card_check_refused', null, { funding });
      return json(await status(uid));
    }

    // ---- the ID check (Ranked Voice): Stripe Identity, ID + matching selfie, once
    if (action === 'id_start') {
      await limit(uid, 'srv_id_start', 3, 86400000, 'Too many tries today. Try again tomorrow.');
      const back = backTo(body.returnTo);
      const v = await stripe('/identity/verification_sessions', 'POST', {
        type: 'document',
        options: { document: { require_matching_selfie: true, require_live_capture: true, allowed_types: ['driving_license', 'id_card', 'passport'] } },
        metadata: { purpose: 'voice_age', user_id: uid },
        return_url: `${back}#/more?voice=id`,
      });
      await saveAccount(uid, { id_session: v.id });
      return json({ url: v.url });
    }
    if (action === 'id_confirm') {
      const a: any = await account(uid);
      if (!a.id_session) return json(await status(uid));
      const v = await stripe(`/identity/verification_sessions/${a.id_session}`, 'GET', { expand: ['verified_outputs'] });
      if (v.metadata?.user_id !== uid) throw new Oops('That check belongs to another account.', 403);
      if (v.status === 'processing' || (v.status === 'requires_input' && !v.last_error)) return json({ ...(await status(uid)), pending: true });
      if (v.status !== 'verified') {
        await saveAccount(uid, { id_session: null });
        await event(uid, 'id_check_failed', null, { code: String(v.last_error?.code ?? v.status).slice(0, 32) });
        return json({ ...(await status(uid)), failed: true });
      }
      const dob = v.verified_outputs?.dob;
      const band = dob ? ageBand(dob.month, dob.year) : null;
      // an exact age from the day of birth: 18 today or not
      let adult = false;
      if (dob?.year) {
        const t = new Date(), y = t.getUTCFullYear() - dob.year;
        const before = t.getUTCMonth() + 1 < dob.month || (t.getUTCMonth() + 1 === dob.month && t.getUTCDate() < dob.day);
        adult = y - (before ? 1 : 0) >= 18;
      }
      const patch: Record<string, unknown> = { id_adult: adult, id_at: nowIso(), id_session: null };
      // an ID that shows a minor overrides what was declared (and closes Friend Voice too)
      if (!adult && band) Object.assign(patch, { band: band === 'adult' ? 'teen' : band, band_at: nowIso() });
      await saveAccount(uid, patch);
      // Stripe is asked to delete the ID images and details now that "18+ or not" is known
      await safely(() => stripe(`/identity/verification_sessions/${v.id}/redact`, 'POST', {}));
      await event(uid, adult ? 'id_check_adult' : 'id_check_minor');
      return json(await status(uid));
    }

    // ---- blocks ---------------------------------------------------------------------
    if (action === 'blocks') {
      const { data } = await admin.from('player_blocks').select('blocked,created_at').eq('blocker', uid);
      const ids = (data ?? []).map((r: any) => r.blocked);
      const { data: names } = ids.length ? await admin.from('pvp_profiles').select('user_id,name').in('user_id', ids) : { data: [] };
      return json({ blocks: ids.map((id: string) => ({ user: id, name: names?.find((n: any) => n.user_id === id)?.name ?? 'Player' })) });
    }
    if (action === 'unblock') {
      await admin.from('player_blocks').delete().eq('blocker', uid).eq('blocked', String(body.user ?? ''));
      return json({ ok: true });
    }
    if (action === 'block') {
      const { row, other } = await matchRow(body.match, uid);
      if (!other) throw new Oops('There’s nobody to block here.');
      await admin.from('player_blocks').upsert({ blocker: uid, blocked: other, created_at: nowIso() }, { onConflict: 'blocker,blocked', ignoreDuplicates: true });
      // voice between them ends now, on both sides
      await endSession(await sessionOf(row.id, uid));
      await endSession(await sessionOf(row.id, other));
      await ping(row);
      await event(uid, 'player_blocked', row.id);
      return json({ ok: true });
    }

    // ---- reports --------------------------------------------------------------------
    if (action === 'report') {
      const { row, other } = await matchRow(body.match, uid);
      if (!other) throw new Oops('There’s nobody to report here.');
      const category = String(body.category ?? '');
      if (!REPORT_CATEGORIES.has(category)) throw new Oops('Pick what happened.');
      await limit(uid, 'srv_report', 10, 86400000, 'You’ve sent a lot of reports today. We’ll look at them.');
      const { data: vs } = await admin.from('voice_sessions').select('user_id').eq('match_id', row.id);
      const voice = [uid, other].every((u) => (vs ?? []).some((s: any) => s.user_id === u));
      const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
      const { error } = await admin.from('player_reports').insert({ reporter: uid, reported: other, match_id: row.id, category, note, voice });
      if (error) throw new Oops(error.message, 500);
      if (body.block) {
        await admin.from('player_blocks').upsert({ blocker: uid, blocked: other, created_at: nowIso() }, { onConflict: 'blocker,blocked', ignoreDuplicates: true });
        await endSession(await sessionOf(row.id, uid));
        await endSession(await sessionOf(row.id, other));
        await ping(row);
      }
      return json({ ok: true });
    }

    // ---- product events (no content) --------------------------------------------------
    if (action === 'event') {
      const name = String(body.name ?? '');
      if (!VOICE_EVENTS.has(name)) throw new Oops('Unknown event.');
      const { count } = await admin.from('voice_events').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', ago(3600000));
      if ((count ?? 0) >= 300) return json({ ok: true, dropped: true });
      await event(uid, name, typeof body.match === 'string' ? body.match : null, cleanMeta(body.meta));
      return json({ ok: true });
    }

    // ---- in a match ---------------------------------------------------------------------
    if (action === 'policy') {
      const d = await decide(body.match, uid);
      const mine = await sessionOf(d.row.id, uid);
      // voice can't outlive the match, a block or a policy change
      if (mine && !d.available) {
        await endSession(mine);
        await ping(d.row);
      }
      const peer = d.available ? await sessionOf(d.row.id, d.other) : null;
      return json({
        available: d.available,
        mine: d.mine,
        kind: d.kind,
        iBlocked: d.iBlocked,
        joined: !!(mine && d.available),
        peer: d.available ? { joined: !!peer, mic: peer ? !!peer.mic : false, at: peer?.joined_at ?? null } : null,
      });
    }

    if (action === 'join') {
      const d = await decide(body.match, uid);
      if (!d.available) return json({ error: 'Voice isn’t available in this match.', mine: d.mine }, 403);
      if (typeof body.offer !== 'string' || body.offer.length > 20000 || typeof body.mid !== 'string') throw new Oops('Bad offer.');
      await limit(uid, 'srv_join', 8, 60000, 'Too many tries. Wait a moment.');
      await endSession(await sessionOf(d.row.id, uid)); // a rejoin replaces the old one
      const s = await cf('/sessions/new', 'POST');
      const track = crypto.randomUUID();
      const t = await cf(`/sessions/${s.sessionId}/tracks/new`, 'POST', {
        sessionDescription: { type: 'offer', sdp: body.offer },
        tracks: [{ location: 'local', mid: body.mid, trackName: track }],
      });
      await admin.from('voice_sessions').upsert({ id: sessionId(d.row.id, uid), match_id: d.row.id, user_id: uid, cf_session: s.sessionId, track, mid: body.mid, pulled: null, mic: true, joined_at: nowIso(), left_at: null, updated_at: nowIso() });
      await ping(d.row);
      const peer = await sessionOf(d.row.id, d.other);
      return json({ answer: t.sessionDescription?.sdp, peer: { joined: !!peer, mic: peer ? !!peer.mic : false, at: peer?.joined_at ?? null } });
    }

    // start hearing the other player (they joined): Cloudflare offers, the game answers
    if (action === 'pull') {
      const d = await decide(body.match, uid);
      if (!d.available) return json({ error: 'Voice isn’t available in this match.', mine: d.mine }, 403);
      const mine = await sessionOf(d.row.id, uid);
      if (!mine) throw new Oops('Join voice first.', 409);
      const peer = await sessionOf(d.row.id, d.other);
      if (!peer?.cf_session || !peer.track) return json({ waiting: true });
      if (mine.pulled) await safely(() => cf(`/sessions/${mine.cf_session}/tracks/close`, 'PUT', { tracks: [{ mid: mine.pulled }], force: true }));
      const t = await cf(`/sessions/${mine.cf_session}/tracks/new`, 'POST', { tracks: [{ location: 'remote', sessionId: peer.cf_session, trackName: peer.track }] });
      const mid = t.tracks?.[0]?.mid ?? null;
      await admin.from('voice_sessions').update({ pulled: mid, updated_at: nowIso() }).eq('id', mine.id);
      return json({ offer: t.sessionDescription?.sdp, renegotiate: !!t.requiresImmediateRenegotiation, mid });
    }
    if (action === 'renegotiate') {
      const mine = await sessionOf(String(body.match ?? ''), uid);
      if (!mine) throw new Oops('Join voice first.', 409);
      await matchRow(body.match, uid);
      if (typeof body.answer !== 'string' || body.answer.length > 20000) throw new Oops('Bad answer.');
      await cf(`/sessions/${mine.cf_session}/renegotiate`, 'PUT', { sessionDescription: { type: 'answer', sdp: body.answer } });
      return json({ ok: true });
    }

    // the microphone switch, so the other side can show "mic off"
    if (action === 'mic') {
      const { row } = await matchRow(body.match, uid);
      const mine = await sessionOf(row.id, uid);
      if (mine) {
        await admin.from('voice_sessions').update({ mic: !!body.on, updated_at: nowIso() }).eq('id', mine.id);
        await ping(row);
      }
      return json({ ok: true });
    }

    if (action === 'leave') {
      const { row } = await matchRow(body.match, uid);
      const mine = await sessionOf(row.id, uid);
      if (mine) {
        await endSession(mine);
        await ping(row);
      }
      return json({ ok: true });
    }

    throw new Oops('Unknown action.');
  } catch (e) {
    const status = e instanceof Oops ? e.status : 500;
    return json({ error: (e as Error).message ?? String(e) }, status);
  }
});
