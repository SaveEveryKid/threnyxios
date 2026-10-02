// THRENYX AUDIO — every sound is synthesized: bells, breath, impacts.
// The world is a song, so the game's sound language is tuned: Orders have
// pitches, READ is a chord resolving, MISREAD is a detuned bell, and the
// Mythic reveal is preceded by the Hush (total silence).

let ctx = null;
let master = null;
let fx = null; // reverb send
let enabled = true;
let hushed = false;
let musicBus = null; // the score (core/music.js) plays through this, outside the sfx compressor
// Voice chat (client/js/voice): while it's on, the score sits at MUSIC_DUCK and
// effects a little lower, so the other player is easy to hear. Levels are set
// from the state (on/off), never multiplied, so they can't drift.
const SFX_LEVEL = 0.8, SFX_VOICE = 0.6, MUSIC_DUCK = 0.25;
let voiceOn = false, duckMusic = true;
let decor = 1; // decorative sounds (taps, flips, whooshes) at half while voice is on
const sfxLevel = () => (enabled ? (voiceOn ? SFX_VOICE : SFX_LEVEL) : 0);
const musicLevel = () => (voiceOn && duckMusic ? MUSIC_DUCK : 1);

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function impulse(ac, seconds = 3.2, decay = 2.6) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = sfxLevel();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx);
  fx = ctx.createGain();
  fx.gain.value = 0.35;
  fx.connect(conv).connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = musicLevel();
  musicBus.connect(ctx.destination);
  // iOS can stop the audio when a call or Siri cuts in; pick it back up while voice is on
  ctx.onstatechange = () => {
    if (voiceOn && ctx.state !== 'running' && ctx.state !== 'closed' && document.visibilityState === 'visible') ctx.resume().catch(() => {});
  };
}
export const audioCtx = () => ctx;
export const musicOut = () => musicBus;

export function setSound(on) {
  enabled = on;
  if (master && !hushed) master.gain.value = sfxLevel();
}

function rampTo(param, v, secs) {
  const t = ctx.currentTime;
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(v, t + secs);
}
/** Voice chat on or off: the score dips (if `music`) and effects ease down; back up when it ends. */
export function setVoiceDuck(active, { music = true } = {}) {
  voiceOn = !!active;
  duckMusic = !!music;
  if (!ctx || hushed) return; // the Hush restores to these levels when it lifts
  rampTo(master.gain, sfxLevel(), 0.3);
  if (musicBus) rampTo(musicBus.gain, musicLevel(), voiceOn ? 0.35 : 0.5);
}
export const voiceDuckState = () => ({ voiceOn, duckMusic, music: musicBus?.gain.value ?? null, sfx: master?.gain.value ?? null, target: { music: musicLevel(), sfx: sfxLevel() } });

function out(node, wet = 0.3) {
  node.connect(master);
  if (wet > 0) {
    const g = ctx.createGain();
    g.gain.value = wet;
    node.connect(g).connect(fx);
  }
}

function env(g, t, a, peak, d) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

// Bell: inharmonic partials with independent decays.
function bell(freq, { t = 0, dur = 2.4, gain = 0.25, wet = 0.5, bright = 1 } = {}) {
  if (!ctx || !enabled || hushed) return;
  const now = ctx.currentTime + t;
  const partials = [
    [0.5, 0.35, 1.3],
    [1, 1, 1],
    [2.0, 0.5 * bright, 0.7],
    [2.76, 0.45 * bright, 0.55],
    [5.4, 0.25 * bright, 0.35],
    [8.93, 0.12 * bright, 0.2],
  ];
  const bus = ctx.createGain();
  bus.gain.value = gain * decor;
  out(bus, wet);
  for (const [ratio, amp, life] of partials) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * ratio;
    const g = ctx.createGain();
    env(g, now, 0.004, amp, dur * life);
    o.connect(g).connect(bus);
    o.start(now);
    o.stop(now + dur * life + 0.1);
  }
}

function noise(dur) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function whoosh({ t = 0, dur = 0.35, from = 400, to = 3000, gain = 0.2, q = 1.2, wet = 0.15 } = {}) {
  if (!ctx || !enabled || hushed) return;
  const now = ctx.currentTime + t;
  const src = noise(dur + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, now);
  f.frequency.exponentialRampToValueAtTime(to, now + dur);
  const g = ctx.createGain();
  env(g, now, dur * 0.35, gain * decor, dur * 0.65);
  src.connect(f).connect(g);
  out(g, wet);
  src.start(now);
}

