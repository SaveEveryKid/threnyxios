// Premium card atmosphere: a small canvas of faction "weather" in front of the
// art. Particles sit at different depths, so tilt slides near ones further than
// far ones (real parallax). Immortals add glints that only catch when the light
// passes over them. Budget: at most ~40 sprites per card, drawn from
// pre-rendered glow sprites, on the shared frame loop.
import { onFrame, motionReduced } from '../core/motion.js';

// Per faction: colours, drift direction (-1 rises, +1 falls), speed and size.
// Speed and size are in card units (1 = 1% of card width).
const WEATHER = {
  crown: { cols: ['255,110,50', '255,176,90', '255,60,40'], dir: -1, speed: [6, 16], size: [0.5, 1.4], sway: 0.6, flicker: 1, glow: true }, // embers off the pyres
  quiet: { cols: ['207,216,232', '170,184,210'], dir: 0.25, speed: [0.8, 2.4], size: [0.4, 1.1], sway: 1.4, flicker: 0.2, glow: false, alpha: 0.55 }, // dust in still air
  hour: { cols: ['63,207,159', '255,209,102'], dir: -0.4, speed: [2, 5], size: [0.35, 0.9], sway: 0.2, flicker: 0.8, glow: true }, // clockwork sparks
  margin: { cols: ['139,92,246', '196,170,255'], dir: 0.6, speed: [1.5, 4], size: [0.4, 1.2], sway: 1.8, flicker: 0.4, glow: true, ink: true }, // drifting ink
  vigil: { cols: ['255,204,102', '255,236,190'], dir: -0.5, speed: [1.5, 4.5], size: [0.5, 1.2], sway: 0.9, flicker: 0.6, glow: true }, // candle motes
};

const spriteCache = new Map();
function sprite(rgb, soft) {
  const key = rgb + soft;
  let c = spriteCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, `rgba(255,255,255,1)`);
    r.addColorStop(soft ? 0.12 : 0.3, `rgba(${rgb},0.95)`);
    r.addColorStop(soft ? 0.4 : 0.55, `rgba(${rgb},0.35)`);
    r.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
    spriteCache.set(key, c);
  }
  return c;
}
function glintSprite() {
  let c = spriteCache.get('glint');
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 48;
    const g = c.getContext('2d');
    g.translate(24, 24);
    const ray = (w, h) => {
      const lg = g.createLinearGradient(-w, 0, w, 0);
      lg.addColorStop(0, 'rgba(255,248,225,0)');
      lg.addColorStop(0.5, 'rgba(255,248,225,1)');
      lg.addColorStop(1, 'rgba(255,248,225,0)');
      g.fillStyle = lg;
      g.fillRect(-w, -h, w * 2, h * 2);
    };
    ray(24, 0.9);
    g.rotate(Math.PI / 2);
    ray(24, 0.9);
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 7);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = r;
    g.fillRect(-7, -7, 14, 14);
    spriteCache.set('glint', c);
  }
  return c;
}

const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * @param el       the .card element
 * @param faction  faction id
 * @param opts     { immortal: bool, density: 0..1, tilt: () => ({x, y}) }
 * @returns stop()
 */
