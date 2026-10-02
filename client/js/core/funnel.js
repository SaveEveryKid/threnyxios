// THE FUNNEL — where strangers find the game and where they drift away
// (docs/18-guest-play.md). Names and timings only: a random id made on this
// device (not a fingerprint), the player id once there is one, never anything
// typed. Fire-and-forget: it never slows or breaks the game.
import * as cloud from './cloud.js';
import { FUNNEL_EVENTS } from '../../../engine/guest.js';

const KEY = 'threnyx.visitor';
let visitor = null;
function visitorId() {
  if (visitor) return visitor;
  try {
    visitor = localStorage.getItem(KEY);
    if (!visitor) localStorage.setItem(KEY, (visitor = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)));
  } catch {
    visitor ||= 'v-' + Math.random().toString(36).slice(2, 12);
  }
  return visitor;
}
const once = new Set();

/** Record a funnel step. `oncePerSession`: only the first time this session. */
export function track(name, meta = null, { oncePerSession = false } = {}) {
  if (!FUNNEL_EVENTS.has(name) || !cloud.enabled) return;
  if (oncePerSession) {
    if (once.has(name)) return;
    once.add(name);
  }
  cloud.client().then((c) => c?.functions.invoke('economy', { body: { action: 'event', name, visitor: visitorId(), meta } })).catch(() => {});
}
