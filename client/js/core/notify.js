// NOTICES — while THRENYX is open, it checks every so often for trade offers,
// counter-offers, finished trades, friend requests and messages, and says so once:
// a banner ("Bob sent you a trade offer · View"), a dot on Home, and the number on
// the app icon when THRENYX is on the home screen. docs/19-friends-trading.md.
import * as cloud from './cloud.js';
import * as vault from './vault.js';
import { presetText } from '../../../engine/social.js';
import { esc } from '../ui/card.js';
import { sfx } from './audio.js';

const EVERY = 45000;
const SEEN = 'threnyx.notices';
let counts = { requests: 0, unread: 0, offers: 0 };
let timer = null;
let ctx = null;
let busy = false;
const listeners = new Set();

/** Things waiting on this player (for the dot on Home): requests + offers + unread. */
export const waiting = () => counts.requests + counts.offers + counts.unread;
export const onChange = (f) => (listeners.add(f), () => listeners.delete(f));

const seen = () => {
  try {
    return JSON.parse(localStorage.getItem(SEEN) || '{}');
  } catch {
    return {};
  }
};
const markSeen = (s) => {
  try {
    localStorage.setItem(SEEN, JSON.stringify(s));
  } catch {}
};

/** Start checking (after sign-in, saved profiles only). `c` has go(). */
export function start(c) {
  ctx = c;
  stop();
  check();
  timer = setInterval(check, EVERY);
  document.addEventListener('visibilitychange', onVisible);
}
export function stop() {
  clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisible);
}
const onVisible = () => document.visibilityState === 'visible' && check();

/** Ask now (after a screen changes something, e.g. accepting an offer). */
export async function check() {
  if (busy || !cloud.enabled || !cloud.currentUser() || cloud.isGuest() || document.visibilityState === 'hidden') return;
  busy = true;
  try {
    const p = await vault.social('ping');
    counts = { requests: p.requests, unread: p.unread, offers: p.offers };
    for (const f of listeners) f(counts);
    // the number on the app icon (home-screen app; quietly nothing elsewhere)
    const n = waiting();
    if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge?.())?.catch?.(() => {});
    announce(p.latest || {});
  } catch {
    // not deployed yet, or offline: try again next time
  } finally {
    busy = false;
  }
}

// each kind of news once: newer than the last one shown on this device
function announce(latest) {
  const s = seen();
  const first = !s.started; // the very first check: only what's waiting now, nothing old
  const news = [];
  const fresh = (k) => latest[k] && latest[k].at > (s[k] || '');
  if (fresh('offer')) news.push({ k: 'offer', text: latest.offer.counter ? `<b>${esc(latest.offer.name)}</b> sent you a counter-offer` : `<b>${esc(latest.offer.name)}</b> sent you a trade offer`, to: ['trade', { tab: 'offers' }] });
  if (fresh('traded') && !first) news.push({ k: 'traded', text: `<b>${esc(latest.traded.name)}</b> traded with you`, to: ['trade', { tab: 'offers' }] });
  if (fresh('request')) news.push({ k: 'request', text: `<b>${esc(latest.request.name)}</b> wants to be friends`, to: ['friends', {}] });
  if (fresh('message')) news.push({ k: 'message', text: `<b>${esc(latest.message.name)}</b>: ${esc(presetText(latest.message.preset))}`, to: ['friends', { id: latest.message.id }] });
  for (const k of ['offer', 'traded', 'request', 'message']) if (latest[k]) s[k] = latest[k].at > (s[k] || '') ? latest[k].at : s[k];
  s.started = true;
  markSeen(s);
  // don't interrupt a match: the dot and the badge are enough there
  if (!news.length || /^#\/battle/.test(location.hash)) return;
  // the screen that shows it already: no banner
  const here = location.hash;
  const shown = news.filter((n) => !(n.to[0] === 'trade' && here.startsWith('#/trade')) && !(n.to[0] === 'friends' && here.startsWith('#/friends')));
  if (shown.length) banner(shown[0], shown.length - 1);
}

function banner(n, more) {
  document.querySelector('.notice')?.remove();
  const el = document.createElement('button');
  el.className = 'notice';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="notice__dot" aria-hidden="true"></span><span class="grow">${n.text}${more ? ` <span class="muted">+${more} more</span>` : ''}</span><span class="notice__go">View</span>`;
  el.onclick = () => {
    el.remove();
    ctx?.go(...n.to);
  };
  document.body.appendChild(el); // outside #app: changing screens clears #app
  sfx.select?.();
  setTimeout(() => el.classList.add('out'), 7000);
  setTimeout(() => el.remove(), 7600);
}
