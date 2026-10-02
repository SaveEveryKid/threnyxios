// CRASH CRUMBS — iPhone Safari silently reloads a tab it kills for memory, so
// the game leaves a trail of what it was doing, with a heartbeat every few
// seconds. A session that ended while a battle was still running (no result,
// no leaving the screen) was interrupted: its trail is kept, lighter effects
// switch on, and More → Playtest report shows it and exports it.
const KEY = 'threnyx.crumbs.v2';
const CRASHES = 'threnyx.crashes.v1';
let rec = { t: 0, battle: null, hidden: false, closed: false, screen: null, trail: [] };
let last = 0;
const write = () => {
  rec.t = Date.now();
  rec.trail = rec.trail.slice(-40);
  try {
    localStorage.setItem(KEY, JSON.stringify(rec));
  } catch {}
};
export function crumb(what) {
  rec.trail.push([new Date().toISOString().slice(11, 19), what]);
  const now = Date.now();
  if (now - last > 250 || /^(round|lock|clash|music|end|battle)/.test(what)) (last = now), write();
}
// the battle screen says when a match starts and when it properly ends
export function battleOn(info) {
  rec.battle = info;
  crumb('battle start ' + (info?.mode || ''));
}
export function battleOff(why) {
  crumb('battle end ' + why);
  rec.battle = null;
  write();
}
// which screen is showing (from the router)
export function screenIs(name) {
  rec.screen = name;
  crumb('screen ' + name);
}
export const crashes = () => {
  try {
    return JSON.parse(localStorage.getItem(CRASHES) || '[]');
  } catch {
    return [];
  }
};
// Called once at boot. Returns the record if the last session died mid-battle.
export function startCrumbs() {
  let prev = null;
  try {
    prev = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {}
  let crash = null;
  // died mid-match, or anywhere while on screen (never closed, never hidden), in the last half hour
  const recent = prev?.t && Date.now() - prev.t < 30 * 60000;
  if (prev && (prev.battle || (recent && !prev.closed && !prev.hidden))) {
    crash = { at: new Date().toISOString(), lastSign: prev.t ? new Date(prev.t).toISOString() : null, screen: prev.screen, battle: prev.battle, whileHidden: !!prev.hidden, ua: navigator.userAgent, trail: prev.trail };
    try {
      localStorage.setItem(CRASHES, JSON.stringify([...crashes(), crash].slice(-10)));
    } catch {}
  }
  rec = { t: 0, battle: null, hidden: false, closed: false, screen: null, trail: [] };
  crumb('boot');
  // heartbeat, so the record says how long the page lived
  setInterval(() => !document.hidden && write(), 4000);
  addEventListener('pagehide', () => {
    rec.closed = true;
    write();
  });
  addEventListener('pageshow', () => {
    rec.closed = false;
    write();
  });
  document.addEventListener('visibilitychange', () => {
    rec.hidden = document.hidden;
    crumb(document.hidden ? 'hidden' : 'visible');
    write();
  });
  return crash;
}
