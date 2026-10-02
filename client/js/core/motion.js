// Motion: one device-orientation source and one frame loop for every premium
// card on screen.
//
// Premium cards read tilt from here. The phone's orientation is turned into a
// *relative* tilt: a slow-moving baseline follows however the player is
// holding the phone, so any comfortable grip is "neutral" and only the small
// movements of the hand move the light. This is what makes it feel like holding
// a real card instead of a spirit level.
//
// Fallbacks, in order: live sensor -> pointer/touch on the card -> still.
// Sensors are never required: desktops, sandboxed frames, denied permission
// and reduced-motion users all get the pointer path.

const TAU_BASE = 3.2; // s: how fast "neutral" follows the player's grip
const RANGE = 20; // degrees of hand movement for full effect
const RAW_SMOOTH = 0.35; // per-event low-pass on raw readings (sensor jitter)

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)');
const S = {
  enabled: true,
  status: 'idle', // idle | pending | live | denied | unsupported
  raw: null, // smoothed screen-space degrees {x, y}
  base: null,
  x: 0,
  y: 0,
  lastEvent: 0,
  lastT: 0,
};

export const motionReduced = () => !!(reduced && reduced.matches);
export const motionState = () => ({ enabled: S.enabled, status: S.status, reduced: motionReduced() });

// Live = enabled, not reduced, and a real reading within the last second.
export function sensorTilt() {
  const live = S.enabled && !motionReduced() && S.status === 'live' && performance.now() - S.lastEvent < 1000;
  return { live, x: live ? S.x : 0, y: live ? S.y : 0 };
}

const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const clamp = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

// Device (beta, gamma) -> screen-space degrees, honouring screen rotation.
function toScreen(beta, gamma) {
  const a = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
  switch (((a % 360) + 360) % 360) {
    case 90: return { x: beta, y: -gamma };
    case 270: return { x: -beta, y: gamma };
    case 180: return { x: -gamma, y: -beta };
    default: return { x: gamma, y: beta };
  }
}

function onOrient(e) {
  if (e.beta == null || e.gamma == null) return; // desktops fire one empty event
  const now = performance.now();
  const r = toScreen(e.beta, e.gamma);
  if (!S.raw || now - S.lastEvent > 1500) {
    // first reading, or back from a pause: this grip is neutral
    S.raw = { ...r };
    S.base = { ...r };
  } else {
    S.raw.x += wrap(r.x - S.raw.x) * RAW_SMOOTH;
    S.raw.y += wrap(r.y - S.raw.y) * RAW_SMOOTH;
    const k = 1 - Math.exp(-(now - S.lastEvent) / 1000 / TAU_BASE);
    S.base.x += wrap(S.raw.x - S.base.x) * k;
    S.base.y += wrap(S.raw.y - S.base.y) * k;
  }
  S.lastEvent = now;
  S.status = 'live';
  S.x = clamp(wrap(S.raw.x - S.base.x) / RANGE);
  S.y = clamp(wrap(S.raw.y - S.base.y) / RANGE);
}

let listening = false;
function listen() {
  if (listening) return;
  if (!('DeviceOrientationEvent' in window)) {
    S.status = 'unsupported';
    return;
  }
  listening = true;
  window.addEventListener('deviceorientation', onOrient, { passive: true });
  if (S.status === 'idle') S.status = 'pending';
}

const needsPermission = () => typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';

// Start sensors. On iOS this must run inside a tap; elsewhere it just listens.
// Resolves to the resulting status. Never throws.
export async function requestSensors() {
  if (!S.enabled || motionReduced()) return S.status;
  if (S.status === 'live' || S.status === 'denied') return S.status;
  if (needsPermission()) {
    try {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') return (S.status = 'denied');
    } catch {
      return S.status; // not in a gesture: try again on the next tap
    }
  }
  listen();
  return S.status;
}

// Android / desktop: no permission needed, so listen as soon as asked for.
export function autoStart() {
  if (!needsPermission()) requestSensors();
}
export const sensorsNeedTap = () => needsPermission() && S.status !== 'live' && S.status !== 'denied';

export function setMotion(on) {
  S.enabled = !!on;
  if (on) autoStart();
}

// ---- frame loop ------------------------------------------------------------
// One requestAnimationFrame for every animated card. Subscribers get (dt, now)
// and return false to unsubscribe. The loop stops when nothing is subscribed,
// and the browser pauses it in background tabs.
const frames = new Set();
let raf = 0;
function tick(now) {
  const dt = Math.min(0.05, S.lastT ? (now - S.lastT) / 1000 : 1 / 60);
  S.lastT = now;
  for (const f of frames) if (f(dt, now) === false) frames.delete(f);
  raf = frames.size ? requestAnimationFrame(tick) : 0;
  if (!raf) S.lastT = 0;
}
// for tools/ checks: how many per-frame callbacks are running
if (typeof window !== 'undefined') window.__frames = () => frames.size;
export function onFrame(fn) {
  frames.add(fn);
  if (!raf) raf = requestAnimationFrame(tick);
  return () => frames.delete(fn);
}

// ---- the room light ---------------------------------------------------------
// Every card on screen shares one light: the phone's tilt is written to
// :root as --gx/--gy (-1..1) and --gm (0..1), smoothed, and only while the
// sensors are live. Board, hand and grid cards read these directly; showcase
// cards (attachTilt) add a finger on top. Quantised so a still phone costs
// nothing.
let roomOn = false;
const room = { x: 0, y: 0, w: '', live: null, wait: 0 };
// Writing to :root restyles the whole page, so the light moves in coarse steps
// at most 20 times a second (at 120 Hz per sensor reading, an iPhone's page
// grew until iOS killed it), and not at all on lighter effects.
const STEP = 0.05;
const q = (v) => (Math.round(v / STEP) * STEP).toFixed(2);
const liteOn = () => !!document.getElementById('app')?.classList.contains('lite');
function roomTick(dt) {
  const s = sensorTilt();
  const k = 1 - Math.exp(-dt / 0.09);
  room.x += ((s.live ? s.x : 0) - room.x) * k;
  room.y += ((s.live ? s.y : 0) - room.y) * k;
  room.wait -= dt;
  if (room.wait <= 0) {
    room.wait = 0.05;
    const key = q(room.x) + q(room.y);
    if (key !== room.w) {
      room.w = key;
      const st = document.documentElement.style;
      st.setProperty('--gx', q(room.x));
      st.setProperty('--gy', q(room.y));
      st.setProperty('--gm', q(Math.min(1, Math.hypot(room.x, room.y))));
    }
    // while the phone is the light, time-based sweeps step aside
    if (room.live !== s.live) document.documentElement.classList.toggle('sensor-live', (room.live = s.live));
  }
  // settle back to rest, then stop until the next reading
  if (!s.live && Math.abs(room.x) < 0.004 && Math.abs(room.y) < 0.004) return (roomOn = false);
  return true;
}
function wakeRoom() {
  if (!roomOn) (roomOn = true), onFrame(roomTick);
}
window.addEventListener('deviceorientation', () => S.status === 'live' && !liteOn() && wakeRoom(), { passive: true });
