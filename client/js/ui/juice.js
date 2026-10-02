// Game feel for the battle screen: one canvas of particles over the whole
// screen (sparks, dust rings, embers, shield motes), shattering cards,
// callouts, hit-stop and camera punches. Everything is transform/opacity or
// canvas, on the shared frame loop.
import { onFrame, motionReduced } from '../core/motion.js';

const COLORS = {
  strike: ['255,120,70', '255,200,120', '255,255,230'],
  guard: ['90,190,255', '170,225,255', '255,255,255'],
  scheme: ['190,120,255', '230,190,255', '255,255,255'],
  gold: ['255,209,102', '255,240,190', '255,255,255'],
  heal: ['120,255,160', '200,255,210'],
  dust: ['190,180,165', '120,110,100'],
  crown: ['255,110,50', '255,176,90'],
  quiet: ['207,216,232', '160,175,200'],
  hour: ['63,207,159', '255,209,102'],
  margin: ['139,92,246', '196,170,255'],
  vigil: ['255,204,102', '255,236,190'],
};
const pick = (a) => a[(Math.random() * a.length) | 0];
const rnd = (a, b) => a + Math.random() * (b - a);

export class Juice {
  constructor(host, { ambient = null } = {}) {
    this.host = host;
    this.reduced = motionReduced() || document.getElementById('app')?.classList.contains('lite');
    this.cv = document.createElement('canvas');
    this.cv.className = 'juice';
    host.appendChild(this.cv);
    this.g = this.cv.getContext('2d');
    this.parts = [];
    this.ambient = ambient;
    this.ambientT = 0;
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.stop = onFrame((dt) => this.tick(dt));
  }

  destroy() {
    this.stop?.();
    window.removeEventListener('resize', this.onResize);
    this.cv.remove();
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.cv.width = Math.round(r.width * this.dpr);
    this.cv.height = Math.round(r.height * this.dpr);
  }

  // host-relative centre of an element
  at(el, fx = 0.5, fy = 0.5) {
    const a = el.getBoundingClientRect();
    const h = this.host.getBoundingClientRect();
    return [a.left - h.left + a.width * fx, a.top - h.top + a.height * fy];
  }