function thud({ t = 0, freq = 80, dur = 0.35, gain = 0.6, click = 0.25 } = {}) {
  if (!ctx || !enabled || hushed) return;
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 2.2, now);
  o.frequency.exponentialRampToValueAtTime(freq, now + 0.06);
  const g = ctx.createGain();
  env(g, now, 0.003, gain, dur);
  o.connect(g);
  out(g, 0.1);
  o.start(now);
  o.stop(now + dur + 0.1);
  if (click) {
    const n = noise(0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800;
    const g2 = ctx.createGain();
    env(g2, now, 0.001, click, 0.04);
    n.connect(f).connect(g2);
    out(g2, 0);
    n.start(now);
  }
}

function tone(freq, { t = 0, dur = 0.2, type = 'triangle', gain = 0.15, glide = null, wet = 0.2 } = {}) {
  if (!ctx || !enabled || hushed) return;
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, now + dur);
  const g = ctx.createGain();
  env(g, now, 0.01, gain * decor, dur);
  o.connect(g);
  out(g, wet);
  o.start(now);
  o.stop(now + dur + 0.05);
}

// Choir pad: detuned saws through two vowel formants.
function choir(notes, { t = 0, dur = 2.5, gain = 0.08, attack = 0.6 } = {}) {
  if (!ctx || !enabled || hushed) return;
  const now = ctx.currentTime + t;
  const bus = ctx.createGain();
  env(bus, now, attack, gain, dur);
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = 700;
  f1.Q.value = 3;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = 1150;
  f2.Q.value = 4;
  const mixg = ctx.createGain();
  f1.connect(mixg);
  f2.connect(mixg);
  mixg.connect(bus);
  out(bus, 0.7);
  for (const n of notes) {
    for (const det of [-9, 0, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      o.detune.value = det;
      o.connect(f1);
      o.connect(f2);
      o.start(now);
      o.stop(now + attack + dur + 0.2);
    }
  }
}

// The Hush: the world goes silent. Everything currently playing is ducked.
function hush(ms) {
  if (!ctx) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(0.0001, now + 0.08);
  // the Hush silences the score too
  if (musicBus) {
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(musicBus.gain.value, now);
    musicBus.gain.linearRampToValueAtTime(0.0001, now + 0.12);
  }
  hushed = true;
  setTimeout(() => {
    hushed = false;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(0.0001, t);
    master.gain.linearRampToValueAtTime(sfxLevel(), t + 0.02);
    if (musicBus) {
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(0.0001, t);
      musicBus.gain.linearRampToValueAtTime(musicLevel(), t + 1.6);
    }
  }, ms);
}

const ORDER_NOTE = { strike: 76, guard: 64, scheme: 71 }; // E5, E4, B4

export const sfx = {
  // the splash: a deep bell under the star's strike
  title: () => { thud({ freq: 40, dur: 1.4, gain: 0.7, click: 0.2 }); bell(midi(52), { gain: 0.24, dur: 5 }); bell(midi(64), { t: 0.02, gain: 0.13, dur: 4.5 }); bell(midi(71), { t: 0.05, gain: 0.07, dur: 4 }); },
  tap: () => whoosh({ dur: 0.05, from: 3000, to: 5000, gain: 0.05, wet: 0 }),
  select: () => { tone(midi(79), { dur: 0.09, gain: 0.07 }); whoosh({ dur: 0.08, from: 1500, to: 4000, gain: 0.05, wet: 0 }); },
  deploy: () => { whoosh({ dur: 0.25, from: 300, to: 2400, gain: 0.18 }); thud({ t: 0.18, freq: 70, gain: 0.35 }); },
  order: (o) => {
    if (o === 'strike') { tone(midi(ORDER_NOTE.strike), { dur: 0.16, type: 'sawtooth', gain: 0.05, glide: midi(83) }); whoosh({ dur: 0.12, from: 2000, to: 6000, gain: 0.06, wet: 0 }); }
    if (o === 'guard') { thud({ freq: 110, dur: 0.2, gain: 0.25, click: 0.05 }); tone(midi(ORDER_NOTE.guard), { dur: 0.2, gain: 0.06, type: 'sine' }); }
    if (o === 'scheme') { tone(midi(ORDER_NOTE.scheme), { dur: 0.25, gain: 0.05, type: 'sine' }); tone(midi(ORDER_NOTE.scheme + 6), { t: 0.05, dur: 0.25, gain: 0.04, type: 'sine' }); }
  },
  focus: (on) => (on ? whoosh({ dur: 0.4, from: 200, to: 2600, gain: 0.12, q: 2 }) : whoosh({ dur: 0.2, from: 2000, to: 300, gain: 0.06 })),
  readArm: () => { tone(midi(64), { dur: 0.35, type: 'sine', gain: 0.07, glide: midi(76) }); bell(midi(88), { gain: 0.04, dur: 1 }); },
  lock: () => { thud({ freq: 60, dur: 0.4, gain: 0.7, click: 0.35 }); bell(midi(52), { t: 0.02, gain: 0.08, dur: 1.2, bright: 0.4 }); },
  oppLock: () => thud({ freq: 52, dur: 0.3, gain: 0.35, click: 0.15 }),
  anticipation: () => { whoosh({ dur: 0.7, from: 120, to: 900, gain: 0.08, q: 0.8 }); },
  reveal: () => { whoosh({ dur: 0.2, from: 4000, to: 600, gain: 0.14 }); thud({ t: 0.12, freq: 48, dur: 0.6, gain: 0.8, click: 0.4 }); },
  readHit: () => {
    // The signature: a bell chord that *resolves*.
    thud({ freq: 42, dur: 0.9, gain: 0.9, click: 0.5 });
    bell(midi(76), { gain: 0.22, dur: 3 });
    bell(midi(83), { t: 0.07, gain: 0.18, dur: 3 });
    bell(midi(88), { t: 0.14, gain: 0.16, dur: 3.4 });
    choir([64, 71, 76], { t: 0.05, dur: 1.6, gain: 0.05, attack: 0.15 });
  },
  misread: () => {
    bell(midi(70), { gain: 0.16, dur: 1.4, bright: 1.4 });
    bell(midi(70) * 1.06, { gain: 0.12, dur: 1.4, bright: 1.2 });
    tone(midi(58), { dur: 0.6, type: 'sawtooth', gain: 0.04, glide: midi(46) });
  },
  power: (i) => tone(midi(60 + Math.min(24, i)), { dur: 0.05, type: 'square', gain: 0.025, wet: 0 }),
  clashWin: () => { thud({ freq: 55, dur: 0.6, gain: 0.8 }); bell(midi(72), { gain: 0.14, dur: 2 }); bell(midi(79), { t: 0.05, gain: 0.1, dur: 2 }); },
  clashLose: () => { thud({ freq: 45, dur: 0.5, gain: 0.5, click: 0.1 }); bell(midi(55), { gain: 0.1, dur: 1.6, bright: 0.5 }); },
  matchWin: () => {
    [72, 76, 79, 84].forEach((n, i) => bell(midi(n), { t: i * 0.12, gain: 0.18, dur: 3.2 }));
    choir([60, 67, 72, 76], { t: 0.3, dur: 2.2, gain: 0.07 });
    thud({ t: 0.36, freq: 40, dur: 1, gain: 0.9 });
  },
  matchLose: () => { bell(midi(43), { gain: 0.3, dur: 4, bright: 0.6 }); bell(midi(43), { t: 1.6, gain: 0.18, dur: 4, bright: 0.5 }); },
  packHold: () => whoosh({ dur: 0.6, from: 100, to: 700, gain: 0.06, q: 0.6 }),
  packTear: () => { whoosh({ dur: 0.45, from: 900, to: 7000, gain: 0.25, q: 0.5, wet: 0.05 }); thud({ t: 0.05, freq: 90, dur: 0.3, gain: 0.3 }); },
  cardFlip: () => whoosh({ dur: 0.18, from: 800, to: 3000, gain: 0.1 }),
  rarity: (r) => {
    if (r === 'common') tone(midi(72), { dur: 0.15, gain: 0.05, type: 'sine' });
    if (r === 'rare') bell(midi(84), { gain: 0.1, dur: 1.4 });
    if (r === 'epic') { bell(midi(76), { gain: 0.12, dur: 2 }); bell(midi(83), { t: 0.06, gain: 0.1, dur: 2 }); }
    if (r === 'legendary') {
      [64, 71, 76, 83].forEach((n, i) => bell(midi(n), { t: i * 0.09, gain: 0.14, dur: 3 }));
      choir([52, 64, 71], { dur: 2, gain: 0.06, attack: 0.3 });
      thud({ freq: 44, dur: 0.8, gain: 0.7 });
    }
    if (r === 'mythic' || r === 'immortal') {
      thud({ freq: 36, dur: 1.4, gain: 1 });
      bell(midi(40), { gain: 0.4, dur: 5, bright: 0.8 });
      [64, 71, 76, 83, 88].forEach((n, i) => bell(midi(n), { t: 0.2 + i * 0.1, gain: 0.13, dur: 3.6 }));
      choir([52, 59, 64, 71, 76], { t: 0.1, dur: 3.2, gain: 0.09, attack: 0.25 });
      if (r === 'immortal') [91, 95, 100].forEach((n, i) => bell(midi(n), { t: 0.9 + i * 0.08, gain: 0.06, dur: 3 }));
    }
  },
  // Rarity clue before the flip: the card's edge hums in the rarity's pitch.
  clue: (r) => {
    const n = { common: 60, rare: 67, epic: 71, legendary: 74, mythic: 40, immortal: 40 }[r];
    if (r === 'mythic' || r === 'immortal') { tone(midi(n), { dur: 1.2, type: 'sine', gain: 0.12, wet: 0.5 }); return; }
    tone(midi(n), { dur: 0.5, type: 'sine', gain: 0.05, wet: 0.4 });
  },
  hush: (ms = 900) => hush(ms),
  nav: () => tone(midi(84), { dur: 0.05, gain: 0.03, type: 'sine', wet: 0 }),
  error: () => tone(midi(50), { dur: 0.15, gain: 0.06, type: 'square', wet: 0 }),
  reward: () => { bell(midi(79), { gain: 0.1, dur: 1.5 }); bell(midi(86), { t: 0.08, gain: 0.08, dur: 1.5 }); },
  // Reckoning: impacts scale with damage; a Champion falling tolls a bell.
  hit: (n = 3) => {
    const k = Math.min(1, n / 9);
    thud({ freq: 70 - 25 * k, dur: 0.25 + 0.3 * k, gain: 0.45 + 0.5 * k, click: 0.3 + 0.3 * k });
    whoosh({ dur: 0.12, from: 5000, to: 1200, gain: 0.08 + 0.1 * k, wet: 0 });
  },
  shield: () => { tone(midi(83), { dur: 0.3, type: 'sine', gain: 0.06, glide: midi(88) }); bell(midi(95), { gain: 0.04, dur: 0.8, bright: 0.6 }); },
  heal: () => { tone(midi(72), { dur: 0.35, type: 'sine', gain: 0.06, glide: midi(79) }); tone(midi(76), { t: 0.08, dur: 0.35, type: 'sine', gain: 0.05, glide: midi(84) }); },
  fall: () => { bell(midi(45), { gain: 0.22, dur: 3, bright: 0.7 }); thud({ t: 0.05, freq: 40, dur: 0.8, gain: 0.6, click: 0.1 }); },
  // Game feel: card slams, the clash sting, windups and glass.
  slam: () => { thud({ freq: 46, dur: 0.5, gain: 0.9, click: 0.45 }); whoosh({ dur: 0.18, from: 3000, to: 400, gain: 0.12, wet: 0 }); },
  windup: () => whoosh({ dur: 0.22, from: 250, to: 2800, gain: 0.14, q: 1.6, wet: 0.05 }),
  clash: () => {
    thud({ freq: 38, dur: 0.9, gain: 1, click: 0.6 });
    whoosh({ dur: 0.5, from: 6000, to: 300, gain: 0.2, q: 0.6 });
    bell(midi(52), { gain: 0.16, dur: 2, bright: 1.2 });
    bell(midi(59), { t: 0.03, gain: 0.12, dur: 2 });
  },
  shatter: () => {
    whoosh({ dur: 0.35, from: 7000, to: 2500, gain: 0.22, q: 0.4, wet: 0.3 });
    [96, 101, 91, 98].forEach((n, i) => tone(midi(n), { t: i * 0.035, dur: 0.18, type: 'triangle', gain: 0.035, wet: 0.4 }));
    thud({ freq: 36, dur: 0.9, gain: 0.8, click: 0.5 });
  },
  banner: () => { whoosh({ dur: 0.45, from: 200, to: 3500, gain: 0.14, q: 0.9 }); bell(midi(64), { t: 0.18, gain: 0.08, dur: 1.4, bright: 0.5 }); },
  knockout: () => { thud({ freq: 34, dur: 1.1, gain: 1, click: 0.6 }); bell(midi(40), { gain: 0.3, dur: 3.5, bright: 0.9 }); bell(midi(47), { t: 0.04, gain: 0.18, dur: 3 }); },
};

// decorative sounds play at half while voice chat is on; the ones that tell you
// something (locks, reveals, hits, results) keep their full level
for (const k of ['tap', 'select', 'nav', 'anticipation', 'packHold', 'cardFlip', 'power', 'windup', 'clue', 'focus', 'banner']) {
  const f = sfx[k];
  sfx[k] = (...a) => {
    decor = voiceOn ? 0.5 : 1;
    try { return f(...a); } finally { decor = 1; }
  };
}