export function attachFx(el, faction, { immortal = false, density = 1, tilt = () => ({ x: 0, y: 0 }) } = {}) {
  if (motionReduced()) return () => {};
  const W = WEATHER[faction] || WEATHER.vigil;
  const cv = document.createElement('canvas');
  cv.className = 'card__fx';
  cv.setAttribute('aria-hidden', 'true');
  el.appendChild(cv);
  const g = cv.getContext('2d');
  let w = 0, h = 0, u = 1, dpr = 1;
  const size = () => {
    const r = cv.getBoundingClientRect();
    // offsetWidth ignores the card's own 3D transform
    const cw = cv.offsetWidth || r.width, ch = cv.offsetHeight || r.height;
    if (!cw) return false;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.round(cw * dpr);
    h = Math.round(ch * dpr);
    cv.width = w;
    cv.height = h;
    u = w / 100;
    return true;
  };

  const N = Math.round((immortal ? 22 : 28) * density);
  const spawn = (p, fresh) => {
    p.z = rnd(0.35, 1); // depth: 1 = nearest
    p.x = Math.random();
    // rising particles enter from the bottom, falling ones from the top
    p.y = fresh ? Math.random() : W.dir < 0 ? 1.05 : W.dir > 0 ? -0.05 : Math.random();
    p.s = rnd(W.speed[0], W.speed[1]) * (0.6 + 0.4 * p.z);
    p.r = rnd(W.size[0], W.size[1]) * (0.55 + 0.65 * p.z);
    p.ph = Math.random() * 6.283;
    p.col = W.cols[(Math.random() * W.cols.length) | 0];
    p.life = fresh ? Math.random() : 0;
    p.ttl = rnd(4, 9);
    return p;
  };
  const parts = Array.from({ length: N }, () => spawn({}, true));
  const glints = immortal ? Array.from({ length: 16 }, () => ({ x: Math.random(), y: Math.random() * 0.62, ph: Math.random() * 6.283, sp: rnd(1.5, 3.5), r: rnd(1.6, 3.2) })) : [];

  let seen = false, t = 0, resizeCheck = 0, age = 0;
  const stop = onFrame((dt) => {
    if (!el.isConnected) return !seen && (age += dt) < 5; // wait to be mounted; stop once removed
    if (!seen) {
      if (!size()) return true;
      seen = true;
    }
    if ((resizeCheck += dt) > 1) {
      resizeCheck = 0;
      if (Math.round(cv.offsetWidth * dpr) !== w) size();
    }
    t += dt;
    const T = tilt();
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = W.glow ? 'lighter' : 'source-over';
    for (const p of parts) {
      p.life += dt / p.ttl;
      p.y += (W.dir * p.s * u * dt) / h || 0;
      p.x += (Math.sin(t * 0.7 + p.ph) * W.sway * u * dt) / w;
      if (p.y < -0.08 || p.y > 1.08 || p.life >= 1) spawn(p, false);
      // fade in and out over the particle's life; flicker like a flame
      const env = Math.sin(Math.min(1, p.life) * Math.PI);
      const fl = 1 - W.flicker * 0.5 * (0.5 + 0.5 * Math.sin(t * (6 + p.ph) + p.ph * 3));
      const a = env * fl * (W.alpha ?? 0.9) * (0.45 + 0.55 * p.z);
      if (a < 0.02) continue;
      // parallax: near particles slide further with the tilt
      const px = p.x * w + T.x * p.z * 5 * u;
      const py = p.y * h + T.y * p.z * 5 * u;
      const s = p.r * u * 2.6;
      g.globalAlpha = a;
      g.drawImage(sprite(p.col, W.glow), px - s / 2, py - s / 2, s, s);
    }
    if (glints.length) {
      // the light sits opposite the tilt; glints flare only when it passes
      const lx = 0.5 - T.x * 0.55, ly = 0.35 - T.y * 0.45;
      g.globalCompositeOperation = 'lighter';
      const gs = glintSprite();
      for (const q of glints) {
        const d2 = (q.x - lx) ** 2 + (q.y - ly) ** 2;
        const catchLight = Math.exp(-d2 / 0.035);
        const tw = 0.5 + 0.5 * Math.sin(t * q.sp + q.ph);
        const a = catchLight * (0.25 + 0.75 * tw) + 0.06 * tw;
        if (a < 0.03) continue;
        const s = q.r * u * (2 + 2.5 * catchLight);
        g.globalAlpha = Math.min(1, a);
        g.drawImage(gs, q.x * w - s / 2 + T.x * 2 * u, q.y * h - s / 2 + T.y * 2 * u, s, s);
      }
    }
    g.globalAlpha = 1;
    return true;
  });
  return () => {
    stop();
    cv.remove();
  };
}
