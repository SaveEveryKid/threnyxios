// THRENYX economy server: the source. Every change to a signed-in player's
// collection and currencies runs here, with the game's own rules
// (engine/economy.js), on the vault stored in the `vaults` table. The game only
// ever receives its vault back. Supabase can't import from other sites, so the
// deployed file is index.ts, built by `bash tools/bundle-economy.sh`
// (docs/15-server-collection.md).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { apply, importVault, freshVault, isEconError, SERVER_ONLY, VAULT_KEYS, TUTORIAL_GRANTS } from '../../../engine/economy.js';
import { isGuestUser, guestStatus, startGuestDuel, finishGuestDuel, profileProblem, FUNNEL_EVENTS } from '../../../engine/guest.js';
import { textProblem } from '../../../engine/text-filter.js';
import { PRODUCTS } from '../../../engine/shop.js';
import { OKTOBER, phase as oktoberPhase, championOf } from '../../../engine/oktober.js';
import { REFERRAL, makeCode, cleanCode, progress } from '../../../engine/referral.js';
import { socialApi } from './social.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
class Oops extends Error {
  status: number;
  constructor(msg: string, status = 400) {
    super(msg);
    this.status = status;
  }
}
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const ALLIANCE_REWARD: Record<number, Record<string, number>> = { 1: { standard: 1 }, 2: { standard: 2 }, 3: { faction: 1 } };

// ---- the vault row ----------------------------------------------------------------
async function load(uid: string) {
  const { data, error } = await admin.from('vaults').select('data, version').eq('user_id', uid).maybeSingle();
  if (error) throw new Oops(error.message, 500);
  return data as { data: any; version: number } | null;
}

// A new player's first vault: their existing collection, checked and bounded,
// with Chimes capped at what they've actually paid for.
async function create(uid: string, save: unknown, guest = false) {
  if (guest) return createGuest(uid, save);
  const { data: paid } = await admin.from('purchases').select('id, product').eq('user_id', uid).not('claimed_at', 'is', null);
  const chimesPaid = (paid ?? []).reduce((n: number, r: any) => n + (PRODUCTS.find((p: any) => p.id === r.product)?.chimes ?? 0), 0);
  const vault = importVault(save, { now: Date.now(), chimesPaid });
  vault.econ.credited = (paid ?? []).map((r: any) => r.id); // already added to the save by the old game
  // Alliance chests claimed before the vault existed were paid on the device too
  const { data: chests } = await admin.from('alliance_claims').select('week, tier').eq('user_id', uid);
  for (const c of chests ?? []) (vault.econ.alliance[String(c.week)] ||= []).push(c.tier);
  const { error } = await admin.from('vaults').insert({ user_id: uid, data: vault, version: 1 });
  if (error && !/duplicate/i.test(error.message)) throw new Oops(error.message, 500);
  return (await load(uid))!;
}

// A guest's first vault never trusts the device: a fresh vault, plus only what
// training itself hands out (the lessons the save says are done), so a guest can't
// arrive with anything training wouldn't have given anyone.
async function createGuest(uid: string, save: any) {
  const now = Date.now();
  let v: any = freshVault(now, String(save?.settings?.name ?? 'You').slice(0, 18) || 'You');
  const done = Math.min(Number(save?.tut?.granted ?? -1) | 0, TUTORIAL_GRANTS.length - 1);
  for (let n = 0; n <= done; n++) v = apply(v, 'lesson', { n }, { now, seed: seed() }).vault;
  if (save?.onboard === 'done') v = apply(v, 'finishTraining', { skip: true }, { now, seed: seed() }).vault;
  const { error } = await admin.from('vaults').insert({ user_id: uid, data: v, version: 1 });
  if (error && !/duplicate/i.test(error.message)) throw new Oops(error.message, 500);
  return (await load(uid))!;
}

// Read, change, save only if nobody saved in between (two devices at once); retried.
async function mutate(uid: string, fn: (vault: any) => { vault: any; result: any } | null, save?: unknown, guest = false) {
  for (let i = 0; i < 5; i++) {
    const row = (await load(uid)) ?? (await create(uid, save, guest));
    const out = fn(row.data);
    if (!out) return { vault: row.data, result: null };
    const { data, error } = await admin
      .from('vaults')
      .update({ data: out.vault, version: row.version + 1, updated_at: new Date().toISOString() })
      .eq('user_id', uid)
      .eq('version', row.version)
      .select('user_id');
    if (error) throw new Oops(error.message, 500);
    if (data?.length) return out;
  }
  throw new Oops('Busy, try again.', 409);
}

