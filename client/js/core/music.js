// MUSIC — the score, under the synthesized sound effects.
// Each screen asks for a track; changes crossfade. Tracks loop by starting the
// other player at the track's loop point a few seconds before the end and
// crossfading, so Suno's intros play once and endings never cut off.
//
// Two <audio> players, A and B, are unlocked on the player's first tap and
// reused forever: iOS only lets a media element start from a tap, so fresh
// elements could never start a loop on their own. Tracks stream from the site
// (nothing held in page memory), a player that stops lets go of its audio, and
// with music off nothing is downloaded or played.
// Plays through its own bus (core/audio.js musicOut), which the Hush silences.
import { audioCtx, musicOut } from './audio.js';
import { onFrame } from './motion.js';
import { crumb } from './crumbs.js';

const BASE = new URL('../../audio/music/', import.meta.url).href;
const SILENCE = new URL('../../audio/silence.mp3', import.meta.url).href;
// loopStart: where repeats begin (skips the intro) · vol: mix level under sfx
// xf: seconds of crossfade at the loop point (short loops use less)
export const TRACKS = {
  main: { loopStart: 12, vol: 0.5 },
  training: { loopStart: 8, vol: 0.45 },
  battle: { loopStart: 10, vol: 0.42 },
  final: { loopStart: 8, vol: 0.48 },
  boss: { loopStart: 10, vol: 0.48 },
  // arenas: the opponent's home ground
  crown: { loopStart: 10, vol: 0.45 },
  quiet: { loopStart: 10, vol: 0.5 },
  hour: { loopStart: 8, vol: 0.45 },
  margin: { loopStart: 10, vol: 0.45 },
  vigil: { loopStart: 10, vol: 0.45 },
  // screens
  pack: { loopStart: 3, vol: 0.45, xf: 1.5 },
  trade: { loopStart: 6, vol: 0.45 },
  story: { loopStart: 10, vol: 0.45 },
  daily: { loopStart: 8, vol: 0.42 },
  draft: { loopStart: 8, vol: 0.42 },
  codex: { loopStart: 2, vol: 0.45, xf: 2 },
  hush: { loopStart: 10, vol: 0.5 },
  finale: { loopStart: 0, vol: 0.55 },
};
// one-shots: played over the score, which ducks under them
export const STINGS = { victory: { vol: 0.75 }, defeat: { vol: 0.7 }, reveal: { vol: 0.8 } };
const XF = 3; // default seconds of crossfade at a loop point
const xfOf = (key) => TRACKS[key].xf ?? XF;

let enabled = true;
let want = null; // the track the current screen wants
let cur = null; // the player carrying it
let players = null; // [A, B], once unlocked
// Streamed from the site (it answers range requests, so loop points still seek).
// Nothing is held in the page: phones kill pages that keep whole tracks in memory.
// If streaming ever fails, fall back to one downloaded copy per player, freed when it stops.
let stream = true;
const fetchTrack = (key) =>
  stream
    ? Promise.resolve(BASE + key + '.mp3')
    : fetch(BASE + key + '.mp3')
        .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
        .then((b) => URL.createObjectURL(b))
        .catch(() => BASE + key + '.mp3');
function load(p, key, url, go) {
  if (p.el.src.startsWith('blob:')) URL.revokeObjectURL(p.el.src);
  p.el.src = url;
  p.el.addEventListener('loadedmetadata', go, { once: true });
  p.el.onerror = () => {
    if (!stream || !url.startsWith('http')) return;
    stream = false; // this server can't stream: use downloaded copies from now on
    const job = p.job;
    fetchTrack(key).then((u) => p.job === job && load(p, key, u, go));
  };
}

// let go of the audio a player holds (a paused element keeps its whole track)
function release(p) {
  p.el.onerror = null; // emptying the element is not a failure
  p.el.pause();
  if (p.el.src.startsWith('blob:')) URL.revokeObjectURL(p.el.src);
  p.el.removeAttribute('src');
  try {
    p.el.load();
  } catch {}
}

function ramp(p, to, secs) {
  const t = audioCtx().currentTime;
  p.g.gain.cancelScheduledValues(t);
  p.g.gain.setValueAtTime(p.g.gain.value, t);
  p.g.gain.linearRampToValueAtTime(to, t + Math.max(0.02, secs));
}

// Called inside the first tap: build and unlock both players.
function makePlayers() {
  const ctx = audioCtx();
  const bus = musicOut();
  if (!ctx || !bus) return null;
  return [0, 1, 2].map(() => {
    const el = new Audio();
    el.preload = 'auto';
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    ctx.createMediaElementSource(el).connect(g).connect(bus);
    // a silent play inside the gesture unlocks this element for later
    el.src = SILENCE;
    el.play().then(() => el.pause()).catch(() => {});
    return { el, g, key: null, retiring: false, job: 0 };
  });
}

