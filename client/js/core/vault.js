// THE VAULT — the game's side of the economy. Every change to what the player
// owns goes through act(name, args):
//   - signed in: the server (supabase/functions/economy) runs it on the
//     player's vault and sends the new vault back, which replaces those parts
//     of the save. Nothing of value is written from this page.
//   - a guest: the same rules (engine/economy.js) run on this device's save.
// If the server function isn't deployed yet, signed-in players play on this
// device too until it is (the first server vault is made from this save).
import * as store from './store.js';
import * as cloud from './cloud.js';
import { apply, pickVault } from '../../../engine/economy.js';

let mode = 'local'; // 'local' | 'server'
export const onServer = () => mode === 'server';
// a guest's allowance, as the server last said ({ allowed, duelsLeft, minutesLeft, started, over }), or null
let guest = null;
export const guestState = () => guest;
const noteGuest = (r) => r && 'guest' in r && (guest = r.guest);

const merge = (v) => store.update((s) => Object.assign(s, v));

async function invoke(body) {
  const c = await cloud.client();
  if (!c) throw new Error('offline');
  const { data, error } = await c.functions.invoke('economy', { body });
  if (!error) return data;
  if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') throw Object.assign(new Error("Can't reach the game server. Check your connection and try again."), { unreachable: true });
  let j = null;
  try {
    j = await error.context.json();
  } catch {}
  if (error.context?.status === 404 && !j?.vault) throw Object.assign(new Error('not deployed'), { missing: true });
  if (j?.vault) merge(j.vault); // refused: still the server's latest
  throw new Error(j?.error || error.message);
}

/**
 * After sign-in: fetch the vault (made from this save the first time) and
 * collect purchases and Alliance chests waiting on the server. Returns
 * { purchases: [{id,name}], alliance: [{tier,reward}] }.
 */
export async function sync() {
  if (!cloud.enabled || !cloud.currentUser()) {
    mode = 'local';
    return { purchases: [], alliance: [], awards: [], eventPacks: [] };
  }
  try {
    const r = await invoke({ action: 'vault', save: store.get() });
    merge(r.vault);
    noteGuest(r);
    mode = 'server';
    return { purchases: r.purchases || [], alliance: r.alliance || [], awards: r.awards || [], eventPacks: r.eventPacks || [], referrals: r.referrals || null, welcome: r.welcome || null };
  } catch (e) {
    // not set up yet (or unreachable at sign-in): keep playing on this device
    console.warn('vault: playing on this device for now:', e.message);
    mode = 'local';
    return { purchases: [], alliance: [], awards: [], eventPacks: [] };
  }
}
export const signedOut = () => ((mode = 'local'), (guest = null));

/**
 * A guest starts a Duel: the server checks the allowance now (and only now, so a
 * Duel that starts always finishes). Resolves { ok, guest }. Not a guest: ok.
 */
export async function guestStart() {
  if (mode !== 'server' || !cloud.isGuest()) return { ok: true, guest: null };
  try {
    const r = await invoke({ action: 'guestStart' });
    if (r.vault) merge(r.vault);
    noteGuest(r);
    return { ok: true, guest: r.guest };
  } catch (e) {
    if (e.message === 'guest_limit') return { ok: false, guest: { ...(guest || {}), allowed: false, over: true } };
    // can't reach the server: let them play (the result is checked when it's reported)
    return { ok: true, guest, offline: true };
  }
}

/** Run an economy action. Returns its result; throws an Error with a message for the player. */
export async function act(name, args = {}) {
  if (mode === 'server') {
    const r = await invoke({ action: 'act', name, args });
    merge(r.vault);
    noteGuest(r);
    return r.result;
  }
  let result;
  store.update((s) => {
    const out = apply(pickVault(s), name, args);
    Object.assign(s, out.vault);
    result = out.result;
  });
  return result;
}

// ---- invite friends --------------------------------------------------------------
/** Your invite code and friends (op 'status'), or join with a code (op 'enter', { code }). */
export async function referral(op, args = {}) {
  if (!cloud.enabled || !cloud.currentUser()) throw new Error('Sign in first.');
  const r = await invoke({ action: 'referral', op, ...args, save: store.get() });
  if (r.vault) merge(r.vault);
  return r;
}

// ---- friends and trading (docs/19-friends-trading.md) ---------------------------------
/** A friends or trading request to the server: op 'status', 'send', 'offer', 'board'… */
export async function social(op, args = {}) {
  if (!cloud.enabled || !cloud.currentUser()) throw new Error('Sign in first.');
  const r = await invoke({ action: 'social', op, ...args, save: store.get() });
  if (r.vault) merge(r.vault);
  return r;
}

// A code from an invite link (?ref=CODE) waits here until the player is signed in.
const REF_KEY = 'threnyx.ref';
export function rememberRef(code) {
  try {
    if (code) localStorage.setItem(REF_KEY, String(code).toUpperCase().slice(0, 12));
  } catch {}
}
export function pendingRef() {
  try {
    return localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}
/** After sign-in: use the waiting invite code, once. Returns { ok, message } or null. */
export async function claimPendingRef() {
  const code = pendingRef();
  if (!code) return null;
  try {
    const r = await referral('enter', { code });
    localStorage.removeItem(REF_KEY);
    return { ok: true, message: 'Invite code added. Finish training for your welcome Pack Ticket.', r };
  } catch (e) {
    if (e.unreachable || e.missing) return null; // try again next time
    try {
      localStorage.removeItem(REF_KEY);
    } catch {}
    return /already/i.test(e.message) ? null : { ok: false, message: e.message };
  }
}