// ---- things only the server can confirm ------------------------------------------
// Paid purchases not yet in the vault (the Stripe webhook writes them).
async function collectPurchases(uid: string) {
  const { data: rows } = await admin.from('purchases').select('id, product').eq('user_id', uid).is('claimed_at', null);
  if (!rows?.length) return [];
  let got: any[] = [];
  await mutate(uid, (v) => {
    const credited = new Set(v.econ?.credited ?? []);
    const fresh = rows.filter((r: any) => !credited.has(r.id));
    if (!fresh.length) return null;
    const out = apply(v, 'grantPurchases', { products: fresh.map((r: any) => r.product) }, { now: Date.now(), seed: seed() });
    out.vault.econ.credited = [...credited, ...fresh.map((r: any) => r.id)].slice(-500);
    got = out.result.got;
    return out;
  });
  // mark them claimed (the vault already remembers them, so this can't pay twice)
  await admin.from('purchases').update({ claimed_at: new Date().toISOString() }).in('id', rows.map((r: any) => r.id)).is('claimed_at', null);
  return got;
}

// Alliance chest tiers claimed in the database (claim_alliance_chest) and not yet paid into the vault.
async function collectAlliance(uid: string) {
  const { data: rows } = await admin.from('alliance_claims').select('week, tier').eq('user_id', uid).order('week', { ascending: false }).limit(12);
  if (!rows?.length) return [];
  const paid: any[] = [];
  await mutate(uid, (v0) => {
    let v = v0;
    let changed = false;
    for (const r of rows as any[]) {
      if ((v.econ?.alliance?.[String(r.week)] ?? []).includes(r.tier) || !ALLIANCE_REWARD[r.tier]) continue;
      const out = apply(v, 'allianceChest', { week: r.week, tier: r.tier, reward: ALLIANCE_REWARD[r.tier] }, { now: Date.now(), seed: seed() });
      v = out.vault;
      changed = true;
      paid.push({ week: r.week, tier: r.tier, reward: ALLIANCE_REWARD[r.tier] });
    }
    return changed ? { vault: v, result: null } : null;
  });
  return paid;
}

// An online match result is never taken on the player's word: look the match
// up and use its real outcome. Only then does it earn online rewards (a.pvp).
async function verifyPvp(uid: string, args: any) {
  const a = { ...args };
  delete a.pvp;
  if (a.mode !== 'pvp' || typeof a.match !== 'string') return a;
  const { data: row } = await admin.from('pvp_matches').select('a,b,status,winner:data->winner,friendly:data->friendly,echo:data->echo').eq('id', a.match).maybeSingle();
  const side = row ? (row.a === uid ? 0 : row.b === uid ? 1 : -1) : -1;
  if (!row || side < 0 || row.status !== 'over' || (row.winner !== 0 && row.winner !== 1)) return { ...a, won: false };
  return { ...a, won: row.winner === side, pvp: { id: a.match, ranked: !row.friendly, echo: !!row.echo } };
}

// Tournament prizes: once Oktoberfest is over, its champion (decided from the
// finals table, so only one account ever qualifies) gets the one-of-one on
// their next visit, once (econ.awards). Quietly nothing if the table isn't there.
async function collectAwards(uid: string) {
  if (oktoberPhase() !== 'over') return [];
  const { data: rows, error } = await admin.from('event_entries').select('*').eq('event', OKTOBER.finalsId);
  if (error) return [];
  const champ: any = championOf(rows ?? []);
  if (!champ || champ.user_id !== uid) return [];
  let got: any[] = [];
  await mutate(uid, (v) => {
    if ((v.econ?.awards ?? []).includes(OKTOBER.id)) return null;
    const line = `Oktoberfest 2026 Champion: ${champ.name}. Won the finals with a ${champ.rating} rating (${champ.wins}–${champ.losses}). One copy, never reprinted.`;
    const out = apply(v, 'award', { event: OKTOBER.id, cardId: 'eighthBell', line }, { now: Date.now(), seed: seed() });
    got = out.result.card ? [{ ...out.result.card, event: OKTOBER.name }] : [];
    return out;
  });
  return got;
}