function start(p, key, at, fade) {
  crumb(`music ${key} @${at}`);
  const job = ++p.job;
  p.key = key;
  p.retiring = false;
  p.el.pause();
  fetchTrack(key).then((url) => {
    if (p.job !== job) return; // superseded while downloading
    const go = () => {
      if (p.job !== job) return;
      try {
        p.el.currentTime = at;
      } catch {}
      p.el.play().catch(() => {});
      ramp(p, enabled ? TRACKS[key].vol : 0.0001, fade);
    };
    if (p.el.src === url && p.el.readyState >= 1) go();
    else load(p, key, url, go);
  });
  watch();
}

function retire(p, secs) {
  if (!p || p.retiring || !p.key) return;
  p.retiring = true;
  const job = p.job;
  ramp(p, 0.0001, secs);
  setTimeout(() => {
    if (p.job !== job) return; // reused meanwhile
    release(p);
    p.key = null;
    p.retiring = false;
  }, secs * 1000 + 200);
}

// players[0] and [1] carry the score; players[2] is the sting channel
const other = (p) => (p === players[0] ? players[1] : players[0]);

function loop() {
  const next = other(cur);
  start(next, cur.key, TRACKS[cur.key].loopStart, xfOf(cur.key));
  retire(cur, xfOf(cur.key));
  cur = next;
}

let watching = false;
function watch() {
  if (watching) return;
  watching = true;
  onFrame(() => {
    if (!cur) return (watching = false);
    const el = cur.el;
    if (cur.key && !cur.retiring && el.duration && !el.paused && el.currentTime > el.duration - xfOf(cur.key) - 0.05) loop();
    return true;
  });
}

// Ask for a track (null = silence). Safe to call before audio is unlocked.
export function play(key, { fade = 1.4 } = {}) {
  want = key;
  if (!players) return;
  if (!enabled) key = null; // music off: download nothing, play nothing
  if (key) fetchTrack(key);
  if (cur && cur.key === key && !cur.retiring) return;
  if (cur) retire(cur, fade);
  if (!key) return (cur = null);
  const p = cur ? other(cur) : players[0];
  start(p, key, 0, fade);
  cur = p;
}
export const stop = (fade = 1.2) => play(null, { fade });

// A one-shot over the score: the score ducks under it, then comes back
// (unless the screen asked for silence meanwhile). Returns false when music
// is off or locked, so callers can fall back to the synthesized sting.
let stingJob = 0;
export function sting(key, { duck = 0.15 } = {}) {
  if (!players || !enabled || !STINGS[key]) return false;
  const p = players[2];
  const job = ++stingJob;
  const under = cur && !cur.retiring ? cur : null;
  if (under) ramp(under, TRACKS[under.key].vol * duck, 0.25);
  p.el.pause();
  fetchTrack(key).then((url) => {
    if (job !== stingJob) return;
    const go = () => {
      p.el.currentTime = 0;
      p.el.play().catch(() => {});
      ramp(p, STINGS[key].vol, 0.03);
      p.el.onended = () => {
        if (job !== stingJob) return;
        if (under && under === cur && !under.retiring) ramp(under, enabled ? TRACKS[under.key].vol : 0.0001, 1.5);
      };
    };
    if (p.el.src === url && p.el.readyState >= 1) go();
    else load(p, key, url, go);
  });
  return true;
}
// warm the browser's cache so a sting fires on time (the bytes aren't kept here)
export const preload = (...keys) => enabled && keys.forEach((k) => fetch(BASE + k + '.mp3').then((r) => r.arrayBuffer()).catch(() => {}));

// Called from the first tap, once the audio context exists.
export function unlock() {
  if (players) return;
  players = makePlayers();
  if (!players) return;
  if (want) play(want, { fade: 2 });
}

export function setMusic(on) {
  enabled = !!on;
  // off: fade out and free the players; on: start the screen's track again
  play(want, { fade: 0.6 });
}

// Backgrounded: pause, and pick up where it left off.
document.addEventListener('visibilitychange', () => {
  for (const p of (players || []).slice(0, 2)) {
    if (!p.key || p.retiring) continue;
    if (document.hidden) p.el.pause();
    else p.el.play().catch(() => {});
  }
});

// for tools/ checks: what is playing right now
export const nowPlaying = () => (players || []).slice(0, 2).filter((p) => p.key).map((p) => ({ key: p.key, t: p.el.currentTime, dur: p.el.duration, paused: p.el.paused, retiring: p.retiring, el: p.el }));
export const stingState = () => players && { src: players[2].el.src.slice(0, 5), t: players[2].el.currentTime, paused: players[2].el.paused };
