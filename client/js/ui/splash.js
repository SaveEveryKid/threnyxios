// THE SPLASH — Firstfall in three seconds. A single star appears, moves (stars
// don't move), falls in white-gold fire and strikes the fog below centre; a
// bell hit sends golden sound-rings across the screen and THRENYX resolves out
// of them. "Tap to begin" is the gesture iOS needs for sound and motion.
//
// The full fall plays on the first launch of the day, a one-second version
// after that (and with reduced motion). The painted key art (ui/title) fades in
// behind the impact once it is delivered. The first screen loads underneath.
import { uiArt } from '../art/index.js';

const EASE_IN = (t) => t * t * t;
const EASE_OUT = (t) => 1 - (1 - t) ** 3;
const clamp = (x) => Math.max(0, Math.min(1, x));

export function splash(host, { full = true } = {}) {
  const el = document.createElement('div');
  el.className = 'splash';
  const art = uiArt('title');
  el.innerHTML = `
    ${art ? `<div class="splash__art" style="background-image:url('${art}')"></div>` : ''}
    <canvas class="splash__fx"></canvas>
    <div class="splash__title"><h1>${[...'THRENYX'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</h1><p>Season I · Firstfall</p></div>
    <div class="splash__tap">Tap to begin</div>`;
  host.appendChild(el);
  const cv = el.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  let W = 0, H = 0;
  const size = () => {
    const r = el.getBoundingClientRect();
    W = r.width;
    H = r.height;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  addEventListener('resize', size);

  // timeline (seconds): star shows, drifts, falls, strikes; the rest follows the strike
  const T = full ? { show: 0.25, drift: 0.7, fall: 1.25, hit: 1.75 } : { show: 0, drift: 0, fall: 0, hit: 0.15 };
  const from = { x: 0.7, y: 0.1 }, drift = { x: 0.64, y: 0.13 }, to = { x: 0.5, y: 0.6 };
  const embers = Array.from({ length: 70 }, () => ({ a: Math.random() * Math.PI * 2, v: 40 + Math.random() * 190, s: 0.6 + Math.random() * 1.8, life: 1.2 + Math.random() * 2.2, up: 10 + Math.random() * 40 }));
  const trail = [];
  const t0 = performance.now();
  let raf = 0, done = false, stage = 0;

  const glow = (x, y, r, a, inner = '255,244,214', outer = '233,196,111') => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${inner},${a})`);
    g.addColorStop(0.25, `rgba(${outer},${a * 0.55})`);
    g.addColorStop(1, `rgba(${outer},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  const frame = (now) => {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    const M = Math.min(W, H);
    // the star: appears, moves, falls
    if (t < T.hit) {
      let p, a = clamp((t - T.show) / 0.3);
      if (t < T.drift) p = from;
      else if (t < T.fall) {
        const k = EASE_OUT((t - T.drift) / (T.fall - T.drift));
        p = { x: from.x + (drift.x - from.x) * k, y: from.y + (drift.y - from.y) * k };
      } else {
        const k = EASE_IN((t - T.fall) / (T.hit - T.fall));
        p = { x: drift.x + (to.x - drift.x) * k, y: drift.y + (to.y - drift.y) * k };
      }
      const x = p.x * W, y = p.y * H;
      if (t >= T.fall) trail.push({ x, y, t });
      // the streak of white-gold fire
      for (let i = 1; i < trail.length; i++) {
        const q = trail[i - 1], r = trail[i];
        const age = t - r.t;
        if (age > 0.35) continue;
        ctx.strokeStyle = `rgba(255,${210 + 40 * (1 - age / 0.35)},150,${0.9 * (1 - age / 0.35)})`;
        ctx.lineWidth = 5 * (1 - age / 0.35) + 0.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(r.x, r.y);
        ctx.stroke();
      }
      const tw = 0.85 + 0.15 * Math.sin(t * 13);
      glow(x, y, M * (t >= T.fall ? 0.07 : 0.035) * tw, a);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      if (!stage) {
        stage = 1;
        el.classList.add('is-struck');
      }
      const k = t - T.hit;
      const x = to.x * W, y = to.y * H;
      // the flash
      if (k < 0.5) {
        const f = (1 - k / 0.5) ** 2;
        const g = ctx.createRadialGradient(x, y, 0, x, y, Math.hypot(W, H) * (0.35 + k));
        g.addColorStop(0, `rgba(255,250,235,${0.9 * f})`);
        g.addColorStop(0.18, `rgba(255,214,140,${0.45 * f})`);
        g.addColorStop(1, 'rgba(233,196,111,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      glow(x, y, M * (0.18 + 0.06 * Math.sin(t * 2)), 0.55 * Math.max(0.35, 1 - k / 2.5));
      // golden sound-rings rolling out, then a slow breathing ring forever
      for (let i = 0; i < 6; i++) {
        const age = k - i * 0.22;
        if (age < 0) continue;
        const life = 2.6;
        const rr = (age % life) / life;
        if (age > life && i > 1) continue;
        const R = M * 0.05 + rr * Math.hypot(W, H) * 0.75;
        ctx.strokeStyle = `rgba(233,196,111,${0.55 * (1 - rr) ** 1.5})`;
        ctx.lineWidth = 2.2 * (1 - rr) + 0.4;
        ctx.beginPath();
        ctx.ellipse(x, y, R, R * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // embers lifting from the impact
      for (const e of embers) {
        const age = (k % e.life) / e.life;
        const px = x + Math.cos(e.a) * e.v * age * 1.4;
        const py = y + Math.sin(e.a) * e.v * age * 0.5 - e.up * age * 3;
        ctx.fillStyle = `rgba(255,${190 + ((e.s * 30) | 0)},120,${0.8 * (1 - age)})`;
        ctx.fillRect(px, py, e.s, e.s);
      }
    }
    if (el.isConnected) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // any tap begins (and is the gesture that unlocks sound and motion)
  return new Promise((resolve) => {
    const begin = () => {
      if (done) return;
      done = true;
      el.classList.add('is-leaving');
      resolve();
      setTimeout(() => {
        cancelAnimationFrame(raf);
        removeEventListener('resize', size);
        el.remove();
      }, 650);
    };
    el.addEventListener('click', begin);
  });
}