// Oktoberfest Packs: qualifying points (the pvp function's scoreboard) reach a
// milestone, the packs go into the vault on the next visit, each milestone once.
async function collectEventPacks(uid: string) {
  if (oktoberPhase() === 'soon') return [];
  const { data: row, error } = await admin.from('event_entries').select('points').eq('event', OKTOBER.id).eq('user_id', uid).maybeSingle();
  if (error || !row) return [];
  let got: any[] = [];
  await mutate(uid, (v) => {
    if ((v.econ?.oktPaid ?? 0) >= OKTOBER.packs.length) return null;
    const out = apply(v, 'eventPacks', { points: row.points }, { now: Date.now(), seed: seed() });
    if (!out.result.packs) return null;
    got = [{ packs: out.result.packs, reached: out.result.reached }];
    return out;
  });
  return got;
}

// ---- referrals -----------------------------------------------------------------------
// Your invite code, made the first time you ask.
async function myCode(uid: string) {
  const { data } = await admin.from('ref_codes').select('code').eq('user_id', uid).maybeSingle();
  if (data) return data.code as string;
  for (let i = 0; i < 6; i++) {
    const code = makeCode();
    const { error } = await admin.from('ref_codes').insert({ user_id: uid, code });
    if (!error) return code;
    if (!/duplicate/i.test(error.message)) throw new Oops(error.message, 500);
    const { data: again } = await admin.from('ref_codes').select('code').eq('user_id', uid).maybeSingle();
    if (again) return again.code as string; // two requests at once
  }
  throw new Oops('Busy, try again.', 409);
}

// Joining with a friend's code: in your first week, once, never your own.
async function enterCode(user: any, raw: unknown) {
  const code = cleanCode(raw);
  if (!code) throw new Oops('Enter a code.');
  const age = Date.now() - Date.parse(user.created_at ?? '');
  if (!(age < REFERRAL.enterDays * 86400000)) throw new Oops(`Codes can only be entered in an account's first ${REFERRAL.enterDays} days.`);
  const { data: mine } = await admin.from('referrals').select('referrer_id').eq('referred_id', user.id).maybeSingle();
  if (mine) throw new Oops('You already joined with a code.');
  const { data: owner } = await admin.from('ref_codes').select('user_id').eq('code', code).maybeSingle();
  if (!owner) throw new Oops('No one has that code. Check it and try again.');
  if (owner.user_id === user.id) throw new Oops('That’s your own code. Share it with friends instead.');
  const { data: swap } = await admin.from('referrals').select('referred_id').eq('referred_id', owner.user_id).eq('referrer_id', user.id).maybeSingle();
  if (swap) throw new Oops('You invited them, so they can’t invite you back.');
  const { error } = await admin.from('referrals').insert({ referred_id: user.id, referrer_id: owner.user_id });
  if (error) throw new Oops(/duplicate/i.test(error.message) ? 'You already joined with a code.' : error.message, 409);
}

// Your invited friends: check the ones who don't count yet (a saved profile and
// REFERRAL.duels Duels played), then pay what's owed (packs). Returns the list for the screen and what was paid now.
async function collectReferrals(uid: string) {
  const { data: rows, error } = await admin.from('referrals').select('referred_id, counted_at, created_at').eq('referrer_id', uid).order('created_at').limit(200);
  if (error || !rows?.length) return { friends: [], counted: 0, got: null };
  const { data: names } = await admin.from('pvp_profiles').select('user_id, name').in('user_id', rows.map((r: any) => r.referred_id));
  const friends: any[] = [];
  for (const r of rows as any[]) {
    const f: any = { name: names?.find((n: any) => n.user_id === r.referred_id)?.name || 'New player', counted: !!r.counted_at };
    if (!f.counted && friends.filter((x) => !x.counted).length < 30) {
      // they count once their profile is saved and they've played enough Duels
      const v = (await load(r.referred_id))?.data;
      const guest = await isGuestId(r.referred_id);
      const p = progress({ duels: v?.econ?.duels ?? 0, guest });
      Object.assign(f, { duels: p.duels, guest });
      if (f.name === 'New player' && v?.profile?.name && v.profile.name !== 'You') f.name = v.profile.name;
      if (p.ok) {
        await admin.from('referrals').update({ counted_at: new Date().toISOString() }).eq('referred_id', r.referred_id).is('counted_at', null);
        f.counted = true;
      }
    }
    friends.push(f);
  }
  const counted = friends.filter((f) => f.counted).length;
  let got: any = null;
  if (counted)
    await mutate(uid, (v) => {
      const out = apply(v, 'referrals', { count: counted }, { now: Date.now(), seed: seed() });
      if (!out.result.newly) return null;
      got = out.result;
      return out;
    });
  return { friends, counted, got };
}

