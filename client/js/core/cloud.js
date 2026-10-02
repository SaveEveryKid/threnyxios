// ACCOUNTS + CLOUD SAVE (Supabase). Sign in with an email link or Google; the
// save follows you to any device. The local save stays the working copy: on
// sign-in the newer of (this device, the cloud) wins, and every change is
// pushed a couple of seconds later. Off unless client/js/config.js is filled.
import { CLOUD } from '../config.js';
import * as store from './store.js';
import * as vault from './vault.js';
import { isGuestUser } from '../../../engine/guest.js';

export const enabled = !!(CLOUD.url && CLOUD.anonKey);
let sb = null;
let user = null;
let timer = null;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f(user));
export const onUser = (f) => (listeners.add(f), f(user), () => listeners.delete(f));
export const currentUser = () => user;
/** A guest: playing before saving a profile (docs/18-guest-play.md). */
export const isGuest = (u = user) => isGuestUser(u);
let syncing = Promise.resolve(); // the current sign-in's first sync
let quiet = false; // a guest being made mid-flow: don't redraw the screen under them

export async function client() {
  if (!enabled) return null;
  if (!sb) {
    try {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      sb = createClient(CLOUD.url, CLOUD.anonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    } catch (e) {
      console.warn('accounts unavailable (offline?); saving on this device', e?.message);
      return null;
    }
  }
  return sb;
}

async function pull(preferCloud = false) {
  const { data, error } = await sb.from('saves').select('data, updated_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  const local = store.get();
  const cloudTime = data ? new Date(data.updated_at).getTime() : 0;
  // a brand-new device (still in training, never played) always takes the cloud save
  const localFresh = local.onboard !== 'done' && !local.stats?.matches;
  // signing in to an account from a guest profile: that account's own save, not this device's
  if (data && (preferCloud || localFresh || cloudTime > (local.updated || 0))) {
    store.replace(data.data);
    return 'loaded';
  }
  await push();
  return 'pushed';
}

export async function push() {
  if (!user) return;
  const s = store.get();
  await sb.from('saves').upsert({ user_id: user.id, data: s, updated_at: new Date(s.updated || Date.now()).toISOString() });
}

// resolves once the first sign-in check is done (signed in or not)
let markReady;
let booted = false; // past the first sign-in check
export const ready = new Promise((r) => (markReady = r));

export async function init({ onLoaded, onPurchase, onAlliance, onAward, onEventPacks, onReferral, onRecovery, onChange } = {}) {
  if (!(await client())) return markReady();
  const start = async (session) => {
    const was = user?.id;
    const fromGuest = isGuestUser(user);
    user = session?.user || null;
    emit();
    if (!user) vault.signedOut();
    if (!user && was) onChange?.(); // signed out: redraw
    if (user && user.id !== was) syncing = first(was, fromGuest && !isGuestUser(user));
    return syncing;
  };
  const first = async (was, preferCloud = false) => {
    {
      try {
        const loaded = (await pull(preferCloud)) === 'loaded';
        // the collection itself comes from the server's vault (made from this save the first time)
        const got = await vault.sync();
        if (loaded) onLoaded?.();
        if (got.purchases.length) (onPurchase?.(got.purchases), claimed.forEach((f) => f(got.purchases, 'startup')));
        if (got.alliance.length) onAlliance?.(got.alliance);
        if (got.awards?.length) onAward?.(got.awards);
        if (got.eventPacks?.length) onEventPacks?.(got.eventPacks);
        if (got.referrals || got.welcome) onReferral?.(got);
        // joined from an invite link: use its code now that there's an account
        const ref = await vault.claimPendingRef();
        if (ref) onReferral?.({ claimed: ref });
      } catch (e) {
        console.warn('cloud pull failed', e);
      }
      if ((was !== undefined || booted) && !quiet) onChange?.(); // signed in while playing: redraw with the account's progress
    }
  };
  firstSync = () => first(null);
  const { data } = await sb.auth.getSession();
  await start(data.session);
  booted = true;
  markReady();
  sb.auth.onAuthStateChange((event, session) => {
    start(session);
    if (event === 'PASSWORD_RECOVERY') onRecovery?.(); // back from a reset link: choose a new password
  });
  // every change goes up a moment later, and once more when the tab is hidden
  store.onChange(() => {
    if (!user) return;
    clearTimeout(timer);
    timer = setTimeout(() => push().catch(() => {}), 2000);
  });
  document.addEventListener('visibilitychange', () => document.hidden && user && push().catch(() => {}));
}

// ---- username + password accounts ---------------------------------------------
// A username signs in through an internal address (never emailed: accounts are
// made without email confirmation, see docs/15). Accounts made with a real
// email address sign in with that address and a password.
const USER_DOMAIN = CLOUD.userDomain || 'players.idea.byrongreen2012.workers.dev';
export const USERNAME_RULE = /^[A-Za-z0-9_]{3,18}$/;
const loginEmail = (login) => (login.includes('@') ? login.trim() : `${login.trim().toLowerCase()}@${USER_DOMAIN}`);
export const isUsernameAccount = (u) => !!u?.email?.endsWith('@' + USER_DOMAIN);
/** The name to show for a signed-in account. */
export const displayName = (u = user) => u?.user_metadata?.username || (isUsernameAccount(u) ? u.email.split('@')[0] : u?.email) || 'player';
const offline = () => new Error('Can’t reach the sign-in service. Check your connection and try again.');

export async function signUp(username, password, recoveryEmail = '') {
  username = username.trim();
  if (!USERNAME_RULE.test(username)) throw new Error('Usernames are 3–18 letters, numbers or _.');
  if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
  const c = await client();
  if (!c) throw offline();
  const { data, error } = await c.auth.signUp({ email: loginEmail(username), password, options: { data: { username, recovery_email: recoveryEmail.trim() || null } } });
  if (error) throw new Error(/registered|exists/i.test(error.message) ? 'That username is taken.' : error.message);
  if (!data.session) throw new Error('The account was made, but sign-in needs “Confirm email” turned off in Supabase (docs/15-server-collection.md).');
}
/**
 * Play as a guest: a real (anonymous) player with a server vault, made the first
 * time a visitor taps to play. Resolves true once the vault is ready; false if
 * guests aren't switched on (the game then plays on this device as before).
 */
export async function startGuest() {
  if (user) return true;
  const c = await client();
  if (!c) return false;
  quiet = true;
  try {
    const { data, error } = await c.auth.signInAnonymously();
    if (error || !data?.session) {
      console.warn('guest play unavailable:', error?.message);
      return false;
    }
    if (!user || user.id !== data.session.user.id) {
      user = data.session.user;
      emit();
      syncing = firstSync();
    }
    await syncing;
    return true;
  } finally {
    quiet = false;
  }
}
let firstSync = async () => {};

/**
 * Save the guest's profile: this same player gets a username and password
 * (the server does it, so the collection, packs and history all stay). Then
 * signs in with them, so this device has the saved profile's session.
 */
export async function convertGuest(username, password, recoveryEmail = '') {
  const c = await client();
  if (!c || !user) throw offline();
  const { data, error } = await c.functions.invoke('economy', { body: { action: 'convert', username: username.trim(), password, email: recoveryEmail.trim() || null } });
  if (error) {
    if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') throw Object.assign(offline(), { retry: true });
    let msg = error.message;
    try {
      msg = (await error.context.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  // the same player, now with a password: a fresh session carries it
  const { error: e2 } = await c.auth.signInWithPassword({ email: data?.email || loginEmail(username), password });
  if (e2) throw Object.assign(new Error('Your profile is saved. Sign in with your new name and password to continue.'), { saved: true });
  return data;
}

export async function signInPassword(login, password) {
  const c = await client();
  if (!c) throw offline();
  const { error } = await c.auth.signInWithPassword({ email: loginEmail(login), password });
  if (error) throw new Error(/invalid/i.test(error.message) ? 'Wrong username or password.' : error.message);
}
/** Set or change the password of the signed-in account. */
export async function setPassword(password) {
  if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
  const c = await client();
  if (!c || !user) throw offline();
  const { error } = await c.auth.updateUser({ password });
  if (error) throw error;
}
/** Accounts with a real email address can get a reset link. */
export async function resetPassword(email) {
  const c = await client();
  if (!c) throw offline();
  const { error } = await c.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
  if (error) throw error;
}

export async function signInGoogle() {
  const c = await client();
  if (!c) throw new Error('Can’t reach the sign-in service. Check your connection and try again.');
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
export async function signOut() {
  await push().catch(() => {});
  await (await client())?.auth.signOut();
}

// ---- purchases (Stripe via the Supabase functions; docs/13-monetization.md) ----
export const paymentsOn = () => enabled && !!CLOUD.payments;

/** Send the player to Stripe's checkout page for a product. */
export async function checkout(product) {
  const c = await client();
  if (!c || !user) throw new Error('Sign in first, so the purchase is saved to your account.');
  const { data, error } = await c.functions.invoke('create-checkout', { body: { product, returnTo: location.origin + location.pathname } });
  if (error) {
    // no answer at all: the function isn't deployed, or the gateway refused the call
    if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') throw new Error("The payment server isn't answering. Try again in a moment.");
    let msg = error.message;
    try {
      msg = (await error.context.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  location.href = data.url;
}

const claimed = new Set();
/** Hear about purchases collected anywhere (startup or the Shop). */
export const onClaimed = (f) => (claimed.add(f), () => claimed.delete(f));

/** Collect paid purchases waiting on the server (it adds them to the vault). */
export async function claimPurchases(by = 'startup') {
  if (!user) return [];
  const got = (await vault.sync()).purchases;
  if (got.length) claimed.forEach((f) => f(got, by));
  return got;
}

// ---- Alliance chest: add points for play (silently does nothing outside an Alliance) ----
export async function contribute(kind) {
  if (!enabled || !user) return;
  try {
    await sb.rpc('alliance_contribute', { p_kind: kind });
  } catch {}
}