  tick(dt) {
    if (!this.host.isConnected) return false;
    // ambient embers drift up through the arena
    if (this.ambient && !this.reduced) {
      this.ambientT += dt;
      while (this.ambientT > 0.12) {
        this.ambientT -= 0.12;
        this.parts.push({ t: 'ember', x: rnd(0, this.w), y: rnd(this.h * 0.3, this.h + 6), vx: rnd(-8, 8), vy: rnd(-55, -22), life: 0, ttl: rnd(4, 8), size: rnd(1, 2.4), col: pick(COLORS[this.ambient] || COLORS.gold), g: 0, sway: rnd(0, 6.28) });
      }
    }
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.globalCompositeOperation = 'lighter';
    const keep = [];
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.ttl) continue;
      p.vy += (p.g || 0) * dt;
      p.vx *= p.drag ? Math.pow(p.drag, dt * 60) : 1;
      p.vy *= p.drag ? Math.pow(p.drag, dt * 60) : 1;
      if (p.t === 'ember') p.x += Math.sin(p.life * 1.3 + p.sway) * 6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.life / p.ttl;
      if (p.t === 'spark') {
        g.strokeStyle = `rgba(${p.col},${k})`;
        g.lineWidth = p.size * k + 0.4;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        g.stroke();
      } else if (p.t === 'ring') {
        const r = p.r0 + (p.r1 - p.r0) * (1 - k * k);
        g.strokeStyle = `rgba(${p.col},${k * 0.9})`;
        g.lineWidth = p.size * k + 0.5;
        g.beginPath();
        g.ellipse(p.x, p.y, r, r * (p.squash || 1), 0, 0, Math.PI * 2);
        g.stroke();
      } else if (p.t === 'dust') {
        // dust is matter, not light: drawn normally, soft and dim
        g.globalCompositeOperation = 'source-over';
        const s = p.size * (1 + (1 - k) * 2.2);
        g.fillStyle = `rgba(${p.col},${k * 0.28})`;
        g.beginPath();
        g.arc(p.x, p.y, s, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = 'lighter';
      } else {
        const a = p.t === 'ember' ? Math.sin(Math.min(1, p.life / p.ttl) * Math.PI) * 0.8 : k;
        const s = p.size;
        const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 3);
        grd.addColorStop(0, `rgba(${p.col},${a})`);
        grd.addColorStop(1, `rgba(${p.col},0)`);
        g.fillStyle = grd;
        g.fillRect(p.x - s * 3, p.y - s * 3, s * 6, s * 6);
      }
      keep.push(p);
    }
    this.parts = keep.length > 900 ? keep.slice(-900) : keep;
    return true;
  }

  // ---- emitters -----------------------------------------------------------
  sparks(x, y, kind = 'strike', n = 26, power = 1) {
    if (this.reduced) n = Math.ceil(n / 4);
    const cols = COLORS[kind] || COLORS.strike;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const v = rnd(120, 420) * power;
      this.parts.push({ t: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 520, drag: 0.93, life: 0, ttl: rnd(0.35, 0.8), size: rnd(1.2, 2.6), col: pick(cols) });
    }
    for (let i = 0; i < n / 3; i++) this.parts.push({ t: 'glow', x: x + rnd(-10, 10), y: y + rnd(-10, 10), vx: rnd(-40, 40), vy: rnd(-60, 10), drag: 0.9, life: 0, ttl: rnd(0.3, 0.6), size: rnd(4, 9) * power, col: pick(cols) });
  }
  ring(x, y, kind = 'gold', r1 = 90, { squash = 0.45, size = 3, ttl = 0.55 } = {}) {
    this.parts.push({ t: 'ring', x, y, r0: 6, r1, squash, size, life: 0, ttl, col: pick(COLORS[kind] || COLORS.gold) });
  }
  dust(x, y, n = 18) {
    for (let i = 0; i < n; i++) {
      const a = rnd(Math.PI * 0.9, Math.PI * 2.1);
      const v = rnd(60, 180);
      this.parts.push({ t: 'dust', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.35, drag: 0.9, life: 0, ttl: rnd(0.5, 0.9), size: rnd(3, 6), col: pick(COLORS.dust) });
    }
  }
  motes(x, y, kind = 'guard', n = 16) {
    const cols = COLORS[kind] || COLORS.guard;
    for (let i = 0; i < n; i++) this.parts.push({ t: 'glow', x: x + rnd(-40, 40), y: y + rnd(-50, 50), vx: rnd(-15, 15), vy: rnd(-70, -20), life: 0, ttl: rnd(0.6, 1.1), size: rnd(2, 4), col: pick(cols) });
  }
  // Explode a card into flying shards (DOM clones clipped to triangles).
  shatter(cardEl, kind = 'strike') {
    const [cx, cy] = this.at(cardEl);
    this.sparks(cx, cy, kind, 40, 1.2);
    this.ring(cx, cy, kind, 120, { squash: 0.6, size: 4 });
    if (this.reduced) return;
    const r = cardEl.getBoundingClientRect();
    const h = this.host.getBoundingClientRect();
    const cols = 3, rows = 4;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++)
        for (const tri of [0, 1]) {
          const x0 = (100 * i) / cols, x1 = (100 * (i + 1)) / cols, y0 = (100 * j) / rows, y1 = (100 * (j + 1)) / rows;
          const poly = tri ? `${x0}% ${y0}%, ${x1}% ${y0}%, ${x0}% ${y1}%` : `${x1}% ${y0}%, ${x1}% ${y1}%, ${x0}% ${y1}%`;
          const s = cardEl.cloneNode(true);
          s.classList.remove('falling', 'rk-in', 'rk-in-top');
          s.classList.add('shard');
          s.style.cssText = `position:absolute;left:${r.left - h.left}px;top:${r.top - h.top}px;width:${r.width}px;height:${r.height}px;--cw:${r.width}px;clip-path:polygon(${poly});z-index:30;pointer-events:none;margin:0`;
          this.host.appendChild(s);
          const mx = ((x0 + x1) / 200 - 0.5) * 2, my = ((y0 + y1) / 200 - 0.5) * 2;
          const dx = mx * rnd(80, 190) + rnd(-30, 30), dy = my * rnd(60, 150) + rnd(40, 160);
          s.animate(
            [
              { transform: 'translate(0,0) rotate(0)', opacity: 1, filter: 'brightness(2.5)' },
              { transform: `translate(${dx * 0.4}px,${dy * 0.2 - 30}px) rotate(${rnd(-40, 40)}deg)`, opacity: 1, filter: 'brightness(1)', offset: 0.35 },
              { transform: `translate(${dx}px,${dy + 120}px) rotate(${rnd(-160, 160)}deg)`, opacity: 0, filter: 'brightness(0.6)' },
            ],
            { duration: rnd(650, 950), easing: 'cubic-bezier(.2,.6,.4,1)' },
          ).onfinish = () => s.remove();
        }
  }

  // Big sweeping word in the middle of the screen.
  callout(text, kind = 'gold', { sub = '', ms = 900, y = 0.5 } = {}) {
    const el = document.createElement('div');
    el.className = `callout callout--${kind}${text.length > 6 ? ' callout--long' : ''}`;
    el.style.top = y * 100 + '%';
    el.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ''}`;
    this.host.appendChild(el);
    setTimeout(() => el.remove(), ms + 400);
    return new Promise((r) => setTimeout(r, ms * 0.6));
  }

  // A band sweeping across the screen: ROUND 3 / Deploy.
  banner(title, sub = '') {
    const el = document.createElement('div');
    el.className = 'rbanner';
    el.innerHTML = `<div class="rbanner__band"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    this.host.appendChild(el);
    setTimeout(() => el.remove(), 1500);
    const [x, y] = [this.w / 2, this.h * 0.47];
    this.ring(x, y, 'gold', this.w * 0.45, { squash: 0.12, size: 2, ttl: 0.7 });
    return new Promise((r) => setTimeout(r, 1000));
  }

  // Camera punch: the field kicks toward the viewer.
  punch(el, power = 1) {
    if (this.reduced || !el) return;
    const s = 1 + 0.035 * power;
    el.animate([{ transform: 'scale(1)' }, { transform: `scale(${s})`, offset: 0.25 }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}