// Joined with a code and finished training: the welcome ticket, once.
async function collectWelcome(uid: string) {
  const { data } = await admin.from('referrals').select('referrer_id').eq('referred_id', uid).maybeSingle();
  if (!data) return null;
  let got: any = null;
  await mutate(uid, (v) => {
    if (v.econ?.refWelcome || !v.econ?.trained) return null;
    const out = apply(v, 'refWelcome', {}, { now: Date.now(), seed: seed() });
    got = out.result.packs;
    return out;
  });
  return got;
}

async function referralStatus(user: any) {
  const uid = user.id;
  const [code, mine, { data: by }] = await Promise.all([myCode(uid), collectReferrals(uid), admin.from('referrals').select('referrer_id').eq('referred_id', uid).maybeSingle()]);
  const welcome = by ? await collectWelcome(uid) : null;
  const vault = (await load(uid))?.data;
  return {
    code,
    friends: mine.friends,
    counted: mine.counted,
    got: mine.got,
    welcome,
    joinedWithCode: !!by,
    canEnter: !by && Date.now() - Date.parse(user.created_at ?? '') < REFERRAL.enterDays * 86400000,
    shared: !!vault?.econ?.shared,
    vault: vault ? pick(vault) : null,
  };
}

async function isGuestId(id: string) {
  try {
    const { data } = await admin.auth.admin.getUserById(id);
    return isGuestUser(data?.user);
  } catch {
    return false;
  }
}

// ---- guests ---------------------------------------------------------------------------
// Usernames sign in through an internal address (client/js/core/cloud.js), never emailed.
const USER_DOMAIN = Deno.env.get('USER_DOMAIN') || 'players.idea.byrongreen2012.workers.dev';
const guestOf = (v: any) => (v?.econ?.guest ? guestStatus(v.econ.guest) : guestStatus(null));

// Save the profile: this same player (same id, same vault, same everything) gets a
// username and password. Nothing is copied, so nothing can be lost or doubled.
async function convert(user: any, body: any) {
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const why = profileProblem({ username, password }) || textProblem(username);
  if (why) throw new Oops(why);
  const email = `${username.toLowerCase()}@${USER_DOMAIN}`;
  // asked twice (a double tap, a retry after a dropped connection): already done
  if (!isGuestUser(user)) {
    if (user.email === email) return { ok: true, username, email, already: true };
    throw new Oops('This profile is already saved.', 409);
  }
  const recovery = typeof body.email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim()) ? body.email.trim().slice(0, 120) : null;
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    email,
    password,
    email_confirm: true,
    user_metadata: { ...(user.user_metadata ?? {}), username, recovery_email: recovery },
    app_metadata: { ...(user.app_metadata ?? {}), threnyx_account: true },
  });
  if (error) throw new Oops(/registered|exists|already/i.test(error.message) ? 'That player name is taken. Try another.' : error.message, /registered|exists|already/i.test(error.message) ? 409 : 500);
  await mutate(user.id, (v) => {
    v.econ ||= {};
    v.econ.guest = { ...(v.econ.guest ?? {}), converted: Date.now() };
    if (v.profile) v.profile.name = username;
    return { vault: v, result: null };
  });
  await funnel(null, user.id, 'guest_account_converted', null);
  return { ok: true, username, email };
}

// ---- the funnel: names and timings only ----------------------------------------------
async function funnel(visitor: string | null, uid: string | null, name: string, meta: any) {
  try {
    await admin.from('funnel_events').insert({ visitor, user_id: uid, name, meta, created_at: new Date().toISOString() });
  } catch {}
}
function cleanMeta(m: unknown) {
  if (!m || typeof m !== 'object') return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(m).slice(0, 6)) {
    if (!/^[a-zA-Z_]{1,24}$/.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && /^[a-zA-Z0-9_.-]{0,32}$/.test(v)) out[k] = v;
  }
  return out;
}

const pick = (v: any) => Object.fromEntries(VAULT_KEYS.filter((k) => v[k] !== undefined).map((k) => [k, v[k]]));
// friends, preset messages and trading (docs/19-friends-trading.md)
const social = socialApi({ admin, load, Oops, pick });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s*/i, '');
    const body = await req.json();
    const { data: { user } } = await admin.auth.getUser(token).catch(() => ({ data: { user: null } }));

    // funnel events can come before there's any player at all (a first visit)
    if (body.action === 'event') {
      const name = String(body.name ?? '');
      if (!FUNNEL_EVENTS.has(name)) throw new Oops('Unknown event.');
      const visitor = typeof body.visitor === 'string' && /^[a-z0-9-]{8,40}$/.test(body.visitor) ? body.visitor : null;
      await funnel(visitor, user?.id ?? null, name, cleanMeta(body.meta));
      return json({ ok: true });
    }

    if (!user) throw new Oops('Sign in first.', 401);
    const uid = user.id;
    const guest = isGuestUser(user);

    // a guest saves their profile: the same player, now with a username and password
    if (body.action === 'convert') return json(await convert(user, body));

    // The vault, created from this device's save the first time; also collects
    // purchases and Alliance chests waiting for this player.
    if (body.action === 'vault') {
      if (!(await load(uid))) await create(uid, body.save ?? null, guest);
      const purchases = await collectPurchases(uid);
      const alliance = await collectAlliance(uid);
      const awards = await collectAwards(uid);
      const eventPacks = await collectEventPacks(uid);
      // referrals: quietly nothing if referrals.sql hasn't been run yet
      const ref = await collectReferrals(uid).catch(() => ({ got: null }));
      const welcome = await collectWelcome(uid).catch(() => null);
      const row = await load(uid);
      return json({ vault: pick(row!.data), purchases, alliance, awards, eventPacks, referrals: ref.got, welcome, guest: guest ? guestOf(row!.data) : null });
    }

    // Invite friends: your code and friends (op 'status'), or join with a code (op 'enter').
    if (body.action === 'referral') {
      if (!(await load(uid))) await create(uid, body.save ?? null, guest);
      if (body.op === 'enter') await enterCode(user, body.code);
      return json(await referralStatus(user));
    }

    // friends, preset messages, trades and the Trade Board
    if (body.action === 'social') {
      if (!(await load(uid))) await create(uid, body.save ?? null, guest);
      return json(await social(user, body));
    }

    // a guest starts a Duel (checked only now: a Duel that starts always finishes)
    if (body.action === 'guestStart') {
      if (!guest) return json({ ok: true, guest: null });
      let refused = false;
      const out = await mutate(uid, (v) => {
        const r = startGuestDuel(v.econ?.guest, Date.now());
        if (!r.ok) return (refused = true), null;
        v.econ ||= {};
        v.econ.guest = r.guest;
        return { vault: v, result: null };
      }, body.save, true);
      const st = guestOf(out.vault);
      if (refused) return json({ error: 'guest_limit', guest: st, vault: pick(out.vault) }, 409);
      return json({ ok: true, guest: st, vault: pick(out.vault) });
    }

    if (body.action === 'act') {
      const name = String(body.name ?? '');
      if (SERVER_ONLY.has(name)) throw new Oops('Not allowed.', 403);
      let err: string | null = null;
      const args = name === 'matchEnd' ? await verifyPvp(uid, body.args ?? {}) : body.args ?? {};
      // a guest's Duel pays only if it was started while they were allowed to play
      // (training never counts; online matches are checked by the pvp server)
      const guestDuel = guest && name === 'matchEnd' && args.mode !== 'tutorial' && !args.pvp;
      const out = await mutate(uid, (v) => {
        try {
          let v2 = v;
          if (guestDuel) {
            const f = finishGuestDuel(v.econ?.guest, Date.now());
            if (!f.ok) {
              err = 'Save your profile to keep earning rewards.';
              return null;
            }
            v2 = { ...v, econ: { ...(v.econ ?? {}), guest: f.guest } };
          }
          return apply(v2, name, args, { now: Date.now(), seed: seed() });
        } catch (e) {
          if (!isEconError(e)) throw e;
          err = (e as Error).message;
          return null;
        }
      }, body.save, guest);
      if (err) return json({ error: err, vault: pick(out.vault), guest: guest ? guestOf(out.vault) : null }, 409);
      return json({ vault: pick(out.vault), result: out.result, guest: guest ? guestOf(out.vault) : null });
    }

    throw new Oops('Unknown action.');
  } catch (e) {
    const status = e instanceof Oops ? e.status : 500;
    return json({ error: (e as Error).message ?? String(e) }, status);
  }
});
